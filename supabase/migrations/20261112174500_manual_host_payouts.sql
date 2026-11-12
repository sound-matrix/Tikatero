-- Launch payment settings and the append-only organiser earnings record.
create table public.platform_payment_settings (
  id boolean primary key default true check (id),
  payout_mode text not null default 'manual' check (payout_mode in ('manual','gateway_split')),
  active_gateway text not null default 'cashfree' check (active_gateway in ('cashfree','instamojo','razorpay','payu')),
  payout_hold_days_after_event integer not null default 2 check (payout_hold_days_after_event between 0 and 365)
);
insert into public.platform_payment_settings default values;
alter table public.platform_payment_settings enable row level security;
revoke all on public.platform_payment_settings from public, anon, authenticated, service_role;
grant select on public.platform_payment_settings to authenticated, service_role;
create policy payment_settings_staff on public.platform_payment_settings
  for select to authenticated using (public.is_staff());

alter table public.organisers add column payout_mode_override text
  check (payout_mode_override in ('manual','gateway_split'));
alter table public.orders add column payout_mode text not null default 'manual'
  check (payout_mode in ('manual','gateway_split'));
-- Preserve the routing of payments already created before the switch.
update public.orders o set payout_mode = 'gateway_split'
where vendor_id is not null or exists (select 1 from public.payouts p where p.order_id = o.id);

alter table public.payouts
  add column method text check (method in ('neft','imps','rtgs','upi','other')),
  add column bank_reference text,
  add column paid_on date,
  add column paid_by uuid references public.profiles(id),
  add column note text,
  add column proof_path text,
  add column voided_at timestamptz,
  add column voided_by uuid references public.profiles(id),
  add column void_reason text,
  add column bank_last4 text check (bank_last4 ~ '^[0-9]{4}$'),
  add constraint manual_payout_details check (method is null or
    (order_id is null and bank_reference is not null and paid_on is not null and paid_by is not null));
create unique index manual_payout_bank_reference on public.payouts(organiser_id, bank_reference)
where bank_reference is not null;

create table public.organiser_earnings_entries (
  id bigint generated always as identity primary key,
  organiser_id uuid not null references public.organisers(id) on delete restrict,
  event_id uuid references public.events(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  refund_id uuid references public.refunds(id) on delete restrict,
  payout_id uuid references public.payouts(id) on delete restrict,
  payout_mode text not null check (payout_mode in ('manual','gateway_split')),
  kind text not null check (kind in ('ticket_sale','refund','payout','payout_reversal','adjustment')),
  amount_paise bigint not null,
  available_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  note text,
  is_test boolean not null,
  check (
    (kind = 'ticket_sale' and order_id is not null and amount_paise > 0)
    or (kind = 'refund' and refund_id is not null and amount_paise <= 0)
    or (kind = 'payout' and payout_id is not null and amount_paise < 0)
    or (kind = 'payout_reversal' and payout_id is not null and amount_paise > 0)
    or (kind = 'adjustment' and amount_paise <> 0 and nullif(btrim(note),'') is not null)
  )
);
create unique index earnings_order_sale on public.organiser_earnings_entries(order_id,kind) where kind = 'ticket_sale';
create unique index earnings_refund on public.organiser_earnings_entries(refund_id) where refund_id is not null;
create unique index earnings_payout_event on public.organiser_earnings_entries(payout_id,kind,event_id)
  nulls not distinct where payout_id is not null;
create index earnings_organiser on public.organiser_earnings_entries(organiser_id,is_test,payout_mode,available_at);
create index earnings_event on public.organiser_earnings_entries(event_id,is_test);
alter table public.organiser_earnings_entries enable row level security;
revoke all on public.organiser_earnings_entries from public, anon, authenticated, service_role;
grant select, update, delete on public.organiser_earnings_entries to service_role;

create function payout_private.earnings_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Earnings entries are append-only.' using errcode = '55000';
end;
$$;
create trigger earnings_immutable before update or delete on public.organiser_earnings_entries
for each row execute function payout_private.earnings_immutable();
create trigger earnings_no_truncate before truncate on public.organiser_earnings_entries
for each statement execute function payout_private.earnings_immutable();

-- Serialise all changes to one host's earnings, including rows not yet present.
create function payout_private.lock_earnings(p_organiser_id uuid) returns void
language sql set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('organiser-earnings/' || p_organiser_id::text, 0));
$$;

