-- Existing accounts have already signed in; they must not receive a backfill.
alter table public.profiles
  add column welcome_email_sent_at timestamptz,
  add column signup_intent text constraint profiles_signup_intent_check
    check (signup_intent in ('attendee', 'organiser'));

update public.profiles set welcome_email_sent_at = now();

-- Snapshot intent at creation. Auth user metadata is editable, so it is never
-- consulted for permissions or later changes to signup intent.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, signup_intent)
  values (
    new.id,
    nullif(coalesce(new.raw_user_meta_data, '{}'::jsonb) ->> 'full_name', ''),
    nullif(to_jsonb(new) ->> 'phone', ''),
    case when new.raw_user_meta_data ->> 'signup_intent' in ('attendee', 'organiser')
      then new.raw_user_meta_data ->> 'signup_intent' else 'attendee' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Column grants are intentionally omitted: authenticated users can still
-- update only full_name, phone, and country through their existing RLS policy.
revoke all (signup_intent, welcome_email_sent_at) on public.profiles from anon, authenticated;
grant select (signup_intent, welcome_email_sent_at) on public.profiles to authenticated;


-- Keep the existing atomic email claim and extend its template allow-list.
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
    'account_blocked', 'staff_alert', 'welcome_attendee', 'welcome_organiser'
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
