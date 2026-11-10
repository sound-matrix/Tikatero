-- PR 14. Organiser sales, Easy Split payouts, and payout-hold self-check.
-- Additive only. Does not edit earlier migrations. Timestamp is after PR 13's
-- scanner migration (20261110120100) so the two can land in either order.
-- scan_progress is used when it exists and is not required here.

create schema if not exists payout_private;
revoke all on schema payout_private from public, anon, authenticated, service_role;

alter table public.payouts
  add column is_test boolean not null default false;

comment on column public.payouts.is_test is
  'Test, mock, and sandbox payouts. They are not live bank transfers.';

alter table public.payouts
  add constraint payouts_amount_positive check (amount_paise > 0);

create unique index payouts_order_id_key on public.payouts (order_id) where order_id is not null;
create unique index payouts_cf_split_ref_key on public.payouts (cf_split_ref) where cf_split_ref is not null;

alter table public.orders
  add column absorbed_gateway_paise bigint,
  add constraint orders_absorbed_gateway check (
    absorbed_gateway_paise is null or absorbed_gateway_paise >= 0
  );

comment on column public.orders.absorbed_gateway_paise is
  'Platform expense when the pinned pricing version absorbs the gateway. Not deducted from organiser_share_paise.';

create table public.payout_exceptions (
  order_id uuid primary key references public.orders (id) on delete restrict,
  organiser_id uuid not null references public.organisers (id) on delete restrict,
  organiser_share_paise bigint not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint payout_exceptions_reason check (char_length(reason) between 1 and 300)
);

comment on table public.payout_exceptions is
  'Paid orders left out of the payout ledger. No bank account numbers or documents.';

alter table public.payout_exceptions enable row level security;
revoke all on public.payout_exceptions from public, anon, authenticated;
grant select on public.payout_exceptions to authenticated;
grant select, insert, update, delete on public.payout_exceptions to service_role;

create policy payout_exceptions_select
on public.payout_exceptions
for select
to authenticated
using (public.is_staff());

-- Fee columns stay on the row for the service role. Browser roles read them
-- only through the membership-checked functions below.
revoke select on public.orders from authenticated;
grant select (
  id,
  event_id,
  buyer_id,
  buyer_name,
  buyer_email,
  buyer_phone,
  subtotal_paise,
  total_paise,
  fee_payer,
  status,
  cf_order_id,
  cf_payment_id,
  pricing_version_id,
  created_at,
  paid_at,
  payment_provider,
  payment_session_id,
  access_token_hash,
  hold_expires_at,
  attendee_names,
  consent_at,
  is_test,
  reconciled_at,
  emailed_at
) on public.orders to authenticated;

create function payout_private.bps(p_amount bigint, p_rate integer)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select (p_amount * p_rate + 5000) / 10000;
$$;

-- Next working days in IST, keeping the clock time. Saturday and Sunday are skipped.
create function payout_private.add_ist_working_days(p_at timestamptz, p_days integer)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  local_ts timestamp := p_at at time zone 'Asia/Kolkata';
  d date := local_ts::date;
  left_days integer := p_days;
begin
  if p_at is null or p_days is null or p_days < 0 or p_days > 365 then
    raise exception 'Payout days must be between 0 and 365.';
  end if;
  while left_days > 0 loop
    d := d + 1;
    if extract(dow from d) not in (0, 6) then
      left_days := left_days - 1;
    end if;
  end loop;
  return (d + local_ts::time) at time zone 'Asia/Kolkata';
end;
$$;