create function payout_private.add_ticket_sale(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ord public.orders; ev public.events; available timestamptz; days integer;
begin
  select * into ord from public.orders where id = p_order_id;
  if ord.paid_at is null or ord.organiser_share_paise <= 0 then return; end if;
  select * into ev from public.events where id = ord.event_id;
  select payout_hold_days_after_event into days from public.platform_payment_settings where id;
  available := case when ord.payout_mode = 'manual' then payout_private.add_ist_working_days(
    coalesce(ev.ends_at, ev.starts_at + interval '1 day', ord.paid_at), days)
    else coalesce((select expected_at from public.payouts where order_id = ord.id),
      payout_private.expected_payout_at(ord.paid_at,
        coalesce((select payout_days from public.pricing_versions where id = ord.pricing_version_id),2), null))
    end;
  perform payout_private.lock_earnings(ev.organiser_id);
  insert into public.organiser_earnings_entries
    (organiser_id,event_id,order_id,payout_mode,kind,amount_paise,available_at,created_at,is_test)
  values (ev.organiser_id,ev.id,ord.id,ord.payout_mode,'ticket_sale',ord.organiser_share_paise,available,ord.paid_at,ord.is_test)
  on conflict (order_id,kind) where kind = 'ticket_sale' do nothing;
end;
$$;

create function payout_private.add_refund_entry(p_refund_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare refund public.refunds; sale public.organiser_earnings_entries;
begin
  select * into refund from public.refunds where id = p_refund_id and status = 'processed';
  if not found then return; end if;
  select * into sale from public.organiser_earnings_entries where order_id = refund.order_id and kind = 'ticket_sale';
  if not found then return; end if;
  perform payout_private.lock_earnings(sale.organiser_id);
  insert into public.organiser_earnings_entries
    (organiser_id,event_id,order_id,refund_id,payout_mode,kind,amount_paise,available_at,created_at,note,is_test)
  values (sale.organiser_id,sale.event_id,sale.order_id,refund.id,sale.payout_mode,'refund',
    -refund.organiser_reversal_paise,sale.available_at,coalesce(refund.processed_at,now()),
    case when refund.gateway_shortfall_paise > 0 then 'Payment charges covered by Tikatero' end,sale.is_test)
  on conflict (refund_id) where refund_id is not null do nothing;
end;
$$;

create function payout_private.refund_earnings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'processed' then
    perform payout_private.add_refund_entry(new.id);
  else
    perform payout_private.lock_earnings(ev.organiser_id)
    from public.orders o join public.events ev on ev.id = o.event_id where o.id = new.order_id;
  end if;
  return new;
end;
$$;
create trigger refund_earnings after insert or update of status on public.refunds
for each row when (new.status in ('approved','processed')) execute function payout_private.refund_earnings();

create function payout_private.add_split_payment(p_payout_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare payment public.payouts;
begin
  select * into payment from public.payouts where id = p_payout_id and order_id is not null and status = 'settled';
  if not found or payment.amount_paise = 0 then return; end if;
  perform payout_private.lock_earnings(payment.organiser_id);
  insert into public.organiser_earnings_entries
    (organiser_id,event_id,order_id,payout_id,payout_mode,kind,amount_paise,available_at,created_at,is_test)
  values (payment.organiser_id,payment.event_id,payment.order_id,payment.id,'gateway_split','payout',
    -payment.amount_paise,coalesce(payment.settled_at,payment.created_at),coalesce(payment.settled_at,payment.created_at),payment.is_test)
  on conflict (payout_id,kind,event_id) where payout_id is not null do nothing;
end;
$$;
create function payout_private.split_payment_earnings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform payout_private.add_split_payment(new.id);
  return new;
end;
$$;
create trigger split_payment_earnings after insert or update of status on public.payouts
for each row when (new.order_id is not null and new.status = 'settled')
execute function payout_private.split_payment_earnings();

-- Backfill processed money only. Preserve the original environment on every row.
do $$
declare row_id uuid;
begin
  for row_id in select id from public.orders where paid_at is not null
    and status in ('paid','partially_refunded','refunded') and organiser_share_paise > 0 loop
    perform payout_private.add_ticket_sale(row_id);
  end loop;
  for row_id in select id from public.refunds where status = 'processed' loop
    perform payout_private.add_refund_entry(row_id);
  end loop;
  for row_id in select id from public.payouts where status = 'settled' and order_id is not null loop
    perform payout_private.add_split_payment(row_id);
  end loop;
end;
$$;
create function payout_private.bank_check(p_organiser uuid)
returns public.kyc_applications language sql stable set search_path = '' as $$
  select a from public.kyc_applications a
  where a.organiser_id = p_organiser and a.region = 'IN' and a.status = 'approved'
  order by a.decided_at desc nulls last, a.created_at desc, a.id limit 1;
$$;

create or replace function public.checkout_hold(p_order_id uuid,p_buyer_id uuid,p_slug text,p_name text,p_email text,p_phone text,
  p_lines jsonb,p_pricing_version_id uuid,p_fee_payer public.fee_payer,p_is_free boolean,p_amounts jsonb,
  p_provider text,p_token_hash text,p_attendees jsonb,p_is_test boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ev public.events; org public.organisers; tier public.ticket_types; item jsonb; current_version uuid;
  requested integer:=0; occupied bigint; held bigint; qty integer; saved public.orders; settings public.platform_payment_settings; mode text;
begin
  select * into ev from public.events where slug=p_slug for update;
  if not found or ev.status<>'published' or ev.hidden_at is not null or coalesce(ev.ends_at,ev.starts_at)<=now() then raise exception 'This event is not accepting bookings.'; end if;
  select * into org from public.organisers where id=ev.organiser_id for share;
  if org.kyc_status<>'approved' then raise exception 'This organiser is awaiting approval.'; end if;
  if org.sales_paused then raise exception 'Ticket sales are temporarily paused.'; end if;
  if p_provider not in ('mock','cashfree','free') then raise exception 'Invalid payment provider.'; end if;
  select * into settings from public.platform_payment_settings where id for share;
  mode := coalesce(org.payout_mode_override, settings.payout_mode);
  if p_provider not in ('mock','free') and p_provider <> settings.active_gateway
    then raise exception 'Payment settings changed. Please refresh checkout.'; end if;
  if p_provider <> 'free' and mode = 'gateway_split' and nullif(btrim(org.cashfree_vendor_id),'') is null then raise exception 'This organiser is not ready to accept payments.'; end if;
  if p_provider = 'cashfree' and not p_is_test and mode = 'manual'
    and not exists(select 1 from payout_private.bank_check(org.id) b
      where b.bank_acct_last4 is not null and b.step_progress #>> '{bank,passed}' = 'true'
        and b.step_progress #>> '{bank,mode}' = 'cashfree')
    then raise exception 'This organiser needs to complete bank verification.'; end if;
  if not exists(select 1 from public.profiles where id=p_buyer_id and blocked_at is null) then raise exception 'This account cannot book tickets.'; end if;
  if not exists(select 1 from auth.users where id=p_buyer_id and lower(email)=p_email and deleted_at is null) then raise exception 'Buyer email does not match.'; end if;
  select id into current_version from public.active_pricing_version();
  if current_version is distinct from p_pricing_version_id or ev.fee_payer<>p_fee_payer or ev.is_free<>p_is_free then raise exception 'Pricing changed. Please refresh checkout.'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 30
    or (select count(distinct x->>'id') from jsonb_array_elements(p_lines) x)<>jsonb_array_length(p_lines) then raise exception 'Choose valid ticket quantities.'; end if;
  -- Prices are recomputed by the TS engine, then compared here under the locks.
  for item in select x from jsonb_array_elements(p_lines) x order by x->>'id' loop
    select * into tier from public.ticket_types where id=(item->>'id')::uuid and event_id=ev.id for update;
    qty:=(item->>'qty')::integer;
    if not found or qty is null or qty<1 or qty>least(coalesce(tier.per_order_max,50),50) then raise exception 'Choose valid ticket quantities.'; end if;
    if tier.price_paise<>(item->>'price_paise')::bigint then raise exception 'Ticket prices changed. Please refresh checkout.'; end if;
    if (tier.sales_start is not null and tier.sales_start>now()) or (tier.sales_end is not null and tier.sales_end<=now()) then raise exception 'This ticket is not on sale right now.'; end if;
    select coalesce(sum(h.qty),0) into held from public.checkout_holds h where h.ticket_type_id=tier.id and h.released_at is null and h.consumed_at is null and h.expires_at>now();
    if tier.qty_sold+held+qty>tier.qty_total then raise exception 'These tickets just sold out. Please choose another ticket.'; end if;
    requested:=requested+qty;
  end loop;
  if requested>50 then raise exception 'Choose up to 50 tickets per order.'; end if;
  select coalesce(sum(t.qty_sold),0) into occupied from public.ticket_types t where t.event_id=ev.id;
  select occupied+coalesce(sum(h.qty),0) into occupied from public.checkout_holds h join public.orders o on o.id=h.order_id
    where o.event_id=ev.id and h.released_at is null and h.consumed_at is null and h.expires_at>now();
  if ev.capacity is not null and occupied+requested>ev.capacity then raise exception 'This event is sold out.'; end if;
  if (p_amounts->>'buyer_total')::bigint>0 and (p_amounts->>'organiser_share')::bigint<=0 then raise exception 'This ticket cannot be booked at its current price.'; end if;
  if (p_provider='free') is distinct from ((p_amounts->>'buyer_total')::bigint=0) then raise exception 'Payment provider does not match the amount.'; end if;
  insert into public.orders(id,event_id,buyer_id,buyer_name,buyer_email,buyer_phone,subtotal_paise,platform_fee_paise,platform_fee_gst_paise,gateway_fee_paise,total_paise,fee_payer,status,cf_order_id,pricing_version_id,payment_provider,vendor_id,organiser_share_paise,platform_share_paise,access_token_hash,hold_expires_at,attendee_names,consent_at,is_test,payout_mode)
  values(p_order_id,ev.id,p_buyer_id,p_name,p_email,p_phone,(p_amounts->>'subtotal')::bigint,(p_amounts->>'platform_fee')::bigint,(p_amounts->>'platform_fee_gst')::bigint,(p_amounts->>'gateway_fee')::bigint,(p_amounts->>'buyer_total')::bigint,ev.fee_payer,'pending',case when p_provider='cashfree' then p_order_id::text end,p_pricing_version_id,p_provider,case when mode = 'gateway_split' then org.cashfree_vendor_id end,(p_amounts->>'organiser_share')::bigint,(p_amounts->>'platform_share')::bigint,p_token_hash,now()+interval '10 minutes',p_attendees,now(),p_is_test,mode)
  returning * into saved;
  for item in select x from jsonb_array_elements(p_lines) x loop
    insert into public.order_items(order_id,ticket_type_id,qty,unit_price_paise) values(saved.id,(item->>'id')::uuid,(item->>'qty')::integer,case when ev.is_free then 0 else (item->>'price_paise')::bigint end);
    insert into public.checkout_holds(order_id,ticket_type_id,qty,expires_at) values(saved.id,(item->>'id')::uuid,(item->>'qty')::integer,saved.hold_expires_at);
  end loop;
  return to_jsonb(saved);
end; $$;

create or replace function payout_private.schedule_order_payout(p_order_id uuid)
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
  perform payout_private.add_ticket_sale(ord.id);
  if ord.payout_mode = 'manual' or ev.status = 'cancelled' then return; end if;
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

create or replace function public.apply_payout_settlement(
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
  if exists (select 1 from public.orders where id = p_order_id and payout_mode = 'manual') then
    return jsonb_build_object('outcome', 'manual');
  end if;
  -- Take the host lock before touching a payout row, in the same order as refunds.
  perform payout_private.lock_earnings(ev.organiser_id)
  from public.orders o join public.events ev on ev.id = o.event_id where o.id = p_order_id;
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
  if payout.status = 'cancelled' or exists (
    select 1 from public.orders as checkout
    where checkout.id = p_order_id and checkout.status = 'refunded'
  ) then
    return jsonb_build_object(
      'outcome', 'unchanged',
      'order_id', p_order_id,
      'payout_id', payout.id,
      'status', payout.status,
      'is_test', payout.is_test
    );
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

create function payout_private.payment_settings_write(p_mode text, p_gateway text, p_days integer, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := admin_private.require_staff(); prior jsonb; changed jsonb;
begin
  if nullif(btrim(p_reason),'') is null then raise exception 'Enter a reason.'; end if;
  select to_jsonb(s) into prior from public.platform_payment_settings s where id for update;
  update public.platform_payment_settings s set payout_mode = p_mode, active_gateway = p_gateway,
    payout_hold_days_after_event = p_days where id returning to_jsonb(s) into changed;
  insert into public.audit_log(actor_id,action,entity,before,after,reason)
  values(actor,'payment_settings_changed','platform_payment_settings',prior,changed,left(p_reason,1000));
end;
$$;

create function payout_private.host_mode_write(p_id uuid, p_mode text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := admin_private.require_staff(); prior text;
begin
  if nullif(btrim(p_reason),'') is null then raise exception 'Enter a reason.'; end if;
  select payout_mode_override into prior from public.organisers where id = p_id for update;
  if not found then raise exception 'Host not found.'; end if;
  update public.organisers set payout_mode_override = p_mode where id = p_id;
  insert into public.audit_log(actor_id,action,entity,entity_id,before,after,reason)
  values(actor,'host_payout_mode_changed','organisers',p_id,jsonb_build_object('payout_mode_override',prior),
    jsonb_build_object('payout_mode_override',p_mode),left(p_reason,1000));
end;
$$;

-- Current availability also respects an event rescheduled after the original sale
-- and reserves the host's share of a refund that is already approved.
create function payout_private.manual_buckets(p_organiser uuid, p_test boolean)
returns table(event_id uuid, available_paise bigint, remaining_paise bigint, next_at timestamptz, oldest_at timestamptz)
language sql stable set search_path = '' as $$
  with entries as (
    select e.event_id, e.amount_paise,
      case when e.kind in ('ticket_sale','refund') then
        greatest(e.available_at,payout_private.add_ist_working_days(
          coalesce(ev.ends_at,ev.starts_at + interval '1 day',e.available_at),
          (select payout_hold_days_after_event from public.platform_payment_settings where id))) else e.available_at end as ready_at,
      e.kind, ev.status
    from public.organiser_earnings_entries e left join public.events ev on ev.id = e.event_id
    where e.organiser_id = p_organiser and e.is_test = p_test and e.payout_mode = 'manual'
  ), reserved as (
    select o.event_id, sum(r.organiser_reversal_paise)::bigint as amount
    from public.refunds r join public.orders o on o.id = r.order_id
    join public.events ev on ev.id = o.event_id
    where ev.organiser_id = p_organiser and o.is_test = p_test and o.payout_mode = 'manual'
      and r.status = 'approved' and ev.status <> 'cancelled'
    group by o.event_id
  )
  select e.event_id,
    coalesce(sum(e.amount_paise) filter (where ready_at <= now()),0)::bigint - coalesce(r.amount,0)
      - case when e.status = 'cancelled' then greatest(0,coalesce(sum(e.amount_paise)
        filter (where e.kind in ('ticket_sale','refund') and ready_at <= now()),0))::bigint else 0 end,
    sum(e.amount_paise)::bigint,
    min(ready_at) filter (where ready_at > now() and e.status is distinct from 'cancelled' and e.kind in ('ticket_sale','adjustment')),
    min(ready_at) filter (where e.kind in ('ticket_sale','adjustment') and e.amount_paise > 0)
  from entries e left join reserved r on r.event_id = e.event_id
  group by e.event_id, r.amount, e.status;
$$;

create function payout_private.record_manual_payout(p_organiser uuid, p_event uuid, p_amount bigint,
  p_method text, p_reference text, p_paid_on date, p_note text, p_proof text, p_test boolean, p_override_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := admin_private.require_staff(); org public.organisers; bank public.kyc_applications;
  reference text := upper(btrim(p_reference)); saved public.payouts; bucket record;
  can_pay bigint; event_can_pay bigint; remainder bigint := p_amount; allocated bigint;
begin
  if p_amount is null or p_amount <= 0 or p_method is null or p_method not in ('neft','imps','rtgs','upi','other')
    or reference is null or reference !~ '^[A-Z0-9][A-Z0-9/-]{3,79}$' or p_test is null then
    raise exception 'Check the amount, method and bank reference.';
  end if;
  if p_paid_on is null or p_paid_on > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Enter a payment date on or before today in India.';
  end if;
  if p_proof is not null and p_proof !~ ('^payout-proofs/' || p_organiser::text || '/[0-9a-f-]{36}\\.(pdf|png|jpg)$') then
    raise exception 'Invalid payout proof.';
  end if;
  select * into org from public.organisers where id = p_organiser for share;
  if not found then raise exception 'Host not found.'; end if;
  if p_event is not null and not exists (
    select 1 from public.events where id = p_event and organiser_id = p_organiser
  ) then raise exception 'Choose an event for this host.'; end if;
  perform payout_private.lock_earnings(org.id);
  select * into saved from public.payouts where organiser_id = org.id and bank_reference = reference;
  if found then
    if saved.event_id is not distinct from p_event and saved.amount_paise = p_amount
      and saved.method = p_method and saved.paid_on = p_paid_on and saved.is_test = p_test
      and saved.voided_at is null then return saved.id; end if;
    raise exception 'This bank reference was already recorded for the host.' using errcode = '23505';
  end if;
  if org.payouts_on_hold then raise exception 'Payments to this host are on hold.'; end if;
  bank := payout_private.bank_check(org.id);
  if org.kyc_status <> 'approved' or (bank.step_progress #>> '{bank,passed}') is distinct from 'true'
    or bank.bank_acct_last4 is null or (not p_test and (bank.step_progress #>> '{bank,mode}') is distinct from 'cashfree')
    then raise exception 'The host needs an approved ID and bank check.'; end if;
  select coalesce(sum(available_paise),0)::bigint,
    coalesce(sum(available_paise) filter (where event_id = p_event),0)::bigint
  into can_pay, event_can_pay from payout_private.manual_buckets(org.id,p_test);
  if p_amount > (case when p_event is null then can_pay else least(can_pay,event_can_pay) end)
    and nullif(btrim(p_override_reason),'') is null then raise exception 'Amount exceeds what can be paid now.'; end if;
  insert into public.payouts(organiser_id,event_id,amount_paise,status,settled_at,is_test,method,
    bank_reference,paid_on,paid_by,note,proof_path,bank_last4)
  values(org.id,p_event,p_amount,'settled',now(),p_test,p_method,reference,p_paid_on,actor,
    left(p_note,1000),p_proof,bank.bank_acct_last4) returning * into saved;

  if p_event is null then
    -- Attribute an unscoped transfer to the oldest available events first.
    for bucket in select * from payout_private.manual_buckets(org.id,p_test)
      where available_paise > 0 order by oldest_at nulls last,event_id nulls last
    loop
      allocated := least(bucket.available_paise,remainder);
      if bucket.event_id is null then continue; end if;
      insert into public.organiser_earnings_entries(organiser_id,event_id,payout_id,payout_mode,kind,
        amount_paise,available_at,created_by,is_test)
      values(org.id,bucket.event_id,saved.id,'manual','payout',-allocated,now(),actor,p_test);
      remainder := remainder - allocated;
      exit when remainder = 0;
    end loop;
  end if;
  if remainder > 0 then
    insert into public.organiser_earnings_entries(organiser_id,event_id,payout_id,payout_mode,kind,
      amount_paise,available_at,created_by,is_test)
    values(org.id,p_event,saved.id,'manual','payout',-remainder,now(),actor,p_test);
  end if;
  insert into public.audit_log(actor_id,action,entity,entity_id,after,reason)
  values(actor,'manual_payout_paid','payouts',saved.id,to_jsonb(saved),left(p_override_reason,1000));
  return saved.id;
end;
$$;

create function payout_private.void_manual_payout(p_id uuid, p_reference text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := admin_private.require_staff(); saved public.payouts; prior jsonb;
begin
  if nullif(btrim(p_reason),'') is null then raise exception 'Enter a reason.'; end if;
  select * into saved from public.payouts where id = p_id and method is not null;
  if not found or saved.bank_reference is distinct from upper(btrim(p_reference)) then
    raise exception 'Type the bank reference to confirm.';
  end if;
  perform payout_private.lock_earnings(saved.organiser_id);
  select * into saved from public.payouts where id = p_id for update;
  if saved.voided_at is not null then return; end if;
  prior := to_jsonb(saved);
  update public.payouts set voided_at = now(), voided_by = actor, void_reason = left(p_reason,1000)
    where id = p_id returning * into saved;
  insert into public.organiser_earnings_entries(organiser_id,event_id,payout_id,payout_mode,kind,
    amount_paise,available_at,created_by,note,is_test)
  select e.organiser_id,e.event_id,e.payout_id,e.payout_mode,'payout_reversal',-e.amount_paise,
    now(),actor,left(p_reason,1000),e.is_test
  from public.organiser_earnings_entries e where e.payout_id = p_id and e.kind = 'payout';
  insert into public.audit_log(actor_id,action,entity,entity_id,before,after,reason)
  values(actor,'manual_payout_voided','payouts',p_id,prior,to_jsonb(saved),left(p_reason,1000));
end;
$$;

create function payout_private.add_earnings_adjustment(p_organiser uuid, p_event uuid, p_amount bigint,
  p_reason text, p_test boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := admin_private.require_staff(); entry public.organiser_earnings_entries;
begin
  if p_amount is null or p_amount = 0 or nullif(btrim(p_reason),'') is null or p_test is null
    then raise exception 'Enter a nonzero amount and a reason.'; end if;
  if not exists (select 1 from public.organisers where id = p_organiser) or
    (p_event is not null and not exists (select 1 from public.events where id = p_event and organiser_id = p_organiser))
    then raise exception 'Choose an event for this host.'; end if;
  perform payout_private.lock_earnings(p_organiser);
  insert into public.organiser_earnings_entries(organiser_id,event_id,payout_mode,kind,
    amount_paise,available_at,created_by,note,is_test)
  values(p_organiser,p_event,'manual','adjustment',p_amount,now(),actor,left(p_reason,1000),p_test) returning * into entry;
  insert into public.audit_log(actor_id,action,entity,entity_id,after,reason)
  values(actor,'earnings_adjusted','organisers',p_organiser,to_jsonb(entry),left(p_reason,1000));
end;
$$;

create function payout_private.event_earnings(p_event uuid, p_test boolean)
returns jsonb language sql stable set search_path = '' as $$
  with summary as (
    select coalesce(sum(amount_paise) filter (where kind in ('ticket_sale','refund','adjustment')),0)::bigint as earnings,
      -coalesce(sum(amount_paise) filter (where kind in ('payout','payout_reversal')),0)::bigint as paid,
      coalesce(sum(amount_paise),0)::bigint as remaining
    from public.organiser_earnings_entries where event_id = p_event and is_test = p_test
  ), orders as (
    select coalesce(sum(o.subtotal_paise),0)::bigint as gross, coalesce(sum(o.platform_fee_paise),0)::bigint as fee,
      coalesce(sum(o.platform_fee_gst_paise),0)::bigint as gst, coalesce(sum(o.gateway_fee_paise),0)::bigint as charges
    from public.organiser_earnings_entries e join public.orders o on o.id = e.order_id
    where e.event_id = p_event and e.is_test = p_test and e.kind = 'ticket_sale'
  ), refunds as (
    select coalesce(sum(r.amount_paise),0)::bigint as gross,
      -coalesce(sum(e.amount_paise),0)::bigint as host
    from public.organiser_earnings_entries e join public.refunds r on r.id = e.refund_id
    where e.event_id = p_event and e.is_test = p_test
  )
  select jsonb_build_object('id',ev.id,'title',ev.title,'organiser_id',org.id,
    'gross_paise',orders.gross,'fee_paise',orders.fee,'gst_paise',orders.gst,
    'charges_paise',orders.charges,'refunds_paise',refunds.gross,'host_refunds_paise',refunds.host,
    'earnings_paise',earnings,'paid_paise',paid,'remaining_paise',remaining,
    'available_paise',case when org.payouts_on_hold then 0 else greatest(0,coalesce(b.available_paise,0)) end,
    'later_paise',greatest(0,remaining - case when org.payouts_on_hold then 0 else greatest(0,coalesce(b.available_paise,0)) end),
    'next_available_at',case when remaining > 0 then coalesce(b.next_at, split.next_at) end)
  from public.events ev join public.organisers org on org.id = ev.organiser_id
  cross join summary cross join orders cross join refunds
  left join lateral (
    select least(sum(m.available_paise),sum(m.available_paise) filter (where m.event_id = ev.id)) as available_paise,
      min(m.next_at) filter (where m.event_id = ev.id) as next_at
    from payout_private.manual_buckets(org.id,p_test) m
  ) b on true
  left join lateral (select min(expected_at) as next_at from public.payouts
    where event_id = p_event and is_test = p_test and status = 'scheduled' and order_id is not null) split on true
  where ev.id = p_event;
$$;

create function payout_private.host_event_earnings(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not payout_private.can_view_sales(p_event) then
    raise exception 'You cannot view earnings for this event.' using errcode = '42501';
  end if;
  return payout_private.event_earnings(p_event,false);
end;
$$;

create function payout_private.host_earnings_summary(p_test boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare report jsonb;
begin
  if auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid() and blocked_at is not null)
    then raise exception 'You cannot view earnings.' using errcode = '42501'; end if;
  with events as materialized (
    select ev.id, ev.organiser_id, ev.starts_at, payout_private.event_earnings(ev.id,p_test) as data
    from public.events ev where payout_private.can_view_sales(ev.id)
      and (public.is_org_member(ev.organiser_id) or public.is_event_team(ev.id,array['manager']::public.team_role[])
        or exists(select 1 from public.organisers o where o.id = ev.organiser_id and o.owner_id = auth.uid()))
  ), entries as materialized (
    select e.* from public.organiser_earnings_entries e where e.is_test = p_test
      and (e.event_id in (select id from events) or (e.event_id is null and public.is_org_member(e.organiser_id)))
  ), history as (
    select p.id,p.amount_paise,p.paid_on,p.settled_at,p.method,p.bank_reference,p.voided_at,ev.title as event_title
    from public.payouts p left join public.events ev on ev.id = p.event_id
    where p.is_test = p_test and p.status = 'settled'
      and (p.event_id in (select id from events) or (p.event_id is null and public.is_org_member(p.organiser_id)))
  )
  select jsonb_build_object(
    'hold_days',(select payout_hold_days_after_event from public.platform_payment_settings where id),
    'has_test',exists(select 1 from public.organiser_earnings_entries e where e.is_test
      and (e.event_id in (select id from events) or (e.event_id is null and public.is_org_member(e.organiser_id)))),
    'events',(select coalesce(jsonb_agg(data order by starts_at desc,id),'[]') from events),
    'history',(select coalesce(jsonb_agg(to_jsonb(history) order by coalesce(paid_on,(settled_at at time zone 'Asia/Kolkata')::date) desc,id),'[]') from history),
    'earnings_paise',(select coalesce(sum(amount_paise),0) from entries where kind in ('ticket_sale','refund','adjustment')),
    'paid_paise',(select -coalesce(sum(amount_paise),0) from entries where kind in ('payout','payout_reversal')),
    'remaining_paise',(select coalesce(sum(amount_paise),0) from entries),
    'next_available_at',(select min(data->>'next_available_at') from events)
  ) into report;
  return report;
end;
$$;

create function payout_private.staff_payouts(p_test boolean, p_event uuid, p_host uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare report jsonb;
begin
  perform admin_private.require_staff();
  with hosts as (
    select o.id,o.display_name,o.kyc_status,o.payouts_on_hold,o.payout_mode_override,
      b.bank_holder_name,b.bank_acct_last4,b.bank_ifsc,
      (b.step_progress #>> '{bank,passed}' = 'true' and (p_test or b.step_progress #>> '{bank,mode}' = 'cashfree')) is true as bank_passed,
      greatest(0,least(coalesce(s.available,0),coalesce(s.total_available,0)))::bigint as available_paise,
      greatest(0,coalesce(s.remaining,0) - greatest(0,least(coalesce(s.available,0),coalesce(s.total_available,0))))::bigint as later_paise,
      coalesce(s.remaining,0)::bigint as remaining_paise,s.oldest_at,
      coalesce(s.events,'[]') as events
    from public.organisers o
    left join lateral payout_private.bank_check(o.id) b on true
    left join lateral (
      select sum(m.available_paise) as total_available,
        sum(m.available_paise) filter (where p_event is null or m.event_id = p_event) as available,
        sum(m.remaining_paise) filter (where p_event is null or m.event_id = p_event) as remaining,
        min(m.oldest_at) filter (where m.available_paise > 0 and (p_event is null or m.event_id = p_event)) as oldest_at,
        jsonb_agg(to_jsonb(m) || jsonb_build_object('title',ev.title) order by m.oldest_at,m.event_id)
          filter (where p_event is null or m.event_id = p_event) as events
      from payout_private.manual_buckets(o.id,p_test) m left join public.events ev on ev.id = m.event_id
    ) s on true
    where (p_host is null or o.id = p_host)
      and (p_event is null or exists(select 1 from public.events ev where ev.id = p_event and ev.organiser_id = o.id))
      and (s.events is not null or p_host is not null or o.payouts_on_hold)
  ), history as (
    select p.id,p.amount_paise,p.paid_on,p.settled_at,p.method,p.bank_reference,p.voided_at,
      p.void_reason,p.note,p.proof_path,p.organiser_id,p.paid_by,p.voided_by,ev.title as event_title
    from public.payouts p left join public.events ev on ev.id = p.event_id
    where p.is_test = p_test and (p_host is null or p.organiser_id = p_host) and p.method is not null
      and (p_event is null or exists(select 1 from public.organiser_earnings_entries e where e.payout_id = p.id and e.event_id = p_event))
    order by p.created_at desc,p.id limit 200
  ), entries as (
    select e.id,e.organiser_id,e.kind,e.amount_paise,e.available_at,e.created_at,e.created_by,e.note,ev.title as event_title,
      sum(e.amount_paise) over (order by e.created_at,e.id) as balance_paise
    from public.organiser_earnings_entries e left join public.events ev on ev.id = e.event_id
    where p_host is not null and e.organiser_id = p_host and e.is_test = p_test
  )
  select jsonb_build_object('hosts',(select coalesce(jsonb_agg(to_jsonb(hosts) order by display_name,id),'[]') from hosts),
    'history',(select coalesce(jsonb_agg(to_jsonb(history) order by paid_on desc,id),'[]') from history),
    'entries',(select coalesce(jsonb_agg(to_jsonb(entries) order by created_at,id),'[]') from entries))
  into report;
  return report;
end;
$$;

create function payout_private.staff_earnings_reconciliation(p_test boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare report jsonb;
begin
  perform admin_private.require_staff();
  with collected as (
    select coalesce(sum(organiser_share_paise),0) as sales
    from public.orders where is_test = p_test and paid_at is not null and status in ('paid','partially_refunded','refunded')
  ), refunded as (
    select coalesce(sum(r.organiser_reversal_paise),0) as refunds
    from public.refunds r join public.orders o on o.id = r.order_id
    where o.is_test = p_test and r.status = 'processed'
  ), transferred as (
    select coalesce(sum(amount_paise),0) as paid from public.payouts
    where is_test = p_test and status = 'settled' and voided_at is null
  ), ledger as (
    select coalesce(sum(amount_paise),0) as balance,
      coalesce(sum(amount_paise) filter (where kind = 'adjustment'),0) as adjustments
    from public.organiser_earnings_entries where is_test = p_test
  ), host_availability as (
    select o.payouts_on_hold,greatest(0,coalesce(sum(b.available_paise),0)) as available,
      coalesce(sum(b.remaining_paise),0) as remaining
    from public.organisers o cross join lateral payout_private.manual_buckets(o.id,p_test) b
    group by o.id
  )
  select jsonb_build_object('collected_paise',sales,'refunds_paise',refunds,'paid_paise',paid,
    'adjustments_paise',adjustments,'expected_paise',sales-refunds-paid+adjustments,
    'balance_paise',balance,'difference_paise',balance-(sales-refunds-paid+adjustments),
    'available_paise',coalesce((select sum(available) from host_availability where not payouts_on_hold),0),
    'later_paise',coalesce((select sum(greatest(0,remaining - case when payouts_on_hold then 0 else available end))
      from host_availability),0) + coalesce((select sum(greatest(0,balance)) from (
        select sum(amount_paise) as balance from public.organiser_earnings_entries
        where is_test = p_test and payout_mode = 'gateway_split' group by organiser_id
      ) split),0))
  into report from collected,refunded,transferred,ledger;
  return report;
end;
$$;

create function public.admin_update_payment_settings(p_mode text,p_gateway text,p_days integer,p_reason text)
returns void language sql security invoker set search_path = '' as $$
  select payout_private.payment_settings_write(p_mode,p_gateway,p_days,p_reason);
$$;
create function public.admin_set_host_payout_mode(p_id uuid,p_mode text,p_reason text)
returns void language sql security invoker set search_path = '' as $$
  select payout_private.host_mode_write(p_id,p_mode,p_reason);
$$;
create function public.admin_record_manual_payout(p_organiser uuid,p_event uuid,p_amount bigint,p_method text,
  p_reference text,p_paid_on date,p_note text,p_proof text,p_test boolean,p_override_reason text)
returns uuid language sql security invoker set search_path = '' as $$
  select payout_private.record_manual_payout(p_organiser,p_event,p_amount,p_method,p_reference,p_paid_on,p_note,p_proof,p_test,p_override_reason);
$$;
create function public.admin_void_manual_payout(p_id uuid,p_reference text,p_reason text)
returns void language sql security invoker set search_path = '' as $$
  select payout_private.void_manual_payout(p_id,p_reference,p_reason);
$$;
create function public.admin_add_earnings_adjustment(p_organiser uuid,p_event uuid,p_amount bigint,p_reason text,p_test boolean)
returns void language sql security invoker set search_path = '' as $$
  select payout_private.add_earnings_adjustment(p_organiser,p_event,p_amount,p_reason,p_test);
$$;
create function public.organiser_event_earnings(p_event_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select payout_private.host_event_earnings(p_event_id);
$$;
create function public.organiser_earnings_summary(p_test boolean default false)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select payout_private.host_earnings_summary(p_test);
$$;
create function public.admin_payouts_overview(p_test boolean default false,p_event uuid default null,p_host uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select payout_private.staff_payouts(p_test,p_event,p_host);
$$;
create function public.admin_earnings_reconciliation(p_test boolean default false)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select payout_private.staff_earnings_reconciliation(p_test);
$$;
create or replace function payout_private.live_event_sales(p_event_id uuid, p_detail boolean)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  ev public.events;
  report jsonb;
  earnings jsonb;
  channels jsonb;
begin
  select * into ev from public.events where id = p_event_id;
  if not found then return null; end if;

  earnings := payout_private.event_earnings(p_event_id, false);
  with paid as materialized (
    select * from public.orders where event_id = p_event_id and not is_test
      and paid_at is not null and status in ('paid', 'partially_refunded', 'refunded')
  ), refunded as (
    select r.order_id, count(*) filter (where r.status in ('approved', 'processed')) as refund_count,
      coalesce(sum(r.amount_paise) filter (where r.status in ('approved', 'processed')), 0) as refunded_paise,
      coalesce(sum(r.organiser_reversal_paise) filter (where r.status in ('approved', 'processed')), 0) as reversal,
      count(*) filter (where r.status = 'requested') as pending
    from public.refunds r join paid o on o.id = r.order_id
    group by r.order_id
  ), order_money as materialized (
    select o.*, coalesce(r.refunded_paise, 0) as refunded_paise,
      coalesce(r.reversal, 0) as reversal, coalesce(r.pending, 0) as pending,
      coalesce(r.refund_count, 0) as refund_count
    from paid o left join refunded r on r.order_id = o.id
  ), tickets as (
    select t.ticket_type_id,
      count(*) filter (where t.status = 'refunded') as refunded,
      count(*) filter (where t.status = 'void') as voided,
      count(*) filter (where t.status = 'used') as checked_in,
      count(*) filter (where not exists (select 1 from public.order_items i
        where i.order_id = t.order_id and i.ticket_type_id = t.ticket_type_id)) as issued_without_line
    from public.tickets t join paid o on o.id = t.order_id
    group by t.ticket_type_id
  ), line_money as (
    select i.ticket_type_id, i.order_id, i.qty, i.qty * i.unit_price_paise as money,
      o.organiser_share_paise - o.reversal as share, o.subtotal_paise,
      sum(i.qty * i.unit_price_paise) over (partition by i.order_id order by i.ticket_type_id) as running_money
    from public.order_items i join order_money o on o.id = i.order_id
  ), line_totals as (
    -- Allocate the stored order share by ticket money, carrying rounding remainders
    -- across lines so each order reconciles to its exact share.
    select ticket_type_id, sum(qty) as sold, sum(money) as money,
      sum(case when subtotal_paise = 0 then 0 else
        floor(share * running_money / subtotal_paise) -
        floor(share * (running_money - money) / subtotal_paise) end) as share
    from line_money group by ticket_type_id
  ), holds as (
    select i.ticket_type_id, sum(i.qty) as qty_held
    from public.order_items i join public.orders o on o.id = i.order_id
    where o.event_id = p_event_id and not o.is_test and o.status in ('created', 'pending')
      and o.hold_expires_at > statement_timestamp()
    group by i.ticket_type_id
  ), test_inventory as (
    select i.ticket_type_id, sum(i.qty) as sold
    from public.order_items i join public.orders o on o.id = i.order_id
    where o.event_id = p_event_id and o.is_test and o.status in ('paid','partially_refunded','refunded')
      and o.paid_at is not null
    group by i.ticket_type_id
  ), ticket_types as (
    select tt.id, tt.name, tt.price_paise, tt.sort, tt.qty_total,
      case when ev.status = 'cancelled' then 0 else greatest(0, coalesce(l.sold, 0) +
        coalesce(t.issued_without_line, 0) - coalesce(t.refunded, 0) - coalesce(t.voided, 0)) end as sold,
      greatest(0, tt.qty_sold - coalesce(ti.sold, 0)) as inventory_sold,
      coalesce(t.refunded, 0) as refunded_tickets, coalesce(t.checked_in, 0) as checked_in,
      coalesce(h.qty_held, 0) as qty_held, coalesce(l.money, 0) as money_paise,
      coalesce(l.share, 0) as share_paise
    from public.ticket_types tt
    left join line_totals l on l.ticket_type_id = tt.id
    left join tickets t on t.ticket_type_id = tt.id
    left join holds h on h.ticket_type_id = tt.id
    left join test_inventory ti on ti.ticket_type_id = tt.id
    where tt.event_id = p_event_id
  ), day_totals as (
    select (paid_at at time zone 'Asia/Kolkata')::date as date, sum(subtotal_paise) as money_paise,
      count(*) as orders from paid
    where (paid_at at time zone 'Asia/Kolkata')::date >=
      (statement_timestamp() at time zone 'Asia/Kolkata')::date - 29 group by 1
  ), day_sales as (
    select dates.date, coalesce(t.money_paise, 0) as money_paise, coalesce(t.orders, 0) as orders
    from generate_series(29, 0, -1) as offsets(days)
    cross join lateral (select (statement_timestamp() at time zone 'Asia/Kolkata')::date - offsets.days as date) dates
    left join day_totals t on t.date = dates.date
  )
  select jsonb_build_object(
    'venue', ev.venue_name,
    'capacity', ev.capacity,
    'seats_left', greatest(0, ev.capacity - coalesce((select sum(inventory_sold) from ticket_types), 0)),
    'tickets_sold', coalesce((select sum(sold) from ticket_types), 0),
    'tickets_left', coalesce((select sum(greatest(0, qty_total - inventory_sold)) from ticket_types), 0),
    'qty_held', coalesce((select sum(qty_held) from ticket_types), 0),
    'checked_in', coalesce((select sum(checked_in) from ticket_types), 0),
    'refunded_tickets', coalesce((select sum(refunded_tickets) from ticket_types), 0),
    'refunded_paise', coalesce((select sum(refunded_paise) from order_money), 0),
    'refund_count', coalesce((select sum(refund_count) from order_money), 0),
    'refund_requests_pending', coalesce((select sum(pending) from order_money), 0),
    'ticket_money_paise', coalesce((select sum(subtotal_paise) from order_money), 0),
    'buyer_paid_paise', coalesce((select sum(total_paise) from order_money), 0),
    'fee_paise', coalesce((select sum(platform_fee_paise) from order_money), 0),
    'fee_gst_paise', coalesce((select sum(platform_fee_gst_paise) from order_money), 0),
    'gateway_paise', coalesce((select sum(gateway_fee_paise) from order_money), 0),
    'organiser_refunds_paise', (earnings->>'host_refunds_paise')::bigint,
     'share_paise', (earnings->>'earnings_paise')::bigint,
    'paid_out_paise', (earnings->>'paid_paise')::bigint,
    'to_be_paid_paise', (earnings->>'remaining_paise')::bigint,
    'on_hold_paise', case when (select payouts_on_hold from public.organisers where id = ev.organiser_id) then greatest(0, (earnings->>'remaining_paise')::bigint) else 0 end,
    'expected_at', earnings->'next_available_at',
    'ticket_types', coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object('left',
      greatest(0, t.qty_total - t.inventory_sold)) order by t.sort, t.name) from ticket_types t), '[]'::jsonb),
    'sales_by_day', case when p_detail then coalesce((select jsonb_agg(to_jsonb(d) order by d.date)
      from day_sales d), '[]'::jsonb) else '[]'::jsonb end
  ) into report;
  if ev.capacity is null then report := jsonb_set(report, '{seats_left}', 'null'::jsonb); end if;
  if p_detail and exists (select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.orders'::regclass and attname = 'ref_channel' and not attisdropped) then
    execute $query$
      select coalesce(jsonb_agg(to_jsonb(c) order by c.bookings desc, c.channel), '[]'::jsonb)
      from (
        select coalesce(ref_channel, 'Direct') as channel, count(*) as bookings
        from public.orders where event_id = $1 and not is_test
          and status in ('paid','partially_refunded','refunded') and paid_at is not null group by 1
      ) c
    $query$ into channels using p_event_id;
    report := report || jsonb_build_object('channels', channels);
  end if;
  return report;
end;
$$;

-- Complete bank numbers never enter KYC progress or staff list responses.
create table public.payout_bank_accounts (
  application_id uuid primary key references public.kyc_applications(id) on delete cascade,
  bank_check_ref text not null,
  encrypted_number text not null check (length(encrypted_number) between 30 and 200)
);
alter table public.payout_bank_accounts enable row level security;
revoke all on public.payout_bank_accounts from public, anon, authenticated, service_role;

create function public.save_kyc_progress_with_bank(p_user_id uuid,p_organiser_id uuid,p_revision integer,
  p_progress jsonb,p_flagged text[],p_status public.kyc_status,p_submit boolean,p_encrypted_number text)
returns setof public.kyc_applications
language plpgsql security definer set search_path = '' as $$
declare app public.kyc_applications;
begin
  select * into app from public.save_kyc_progress(p_user_id,p_organiser_id,p_revision,p_progress,p_flagged,p_status,p_submit);
  if p_encrypted_number is not null and app.step_progress #>> '{bank,passed}' = 'true' then
    insert into public.payout_bank_accounts(application_id,bank_check_ref,encrypted_number)
    values(app.id,app.step_progress #>> '{bank,ref}',p_encrypted_number)
    on conflict (application_id) do update set
      bank_check_ref = excluded.bank_check_ref,encrypted_number = excluded.encrypted_number;
  else
    delete from public.payout_bank_accounts where application_id = app.id
      and bank_check_ref is distinct from (app.step_progress #>> '{bank,ref}');
  end if;
  return next app;
end;
$$;

create function public.store_reverified_payout_bank(p_user_id uuid,p_organiser uuid,p_application uuid,
  p_ifsc text,p_last4 text,p_mode text,p_encrypted_number text)
returns void language plpgsql security definer set search_path = '' as $$
declare app public.kyc_applications; org public.organisers;
begin
  select * into org from public.organisers where id = p_organiser and owner_id = p_user_id and kyc_status = 'approved' for share;
  if not found or not exists(select 1 from public.profiles where id = p_user_id and blocked_at is null)
    then raise exception 'Host access denied.' using errcode = '42501'; end if;
  app := payout_private.bank_check(org.id);
  if app.id is distinct from p_application or app.bank_ifsc is distinct from p_ifsc
    or app.bank_acct_last4 is distinct from p_last4 or (app.step_progress #>> '{bank,passed}') is distinct from 'true'
    or (app.step_progress #>> '{bank,mode}' = 'cashfree' and p_mode is distinct from 'cashfree')
    then raise exception 'Enter the bank account you used for verification.'; end if;
  insert into public.payout_bank_accounts(application_id,bank_check_ref,encrypted_number)
  values(app.id,app.step_progress #>> '{bank,ref}',p_encrypted_number)
  on conflict (application_id) do update set bank_check_ref = excluded.bank_check_ref, encrypted_number = excluded.encrypted_number
  where public.payout_bank_accounts.bank_check_ref is distinct from excluded.bank_check_ref;
end;
$$;

create function payout_private.staff_bank_details(p_organiser uuid,p_event uuid,p_test boolean,p_export boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := admin_private.require_staff(); rows jsonb;
begin
  if (not p_export and p_organiser is null) or p_export is null then
    raise exception 'Choose a host.';
  end if;
  if not public.consume_rate_limit(md5('payout-bank/' || p_export::text || '/' || actor::text),
    case when p_export then 5 else 20 end,3600) then
    return null;
  end if;
  with eligible as (
    select o.id, b.bank_holder_name as beneficiary, b.bank_ifsc as ifsc,
      greatest(0, least(s.total,case when p_event is null then s.total else s.scoped end))::bigint as amount_paise,
      coalesce(ev.title,'host earnings') as event_title, a.encrypted_number
    from public.organisers o
    cross join lateral payout_private.bank_check(o.id) b
    join public.payout_bank_accounts a on a.application_id = b.id and a.bank_check_ref = b.step_progress #>> '{bank,ref}'
    left join public.events ev on ev.id = p_event and ev.organiser_id = o.id
    left join lateral (
      select sum(available_paise) as total,sum(available_paise) filter (where event_id = p_event) as scoped
      from payout_private.manual_buckets(o.id,p_test)
    ) s on p_export
    where (p_organiser is null or o.id = p_organiser)
      and (p_event is null or ev.id is not null)
      and o.kyc_status = 'approved' and b.step_progress #>> '{bank,passed}' = 'true'
      and (p_test or b.step_progress #>> '{bank,mode}' = 'cashfree')
      and b.bank_holder_name is not null and b.bank_ifsc is not null
      and (not p_export or not o.payouts_on_hold)
  )
  select coalesce(jsonb_agg(to_jsonb(eligible) order by beneficiary,id),'[]') into rows
  from eligible where not p_export or amount_paise > 0;
  insert into public.audit_log(actor_id,action,entity,entity_id,after)
  values(actor,case when p_export then 'payout_bank_export' else 'payout_bank_revealed' end,
    'organisers',p_organiser,jsonb_build_object('host_ids',jsonb_path_query_array(rows,'$[*].id'),
    'event_id',p_event,'is_test',p_test));
  return rows;
end;
$$;

create function public.admin_payout_bank_details(p_organiser uuid,p_event uuid,p_test boolean,p_export boolean)
returns jsonb language sql security invoker set search_path = '' as $$
  select payout_private.staff_bank_details(p_organiser,p_event,p_test,p_export);
$$;

revoke insert on public.organisers from authenticated;
grant insert (id,owner_id,display_name,slug,kyc_status) on public.organisers to authenticated;
revoke select on public.payouts from authenticated;
grant select (id,organiser_id,event_id,order_id,cf_split_ref,amount_paise,status,expected_at,settled_at,created_at,is_test)
  on public.payouts to authenticated;
revoke all on function public.save_kyc_progress_with_bank(uuid,uuid,integer,jsonb,text[],public.kyc_status,boolean,text),
  public.store_reverified_payout_bank(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.save_kyc_progress_with_bank(uuid,uuid,integer,jsonb,text[],public.kyc_status,boolean,text),
  public.store_reverified_payout_bank(uuid,uuid,uuid,text,text,text,text) to service_role;

revoke all on all functions in schema payout_private from public,anon,authenticated,service_role;
grant usage on schema payout_private to authenticated;
grant execute on function payout_private.payment_settings_write(text,text,integer,text),
  payout_private.host_mode_write(uuid,text,text),payout_private.record_manual_payout(uuid,uuid,bigint,text,text,date,text,text,boolean,text),
  payout_private.void_manual_payout(uuid,text,text),payout_private.add_earnings_adjustment(uuid,uuid,bigint,text,boolean),
  payout_private.host_event_earnings(uuid),payout_private.host_earnings_summary(boolean),
  payout_private.staff_payouts(boolean,uuid,uuid),payout_private.staff_earnings_reconciliation(boolean),
  payout_private.staff_bank_details(uuid,uuid,boolean,boolean) to authenticated;
revoke all on function public.admin_update_payment_settings(text,text,integer,text),public.admin_set_host_payout_mode(uuid,text,text),
  public.admin_record_manual_payout(uuid,uuid,bigint,text,text,date,text,text,boolean,text),
  public.admin_void_manual_payout(uuid,text,text),public.admin_add_earnings_adjustment(uuid,uuid,bigint,text,boolean),
  public.organiser_event_earnings(uuid),public.organiser_earnings_summary(boolean),
  public.admin_payouts_overview(boolean,uuid,uuid),public.admin_earnings_reconciliation(boolean),
  public.admin_payout_bank_details(uuid,uuid,boolean,boolean) from public,anon,service_role;
grant execute on function public.admin_update_payment_settings(text,text,integer,text),public.admin_set_host_payout_mode(uuid,text,text),
  public.admin_record_manual_payout(uuid,uuid,bigint,text,text,date,text,text,boolean,text),
  public.admin_void_manual_payout(uuid,text,text),public.admin_add_earnings_adjustment(uuid,uuid,bigint,text,boolean),
  public.organiser_event_earnings(uuid),public.organiser_earnings_summary(boolean),
  public.admin_payouts_overview(boolean,uuid,uuid),public.admin_earnings_reconciliation(boolean),
  public.admin_payout_bank_details(uuid,uuid,boolean,boolean) to authenticated;

create or replace function public.event_excel_rows(p_event_id uuid, p_staff boolean, p_include_orders boolean default true)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not payout_private.can_view_sales(p_event_id) then
    raise exception 'You cannot view sales for this event.' using errcode = '42501';
  end if;
  if p_staff then perform admin_private.require_staff(); end if;
  if public.is_staff() then
    perform moderation_private.audit(p_event_id, 'event_export', null, null, 'Downloaded event Excel.');
  end if;
  with paid as (
    select * from public.orders where event_id = p_event_id and not is_test
      and paid_at is not null and status in ('paid', 'partially_refunded', 'refunded')
  ), order_rows as (
    select left(o.id::text, 8) as id, o.paid_at, lines.ticket_types, lines.qty,
      o.subtotal_paise, o.platform_fee_paise, o.platform_fee_gst_paise, o.gateway_fee_paise,
      r.refund_paise, o.organiser_share_paise - r.reversal as share_paise,
      case when r.refund_paise >= o.total_paise and o.total_paise > 0 then 'Refunded'
        when r.requested then 'Refund requested'
        when r.refund_paise > 0 then 'Part refunded' else 'Paid' end as status
    from paid o
    cross join lateral (
      select coalesce(string_agg(t.name || ' × ' || i.qty, ', ' order by t.sort, t.id), '') as ticket_types,
        coalesce(sum(i.qty), 0) as qty
      from public.order_items i join public.ticket_types t on t.id = i.ticket_type_id where i.order_id = o.id
    ) lines
    cross join lateral (
      select coalesce(sum(amount_paise) filter (where status in ('approved','processed')), 0) as refund_paise,
        coalesce(sum(organiser_reversal_paise) filter (where status in ('approved','processed')), 0) as reversal,
        bool_or(status = 'requested') as requested from public.refunds where order_id = o.id
    ) r
  ), payouts as (
    select created_at, settled_at, expected_at, amount_paise, status
    from public.payouts where event_id = p_event_id and not is_test and order_id is not null
    union all
    select p.created_at,p.settled_at,p.expected_at,-e.amount_paise,
      case when p.voided_at is null then 'settled'::public.payout_status else 'cancelled'::public.payout_status end
    from public.organiser_earnings_entries e join public.payouts p on p.id = e.payout_id
    where e.event_id = p_event_id and e.kind = 'payout' and e.payout_mode = 'manual' and not e.is_test
  )
  select jsonb_build_object(
    'orders', case when p_include_orders then coalesce((select jsonb_agg(to_jsonb(o) order by o.paid_at desc, o.id) from order_rows o), '[]'::jsonb) else '[]'::jsonb end,
    'payouts', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from payouts p), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
