-- PR 11. Service-only checkout RPCs; no browser may write a payment or inventory ledger.
alter table public.orders
  add column payment_provider text check (payment_provider in ('mock','cashfree','free')),
  add column payment_session_id text,
  add column vendor_id text,
  add column organiser_share_paise bigint not null default 0,
  add column platform_share_paise bigint not null default 0,
  add column access_token_hash text,
  add column hold_expires_at timestamptz,
  add column attendee_names jsonb not null default '[]',
  add column consent_at timestamptz,
  add column is_test boolean not null default false,
  add column reconciled_at timestamptz;
create index checkout_pending_idx on public.orders(created_at) where status in ('created','pending');
create table public.checkout_holds (
  order_id uuid not null references public.orders(id),
  ticket_type_id uuid not null references public.ticket_types(id),
  qty integer not null check(qty>0),
  expires_at timestamptz not null,
  released_at timestamptz,
  consumed_at timestamptz,
  primary key(order_id,ticket_type_id)
);
create index checkout_active_holds on public.checkout_holds(ticket_type_id,expires_at) where released_at is null and consumed_at is null;
create table public.order_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  topic text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  unique(order_id,topic)
);
comment on table public.order_outbox is 'PR 12 consumes order.paid, then stamps consumed_at. Honour payload.is_test. payment.review_required needs operator review, never automatic tickets.';
create table public.checkout_rate_limits (
  key_hash text not null,
  bucket timestamptz not null,
  attempts integer not null,
  primary key(key_hash,bucket)
);
alter table public.checkout_holds enable row level security;
alter table public.order_outbox enable row level security;
alter table public.checkout_rate_limits enable row level security;
revoke all on public.checkout_holds,public.order_outbox,public.checkout_rate_limits from public,anon,authenticated;
grant select,insert,update,delete on public.checkout_holds,public.order_outbox,public.checkout_rate_limits to service_role;

create function public.checkout_rate_limit(p_key text) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  delete from public.checkout_rate_limits where bucket < now()-interval '1 day';
  insert into public.checkout_rate_limits(key_hash,bucket,attempts)
  values(p_key,date_bin('10 minutes',now(),'2026-01-01'::timestamptz),1)
  on conflict(key_hash,bucket) do update set attempts=public.checkout_rate_limits.attempts+1 returning attempts into n;
  return n<=15;
end; $$;
create function public.checkout_user_by_email(p_email text) returns uuid
language sql stable security definer set search_path='' as $$
  select u.id from auth.users u join public.profiles p on p.id=u.id
  where lower(u.email)=lower(p_email) and u.deleted_at is null limit 1;
$$;

