-- Safe provider expansion, preserving all legacy Cashfree rows and existing operational logic.
-- Base definitions imported from the connected Tikatero production schema on 2026-11-17.
alter table public.orders drop constraint orders_payment_provider_check;
alter table public.orders add constraint orders_payment_provider_check check (payment_provider in ('mock','cashfree','payu','free'));

CREATE OR REPLACE FUNCTION public.checkout_hold(p_order_id uuid, p_buyer_id uuid, p_slug text, p_name text, p_email text, p_phone text, p_lines jsonb, p_pricing_version_id uuid, p_fee_payer fee_payer, p_is_free boolean, p_amounts jsonb, p_provider text, p_token_hash text, p_attendees jsonb, p_is_test boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ev public.events; org public.organisers; tier public.ticket_types; item jsonb; current_version uuid;
  requested integer:=0; occupied bigint; held bigint; qty integer; saved public.orders; settings public.platform_payment_settings; mode text;
begin
  select * into ev from public.events where slug=p_slug for update;
  if not found or ev.status<>'published' or ev.hidden_at is not null or coalesce(ev.ends_at,ev.starts_at)<=now() then raise exception 'This event is not accepting bookings.'; end if;
  select * into org from public.organisers where id=ev.organiser_id for share;
  if org.kyc_status<>'approved' then raise exception 'This organiser is awaiting approval.'; end if;
  if org.sales_paused then raise exception 'Ticket sales are temporarily paused.'; end if;
  if p_provider not in ('mock','cashfree','payu','free') then raise exception 'Invalid payment provider.'; end if;
  select * into settings from public.platform_payment_settings where id for share;
  mode := coalesce(org.payout_mode_override, settings.payout_mode);
  if p_provider not in ('mock','free') and p_provider <> settings.active_gateway
    then raise exception 'Payment settings changed. Please refresh checkout.'; end if;
  if p_provider = 'payu' and mode <> 'manual' then raise exception 'PayU requires manual organiser payouts.'; end if;
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
end; $function$;

CREATE OR REPLACE FUNCTION public.checkout_transition(p_order_id uuid, p_state text, p_amount bigint, p_currency text, p_payment_id text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_event_id text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if p_source in ('cashfree','payu') and ord.payment_provider<>p_source then raise exception 'Payment provider does not match the order.'; end if;
  if ord.paid_at is not null then
    -- A later failed attempt can never undo a successful payment.
    null;
  elsif exists(select 1 from public.order_outbox where order_id=ord.id and topic='payment.review_required') then
    null; -- A review case is resolved by an operator, never by another automatic attempt.
  elsif p_state='paid' and ev.status='cancelled' then
    -- A held payment can succeed after cancellation. Save the captured money and
    -- queue its full refund without consuming seats or creating tickets.
    update public.checkout_holds set released_at=coalesce(released_at,now()) where order_id=ord.id and consumed_at is null;
    update public.orders set status='paid',paid_at=now(),cf_payment_id=p_payment_id where id=ord.id returning * into ord;
    if ord.total_paise > 0 then
      perform refund_private.insert_refund(ord, ord.total_paise, 'approved', 'The event was cancelled.',
        null, null, true);
    end if;
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
end; $function$;
