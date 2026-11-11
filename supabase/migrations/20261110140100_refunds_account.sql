-- PR 15. Refunds, payout adjustments, and attendee data rights.
-- Additive only. Does not edit earlier migrations.

alter table public.refunds
  add column organiser_reversal_paise bigint not null default 0,
  add column gateway_shortfall_paise bigint not null default 0,
  add column processed_at timestamptz,
  add constraint refunds_amount_positive check (amount_paise > 0),
  add constraint refunds_reversal_nonnegative check (organiser_reversal_paise >= 0),
  add constraint refunds_shortfall_nonnegative check (gateway_shortfall_paise >= 0);

comment on column public.refunds.organiser_reversal_paise is
  'Organiser share reversed with this refund, in paise. Never more than the share still left.';
comment on column public.refunds.gateway_shortfall_paise is
  'Gateway cost kept as a platform expense when it is not returned. Not taken from the buyer.';

create unique index refunds_cf_refund_id_key
  on public.refunds (cf_refund_id)
  where cf_refund_id is not null;

create unique index refunds_one_open_per_order
  on public.refunds (order_id)
  where status in ('requested', 'approved');

create table public.refund_tickets (
  refund_id uuid not null references public.refunds (id) on delete restrict,
  ticket_id uuid not null references public.tickets (id) on delete restrict,
  primary key (refund_id, ticket_id)
);

comment on table public.refund_tickets is
  'Unused tickets included in a refund. No payment instrument details.';

alter table public.refund_tickets enable row level security;
revoke all on public.refund_tickets from public, anon, authenticated;
grant select on public.refund_tickets to authenticated;
grant select, insert, update, delete on public.refund_tickets to service_role;

create policy refund_tickets_select
on public.refund_tickets
for select
to authenticated
using (
  public.is_staff()
  or exists (
    select 1
    from public.refunds as refund
    join public.orders as checkout on checkout.id = refund.order_id
    join public.events as event on event.id = checkout.event_id
    where refund.id = refund_tickets.refund_id
      and (
        checkout.buyer_id = auth.uid()
        or public.is_org_member(event.organiser_id)
        or public.is_event_team(event.id, array['manager']::public.team_role[])
      )
  )
);

create table public.payout_refund_exceptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  payout_id uuid references public.payouts (id) on delete restrict,
  refund_id uuid not null references public.refunds (id) on delete restrict,
  amount_paise bigint not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint payout_refund_exceptions_amount check (amount_paise > 0),
  constraint payout_refund_exceptions_reason check (char_length(reason) between 1 and 300),
  constraint payout_refund_exceptions_refund_key unique (refund_id)
);

comment on table public.payout_refund_exceptions is
  'A refund arrived after the organiser was already paid. Staff recover the share. No bank details.';

alter table public.payout_refund_exceptions enable row level security;
revoke all on public.payout_refund_exceptions from public, anon, authenticated;
grant select on public.payout_refund_exceptions to authenticated;
grant select, insert, update, delete on public.payout_refund_exceptions to service_role;

create policy payout_refund_exceptions_select
on public.payout_refund_exceptions
for select
to authenticated
using (public.is_staff());

create schema if not exists refund_private;
revoke all on schema refund_private from public, anon, authenticated, service_role;