-- All inventory transitions lock event -> organiser -> tiers in UUID order -> order.
-- Event locking also serialises capacity across different tiers.
create function public.checkout_hold(p_order_id uuid,p_buyer_id uuid,p_slug text,p_name text,p_email text,p_phone text,
  p_lines jsonb,p_pricing_version_id uuid,p_fee_payer public.fee_payer,p_is_free boolean,p_amounts jsonb,
  p_provider text,p_token_hash text,p_attendees jsonb,p_is_test boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ev public.events; org public.organisers; tier public.ticket_types; item jsonb; current_version uuid;
  requested integer:=0; occupied bigint; held bigint; qty integer; saved public.orders;
begin
  select * into ev from public.events where slug=p_slug for update;
  if not found or ev.status<>'published' or coalesce(ev.ends_at,ev.starts_at)<=now() then raise exception 'This event is not accepting bookings.'; end if;
  select * into org from public.organisers where id=ev.organiser_id for share;
  if org.kyc_status<>'approved' then raise exception 'This organiser is awaiting approval.'; end if;
  if org.sales_paused then raise exception 'Ticket sales are temporarily paused.'; end if;
  if p_provider not in ('mock','cashfree','free') then raise exception 'Invalid payment provider.'; end if;
  if p_provider='cashfree' and nullif(btrim(org.cashfree_vendor_id),'') is null then raise exception 'This organiser is not ready to accept payments.'; end if;
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
    if (tier.sales_start is not null and tier.sales_start>now()) or (tier.sales_end is not null and tier.sales_end<=now()) then raise exception 'This ticket tier is outside its sales window.'; end if;
    select coalesce(sum(h.qty),0) into held from public.checkout_holds h where h.ticket_type_id=tier.id and h.released_at is null and h.consumed_at is null and h.expires_at>now();
    if tier.qty_sold+held+qty>tier.qty_total then raise exception 'These tickets just sold out. Please choose another tier.'; end if;
    requested:=requested+qty;
  end loop;
  if requested>50 then raise exception 'Choose up to 50 tickets per order.'; end if;
  select coalesce(sum(t.qty_sold),0) into occupied from public.ticket_types t where t.event_id=ev.id;
  select occupied+coalesce(sum(h.qty),0) into occupied from public.checkout_holds h join public.orders o on o.id=h.order_id
    where o.event_id=ev.id and h.released_at is null and h.consumed_at is null and h.expires_at>now();
  if ev.capacity is not null and occupied+requested>ev.capacity then raise exception 'This event is sold out.'; end if;
  if (p_amounts->>'buyer_total')::bigint>0 and (p_amounts->>'organiser_share')::bigint<=0 then raise exception 'This ticket cannot be booked at its current price.'; end if;
  if (p_provider='free') is distinct from ((p_amounts->>'buyer_total')::bigint=0) then raise exception 'Payment provider does not match the amount.'; end if;
  insert into public.orders(id,event_id,buyer_id,buyer_name,buyer_email,buyer_phone,subtotal_paise,platform_fee_paise,platform_fee_gst_paise,gateway_fee_paise,total_paise,fee_payer,status,cf_order_id,pricing_version_id,payment_provider,vendor_id,organiser_share_paise,platform_share_paise,access_token_hash,hold_expires_at,attendee_names,consent_at,is_test)
  values(p_order_id,ev.id,p_buyer_id,p_name,p_email,p_phone,(p_amounts->>'subtotal')::bigint,(p_amounts->>'platform_fee')::bigint,(p_amounts->>'platform_fee_gst')::bigint,(p_amounts->>'gateway_fee')::bigint,(p_amounts->>'buyer_total')::bigint,ev.fee_payer,'pending',case when p_provider='cashfree' then p_order_id::text end,p_pricing_version_id,p_provider,org.cashfree_vendor_id,(p_amounts->>'organiser_share')::bigint,(p_amounts->>'platform_share')::bigint,p_token_hash,now()+interval '10 minutes',p_attendees,now(),p_is_test)
  returning * into saved;
  for item in select x from jsonb_array_elements(p_lines) x loop
    insert into public.order_items(order_id,ticket_type_id,qty,unit_price_paise) values(saved.id,(item->>'id')::uuid,(item->>'qty')::integer,case when ev.is_free then 0 else (item->>'price_paise')::bigint end);
    insert into public.checkout_holds(order_id,ticket_type_id,qty,expires_at) values(saved.id,(item->>'id')::uuid,(item->>'qty')::integer,saved.hold_expires_at);
  end loop;
  return to_jsonb(saved);
end; $$;

-- One paid transition for webhooks, free RSVP, mock and reconciliation. Event insert,
-- inventory consumption, status and outbox commit or roll back together.
create function public.checkout_transition(p_order_id uuid,p_state text,p_amount bigint,p_currency text,p_payment_id text default null,
  p_source text default null,p_event_id text default null,p_payload jsonb default '{}')
returns text language plpgsql security definer set search_path='' as $$
declare ord public.orders; ev public.events; item record; tier public.ticket_types; held bigint; occupied bigint; duplicate_id uuid; unavailable boolean:=false;
begin
  select e.* into ev from public.events e join public.orders o on o.event_id=e.id where o.id=p_order_id for update of e;
  if not found then raise exception 'Order not found.'; end if;
  perform 1 from public.ticket_types where event_id=ev.id order by id for update;
  select * into ord from public.orders where id=p_order_id for update;
  if p_source is not null then
    insert into public.webhook_events(source,event_id,payload) values(p_source,p_event_id,p_payload)
      on conflict(source,event_id) do nothing returning id into duplicate_id;
    if duplicate_id is null then return ord.status::text; end if;
  end if;
  if p_state not in ('paid','failed','expired','pending') then raise exception 'Invalid payment state.'; end if;
  if p_currency<>'INR' or p_amount is distinct from ord.total_paise then raise exception 'Payment amount does not match the order.'; end if;
  if p_source='cashfree' and ord.payment_provider<>'cashfree' then raise exception 'Payment provider does not match the order.'; end if;
  if ord.paid_at is not null then
    -- A later failed attempt can never undo a successful payment.
    null;
  elsif exists(select 1 from public.order_outbox where order_id=ord.id and topic='payment.review_required') then
    null; -- A review case is resolved by an operator, never by another automatic attempt.
  elsif p_state='paid' then
    -- A late success may arrive after expiry/failure and seat reallocation. Reacquire
    -- under the same locks or queue review; never oversell or silently issue tickets.
    for item in select * from public.order_items where order_id=ord.id order by ticket_type_id loop
      select * into tier from public.ticket_types where id=item.ticket_type_id;
      select coalesce(sum(qty),0) into held from public.checkout_holds where ticket_type_id=tier.id and order_id<>ord.id and released_at is null and consumed_at is null and expires_at>now();
      if tier.qty_sold+held+item.qty>tier.qty_total then unavailable:=true; end if;
    end loop;
    select coalesce(sum(qty_sold),0) into occupied from public.ticket_types where event_id=ev.id;
    select occupied+coalesce(sum(h.qty),0) into occupied from public.checkout_holds h join public.orders o on o.id=h.order_id
      where o.event_id=ev.id and o.id<>ord.id and h.released_at is null and h.consumed_at is null and h.expires_at>now();
    if ev.capacity is not null and occupied+(select sum(qty) from public.order_items where order_id=ord.id)>ev.capacity then unavailable:=true; end if;
    if unavailable then
      insert into public.order_outbox(order_id,topic,payload) values(ord.id,'payment.review_required',jsonb_build_object('order_id',ord.id,'reason','Paid after inventory was reallocated')) on conflict do nothing;
      update public.orders set status='expired' where id=ord.id;
      update public.checkout_holds set released_at=coalesce(released_at,now()) where order_id=ord.id and consumed_at is null;
    else
      update public.checkout_holds set consumed_at=now(),released_at=null where order_id=ord.id;
      update public.ticket_types t set qty_sold=t.qty_sold+i.qty from public.order_items i where i.order_id=ord.id and i.ticket_type_id=t.id;
      update public.orders set status='paid',paid_at=now(),cf_payment_id=p_payment_id where id=ord.id;
      insert into public.order_outbox(order_id,topic,payload) values(ord.id,'order.paid',jsonb_build_object('order_id',ord.id,'is_test',ord.is_test,'payment_provider',ord.payment_provider)) on conflict do nothing;
    end if;
  elsif p_state in ('failed','expired') then
    update public.checkout_holds set released_at=coalesce(released_at,now()) where order_id=ord.id and consumed_at is null;
    update public.orders set status=p_state::public.order_status where id=ord.id;
  end if;
  if p_source is not null then update public.webhook_events set processed_at=now() where source=p_source and event_id=p_event_id; end if;
  update public.orders set reconciled_at=now() where id=ord.id;
  return (select status::text from public.orders where id=ord.id);
end; $$;

-- Organiser edits cannot reduce inventory below currently held seats, or move a
-- tier with orders to a different event. They acquire the same tier row locks.
create function public.checkout_protect_inventory() returns trigger
language plpgsql security definer set search_path='' as $$
declare held bigint;
begin
  select coalesce(sum(qty),0) into held from public.checkout_holds where ticket_type_id=old.id and released_at is null and consumed_at is null and expires_at>now();
  if new.qty_total<new.qty_sold+held then raise exception 'Inventory cannot be reduced below sold and held tickets.'; end if;
  if new.event_id<>old.event_id and exists(select 1 from public.order_items where ticket_type_id=old.id) then raise exception 'A tier with orders cannot move to another event.'; end if;
  return new;
end; $$;
create trigger checkout_inventory_guard before update on public.ticket_types for each row execute function public.checkout_protect_inventory();

-- Narrow grants explicitly; SECURITY DEFINER is never a public checkout API.
revoke all on function public.checkout_rate_limit(text),public.checkout_user_by_email(text),public.checkout_hold(uuid,uuid,text,text,text,text,jsonb,uuid,public.fee_payer,boolean,jsonb,text,text,jsonb,boolean),public.checkout_transition(uuid,text,bigint,text,text,text,text,jsonb),public.checkout_protect_inventory() from public,anon,authenticated;
grant execute on function public.checkout_rate_limit(text),public.checkout_user_by_email(text),public.checkout_hold(uuid,uuid,text,text,text,text,jsonb,uuid,public.fee_payer,boolean,jsonb,text,text,jsonb,boolean),public.checkout_transition(uuid,text,bigint,text,text,text,text,jsonb) to service_role;

create function public.checkout_protect_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
declare occupied bigint;
begin
  if new.capacity is distinct from old.capacity and new.capacity is not null then
    select coalesce(sum(qty_sold),0) into occupied from public.ticket_types where event_id=old.id;
    select occupied+coalesce(sum(h.qty),0) into occupied from public.checkout_holds h join public.orders o on o.id=h.order_id
      where o.event_id=old.id and h.released_at is null and h.consumed_at is null and h.expires_at>now();
    if new.capacity<occupied then raise exception 'Capacity cannot be reduced below sold and held tickets.'; end if;
  end if;
  return new;
end; $$;
create trigger checkout_capacity_guard before update on public.events for each row execute function public.checkout_protect_capacity();
revoke all on function public.checkout_protect_capacity() from public,anon,authenticated,service_role;
