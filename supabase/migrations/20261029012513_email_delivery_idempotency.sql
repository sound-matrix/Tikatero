-- Keep the existing staff-only read policy and server-only write grants.
alter table public.email_log add column idempotency_key text;

-- Preserve historical rows, including duplicates, and reserve one permanent key
-- per known legacy identity. Prefer a sent row when one exists.
with ranked as (
  select id, template, btrim(entity_ref) as entity_ref, lower(btrim(to_email)) as recipient,
    row_number() over (
      partition by template, btrim(entity_ref), lower(btrim(to_email))
      order by (status = 'sent') desc, created_at, id
    ) as position
  from public.email_log where entity_ref is not null
)
update public.email_log as log
set idempotency_key = 'tikatero-email-v1-' || encode(extensions.digest(
  convert_to(ranked.template || chr(31) || ranked.entity_ref || chr(31) || ranked.recipient, 'UTF8'), 'sha256'
), 'hex')
from ranked where ranked.id = log.id and ranked.position = 1;

create unique index email_log_idempotency_key_key on public.email_log(idempotency_key);

-- Atomic cross-process claim. Only a configuration skip can be claimed later.
-- Never reclaim sending/unknown/failed rows: an earlier provider call may have
-- succeeded, and provider idempotency keys expire after 24 hours.
create function public.claim_email_send(
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
    'kyc_approved', 'kyc_rejected', 'team_invite', 'payout_settled',
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

revoke all on function public.claim_email_send(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_email_send(text, text, text, boolean) to service_role;
comment on column public.email_log.idempotency_key is 'Permanent opaque notification identity. No email body or attachment content is stored.';
