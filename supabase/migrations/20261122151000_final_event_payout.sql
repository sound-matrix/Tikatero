-- Final payout can only be recorded AFTER an actual external bank transfer.
-- This API does not send money. It derives the exact amount from the locked ledger
-- and delegates all bank verification / UTR uniqueness to the established payout RPC.
CREATE OR REPLACE FUNCTION public.admin_record_final_event_payout(
  p_event uuid, p_method text, p_reference text, p_paid_on date, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  actor uuid := admin_private.require_staff();
  ev public.events;
  summary jsonb;
  due bigint;
  existing public.payouts;
BEGIN
  SELECT * INTO ev FROM public.events WHERE id=p_event FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found.'; END IF;
  PERFORM payout_private.lock_earnings(ev.organiser_id);
  -- Retry after a lost response must not produce a second bank record.
  SELECT * INTO existing FROM public.payouts WHERE organiser_id=ev.organiser_id
     AND event_id=p_event AND bank_reference=upper(btrim(p_reference))
     AND method IS NOT NULL AND is_test=false AND voided_at IS NULL
     ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    IF existing.method=p_method AND existing.paid_on=p_paid_on THEN RETURN existing.id; END IF;
    RAISE EXCEPTION 'This bank reference has already been used.';
  END IF;

  summary := public.event_settlement_statement(p_event);
  IF summary->>'status' <> 'ready_for_manual_transfer'
    THEN RAISE EXCEPTION 'This event is not ready for final settlement. Reconcile bookings, refunds and payout holds first.'; END IF;
  due := (summary->>'remaining_host_paise')::bigint;
  IF due IS NULL OR due<=0 OR due<>(summary->>'available_host_paise')::bigint
    THEN RAISE EXCEPTION 'The final amount cannot be settled yet.'; END IF;
  RETURN payout_private.record_manual_payout(
    ev.organiser_id,p_event,due,p_method,p_reference,p_paid_on,
    left(p_note,1000),NULL,false,NULL
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_record_final_event_payout(uuid,text,text,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_record_final_event_payout(uuid,text,text,date,text) TO authenticated;