create function refund_private.scaled_paise(
  p_refund bigint,
  p_part bigint,
  p_total bigint,
  p_already_part bigint,
  p_already_refunded bigint
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_part <= p_already_part or p_refund <= 0 or p_total <= 0 then 0
    when p_already_refunded + p_refund = p_total then p_part - p_already_part
    else least((p_refund * p_part) / p_total, p_part - p_already_part)
  end;
$$;

create function refund_private.assert_manager(
  p_event_id uuid,
  p_as text,
  p_confirm boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  org_id uuid;
  member boolean;
  staff boolean;
begin
  if actor is null or exists (
    select 1 from public.profiles where id = actor and blocked_at is not null
  ) then
    raise exception 'You need to sign in.' using errcode = '42501';
  end if;
  select organiser_id into org_id from public.events where id = p_event_id;
  if org_id is null then
    raise exception 'Event not found.' using errcode = 'P0002';
  end if;
  member := public.is_org_member(org_id)
    or public.is_event_team(p_event_id, array['manager']::public.team_role[]);
  staff := public.is_staff();
  if coalesce(p_as, '') = 'staff' then
    if not staff then
      raise exception 'You cannot refund this booking.' using errcode = '42501';
    end if;
    if member and coalesce(p_confirm, false) is not true then
      raise exception 'You belong to this organiser. Confirm you are refunding your own organiser.'
        using errcode = '42501';
    end if;
    return 'staff';
  end if;
  if member then
    return 'organiser';
  end if;
  raise exception 'You cannot refund this booking.' using errcode = '42501';
end;
$$;

create function refund_private.insert_refund(
  p_order public.orders,
  p_amount bigint,
  p_status public.refund_status,
  p_reason text,
  p_actor uuid,
  p_ticket_ids uuid[],
  p_all_refundable boolean,
  p_audit text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  done_amount bigint;
  done_reversal bigint;
  done_shortfall bigint;
  remaining bigint;
  reversal bigint;
  shortfall bigint;
  refund_id uuid;
  reason text := left(btrim(coalesce(p_reason, '')), 300);
  refundable integer;
begin
  if reason = '' then reason := null; end if;
  if reason ~* 'sb_secret_|service_role|cashfree_secret|qr_secret' then
    raise exception 'That reason cannot be saved.';
  end if;
  select
    coalesce(sum(amount_paise)::bigint, 0),
    coalesce(sum(organiser_reversal_paise), 0),
    coalesce(sum(gateway_shortfall_paise), 0)
  into done_amount, done_reversal, done_shortfall
  from public.refunds
  where order_id = p_order.id and status = 'processed';
  remaining := p_order.total_paise - done_amount;
  if p_amount is null or p_amount <= 0 or p_amount > remaining then
    raise exception 'That refund is larger than the amount left on this booking.';
  end if;
  if exists (
    select 1 from public.refunds
    where order_id = p_order.id and status in ('requested', 'approved')
  ) then
    raise exception 'A refund is already in progress for this booking.';
  end if;
  reversal := refund_private.scaled_paise(
    p_amount, p_order.organiser_share_paise, p_order.total_paise, done_reversal, done_amount
  );
  shortfall := refund_private.scaled_paise(
    p_amount, p_order.gateway_fee_paise, p_order.total_paise, done_shortfall, done_amount
  );
  select count(*) into refundable
  from public.tickets
  where order_id = p_order.id and status in ('valid', 'transferred');
  if p_amount < remaining and not p_all_refundable and refundable > 0
     and coalesce(cardinality(p_ticket_ids), 0) = 0 then
    raise exception 'Choose the unused tickets to refund.';
  end if;
  insert into public.refunds (
    order_id, amount_paise, reason, status, requested_by, approved_by,
    organiser_reversal_paise, gateway_shortfall_paise
  )
  values (
    p_order.id,
    p_amount,
    reason,
    p_status,
    p_actor,
    case when p_status = 'approved' then p_actor else null end,
    reversal,
    shortfall
  )
  returning id into refund_id;
  if p_all_refundable or p_amount = remaining then
    insert into public.refund_tickets (refund_id, ticket_id)
    select refund_id, ticket.id
    from public.tickets as ticket
    where ticket.order_id = p_order.id and ticket.status in ('valid', 'transferred');
  elsif p_ticket_ids is not null then
    if exists (
      select 1
      from unnest(p_ticket_ids) as wanted (id)
      where not exists (
        select 1 from public.tickets as ticket
        where ticket.id = wanted.id
          and ticket.order_id = p_order.id
          and ticket.status in ('valid', 'transferred')
      )
    ) then
      raise exception 'Choose unused tickets from this booking.';
    end if;
    insert into public.refund_tickets (refund_id, ticket_id)
    select distinct refund_id, wanted.id
    from unnest(p_ticket_ids) as wanted (id);
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, after, reason)
  values (
    p_actor,
    coalesce(
      p_audit,
      case when p_status = 'requested' then 'refund_requested' else 'refund_approved' end
    ),
    'refunds',
    refund_id,
    jsonb_build_object(
      'order_id', p_order.id,
      'amount_paise', p_amount,
      'organiser_reversal_paise', reversal,
      'gateway_shortfall_paise', shortfall,
      'status', p_status,
      'is_test', p_order.is_test
    ),
    reason
  );
  return jsonb_build_object(
    'outcome', 'opened',
    'refund_id', refund_id,
    'order_id', p_order.id,
    'event_id', p_order.event_id,
    'amount_paise', p_amount,
    'reversal_paise', reversal,
    'needs_provider', p_status = 'approved',
    'is_test', p_order.is_test
  );
end;
$$;

create function public.refund_action(
  p_action text,
  p_order_id uuid,
  p_refund_id uuid,
  p_amount bigint,
  p_ticket_ids uuid[],
  p_reason text,
  p_as text,
  p_confirm boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  ord public.orders;
  ev public.events;
  existing public.refunds;
  result jsonb;
begin
  if actor is null then
    raise exception 'You need to sign in.' using errcode = '42501';
  end if;
  if p_action = 'approve' or p_action = 'reject' then
    select * into existing from public.refunds where id = p_refund_id for update;
    if not found or existing.status <> 'requested' then
      raise exception 'That refund request is not waiting for a decision.';
    end if;
    select * into ord from public.orders where id = existing.order_id for update;
    perform refund_private.assert_manager(ord.event_id, p_as, p_confirm);
    if p_action = 'reject' then
      update public.refunds
      set status = 'rejected', approved_by = actor
      where id = existing.id;
      insert into public.audit_log (actor_id, action, entity, entity_id, after, reason)
      values (
        actor, 'refund_rejected', 'refunds', existing.id,
        jsonb_build_object('order_id', ord.id, 'amount_paise', existing.amount_paise),
        left(btrim(coalesce(p_reason, '')), 300)
      );
      return jsonb_build_object(
        'outcome', 'rejected',
        'refund_id', existing.id,
        'order_id', ord.id,
        'needs_provider', false,
        'is_test', ord.is_test
      );
    end if;
    update public.refunds
    set status = 'approved', approved_by = actor
    where id = existing.id;
    insert into public.audit_log (actor_id, action, entity, entity_id, after)
    values (
      actor, 'refund_approved', 'refunds', existing.id,
      jsonb_build_object(
        'order_id', ord.id,
        'amount_paise', existing.amount_paise,
        'organiser_reversal_paise', existing.organiser_reversal_paise,
        'is_test', ord.is_test
      )
    );
    return jsonb_build_object(
      'outcome', 'opened',
      'refund_id', existing.id,
      'order_id', ord.id,
      'event_id', ord.event_id,
      'amount_paise', existing.amount_paise,
      'reversal_paise', existing.organiser_reversal_paise,
      'needs_provider', true,
      'is_test', ord.is_test
    );
  end if;

  if p_order_id is null then
    raise exception 'Choose a booking.';
  end if;
  select * into ord from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  if ord.status not in ('paid', 'partially_refunded') then
    raise exception 'This booking cannot be refunded.';
  end if;
  select * into ev from public.events where id = ord.event_id;

  if p_action = 'request' then
    if ord.buyer_id is distinct from actor then
      raise exception 'You cannot refund this booking.' using errcode = '42501';
    end if;
    if ev.refund_policy = 'none' then
      raise exception 'This event does not offer refunds.';
    end if;
    if ev.refund_policy = '72h' then
      if exists (
        select 1 from public.tickets where order_id = ord.id and status = 'used'
      ) then
        raise exception 'A ticket from this booking has already been used.';
      end if;
      if ev.starts_at - now() < interval '72 hours' then
        raise exception 'Refunds for this event close 72 hours before the start.';
      end if;
      result := refund_private.insert_refund(
        ord, ord.total_paise - coalesce((
          select sum(amount_paise)::bigint from public.refunds
          where order_id = ord.id and status = 'processed'
        ), 0),
        'approved', p_reason, actor, null, true, 'refund_requested'
      );
      return result;
    end if;
    result := refund_private.insert_refund(
      ord, ord.total_paise - coalesce((
        select sum(amount_paise)::bigint from public.refunds
        where order_id = ord.id and status = 'processed'
      ), 0),
      'requested', p_reason, actor, null, false
    );
    return result;
  end if;

  if p_action = 'issue' then
    perform refund_private.assert_manager(ord.event_id, p_as, p_confirm);
    return refund_private.insert_refund(
      ord, p_amount, 'approved', p_reason, actor, p_ticket_ids, false
    );
  end if;

  raise exception 'Choose a refund action.';
end;
$$;

create function public.cancel_event_refunds(
  p_event_id uuid,
  p_reason text,
  p_as text,
  p_confirm boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  ev public.events;
  ord public.orders;
  opened jsonb := '[]'::jsonb;
  row jsonb;
  reason text := left(btrim(coalesce(p_reason, '')), 300);
begin
  perform refund_private.assert_manager(p_event_id, p_as, p_confirm);
  if reason is null or reason = '' then
    raise exception 'Add a short reason for the cancellation.';
  end if;
  if reason ~* 'sb_secret_|service_role|cashfree_secret' then
    raise exception 'That reason cannot be saved.';
  end if;
  if exists (
    select 1
    from public.refunds as refund
    join public.orders as checkout on checkout.id = refund.order_id
    where checkout.event_id = p_event_id
      and refund.status in ('requested', 'approved')
  ) then
    raise exception 'Resolve the open refund request before cancelling the event.';
  end if;
  select * into ev from public.events where id = p_event_id for update;
  if ev.status <> 'cancelled' then
    update public.events set status = 'cancelled' where id = ev.id;
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after, reason)
    values (
      actor, 'event_cancelled', 'events', ev.id,
      jsonb_build_object('status', ev.status),
      jsonb_build_object('status', 'cancelled'),
      reason
    );
  end if;
  for ord in
    select *
    from public.orders
    where event_id = p_event_id
      and status in ('paid', 'partially_refunded')
    order by id
    for update
  loop
    if ord.total_paise > coalesce((
      select sum(amount_paise)::bigint from public.refunds
      where order_id = ord.id and status = 'processed'
    ), 0) then
      row := refund_private.insert_refund(
        ord,
        ord.total_paise - coalesce((
          select sum(amount_paise)::bigint from public.refunds
          where order_id = ord.id and status = 'processed'
        ), 0),
        'approved',
        reason,
        actor,
        null,
        true
      );
      opened := opened || jsonb_build_array(row);
    end if;
  end loop;
  return jsonb_build_object('outcome', 'cancelled', 'event_id', p_event_id, 'refunds', opened);
end;
$$;

create function refund_private.apply_payout(
  p_order public.orders,
  p_refund public.refunds,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  payout public.payouts;
  full_refund boolean;
  done_amount bigint;
begin
  if p_refund.organiser_reversal_paise <= 0 then
    return;
  end if;
  select * into payout from public.payouts where order_id = p_order.id for update;
  if not found then
    return;
  end if;
  select coalesce(sum(amount_paise)::bigint, 0) into done_amount
  from public.refunds
  where order_id = p_order.id and status = 'processed';
  full_refund := done_amount >= p_order.total_paise;
  if payout.status = 'settled' then
    insert into public.payout_refund_exceptions (
      order_id, payout_id, refund_id, amount_paise, reason
    )
    values (
      p_order.id,
      payout.id,
      p_refund.id,
      p_refund.organiser_reversal_paise,
      'This payout was already paid. The refund reversed the organiser share. Do not pay it again.'
    )
    on conflict (refund_id) do nothing;
    insert into public.audit_log (actor_id, action, entity, entity_id, after, reason)
    values (
      p_actor,
      'payout_refund_already_paid',
      'payouts',
      payout.id,
      jsonb_build_object(
        'order_id', p_order.id,
        'refund_id', p_refund.id,
        'amount_paise', p_refund.organiser_reversal_paise,
        'is_test', payout.is_test,
        'gateway_shortfall_paise', p_refund.gateway_shortfall_paise
      ),
      'Already paid. Recorded so the organiser is not paid twice.'
    );
    return;
  end if;
  if payout.status = 'cancelled' then
    return;
  end if;
  if payout.status not in ('scheduled', 'on_hold', 'failed') then
    return;
  end if;
  if full_refund or p_refund.organiser_reversal_paise >= payout.amount_paise then
    update public.payouts set status = 'cancelled' where id = payout.id;
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after, reason)
    values (
      p_actor,
      'payout_refund_cancelled',
      'payouts',
      payout.id,
      jsonb_build_object('status', payout.status, 'amount_paise', payout.amount_paise),
      jsonb_build_object('status', 'cancelled', 'is_test', payout.is_test),
      'Full refund. This payout is not to be paid.'
    );
    return;
  end if;
  update public.payouts
  set amount_paise = payout.amount_paise - p_refund.organiser_reversal_paise
  where id = payout.id;
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (
    p_actor,
    'payout_refund_adjusted',
    'payouts',
    payout.id,
    jsonb_build_object('amount_paise', payout.amount_paise, 'status', payout.status),
    jsonb_build_object(
      'amount_paise', payout.amount_paise - p_refund.organiser_reversal_paise,
      'status', payout.status,
      'is_test', payout.is_test
    )
  );
end;
$$;

create function public.finish_refund(
  p_refund_id uuid,
  p_cf_refund_id text,
  p_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  refund public.refunds;
  ord public.orders;
  actor uuid;
  done_amount bigint;
  next_status public.order_status;
begin
  if p_outcome not in ('processed', 'pending', 'failed') then
    raise exception 'Invalid refund result.';
  end if;
  select * into refund from public.refunds where id = p_refund_id for update;
  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;
  if refund.status = 'processed' and refund.cf_refund_id is not distinct from p_cf_refund_id then
    return jsonb_build_object('outcome', 'duplicate', 'refund_id', refund.id, 'is_test', (
      select is_test from public.orders where id = refund.order_id
    ));
  end if;
  if refund.status <> 'approved' then
    return jsonb_build_object('outcome', 'ignored', 'refund_id', refund.id);
  end if;
  select * into ord from public.orders where id = refund.order_id for update;
  actor := coalesce(refund.approved_by, refund.requested_by);
  if p_outcome = 'failed' then
    update public.refunds
    set status = 'failed',
        cf_refund_id = coalesce(cf_refund_id, nullif(p_cf_refund_id, ''))
    where id = refund.id;
    insert into public.audit_log (actor_id, action, entity, entity_id, after)
    values (
      actor, 'refund_failed', 'refunds', refund.id,
      jsonb_build_object('order_id', ord.id, 'amount_paise', refund.amount_paise)
    );
    return jsonb_build_object('outcome', 'failed', 'refund_id', refund.id);
  end if;
  if p_cf_refund_id is null or p_cf_refund_id !~ '^[A-Za-z0-9:_-]{4,120}$' then
    raise exception 'Invalid refund reference.';
  end if;
  if p_outcome = 'pending' then
    update public.refunds set cf_refund_id = p_cf_refund_id where id = refund.id;
    return jsonb_build_object('outcome', 'pending', 'refund_id', refund.id, 'is_test', ord.is_test);
  end if;
  update public.refunds
  set status = 'processed', cf_refund_id = p_cf_refund_id, processed_at = now()
  where id = refund.id
  returning * into refund;
  update public.tickets as ticket
  set status = 'refunded'
  from public.refund_tickets as link
  where link.refund_id = refund.id
    and link.ticket_id = ticket.id
    and ticket.status in ('valid', 'transferred');
  select coalesce(sum(amount_paise)::bigint, 0) into done_amount
  from public.refunds
  where order_id = ord.id and status = 'processed';
  next_status := case
    when done_amount >= ord.total_paise then 'refunded'::public.order_status
    when done_amount > 0 then 'partially_refunded'::public.order_status
    else ord.status
  end;
  update public.orders set status = next_status where id = ord.id;
  ord.status := next_status;
  perform refund_private.apply_payout(ord, refund, actor);
  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (
    actor,
    'refund_processed',
    'refunds',
    refund.id,
    jsonb_build_object(
      'order_id', ord.id,
      'amount_paise', refund.amount_paise,
      'organiser_reversal_paise', refund.organiser_reversal_paise,
      'gateway_shortfall_paise', refund.gateway_shortfall_paise,
      'order_status', next_status,
      'is_test', ord.is_test
    )
  );
  return jsonb_build_object(
    'outcome', 'processed',
    'refund_id', refund.id,
    'order_id', ord.id,
    'amount_paise', refund.amount_paise,
    'is_test', ord.is_test
  );
end;
$$;

create function public.export_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  payload jsonb;
begin
  if actor is null then
    raise exception 'You need to sign in.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'profile', (
      select jsonb_build_object('full_name', full_name, 'phone', phone)
      from public.profiles where id = actor
    ),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', checkout.id,
        'event_title', event.title,
        'status', checkout.status,
        'paid_at', checkout.paid_at,
        'total_paise', checkout.total_paise,
        'is_test', checkout.is_test
      ) order by checkout.created_at)
      from public.orders as checkout
      join public.events as event on event.id = checkout.event_id
      where checkout.buyer_id = actor
    ), '[]'::jsonb),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', ticket.code,
        'event_title', event.title,
        'status', ticket.status,
        'starts_at', event.starts_at,
        'is_test', checkout.is_test
      ) order by event.starts_at)
      from public.tickets as ticket
      join public.orders as checkout on checkout.id = ticket.order_id
      join public.events as event on event.id = ticket.event_id
      where checkout.buyer_id = actor
    ), '[]'::jsonb),
    'refunds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', refund.id,
        'order_id', refund.order_id,
        'amount_paise', refund.amount_paise,
        'status', refund.status,
        'created_at', refund.created_at
      ) order by refund.created_at)
      from public.refunds as refund
      join public.orders as checkout on checkout.id = refund.order_id
      where checkout.buyer_id = actor
    ), '[]'::jsonb)
  ) into payload;
  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (actor, 'account_export', 'profiles', actor, jsonb_build_object('exported', true));
  return payload;
