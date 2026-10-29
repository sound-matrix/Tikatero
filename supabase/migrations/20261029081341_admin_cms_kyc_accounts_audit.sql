-- Staff API: a locked change and its minimal audit snapshot commit together.
-- No document keys, provider references, ID numbers or credentials enter the log.
create schema if not exists admin_private;
revoke all on schema admin_private from public, anon;
grant usage on schema admin_private to authenticated;

create function admin_private.require_staff() returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  perform 1 from public.profiles where id = auth.uid() and blocked_at is null and role in ('staff','admin') for share;
  if not found then raise exception 'Staff access required' using errcode = '42501'; end if;
  return auth.uid();
end;
$$;

-- Free text is never a safe source of identity data. Redact likely identifiers
-- and tokens at the database boundary, including direct RPC callers.
create function admin_private.safe_note(p_text text) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(regexp_replace(regexp_replace(regexp_replace(
    btrim(coalesce(p_text,'')),
    '(eyJ[A-Za-z0-9_.-]+|sb_secret_[A-Za-z0-9_-]+|re_[A-Za-z0-9_-]+|Bearer[[:space:]]+[^[:space:]]+)', '[redacted]', 'gi'),
    '[A-Z]{5}[0-9]{4}[A-Z]|[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}', '[redacted]', 'gi'),
    '[0-9]([ -]?[0-9]){7,}', '[redacted]', 'g'), 1000), '');
$$;

-- Retain PR 2's append-only row triggers; close direct INSERT and TRUNCATE too.
revoke insert, update, delete, truncate on public.audit_log from public, anon, authenticated, service_role;
drop policy audit_log_insert on public.audit_log;
create trigger audit_log_reject_truncate before truncate on public.audit_log
for each statement execute function public.reject_audit_log_mutation();

-- Staff cannot bypass the audited API by updating organiser control columns.
-- Other organiser edits and the service-only onboarding RPC retain their grants.
revoke update on public.organisers from authenticated;
grant update (display_name, slug, legal_name, country) on public.organisers to authenticated;
create function admin_private.guard_staff_organiser_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('postgres','supabase_admin','service_role') and
    (new.kyc_status <> 'draft' or new.approved_at is not null or new.approved_by is not null
     or new.payouts_on_hold or new.sales_paused or new.cashfree_vendor_id is not null) then
    raise exception 'Use the audited admin functions' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger organisers_admin_insert_guard before insert on public.organisers
for each row execute function admin_private.guard_staff_organiser_insert();

