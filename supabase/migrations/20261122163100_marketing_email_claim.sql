-- Add opt-in promotion template to the existing transactional email idempotency claim.
CREATE OR REPLACE FUNCTION public.claim_email_send(p_template text, p_entity_ref text, p_to_email text, p_configured boolean)
 RETURNS SETOF email_log
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_entity text := btrim(p_entity_ref);
  v_recipient text := lower(btrim(p_to_email));
  v_key text;
begin
  if p_template is null or not (p_template = any(array[
    'order_confirmed', 'payment_failed', 'event_reminder', 'marketing_event', 'event_changed',
    'event_cancelled', 'refund_processed', 'refund_request_rejected', 'kyc_submitted', 'kyc_needs_docs',
    'kyc_approved', 'kyc_rejected', 'team_invite', 'payout_settled', 'payout_on_hold',
    'account_blocked', 'staff_alert', 'welcome_attendee', 'welcome_organiser',
    'event_hidden_by_admin', 'event_removal_approved', 'event_removal_rejected'
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
$function$
;