end;
$$;

create function refund_private.deletion_block(p_actor uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.tickets as ticket
    join public.orders as checkout on checkout.id = ticket.order_id
    join public.events as event on event.id = ticket.event_id
    where checkout.buyer_id = p_actor
      and ticket.status = 'valid'
      and coalesce(event.ends_at, event.starts_at) > now()
  ) then
    return 'You still have upcoming tickets. Those bookings must be refunded or used before you can delete your account.';
  end if;
  if exists (
    select 1
    from public.events as event
    join public.organisers as organiser on organiser.id = event.organiser_id
    where (
      organiser.owner_id = p_actor
      or exists (
        select 1 from public.organiser_members as member
        where member.organiser_id = organiser.id and member.user_id = p_actor
      )
    )
    and (
      event.status = 'published'
      or (event.starts_at > now() and event.status not in ('cancelled', 'ended'))
    )
  ) then
    return 'You still run events with this account. Close them in the organiser console, or visit Help, before you delete your account.';
  end if;
  return null;
end;
$$;

create function public.account_deletion_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  message text;
begin
  if actor is null then
    raise exception 'You need to sign in.' using errcode = '42501';
  end if;
  message := refund_private.deletion_block(actor);
  return jsonb_build_object('allowed', message is null, 'message', coalesce(message, ''));