create function admin_private.review_kyc(p_id uuid, p_revision integer, p_decision text, p_steps text[], p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := admin_private.require_staff();
  org public.organisers;
  app public.kyc_applications;
  old_state jsonb;
  new_state jsonb;
  log_id uuid;
  note text := admin_private.safe_note(p_note);
begin
  if p_decision is null or p_decision not in ('approved','rejected','needs_docs') then raise exception 'Choose a review action'; end if;
  if p_steps is null or not p_steps <@ array['details','pan','aadhaar','gstin','bank','selfie']::text[]
     or (p_decision = 'needs_docs' and cardinality(p_steps) = 0)
     or array_position(p_steps, null) is not null then raise exception 'Choose the steps to correct'; end if;
  -- Same lock order as save_kyc_progress: organiser, then application.
  select o.* into org from public.organisers o join public.kyc_applications a on a.organiser_id=o.id where a.id=p_id for update of o;
  if not found then raise exception 'Application not found'; end if;
  if org.owner_id=actor or exists(select 1 from public.organiser_members where organiser_id=org.id and user_id=actor) then
    raise exception 'You cannot review your own organiser' using errcode='42501';
  end if;
  select * into app from public.kyc_applications where id=p_id for update;
  if app.revision is distinct from p_revision then raise exception 'Application changed. Reload before reviewing.' using errcode='40001'; end if;
  if app.status not in ('submitted','auto_passed','needs_docs') or app.submitted_at is null then raise exception 'Application is not waiting for review'; end if;
  old_state := jsonb_build_object('status',app.status,'organiser_status',org.kyc_status,'revision',app.revision,'flagged_steps',app.flagged_steps,'reviewer_note',admin_private.safe_note(app.reviewer_note),'approved_at',org.approved_at,'approved_by',org.approved_by);
  update public.kyc_applications set status=p_decision::public.kyc_status,
    flagged_steps=case when p_decision='needs_docs' then p_steps else '{}'::text[] end,
    reviewer_id=actor,reviewer_note=note,decided_at=now(),revision=case when revision is null then null else revision+1 end where id=p_id returning * into app;
  update public.organisers set kyc_status=p_decision::public.kyc_status,
    approved_at=case when p_decision='approved' then now() end,
    approved_by=case when p_decision='approved' then actor end where id=org.id returning * into org;
  new_state := jsonb_build_object('status',app.status,'organiser_status',org.kyc_status,'revision',app.revision,'flagged_steps',app.flagged_steps,'reviewer_note',note,'approved_at',org.approved_at,'approved_by',org.approved_by);
  insert into public.audit_log(actor_id,action,entity,entity_id,before,after,reason)
    values(actor,'kyc_'||p_decision,'kyc_applications',p_id,old_state,new_state,note) returning id into log_id;
  return log_id;
end;
$$;

create function admin_private.account_action(p_id uuid,p_action text,p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := admin_private.require_staff();
  profile public.profiles;
  old_state jsonb;
  log_id uuid;
  reason text := admin_private.safe_note(p_reason);
begin
  if p_action is null or p_action not in ('block','suspend','unblock') then raise exception 'Choose an account action'; end if;
  if p_id=actor then raise exception 'You cannot restrict your own account' using errcode='42501'; end if;
  if p_action<>'unblock' and reason is null then raise exception 'A reason is required'; end if;
  select * into profile from public.profiles where id=p_id for update;
  if not found then raise exception 'Account not found'; end if;
  old_state:=jsonb_build_object('blocked_at',profile.blocked_at,'block_reason',admin_private.safe_note(profile.block_reason));
  update public.profiles set blocked_at=case when p_action<>'unblock' then now() end,
    block_reason=case when p_action<>'unblock' then reason end where id=p_id returning * into profile;
  insert into public.audit_log(actor_id,action,entity,entity_id,before,after,reason)
    values(actor,'account_'||p_action,'profiles',p_id,old_state,jsonb_build_object('blocked_at',profile.blocked_at,'block_reason',profile.block_reason),reason) returning id into log_id;
  return log_id;
end;
$$;

create function admin_private.organiser_control(p_id uuid,p_control text,p_enabled boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=admin_private.require_staff(); org public.organisers; old_state jsonb; log_id uuid;
begin
  if p_control is null or p_control not in ('payouts_on_hold','sales_paused') or p_enabled is null then raise exception 'Choose an organiser control'; end if;
  select * into org from public.organisers where id=p_id for update;
  if not found then raise exception 'Organiser not found'; end if;
  old_state:=jsonb_build_object('payouts_on_hold',org.payouts_on_hold,'sales_paused',org.sales_paused);
  update public.organisers set payouts_on_hold=case when p_control='payouts_on_hold' then p_enabled else payouts_on_hold end,
    sales_paused=case when p_control='sales_paused' then p_enabled else sales_paused end where id=p_id returning * into org;
  insert into public.audit_log(actor_id,action,entity,entity_id,before,after)
    values(actor,p_control,'organisers',p_id,old_state,jsonb_build_object('payouts_on_hold',org.payouts_on_hold,'sales_paused',org.sales_paused)) returning id into log_id;
  return log_id;
end;
$$;

-- Staff-only contact search joins Auth internally; no general Auth table grant.
create function admin_private.search_accounts(p_query text,p_offset integer)
returns table(id uuid,full_name text,email text,phone text,role public.user_role,blocked_at timestamptz,block_reason text)
language plpgsql security definer set search_path = '' as $$
begin
  perform admin_private.require_staff();
  return query select p.id,p.full_name,u.email::text,p.phone,p.role,p.blocked_at,p.block_reason
    from public.profiles p join auth.users u on u.id=p.id
    where coalesce(p_query,'')='' or position(lower(left(p_query,120)) in lower(concat_ws(' ',p.full_name,u.email,p.phone)))>0
      or exists(select 1 from public.organisers o where o.owner_id=p.id and (
        position(lower(left(p_query,120)) in lower(concat_ws(' ',o.display_name,o.legal_name)))>0
        or exists(select 1 from public.kyc_applications a where a.organiser_id=o.id
          and position(lower(left(p_query,120)) in coalesce(a.step_progress #>> '{details,phone}',''))>0)))
    order by p.created_at desc,p.id limit 25 offset greatest(0,least(coalesce(p_offset,0),100000));
end;
$$;

-- Only invoker wrappers live in the exposed schema. All privileged functions
-- have fixed search paths and their own fresh staff checks.
create function public.admin_review_kyc(p_id uuid,p_revision integer,p_decision text,p_steps text[],p_note text)
returns uuid language sql security invoker set search_path='' as $$ select admin_private.review_kyc(p_id,p_revision,p_decision,p_steps,p_note); $$;
create function public.admin_account_action(p_id uuid,p_action text,p_reason text)
returns uuid language sql security invoker set search_path='' as $$ select admin_private.account_action(p_id,p_action,p_reason); $$;
create function public.admin_organiser_control(p_id uuid,p_control text,p_enabled boolean)
returns uuid language sql security invoker set search_path='' as $$ select admin_private.organiser_control(p_id,p_control,p_enabled); $$;
create function public.admin_search_accounts(p_query text default '',p_offset integer default 0)
returns table(id uuid,full_name text,email text,phone text,role public.user_role,blocked_at timestamptz,block_reason text)
language sql security invoker set search_path='' as $$ select * from admin_private.search_accounts(p_query,p_offset); $$;

revoke all on all functions in schema admin_private from public,anon,authenticated,service_role;
grant execute on function admin_private.review_kyc(uuid,integer,text,text[],text),admin_private.account_action(uuid,text,text),admin_private.organiser_control(uuid,text,boolean),admin_private.search_accounts(text,integer) to authenticated;
revoke all on function public.admin_review_kyc(uuid,integer,text,text[],text),public.admin_account_action(uuid,text,text),public.admin_organiser_control(uuid,text,boolean),public.admin_search_accounts(text,integer) from public,anon,service_role;
grant execute on function public.admin_review_kyc(uuid,integer,text,text[],text),public.admin_account_action(uuid,text,text),public.admin_organiser_control(uuid,text,boolean),public.admin_search_accounts(text,integer) to authenticated;
create index kyc_admin_queue_idx on public.kyc_applications(status,submitted_at,id);
create index audit_actor_action_idx on public.audit_log(actor_id,action,created_at desc);
