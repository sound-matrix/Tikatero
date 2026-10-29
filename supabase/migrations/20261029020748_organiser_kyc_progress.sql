-- Existing masked columns and staff review fields are retained. Historical rows are untouched.
alter table public.kyc_applications
  add column step_progress jsonb not null default '{}'::jsonb,
  add column revision integer,
  add column flagged_steps text[] not null default '{}',
  add column submission_count integer not null default 0,
  add constraint kyc_progress_object check (jsonb_typeof(step_progress) = 'object'),
  add constraint kyc_revision_nonnegative check (revision is null or revision >= 0),
  add constraint kyc_flagged_steps check (flagged_steps <@ array['details','pan','aadhaar','gstin','bank','selfie']::text[]);
create unique index kyc_one_onboarding_per_organiser on public.kyc_applications (organiser_id) where revision is not null;
grant select (step_progress, revision, flagged_steps, submission_count) on public.kyc_applications to authenticated;
-- Provider outcomes cannot be asserted from a browser. Member writes use the checked
-- server action and the service-only RPC below; SELECT still uses PR 2 ownership RLS.
revoke insert, update on public.kyc_applications from authenticated;
revoke insert (organiser_id, region, pan_last4, pan_name, pan_name_match, aadhaar_last4, gstin, bank_ifsc, bank_acct_last4, bank_holder_name, liveness_score, face_match_score, provider_refs, status, submitted_at) on public.kyc_applications from authenticated;
revoke update (region, pan_last4, pan_name, pan_name_match, aadhaar_last4, gstin, bank_ifsc, bank_acct_last4, bank_holder_name, liveness_score, face_match_score, provider_refs, status, reviewer_id, reviewer_note, submitted_at, decided_at) on public.kyc_applications from authenticated;

create function public.save_kyc_progress(p_user_id uuid, p_organiser_id uuid, p_revision integer, p_progress jsonb, p_flagged text[], p_status public.kyc_status, p_submit boolean)
returns setof public.kyc_applications
language plpgsql security invoker set search_path = '' as $$
declare application public.kyc_applications;
begin
  -- The user id comes only from getUser(), never from action input. Recheck under
  -- the transaction lock so removal/blocking during a provider request fails closed.
  perform 1 from public.profiles where id = p_user_id and blocked_at is null for share;
  if not found then raise exception 'KYC access denied' using errcode = '42501'; end if;
  perform 1 from public.organiser_members where user_id = p_user_id and organiser_id = p_organiser_id for share;
  if not found then raise exception 'KYC access denied' using errcode = '42501'; end if;
  perform 1 from public.organisers where id = p_organiser_id and kyc_status not in ('approved','rejected') for update;
  if not found then raise exception 'KYC is locked' using errcode = '42501'; end if;
  select * into application from public.kyc_applications where organiser_id = p_organiser_id and revision is not null for update;
  if not found then
    if p_revision <> 0 then raise exception 'KYC changed; reload' using errcode = '40001'; end if;
    insert into public.kyc_applications (organiser_id, region, revision) values (p_organiser_id, 'IN', 0) returning * into application;
  end if;
  if application.revision <> p_revision then raise exception 'KYC changed; reload' using errcode = '40001'; end if;
  if application.status not in ('draft','needs_docs') then raise exception 'KYC is locked' using errcode = '42501'; end if;
  if (p_submit and p_status not in ('auto_passed','needs_docs')) or (not p_submit and p_status <> application.status) then raise exception 'Invalid KYC transition'; end if;
  update public.kyc_applications set
    step_progress = p_progress, revision = application.revision + 1,
    flagged_steps = p_flagged, status = p_status,
    pan_last4 = p_progress #>> '{pan,last4}', pan_name = p_progress #>> '{pan,name}',
    pan_name_match = coalesce((p_progress #>> '{pan,passed}')::boolean, false),
    aadhaar_last4 = p_progress #>> '{aadhaar,last4}',
    -- GSTIN includes a PAN: retain only its last four too.
    gstin = p_progress #>> '{gstin,last4}',
    bank_ifsc = p_progress #>> '{bank,ifsc}', bank_acct_last4 = p_progress #>> '{bank,last4}', bank_holder_name = p_progress #>> '{bank,name}',
    liveness_score = (p_progress #>> '{selfie,score}')::numeric,
    face_match_score = (p_progress #>> '{selfie,faceScore}')::numeric,
    provider_refs = jsonb_strip_nulls(jsonb_build_object('pan', p_progress #>> '{pan,ref}', 'aadhaar', p_progress #>> '{aadhaar,ref}', 'gstin', p_progress #>> '{gstin,ref}', 'bank', p_progress #>> '{bank,ref}', 'selfie', p_progress #>> '{selfie,ref}')),
    doc_keys = array_remove(array[p_progress #>> '{aadhaar,docKey}', p_progress #>> '{selfie,docKey}'], null),
    submitted_at = case when p_submit then now() else application.submitted_at end,
    submission_count = application.submission_count + case when p_submit then 1 else 0 end
  where id = application.id returning * into application;
  if p_progress ? 'details' then
    update public.organisers set display_name = p_progress #>> '{details,displayName}', legal_name = p_progress #>> '{details,legalName}' where id = p_organiser_id;
  end if;
  if p_submit then update public.organisers set kyc_status = p_status where id = p_organiser_id; end if;
  return next application;
end;
$$;
revoke all on function public.save_kyc_progress(uuid,uuid,integer,jsonb,text[],public.kyc_status,boolean) from public, anon, authenticated;
grant execute on function public.save_kyc_progress(uuid,uuid,integer,jsonb,text[],public.kyc_status,boolean) to service_role;
