-- Event-wide booking deadline. Applied separately from checkout code deployment.
-- For existing and new events, NULL means close at the scheduled event start.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS booking_close_at timestamptz;
ALTER TABLE public.events ADD CONSTRAINT event_booking_close_before_start
  CHECK (booking_close_at IS NULL OR starts_at IS NULL OR booking_close_at <= starts_at);

COMMENT ON COLUMN public.events.booking_close_at IS
  'Optional organiser-selected booking deadline. NULL falls back to event start. Enforced during order creation.';

-- Enforce the deadline inside the checkout RPC while the event row is locked.\n-- This deliberately does not intercept historical order backfills.\nCREATE OR REPLACE FUNCTION public.checkout_hold(p_order_id uuid, p_buyer_id uuid, p_slug text, p_name text, p_email text, p_phone text, p_lines jsonb, p_pricing_version_id uuid, p_fee_payer fee_payer, p_is_free boolean, p_amounts jsonb, p_provider text, p_token_hash text, p_attendees jsonb, p_is_test boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ev public.events; org public.organisers; tier public.ticket_types; item jsonb; current_version uuid;
  requested integer:=0; occupied bigint; held bigint; qty integer; saved public.orders; settings public.platform_payment_settings; mode text;
begin
  select * into ev from public.events where slug=p_slug for update;
  if not found or ev.status<>'published' or ev.hidden_at is not null or coalesce(ev.ends_at,ev.starts_at)<=now() or now()>=coalesce(ev.booking_close_at,ev.starts_at) then raise exception 'Bookings for this event are closed.'; end if;
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
end; $function$
;\n\n-- A host can move the deadline earlier, but not reopen bookings or extend
-- a deadline once buyers have initiated purchases. Staff can use existing
-- event moderation controls to pause sales in emergencies.
CREATE OR REPLACE FUNCTION public.set_event_booking_close(p_event uuid, p_close timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE current_event public.events;
BEGIN
  SELECT * INTO current_event FROM public.events WHERE id=p_event FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.organisers
     WHERE id=current_event.organiser_id AND owner_id=(select auth.uid())
  ) THEN RAISE EXCEPTION 'You cannot update this event.' USING errcode='42501'; END IF;
  IF current_event.status IN ('cancelled','ended')
    OR current_event.starts_at IS NULL
    OR now() >= COALESCE(current_event.booking_close_at,current_event.starts_at)
    THEN RAISE EXCEPTION 'Bookings are already closed.'; END IF;
  IF p_close IS NULL OR p_close > current_event.starts_at OR p_close <= now()
    THEN RAISE EXCEPTION 'Choose a future booking deadline no later than the event start.'; END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE event_id=p_event)
    AND p_close > COALESCE(current_event.booking_close_at,current_event.starts_at)
    THEN RAISE EXCEPTION 'You cannot extend a booking deadline after purchases begin.'; END IF;
  UPDATE public.events SET booking_close_at=p_close WHERE id=p_event;
  INSERT INTO public.audit_log(actor_id,action,entity,entity_id,before,after)
    VALUES ((select auth.uid()),'event_booking_deadline_updated','events',p_event,
      jsonb_build_object('booking_close_at',current_event.booking_close_at),
      jsonb_build_object('booking_close_at',p_close));
END;
$$;
REVOKE ALL ON FUNCTION public.set_event_booking_close(uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_event_booking_close(uuid,timestamptz) TO authenticated;