-- No settlement time yet: Cashfree's next working day, then payout_days working days.
-- A known settlement time uses only payout_days after that instant.
create function payout_private.expected_payout_at(
  p_paid timestamptz,
  p_days integer,
  p_settled timestamptz
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when p_settled is not null then payout_private.add_ist_working_days(p_settled, p_days)
    else payout_private.add_ist_working_days(p_paid, 1 + p_days)
  end;
$$;

create function payout_private.absorbed_cost(p_order_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ord public.orders;
  ev public.events;
  ver public.pricing_versions;
  total bigint := 0;
  item record;
  base bigint;
  gateway bigint;
begin
  select * into ord from public.orders where id = p_order_id;
  if not found then return null; end if;
  select * into ev from public.events where id = ord.event_id;
  if ev.is_free then return 0; end if;
  select * into ver from public.pricing_versions where id = ord.pricing_version_id;
  if ver.id is null or ver.gateway_mode <> 'absorb' then return null; end if;
  for item in
    select unit_price_paise, qty from public.order_items where order_id = ord.id
  loop
    if item.unit_price_paise > 0 and item.qty > 0 then
      base := payout_private.bps(item.unit_price_paise, ver.gateway_bps);
      gateway := base + payout_private.bps(base, ver.gst_bps);
      total := total + gateway * item.qty;
    end if;
  end loop;
  return total;
end;
$$;

create function payout_private.note_exception(
  p_order public.orders,
  p_organiser uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted uuid;
begin
  insert into public.payout_exceptions (order_id, organiser_id, organiser_share_paise, reason)
  values (p_order.id, p_organiser, p_order.organiser_share_paise, p_reason)
  on conflict (order_id) do nothing
  returning order_id into inserted;
  if inserted is null then return; end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, after, reason)
  values (
    null,
    'payout_negative_share',
    'orders',
    p_order.id,
    jsonb_build_object('organiser_share_paise', p_order.organiser_share_paise),
    p_reason
  );
end;
$$;

create function payout_private.schedule_order_payout(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ord public.orders;
  ev public.events;
  org public.organisers;
  days integer;
  payout_status public.payout_status;
begin
  select * into ord from public.orders where id = p_order_id for update;
  if not found or ord.status <> 'paid' or ord.paid_at is null then return; end if;
  select * into ev from public.events where id = ord.event_id;
  if not found then return; end if;
  select * into org from public.organisers where id = ev.organiser_id;
  update public.orders
  set absorbed_gateway_paise = payout_private.absorbed_cost(ord.id)
  where id = ord.id
    and absorbed_gateway_paise is distinct from payout_private.absorbed_cost(ord.id);
  if ord.total_paise is distinct from
    ord.organiser_share_paise + ord.platform_share_paise + ord.gateway_fee_paise
  then
    perform payout_private.note_exception(ord, org.id, 'Paid order does not balance and was left out of payouts.');
    return;
  end if;
  if ord.organiser_share_paise < 0 then
    perform payout_private.note_exception(ord, org.id, 'Paid order has a negative organiser share and was left out of payouts.');
    return;
  end if;
  if ord.organiser_share_paise = 0 then return; end if;
  select coalesce(v.payout_days, 2) into days
  from public.pricing_versions v
  where v.id = ord.pricing_version_id;
  days := coalesce(days, 2);
  payout_status := case when org.payouts_on_hold then 'on_hold'::public.payout_status else 'scheduled'::public.payout_status end;
  insert into public.payouts (
    organiser_id, event_id, order_id, amount_paise, status, expected_at, is_test
  )
  values (
    org.id,
    ev.id,
    ord.id,
    ord.organiser_share_paise,
    payout_status,
    payout_private.expected_payout_at(ord.paid_at, days, null),
    ord.is_test
  )
  on conflict (order_id) where order_id is not null do nothing;
end;
$$;

create function payout_private.on_order_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform payout_private.schedule_order_payout(new.id);
  return new;
end;
$$;

create trigger orders_schedule_payout
after update of status on public.orders
for each row
when (new.status = 'paid' and old.status is distinct from 'paid')
execute function payout_private.on_order_paid();

create trigger orders_schedule_payout_insert
after insert on public.orders
for each row
when (new.status = 'paid')
execute function payout_private.on_order_paid();

create function payout_private.can_view_sales(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and not exists (
      select 1 from public.profiles where id = auth.uid() and blocked_at is not null
    )
    and exists (select 1 from public.events where id = p_event_id)
    and (
      public.is_staff()
      or exists (
        select 1
        from public.events as event
        where event.id = p_event_id
          and public.is_org_member(event.organiser_id)
      )
      or public.is_event_team(p_event_id, array['manager']::public.team_role[])
    );
$$;

create function payout_private.event_payload(p_event_id uuid, p_orders boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ev public.events;
  checked bigint := 0;
  sold bigint := 0;
  gross bigint;
  buyer bigint;
  fee bigint;
  gst bigint;
  gateway bigint;
  share bigint;
  payable bigint;
  days integer;
  identity_ok boolean;
  from_scanner boolean := false;
  tiers jsonb;
  orders_json jsonb := '[]'::jsonb;
begin
  select * into ev from public.events where id = p_event_id;
  if not found then return null; end if;
  select
    coalesce(sum(checkout.subtotal_paise), 0),
    coalesce(sum(checkout.total_paise), 0),
    coalesce(sum(checkout.platform_fee_paise), 0),
    coalesce(sum(checkout.platform_fee_gst_paise), 0),
    coalesce(sum(checkout.gateway_fee_paise), 0),
    coalesce(sum(checkout.organiser_share_paise), 0)
  into gross, buyer, fee, gst, gateway, share
  from public.orders as checkout
  where checkout.event_id = p_event_id
    and checkout.status = 'paid'
    and checkout.is_test = false;
  select coalesce(sum(payout.amount_paise), 0)
  into payable
  from public.payouts as payout
  where payout.event_id = p_event_id
    and payout.status = 'scheduled'
    and payout.is_test = false;
  select coalesce(max(version.payout_days), 2)
  into days
  from public.orders as checkout
  join public.pricing_versions as version on version.id = checkout.pricing_version_id
  where checkout.event_id = p_event_id
    and checkout.status = 'paid'
    and checkout.is_test = false;
  select not exists (
    select 1
    from public.orders as checkout
    where checkout.event_id = p_event_id
      and checkout.status = 'paid'
      and checkout.is_test = false
      and checkout.total_paise is distinct from
        checkout.organiser_share_paise + checkout.platform_share_paise + checkout.gateway_fee_paise
  )
  into identity_ok;
  select
    count(*) filter (where ticket.status = 'used'),
    count(*) filter (where ticket.status in ('valid', 'used'))
  into checked, sold
  from public.tickets as ticket
  join public.orders as checkout on checkout.id = ticket.order_id
  where ticket.event_id = p_event_id
    and checkout.status = 'paid'
    and checkout.is_test = false
    and ticket.status in ('valid', 'used');
  if to_regprocedure('public.scan_progress(uuid,uuid)') is not null and auth.uid() is not null then
    begin
      execute 'select checked_in, total from public.scan_progress($1, $2)'
        into checked, sold
        using p_event_id, auth.uid();
      from_scanner := true;
    exception
      when sqlstate '42501' then
        from_scanner := false;
    end;
  end if;
  checked := coalesce(checked, 0);
  sold := coalesce(sold, 0);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', tier.id,
    'name', tier.name,
    'is_vip', tier.is_vip,
    'qty_sold', tier.qty_sold,
    'qty_total', tier.qty_total,
    'price_paise', tier.price_paise,
    'sold_real', coalesce(counts.sold, 0),
    'checked_in', coalesce(counts.checked, 0)
  ) order by tier.sort, tier.name), '[]'::jsonb)
  into tiers
  from public.ticket_types as tier
  left join (
    select
      ticket.ticket_type_id,
      count(*) filter (where ticket.status in ('valid', 'used'))::integer as sold,
      count(*) filter (where ticket.status = 'used')::integer as checked
    from public.tickets as ticket
    join public.orders as checkout on checkout.id = ticket.order_id
    where ticket.event_id = p_event_id
      and checkout.status = 'paid'
      and checkout.is_test = false
      and ticket.status in ('valid', 'used')
    group by ticket.ticket_type_id
  ) as counts on counts.ticket_type_id = tier.id
  where tier.event_id = p_event_id;
  if p_orders then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', checkout.id,
      'paid_at', checkout.paid_at,
      'subtotal_paise', checkout.subtotal_paise,
      'platform_fee_paise', checkout.platform_fee_paise,
      'platform_fee_gst_paise', checkout.platform_fee_gst_paise,
      'gateway_fee_paise', checkout.gateway_fee_paise,
      'organiser_share_paise', checkout.organiser_share_paise,
      'platform_share_paise', checkout.platform_share_paise,
      'buyer_total_paise', checkout.total_paise
    ) order by checkout.paid_at desc nulls last, checkout.id), '[]'::jsonb)
    into orders_json
    from (
      select *
      from public.orders
      where event_id = p_event_id
        and status = 'paid'
        and is_test = false
      order by paid_at desc nulls last, id
      limit 500
    ) as checkout;
  end if;
  return jsonb_build_object(
    'id', ev.id,
    'organiser_id', ev.organiser_id,
    'title', ev.title,
    'starts_at', ev.starts_at,
    'ends_at', ev.ends_at,
    'status', ev.status,
    'is_free', ev.is_free,
    'gross_subtotal_paise', gross,
    'buyer_total_paise', buyer,
    'platform_fee_paise', fee,
    'platform_fee_gst_paise', gst,
    'gateway_fee_paise', gateway,
    'organiser_share_paise', share,
    'tickets_sold', sold,
    'checked_in', checked,
    'to_be_paid_paise', payable,
    'payout_days', days,
    'identity_ok', identity_ok,
    'checkins_from_scanner', from_scanner,
    'tiers', tiers,
    'orders', orders_json
  );
