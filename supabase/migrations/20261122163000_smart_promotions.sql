-- PR 57: consent-first organiser promotions. No existing buyer is opted in.
create schema if not exists promotions_private;
revoke all on schema promotions_private from public, anon, authenticated;
grant usage on schema promotions_private to service_role;

create table public.marketing_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_opt_in boolean not null default false,
  whatsapp_opt_in boolean not null default false,
  email_consented_at timestamptz,
  whatsapp_consented_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.marketing_preferences enable row level security;
revoke all on public.marketing_preferences from public, anon, authenticated;
grant select on public.marketing_preferences to authenticated, service_role;
create policy marketing_preferences_self_read on public.marketing_preferences
  for select to authenticated using (user_id=auth.uid());

create function public.set_marketing_preference(p_channel text, p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null or p_channel not in ('email','whatsapp') or p_enabled is null
    or not exists(select 1 from public.profiles where id=actor and blocked_at is null)
    then raise exception 'Preference could not be updated.' using errcode='42501'; end if;
  insert into public.marketing_preferences(user_id) values(actor) on conflict do nothing;
  if p_channel='email' then
    update public.marketing_preferences set email_opt_in=p_enabled,
      email_consented_at=case when p_enabled then now() else null end,updated_at=now()
    where user_id=actor;
  else
    update public.marketing_preferences set whatsapp_opt_in=p_enabled,
      whatsapp_consented_at=case when p_enabled then now() else null end,updated_at=now()
    where user_id=actor;
  end if;
end;
$$;
revoke all on function public.set_marketing_preference(text,boolean) from public,anon;
grant execute on function public.set_marketing_preference(text,boolean) to authenticated;

create table public.promotion_campaigns (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  organiser_id uuid not null references public.organisers(id) on delete cascade,
  status text not null default 'pending_review'
    check(status in ('pending_review','approved','paused','rejected')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index promotion_campaigns_organiser_idx on public.promotion_campaigns(organiser_id,status);
alter table public.promotion_campaigns enable row level security;
revoke all on public.promotion_campaigns from public,anon,authenticated;
grant select on public.promotion_campaigns to authenticated, service_role;
create policy promotion_campaigns_visible on public.promotion_campaigns
  for select to authenticated using (
    exists(select 1 from public.organisers org
      where org.id=organiser_id and org.owner_id=auth.uid())
    or exists(select 1 from public.profiles p where p.id=auth.uid()
      and p.role='admin' and p.blocked_at is null)
  );

create table public.promotion_email_deliveries (
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued'
    check(status in ('queued','sending','sent','failed','suppressed')),
  attempts smallint not null default 0 check(attempts between 0 and 3),
  locked_until timestamptz,
  sent_at timestamptz,
  last_error text,
  primary key(campaign_id,buyer_id)
);
create index promotion_deliveries_queue_idx on public.promotion_email_deliveries(status,locked_until);
alter table public.promotion_email_deliveries enable row level security;
revoke all on public.promotion_email_deliveries from public,anon,authenticated;

-- Only prior real paid booking holders who personally opted into future
-- organiser promotion. Never reuse payment/transactional consent.
create function promotions_private.eligible(p_event uuid)
returns table(buyer_id uuid) language sql stable security definer set search_path='' as $$
  select distinct o.buyer_id
  from public.events target
  join public.events historical on historical.organiser_id=target.organiser_id
    and historical.id<>target.id and historical.starts_at<now()
  join public.orders o on o.event_id=historical.id
  join public.marketing_preferences pref on pref.user_id=o.buyer_id
  join public.profiles profile on profile.id=o.buyer_id
  where target.id=p_event and o.buyer_id is not null
    and o.is_test=false and o.status in ('paid','partially_refunded')
    and pref.email_opt_in and pref.email_consented_at is not null
    and profile.blocked_at is null
$$;
revoke all on function promotions_private.eligible(uuid) from public,anon,authenticated;

create function public.promotion_audience_count(p_event uuid)
returns integer language plpgsql stable security definer set search_path='' as $$
declare total integer;
begin
  if not exists (
    select 1 from public.events e join public.organisers o on o.id=e.organiser_id
    where e.id=p_event and (o.owner_id=auth.uid() or exists(
      select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'
        and p.blocked_at is null))
  ) then raise exception 'Audience not available.' using errcode='42501'; end if;
  select count(*)::integer into total from promotions_private.eligible(p_event);
  return total;
end;
$$;
revoke all on function public.promotion_audience_count(uuid) from public,anon;
grant execute on function public.promotion_audience_count(uuid) to authenticated;

-- Publishing a public event proposes a campaign, not an unsolicited send.
create function promotions_private.queue_published_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare newly_published boolean := (tg_op='INSERT');
begin
  if not newly_published then
    newly_published := old.status is distinct from 'published';
  end if;
  if new.status='published' and new.hidden_at is null and not new.is_unlisted
    and new.starts_at>now()
    and newly_published then
    insert into public.promotion_campaigns(event_id,organiser_id)
      values(new.id,new.organiser_id) on conflict(event_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function promotions_private.queue_published_event() from public,anon,authenticated;
create trigger enqueue_smart_promotion after insert or update of status on public.events
 for each row execute function promotions_private.queue_published_event();

create function public.host_request_promotion(p_event uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not exists(select 1 from public.events ev
    join public.organisers org on org.id=ev.organiser_id
    where ev.id=p_event and org.owner_id=auth.uid() and org.kyc_status='approved'
      and ev.status='published' and ev.hidden_at is null
      and ev.is_unlisted=false and ev.starts_at>now())
  then raise exception 'This event cannot be promoted.' using errcode='42501'; end if;
  insert into public.promotion_campaigns(event_id,organiser_id)
    select id,organiser_id from public.events where id=p_event
    on conflict(event_id) do nothing;
  select id into result from public.promotion_campaigns where event_id=p_event;
  return result;
end;
$$;
revoke all on function public.host_request_promotion(uuid) from public,anon;
grant execute on function public.host_request_promotion(uuid) to authenticated;

create function public.admin_decide_promotion(p_event uuid,p_approved boolean)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); campaign public.promotion_campaigns;
begin
  if actor is null or not exists(select 1 from public.profiles where id=actor
    and role='admin' and blocked_at is null) or p_approved is null
  then raise exception 'Admin permission required.' using errcode='42501'; end if;
  select * into campaign from public.promotion_campaigns where event_id=p_event for update;
  if not found or campaign.status<>'pending_review'
  then raise exception 'Campaign is not awaiting review.'; end if;
  if p_approved and not exists(
    select 1 from public.events e where e.id=p_event and e.status='published'
      and e.hidden_at is null and e.is_unlisted=false and e.starts_at>now()
  ) then raise exception 'Event is no longer eligible.'; end if;
  update public.promotion_campaigns set status=case when p_approved then 'approved' else 'rejected' end,
    approved_at=case when p_approved then now() else null end,
    approved_by=actor where id=campaign.id;
  if p_approved then
    insert into public.promotion_email_deliveries(campaign_id,buyer_id)
      select campaign.id,eligible.buyer_id from promotions_private.eligible(p_event) eligible
      order by eligible.buyer_id limit 200
      on conflict do nothing;
  end if;
  insert into public.audit_log(actor_id,action,entity,entity_id,after)
    values(actor,'promotion_review','promotion_campaigns',campaign.id,
      jsonb_build_object('approved',p_approved));
end;
$$;
revoke all on function public.admin_decide_promotion(uuid,boolean) from public,anon;
grant execute on function public.admin_decide_promotion(uuid,boolean) to authenticated;

create function public.promotion_claim_emails(p_limit integer default 10)
returns table(campaign_id uuid,buyer_id uuid,buyer_email text,event_id uuid,event_slug text,
  event_title text,starts_at timestamptz,venue_name text,organiser_name text)
language plpgsql security definer set search_path='' as $$
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role'
    then raise exception 'Service permission required.' using errcode='42501'; end if;
  if p_limit<1 or p_limit>20 then raise exception 'Invalid batch size.'; end if;
  -- Suppress revocations before claiming. Never reuse old consent.
  update public.promotion_email_deliveries d set status='suppressed'
  where d.status='queued' and not exists(
    select 1 from public.marketing_preferences p where p.user_id=d.buyer_id
    and p.email_opt_in and p.email_consented_at is not null
  );
  return query
  with selected as (
    select d.campaign_id,d.buyer_id
    from public.promotion_email_deliveries d
    join public.promotion_campaigns c on c.id=d.campaign_id
    join public.events e on e.id=c.event_id
    join public.marketing_preferences p on p.user_id=d.buyer_id
    join auth.users u on u.id=d.buyer_id and u.email_confirmed_at is not null
      and u.deleted_at is null and u.email is not null
    where (d.status='queued' or (d.status='sending' and d.locked_until<now()))
      and d.attempts<3 and c.status='approved'
      and e.status='published' and e.hidden_at is null and not e.is_unlisted
      and e.starts_at>now() and p.email_opt_in and p.email_consented_at is not null
    order by c.approved_at,d.buyer_id limit p_limit for update of d skip locked
  ), claimed as (
    update public.promotion_email_deliveries d
      set status='sending',attempts=d.attempts+1,locked_until=now()+interval '10 minutes'
    from selected s where d.campaign_id=s.campaign_id and d.buyer_id=s.buyer_id
    returning d.campaign_id,d.buyer_id
  )
  select c.id,cl.buyer_id,u.email,e.id,e.slug,e.title,e.starts_at,
     coalesce(e.venue_name,'See event page'),org.display_name
  from claimed cl join public.promotion_campaigns c on c.id=cl.campaign_id
  join public.events e on e.id=c.event_id
  join public.organisers org on org.id=c.organiser_id
  join auth.users u on u.id=cl.buyer_id
  where u.email_confirmed_at is not null and u.deleted_at is null
    and u.email is not null;
end;
$$;
revoke all on function public.promotion_claim_emails(integer) from public,anon,authenticated;
grant execute on function public.promotion_claim_emails(integer) to service_role;

create function public.promotion_finish_email(p_campaign uuid,p_buyer uuid,p_success boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role'
    then raise exception 'Service permission required.' using errcode='42501'; end if;
  update public.promotion_email_deliveries
    set status=case when p_success then 'sent' else 'failed' end,
        sent_at=case when p_success then now() else null end,locked_until=null
   where campaign_id=p_campaign and buyer_id=p_buyer and status='sending';
end;
$$;
revoke all on function public.promotion_finish_email(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.promotion_finish_email(uuid,uuid,boolean) to service_role;

create function public.promotion_stop_email(p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role'
    then raise exception 'Service permission required.' using errcode='42501'; end if;
  update public.marketing_preferences set email_opt_in=false,email_consented_at=null,
    updated_at=now() where user_id=p_user;
  update public.promotion_email_deliveries set status='suppressed'
    where buyer_id=p_user and status='queued';
end;
$$;
revoke all on function public.promotion_stop_email(uuid) from public,anon,authenticated;
grant execute on function public.promotion_stop_email(uuid) to service_role;
