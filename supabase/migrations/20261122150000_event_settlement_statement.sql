-- Read-only, identity-scoped financial summary for transparent admin/host CSV.
-- Financial amounts are stored integer paise; no bank account numbers or buyer PII.
CREATE OR REPLACE FUNCTION public.event_settlement_statement(p_event uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  ev public.events;
  org public.organisers;
  bank public.kyc_applications;
  actor uuid := (SELECT auth.uid());
  b record;
  gross bigint := 0;
  commission bigint := 0;
  fee_gst bigint := 0;
  gateway_charges bigint := 0;
  processed_refunds bigint := 0;
  refund_host_share bigint := 0;
  paid_out bigint := 0;
  pending_orders integer := 0;
  pending_refunds integer := 0;
  paid_bookings integer := 0;
  net bigint := 0;
  payable bigint := 0;
  state text;
  latest_utr text;
  latest_paid_at date;
BEGIN
  SELECT * INTO ev FROM public.events WHERE id=p_event;
  IF NOT FOUND THEN RAISE EXCEPTION 'Statement unavailable.' USING errcode='42501'; END IF;
  SELECT * INTO org FROM public.organisers WHERE id=ev.organiser_id;
  bank := payout_private.bank_check(org.id);
  IF actor IS NULL OR NOT (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=actor AND p.role IN ('admin','staff'))
    OR org.owner_id=actor
  ) THEN RAISE EXCEPTION 'Statement unavailable.' USING errcode='42501'; END IF;

  SELECT count(*)::integer,coalesce(sum(total_paise),0)::bigint,
    coalesce(sum(platform_fee_paise),0)::bigint,
    coalesce(sum(platform_fee_gst_paise),0)::bigint,
    coalesce(sum(gateway_fee_paise),0)::bigint
  INTO paid_bookings,gross,commission,fee_gst,gateway_charges
  FROM public.orders WHERE event_id=p_event AND is_test=false
    AND status IN ('paid','refunded','partially_refunded');

  SELECT count(*)::integer INTO pending_orders
    FROM public.orders WHERE event_id=p_event AND is_test=false
      AND (status IN ('created','pending')
        OR (payment_provider='payu' AND status='expired'));

  SELECT count(*)::integer,
    coalesce(sum(amount_paise) FILTER (WHERE status='processed'),0)::bigint,
    coalesce(sum(organiser_reversal_paise) FILTER (WHERE status='processed'),0)::bigint
  INTO pending_refunds,processed_refunds,refund_host_share
  FROM public.refunds WHERE order_id IN
    (SELECT id FROM public.orders WHERE event_id=p_event AND is_test=false)
    AND status IN ('requested','approved','failed','processed');
  -- Above count includes processed; obtain true pending count separately.
  SELECT count(*)::integer INTO pending_refunds
    FROM public.refunds WHERE order_id IN
      (SELECT id FROM public.orders WHERE event_id=p_event AND is_test=false)
      AND status IN ('requested','approved','failed');

  SELECT coalesce(sum(-amount_paise),0)::bigint INTO paid_out
  FROM public.organiser_earnings_entries
  WHERE organiser_id=org.id AND event_id=p_event AND is_test=false
    AND payout_mode='manual' AND kind='payout';

  SELECT coalesce(sum(remaining_paise),0)::bigint,
    coalesce(sum(available_paise),0)::bigint
    INTO net,payable
    FROM payout_private.manual_buckets(org.id,false)
    WHERE event_id=p_event;

  SELECT bank_reference,paid_on INTO latest_utr,latest_paid_at
  FROM public.payouts WHERE organiser_id=org.id AND event_id=p_event
    AND method IS NOT NULL AND is_test=false AND voided_at IS NULL
  ORDER BY paid_on DESC,id DESC LIMIT 1;

  state := CASE
    WHEN ev.status='cancelled' THEN 'cancelled'
    WHEN now() < coalesce(ev.booking_close_at,ev.starts_at) THEN 'bookings_open'
    WHEN pending_orders>0 THEN 'reconciling_payments'
    WHEN pending_refunds>0 THEN 'reconciling_refunds'
    WHEN org.payouts_on_hold THEN 'payout_on_hold'
    WHEN org.kyc_status<>'approved' THEN 'verification_pending'
    WHEN (bank.step_progress #>> '{bank,passed}') IS DISTINCT FROM 'true'
      OR (bank.step_progress #>> '{bank,mode}') IS DISTINCT FROM 'cashfree' THEN 'bank_verification_pending'
    WHEN now()<coalesce(ev.ends_at,ev.starts_at + interval '1 day') THEN 'event_in_progress'
    WHEN net<0 THEN 'recovery_needed'
    WHEN net=0 AND paid_out>0 THEN 'paid'
    WHEN net<=0 THEN 'no_balance'
    WHEN payable<net THEN 'waiting_for_payout_date'
    ELSE 'ready_for_manual_transfer' END;

  RETURN jsonb_build_object(
    'event_id', ev.id,
    'event_title', ev.title,
    'host_name', org.display_name,
    'event_starts_at', ev.starts_at,
    'event_ends_at', ev.ends_at,
    'booking_close_at',coalesce(ev.booking_close_at,ev.starts_at),
    'status',state,
    'paid_booking_count',paid_bookings,
    'pending_order_count',pending_orders,
    'pending_refund_count',pending_refunds,
    'gross_collected_paise',gross,
    'platform_fee_paise',commission,
    'platform_fee_gst_paise',fee_gst,
    'gateway_fee_paise',gateway_charges,
    'processed_refund_paise',processed_refunds,
    'refunded_host_share_paise',refund_host_share,
    'paid_out_paise',paid_out,
    'remaining_host_paise',net,
    'available_host_paise',greatest(0,least(net,payable)),
    'latest_bank_reference',latest_utr,
    'latest_transfer_date',latest_paid_at,
    'statement_as_of',now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.event_settlement_statement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_settlement_statement(uuid) TO authenticated;
