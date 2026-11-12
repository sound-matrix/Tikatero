-- International organiser identity checks use the existing manual review queue.
alter table public.kyc_applications
  add column id_doc_type text check (id_doc_type in ('passport','national_id','driving_licence','residence_permit')),
  add column id_doc_last4 text check (char_length(id_doc_last4) between 1 and 4),
  add column id_doc_expiry date,
  add column id_country char(2) check (id_country ~ '^[A-Z]{2}$' and id_country <> 'IN'),
  add constraint kyc_intl_columns check (region = 'INTL' or
    (id_doc_type is null and id_doc_last4 is null and id_doc_expiry is null and id_country is null)),
  add constraint kyc_intl_flagged_steps check (
    (region = 'INTL' and flagged_steps <@ array['details','id','selfie']::text[])
    or (region = 'IN' and flagged_steps <@ array['details','pan','aadhaar','gstin','bank','selfie']::text[])
  );
alter table public.kyc_applications drop constraint kyc_flagged_steps;

create function admin_private.lock_saved_kyc_region() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (old.step_progress <> '{}'::jsonb and new.region is distinct from old.region)
     or (old.id_country is not null and new.id_country is distinct from old.id_country) then
    raise exception 'To change country, contact support';
  end if;
  return new;
end;
$$;
create trigger kyc_lock_saved_region before update of region, id_country on public.kyc_applications
for each row execute function admin_private.lock_saved_kyc_region();