end;
$$;

create function public.organiser_event_sales(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not payout_private.can_view_sales(p_event_id) then
    raise exception 'You cannot view sales for this event.' using errcode = '42501';
  end if;
  return payout_private.event_payload(p_event_id, true);
end;
$$;

create function public.organiser_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or exists (
    select 1 from public.profiles where id = auth.uid() and blocked_at is not null
  ) then
    raise exception 'You cannot view sales for this event.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', organiser.id,
    'display_name', organiser.display_name,
    'events', coalesce((
      select jsonb_agg(payout_private.event_payload(event.id, false) order by event.starts_at desc)
      from public.events as event
      where event.organiser_id = organiser.id
    ), '[]'::jsonb)
  ) order by organiser.display_name), '[]'::jsonb)
  into result
  from public.organisers as organiser
  where organiser.kyc_status = 'approved'
    and public.is_org_member(organiser.id);
  return jsonb_build_object('organisers', coalesce(result, '[]'::jsonb));
end;
$$;

create function public.admin_gateway_reconciliation()
returns table (
  order_id uuid,
  event_id uuid,
  event_title text,
  organiser_share_paise bigint,
  platform_share_paise bigint,
  gateway_fee_paise bigint,
  absorbed_gateway_paise bigint,
  platform_net_paise bigint,
  buyer_total_paise bigint,
  paid_at timestamptz,
  is_test boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  return query
  select
    checkout.id,
    checkout.event_id,
    event.title,
    checkout.organiser_share_paise,
    checkout.platform_share_paise,
    checkout.gateway_fee_paise,
    checkout.absorbed_gateway_paise,
    checkout.platform_share_paise - checkout.absorbed_gateway_paise,
    checkout.total_paise,
    checkout.paid_at,
    checkout.is_test
  from public.orders as checkout
  join public.events as event on event.id = checkout.event_id
  where checkout.status = 'paid'
    and checkout.absorbed_gateway_paise is not null
  order by checkout.paid_at desc nulls last, checkout.id
  limit 500;
end;
$$;

create function public.apply_payout_settlement(
  p_event_id text,
  p_order_id uuid,
  p_status text,
  p_split_ref text,
  p_amount bigint,
  p_settled_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted uuid;
  payout public.payouts;
  days integer;
begin
  if p_event_id is null or p_event_id !~ '^[A-Za-z0-9:_-]{8,120}$' then
    raise exception 'Invalid payout event.';
  end if;
  if p_status not in ('settled', 'failed', 'on_hold') then
    raise exception 'Invalid payout status.';
  end if;
  insert into public.webhook_events (source, event_id, payload)
  values ('cashfree-split', p_event_id, coalesce(p_payload, '{}'::jsonb))
  on conflict (source, event_id) do nothing
  returning id into inserted;
  if inserted is null then
    return jsonb_build_object('outcome', 'duplicate', 'order_id', p_order_id);
  end if;
  select * into payout from public.payouts where order_id = p_order_id for update;
  if not found then
    return jsonb_build_object('outcome', 'missing', 'order_id', p_order_id);
  end if;
  if p_amount is distinct from payout.amount_paise then
    insert into public.payout_exceptions (order_id, organiser_id, organiser_share_paise, reason)
    values (p_order_id, payout.organiser_id, payout.amount_paise, 'Settlement amount did not match the saved organiser share.')
    on conflict (order_id) do nothing;
    return jsonb_build_object('outcome', 'mismatch', 'order_id', p_order_id, 'payout_id', payout.id);
  end if;
  if payout.status = 'settled' or (payout.status = 'failed' and p_status <> 'settled') then
    return jsonb_build_object(
      'outcome', 'unchanged',
      'order_id', p_order_id,
      'payout_id', payout.id,
      'status', payout.status,
      'is_test', payout.is_test
    );
  end if;
  select coalesce(version.payout_days, 2) into days
  from public.orders as checkout
  left join public.pricing_versions as version on version.id = checkout.pricing_version_id
  where checkout.id = p_order_id;
  update public.payouts
  set
    status = p_status::public.payout_status,
    cf_split_ref = coalesce(p_split_ref, cf_split_ref),
    settled_at = case when p_status = 'settled' then coalesce(p_settled_at, now()) else settled_at end,
    expected_at = case
      when p_status = 'settled' then expected_at
      when p_settled_at is not null then payout_private.expected_payout_at(created_at, coalesce(days, 2), p_settled_at)
      else expected_at
    end
  where id = payout.id
  returning * into payout;
  update public.webhook_events set processed_at = now() where id = inserted;
  return jsonb_build_object(
    'outcome', payout.status,
    'order_id', p_order_id,
    'payout_id', payout.id,
    'status', payout.status,
    'is_test', payout.is_test
  );
end;
$$;

-- Staff cannot hold payouts or pause sales on an organiser they own or belong to.
create or replace function admin_private.organiser_control(p_id uuid, p_control text, p_enabled boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := admin_private.require_staff();
  org public.organisers;
  old_state jsonb;
  log_id uuid;
begin
  if p_control is null or p_control not in ('payouts_on_hold', 'sales_paused') or p_enabled is null then
    raise exception 'Choose an organiser control';
  end if;
  select * into org from public.organisers where id = p_id for update;
  if not found then raise exception 'Organiser not found'; end if;
  if org.owner_id = actor or exists (
    select 1 from public.organiser_members
    where organiser_id = org.id and user_id = actor
  ) then
    raise exception 'You cannot change payouts or sales on your own organiser' using errcode = '42501';
  end if;
  old_state := jsonb_build_object('payouts_on_hold', org.payouts_on_hold, 'sales_paused', org.sales_paused);
  update public.organisers
  set
    payouts_on_hold = case when p_control = 'payouts_on_hold' then p_enabled else payouts_on_hold end,
    sales_paused = case when p_control = 'sales_paused' then p_enabled else sales_paused end
  where id = p_id
  returning * into org;
  if p_control = 'payouts_on_hold' and p_enabled then
    update public.payouts set status = 'on_hold' where organiser_id = p_id and status = 'scheduled';
  elsif p_control = 'payouts_on_hold' and not p_enabled then
    update public.payouts set status = 'scheduled' where organiser_id = p_id and status = 'on_hold';
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (
    actor,
    p_control,
    'organisers',
    p_id,
    old_state,
    jsonb_build_object('payouts_on_hold', org.payouts_on_hold, 'sales_paused', org.sales_paused)
  )
  returning id into log_id;
  return log_id;
end;
$$;

-- Same claim as PR 5, plus the on-hold notice.
create or replace function public.claim_email_send(
  p_template text, p_entity_ref text, p_to_email text, p_configured boolean
)
returns setof public.email_log
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_entity text := btrim(p_entity_ref);
  v_recipient text := lower(btrim(p_to_email));
  v_key text;
begin
  if p_template is null or not (p_template = any(array[
    'order_confirmed', 'payment_failed', 'event_reminder', 'event_changed',
    'event_cancelled', 'refund_processed', 'kyc_submitted', 'kyc_needs_docs',
    'kyc_approved', 'kyc_rejected', 'team_invite', 'payout_settled', 'payout_on_hold',
    'account_blocked', 'staff_alert'
  ])) or v_entity is null or v_entity = '' or length(v_entity) > 200
    or v_entity ~ '[[:cntrl:]]' or v_recipient is null or v_recipient = ''
    or length(v_recipient) > 254 or v_recipient ~ '[[:cntrl:]]'
    or p_configured is null
  then raise exception 'invalid email identity' using errcode = '22023';
  end if;

  v_key := 'tikatero-email-v1-' || encode(extensions.digest(
    convert_to(p_template || chr(31) || v_entity || chr(31) || v_recipient, 'UTF8'), 'sha256'
  ), 'hex');

  return query
  insert into public.email_log as existing (template, entity_ref, to_email, status, idempotency_key)
  values (p_template, v_entity, v_recipient,
    case when p_configured then 'sending' else 'skipped_not_configured' end, v_key)
  on conflict (idempotency_key) do update set status = excluded.status
    where existing.status = 'skipped_not_configured' and excluded.status = 'sending'
  returning existing.*;
end;
$$;

revoke all on function public.organiser_event_sales(uuid), public.organiser_dashboard(), public.admin_gateway_reconciliation(), public.apply_payout_settlement(text, uuid, text, text, bigint, timestamptz, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.organiser_event_sales(uuid), public.organiser_dashboard() to authenticated;
grant execute on function public.admin_gateway_reconciliation() to authenticated;
grant execute on function public.apply_payout_settlement(text, uuid, text, text, bigint, timestamptz, jsonb) to service_role;

revoke all on all functions in schema payout_private from public, anon, authenticated, service_role;

-- Backfill paid orders that existed before this ledger.
do $$
declare
  paid uuid;
begin
  for paid in select id from public.orders where status = 'paid' and paid_at is not null loop
    perform payout_private.schedule_order_payout(paid);
  end loop;
end;
$$;