end;
$$;

create function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  message text;
  tombstone text;
begin
  if actor is null then
    raise exception 'You need to sign in.' using errcode = '42501';
  end if;
  message := refund_private.deletion_block(actor);
  if message is not null then
    raise exception '%', message using errcode = 'P0001';
  end if;
  tombstone := 'deleted+' || replace(actor::text, '-', '') || '@users.invalid';
  update public.orders
  set buyer_name = 'Deleted account', buyer_email = tombstone, buyer_phone = null
  where buyer_id = actor;
  update public.tickets as ticket
  set holder_name = null, holder_email = null
  from public.orders as checkout
  where ticket.order_id = checkout.id and checkout.buyer_id = actor;
  update public.profiles
  set full_name = 'Deleted account', phone = null, country = null,
      blocked_at = coalesce(blocked_at, now()), block_reason = 'Account deleted'
  where id = actor;
  update auth.users
  set
    email = tombstone,
    banned_until = '2999-01-01 00:00:00+00',
    raw_user_meta_data = '{}'::jsonb
  where id = actor;
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id::text = $1' using actor::text;
  end if;
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using actor;
  end if;
  if to_regclass('auth.identities') is not null then
    execute 'delete from auth.identities where user_id = $1' using actor;
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (actor, 'account_deleted', 'profiles', actor, jsonb_build_object('anonymized', true));
  return jsonb_build_object('outcome', 'deleted');
end;
$$;

revoke all on function public.refund_action(text, uuid, uuid, bigint, uuid[], text, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.cancel_event_refunds(uuid, text, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.finish_refund(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.export_my_account() from public, anon, authenticated, service_role;
revoke all on function public.account_deletion_status() from public, anon, authenticated, service_role;
revoke all on function public.delete_my_account() from public, anon, authenticated, service_role;

grant execute on function public.refund_action(text, uuid, uuid, bigint, uuid[], text, text, boolean)
  to authenticated;
grant execute on function public.cancel_event_refunds(uuid, text, text, boolean) to authenticated;
grant execute on function public.finish_refund(uuid, text, text) to service_role;
grant execute on function public.export_my_account() to authenticated;
grant execute on function public.account_deletion_status() to authenticated;
grant execute on function public.delete_my_account() to authenticated;

revoke all on all functions in schema refund_private from public, anon, authenticated, service_role;

-- A cancelled or fully refunded payout must not be settled later.
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