create or replace function public.save_kyc_progress(p_user_id uuid, p_organiser_id uuid, p_revision integer, p_progress jsonb, p_flagged text[], p_status public.kyc_status, p_submit boolean)
returns setof public.kyc_applications
language plpgsql security definer set search_path = '' as $$
declare
  application public.kyc_applications;
  requested_region public.kyc_region := case when p_progress ? 'intlDetails' then 'INTL' else 'IN' end;
  requested_country text := p_progress #>> '{intlDetails,country}';
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
    insert into public.kyc_applications (organiser_id, region, revision) values (p_organiser_id, requested_region, 0) returning * into application;
  end if;
  if application.region <> requested_region
     or (application.id_country is not null and application.id_country is distinct from requested_country)
    then raise exception 'To change country, contact support'; end if;
  if application.revision <> p_revision then raise exception 'KYC changed; reload' using errcode = '40001'; end if;
  if application.status not in ('draft','needs_docs') then raise exception 'KYC is locked' using errcode = '42501'; end if;
  if requested_region = 'INTL' then
    if (p_submit and p_status <> 'submitted') or (not p_submit and p_status <> application.status)
      then raise exception 'Invalid KYC transition'; end if;
    if requested_country is null or requested_country !~ '^[A-Z]{2}$' or requested_country = 'IN'
      then raise exception 'Choose a country outside India'; end if;
    if p_progress - array['intlDetails','idDocument','idFront','idBack','selfie','intlUpdatedSteps'] <> '{}'::jsonb
       or coalesce(p_progress->'idDocument', '{}'::jsonb) - array['type','last4','expiry'] <> '{}'::jsonb
      then raise exception 'Invalid international verification details'; end if;
    if p_submit and (
      coalesce(p_progress #>> '{idDocument,expiry}', '') = ''
      or (p_progress #>> '{idDocument,expiry}')::date <= current_date
      or p_progress #>> '{idDocument,type}' is null
      or p_progress #>> '{idDocument,last4}' is null
      or p_progress->>'idFront' is null
      or (p_progress #>> '{idDocument,type}' <> 'passport' and p_progress->>'idBack' is null)
      or p_progress #>> '{selfie,docKey}' is null
      or (application.status = 'needs_docs' and not coalesce(
        (application.step_progress->'intlUpdatedSteps') ?& application.flagged_steps, false
      ))
    ) then raise exception 'Please finish each step before submitting.'; end if;
    update public.kyc_applications set
      step_progress = p_progress, revision = application.revision + 1,
      flagged_steps = p_flagged, status = p_status,
      id_country = requested_country,
      id_doc_type = p_progress #>> '{idDocument,type}',
      id_doc_last4 = p_progress #>> '{idDocument,last4}',
      id_doc_expiry = (p_progress #>> '{idDocument,expiry}')::date,
      doc_keys = array_remove(array[p_progress->>'idFront', p_progress->>'idBack', p_progress #>> '{selfie,docKey}'], null),
      submitted_at = case when p_submit then now() else application.submitted_at end,
      submission_count = application.submission_count + case when p_submit then 1 else 0 end
    where id = application.id returning * into application;
    if p_submit then
      update public.organisers set
        display_name = p_progress #>> '{intlDetails,displayName}',
        legal_name = p_progress #>> '{intlDetails,legalName}',
        country = requested_country, kyc_status = p_status
      where id = p_organiser_id;
    end if;
    return next application;
    return;
  end if;
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

create or replace function admin_private.review_kyc(p_id uuid, p_revision integer, p_decision text, p_steps text[], p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := admin_private.require_staff();
  org public.organisers;
  app public.kyc_applications;
  old_state jsonb;
  new_state jsonb;
  log_id uuid;
  note text := admin_private.safe_note(p_note);
  allowed_steps text[];
  log_note text;
begin
  if p_decision is null or p_decision not in ('approved','rejected','needs_docs') then raise exception 'Choose a review action'; end if;
  -- Same lock order as save_kyc_progress: organiser, then application.
  select o.* into org from public.organisers o join public.kyc_applications a on a.organiser_id=o.id where a.id=p_id for update of o;
  if not found then raise exception 'Application not found'; end if;
  if org.owner_id=actor or exists(select 1 from public.organiser_members where organiser_id=org.id and user_id=actor) then
    raise exception 'You cannot review your own organiser' using errcode='42501';
  end if;
  select * into app from public.kyc_applications where id=p_id for update;
  allowed_steps := case when app.region = 'INTL' then array['details','id','selfie']
    else array['details','pan','aadhaar','gstin','bank','selfie'] end;
  if p_steps is null or not p_steps <@ allowed_steps
     or (p_decision = 'needs_docs' and cardinality(p_steps) = 0)
     or array_position(p_steps, null) is not null then raise exception 'Choose the steps to correct'; end if;
  -- International reviewer notes are visible in the application and emails.
  -- Keep arbitrary text out of the audit log for these identity documents.
  log_note := case when app.region = 'IN' then note end;
  if app.revision is distinct from p_revision then raise exception 'Application changed. Reload before reviewing.' using errcode='40001'; end if;
  if app.status not in ('submitted','auto_passed','needs_docs') or app.submitted_at is null then raise exception 'Application is not waiting for review'; end if;
  if app.region = 'INTL' and app.status <> 'submitted' then
    raise exception 'Application is not waiting for review';
  end if;
  old_state := jsonb_build_object('status',app.status,'organiser_status',org.kyc_status,'revision',app.revision,'flagged_steps',app.flagged_steps,'reviewer_note',case when app.region = 'IN' then admin_private.safe_note(app.reviewer_note) end,'approved_at',org.approved_at,'approved_by',org.approved_by);
  update public.kyc_applications set status=p_decision::public.kyc_status,
    flagged_steps=case when p_decision='needs_docs' then p_steps else '{}'::text[] end,
    reviewer_id=actor,reviewer_note=note,decided_at=now(),revision=case when revision is null then null else revision+1 end where id=p_id returning * into app;
  update public.organisers set kyc_status=p_decision::public.kyc_status,
    approved_at=case when p_decision='approved' then now() end,
    approved_by=case when p_decision='approved' then actor end where id=org.id returning * into org;
  new_state := jsonb_build_object('status',app.status,'organiser_status',org.kyc_status,'revision',app.revision,'flagged_steps',app.flagged_steps,'reviewer_note',log_note,'approved_at',org.approved_at,'approved_by',org.approved_by);
  insert into public.audit_log(actor_id,action,entity,entity_id,before,after,reason)
    values(actor,'kyc_'||p_decision,'kyc_applications',p_id,old_state,new_state,log_note) returning id into log_id;
  return log_id;
end;
$$;


-- Only an active admin may request a document from an already submitted application.
-- The log records which application and document slot were opened.
create function admin_private.open_intl_kyc_document(p_id uuid, p_slot text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := admin_private.require_staff();
  app public.kyc_applications;
  object_key text;
begin
  if not exists (select 1 from public.profiles where id = actor and role = 'admin') then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into app from public.kyc_applications where id = p_id and region = 'INTL'
    and submitted_at is not null;
  object_key := case p_slot
    when 'front' then app.step_progress->>'idFront'
    when 'back' then app.step_progress->>'idBack'
    when 'selfie' then app.step_progress #>> '{selfie,docKey}'
  end;
  if object_key is null or not (object_key = any(app.doc_keys)) or not
    starts_with(object_key, 'kyc/' || app.organiser_id::text || '/' || app.id::text || '/') then
    raise exception 'Document unavailable';
  end if;
  insert into public.audit_log(actor_id, action, entity, entity_id, after)
    values (actor, 'kyc_document_view', 'kyc_applications', p_id, jsonb_build_object('document', p_slot));
  return object_key;
end;
$$;
create function public.open_intl_kyc_document(p_id uuid, p_slot text) returns text
language sql security invoker set search_path = '' as $$
  select admin_private.open_intl_kyc_document(p_id, p_slot);
$$;
revoke all on function public.open_intl_kyc_document(uuid,text),
  admin_private.open_intl_kyc_document(uuid,text) from public, anon, service_role;
grant execute on function public.open_intl_kyc_document(uuid,text),
  admin_private.open_intl_kyc_document(uuid,text) to authenticated;

-- The saved application is authoritative. Organiser profile/venue countries are editable.
create function admin_private.has_intl_kyc(p_organiser_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists(select 1 from public.kyc_applications a
    where a.organiser_id = p_organiser_id and a.region = 'INTL'
      and (a.revision is not null or a.status = 'approved'));
$$;

create function admin_private.guard_intl_event_publish() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and (
    not new.is_free or exists(select 1 from public.ticket_types where event_id = new.id and price_paise > 0)
  ) and admin_private.has_intl_kyc(new.organiser_id) then
    raise exception 'Paid tickets need an Indian bank account for now. Contact support to set this up.';
  end if;
  return new;
end;
$$;
create trigger intl_event_publish before insert or update of status, is_free, organiser_id on public.events
for each row execute function admin_private.guard_intl_event_publish();

create function admin_private.guard_intl_ticket_price() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.price_paise > 0 and exists(select 1 from public.events e where e.id = new.event_id
      and admin_private.has_intl_kyc(e.organiser_id)) then
    raise exception 'Paid tickets need an Indian bank account for now. Contact support to set this up.';
  end if;
  return new;
end;
$$;
create trigger intl_ticket_price before insert or update of price_paise, event_id on public.ticket_types
for each row execute function admin_private.guard_intl_ticket_price();

create function admin_private.guard_intl_paid_order() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.events e where e.id = new.event_id
    and admin_private.has_intl_kyc(e.organiser_id) and (
      new.total_paise > 0 or not e.is_free
      or exists(select 1 from public.ticket_types t where t.event_id = e.id and t.price_paise > 0)
    )) then
    raise exception 'Paid tickets need an Indian bank account for now. Contact support to set this up.';
  end if;
  return new;
end;
$$;
create trigger intl_paid_order before insert on public.orders
for each row execute function admin_private.guard_intl_paid_order();

revoke all on function admin_private.lock_saved_kyc_region(),
  admin_private.has_intl_kyc(uuid), admin_private.guard_intl_event_publish(),
  admin_private.guard_intl_ticket_price(), admin_private.guard_intl_paid_order()
from public, anon, authenticated, service_role;
