-- Social auto-post. Additive only: one schema, three tables, worker and admin functions.
-- No new columns on public.events. No changes to discovery_events or public_event_details.
-- Auto-posting ships paused. The single settings row is configuration, not seed data.

create schema if not exists social_private;
revoke all on schema social_private from public, anon, authenticated;
grant usage on schema social_private to service_role;

create table public.platform_social_settings (
  id boolean primary key default true check (id),
  autopost_paused boolean not null default true,
  autopost_since timestamptz not null default now(),
  post_window_start time not null default '09:00',
  post_window_end time not null default '21:30',
  ig_daily_cap integer not null default 25 check (ig_daily_cap between 1 and 50),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint platform_social_window check (post_window_start < post_window_end)
);
insert into public.platform_social_settings default values;
alter table public.platform_social_settings enable row level security;
revoke all on public.platform_social_settings from public, anon, authenticated, service_role;
grant select on public.platform_social_settings to authenticated, service_role;
create policy platform_social_settings_staff on public.platform_social_settings
  for select to authenticated using (public.is_staff());

create table public.event_social_settings (
  event_id uuid primary key references public.events (id) on delete cascade,
  autopost boolean not null default true,
  is_test boolean,
  ig_collaborator text check (ig_collaborator is null or ig_collaborator ~ '^[a-z0-9._]{1,30}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
alter table public.event_social_settings enable row level security;
revoke all on public.event_social_settings from public, anon, authenticated, service_role;
grant select on public.event_social_settings to authenticated, service_role;
create policy event_social_settings_staff on public.event_social_settings
  for select to authenticated using (public.is_staff());

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook')),
  kind text not null check (kind in ('feed', 'story', 'last_seats')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'posted', 'failed', 'skipped')),
  caption text check (caption is null or char_length(caption) <= 2200),
  image_path text check (
    image_path is null
    or image_path ~ '^social/[0-9a-f-]{36}/(square|story|last_seats)-[0-9a-f]{16}\.jpg$'
  ),
  ig_container_id text check (ig_container_id is null or char_length(ig_container_id) <= 200),
  meta_photo_id text check (meta_photo_id is null or char_length(meta_photo_id) <= 200),
  meta_post_id text check (meta_post_id is null or char_length(meta_post_id) <= 200),
  permalink text check (permalink is null or char_length(permalink) <= 2000),
  error text check (error is null or char_length(error) <= 500),
  skipped_reason text check (skipped_reason is null or char_length(skipped_reason) <= 300),
  attempts smallint not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  posted_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_posts_event_platform_kind_key unique (event_id, platform, kind)
);
create index social_posts_status_next_idx on public.social_posts (status, next_attempt_at);
create index social_posts_platform_posted_idx on public.social_posts (platform, posted_at);
alter table public.social_posts enable row level security;
revoke all on public.social_posts from public, anon, authenticated, service_role;
grant select on public.social_posts to authenticated, service_role;
create policy social_posts_staff on public.social_posts
  for select to authenticated using (public.is_staff());

comment on table public.platform_social_settings is
  'One row. Auto-posting starts paused until an admin turns it on.';
comment on table public.event_social_settings is
  'Staff-only per-event social switch. A missing row means auto-post on and the title test rule.';
comment on table public.social_posts is
  'One row per event, platform and kind. Staff can read. Hosts cannot.';

-- The worker reads public.discovery_events as the only eligibility source.
grant select on public.discovery_events to service_role;
grant select on public.organisers_public to service_role;

create function social_private.clean_caption(p_caption text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(coalesce(p_caption, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g');
$$;

create function social_private.is_test_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.is_test from public.event_social_settings s where s.event_id = p_event_id),
    exists (
      select 1
      from public.events e
      where e.id = p_event_id
        and (
          e.title ~* '\mtest\M'
          or lower(e.slug) like 'test-%'
          or lower(e.slug) = 'test'
        )
    )
  );
$$;

create function social_private.audit(
  p_actor uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_reason text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after, reason)
  values (p_actor, p_action, p_entity, p_entity_id, p_before, p_after, left(p_reason, 1000));
$$;

create function social_private.enqueue_due(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer := 0;
  batch integer := 0;
  paused boolean;
  since timestamptz;
begin
  if p_limit is null or p_limit < 1 then
    return 0;
  end if;
  select autopost_paused, autopost_since into paused, since
  from public.platform_social_settings
  where id;
  if paused is distinct from false then
    return 0;
  end if;

  with candidates as (
    select e.id
    from public.discovery_events d
    join public.events e on e.id = d.id
    left join public.event_social_settings s on s.event_id = e.id
    where e.published_at >= since
      and d.starts_at > now() + interval '3 hours'
      and coalesce(s.autopost, true)
      and not social_private.is_test_event(e.id)
    order by e.published_at, e.id
    limit p_limit
  ), ins as (
    insert into public.social_posts (event_id, platform, kind, next_attempt_at)
    select c.id, k.platform, k.kind, now() + interval '10 minutes'
    from candidates c
    cross join (
      values
        ('instagram', 'feed'),
        ('instagram', 'story'),
        ('facebook', 'feed'),
        ('facebook', 'story')
    ) as k(platform, kind)
    on conflict (event_id, platform, kind) do nothing
    returning 1
  )
  select count(*)::integer into batch from ins;
  inserted := inserted + coalesce(batch, 0);

  with seat as (
    select e.id,
      case
        when e.capacity is null then coalesce(sum(tt.qty_total), 0)
        else least(coalesce(sum(tt.qty_total), 0), e.capacity::bigint)
      end as total_seats,
      case
        when e.capacity is null then coalesce(sum(greatest(tt.qty_total - tt.qty_sold, 0)), 0)
        else least(
          coalesce(sum(greatest(tt.qty_total - tt.qty_sold, 0)), 0),
          greatest(e.capacity::bigint - coalesce(sum(tt.qty_sold), 0), 0)
        )
      end as seats_left
    from public.discovery_events d
    join public.events e on e.id = d.id
    left join public.event_social_settings s on s.event_id = e.id
    left join public.ticket_types tt on tt.event_id = e.id
    where d.starts_at > now() + interval '3 hours'
      and coalesce(s.autopost, true)
      and not social_private.is_test_event(e.id)
      and exists (
        select 1
        from public.social_posts story
        where story.event_id = e.id
          and story.kind = 'story'
          and story.status = 'posted'
      )
    group by e.id, e.capacity
  ), few as (
    select id
    from seat
    where total_seats > 0
      and seats_left > 0
      and seats_left * 10 < total_seats
    limit p_limit
  ), ins as (
    insert into public.social_posts (event_id, platform, kind, next_attempt_at)
    select f.id, k.platform, 'last_seats', now() + interval '10 minutes'
    from few f
    cross join (values ('instagram'), ('facebook')) as k(platform)
    on conflict (event_id, platform, kind) do nothing
    returning 1
  )
  select count(*)::integer into batch from ins;
  return inserted + coalesce(batch, 0);
end;
$$;

create function social_private.claim_due(p_limit integer)
returns setof public.social_posts
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 then
    return;
  end if;
  return query
  with picked as (
    select post.id
    from public.social_posts post
    where post.next_attempt_at <= now()
      and (
        (post.status = 'queued' and post.attempts < 5)
        or (post.status = 'processing' and post.locked_until is not null and post.locked_until < now())
      )
    order by
      case
        when post.platform = 'instagram' and post.kind = 'feed' then 0
        when post.platform = 'instagram' and post.kind = 'story' then 1
        when post.platform = 'instagram' then 2
        else 3
      end,
      post.next_attempt_at,
      post.created_at
    limit p_limit
    for update skip locked
  )
  update public.social_posts as post
  set status = 'processing',
      locked_until = now() + interval '10 minutes',
      attempts = least(post.attempts + 1, 5),
      updated_at = now()
  from picked
  where post.id = picked.id
  returning post.*;
end;
$$;

create function social_private.finish(p_id uuid, p_status text, p_fields jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  key text;
  allowed text[] := array[
    'ig_container_id', 'meta_photo_id', 'meta_post_id', 'permalink', 'error',
    'skipped_reason', 'next_attempt_at', 'image_path', 'caption', 'refund_attempt'
  ];
  refund boolean;
begin
  if p_status not in ('queued', 'processing', 'posted', 'failed', 'skipped') then
    raise exception 'Choose a valid result.' using errcode = '22023';
  end if;
  if p_fields is null then
    p_fields := '{}'::jsonb;
  end if;
  if jsonb_typeof(p_fields) <> 'object' then
    raise exception 'Choose a valid result.' using errcode = '22023';
  end if;
  for key in select jsonb_object_keys(p_fields)
  loop
    if not (key = any (allowed)) then
      raise exception 'Choose a valid result.' using errcode = '22023';
    end if;
  end loop;
  if p_fields ? 'image_path'
    and nullif(p_fields ->> 'image_path', '') is not null
    and (p_fields ->> 'image_path') !~ '^social/[0-9a-f-]{36}/(square|story|last_seats)-[0-9a-f]{16}\.jpg$'
  then
    raise exception 'Choose a valid result.' using errcode = '22023';
  end if;
  if p_fields ? 'caption' and char_length(coalesce(p_fields ->> 'caption', '')) > 2200 then
    raise exception 'Caption is too long.' using errcode = '22023';
  end if;
  refund := coalesce((p_fields ->> 'refund_attempt')::boolean, false);
  update public.social_posts
  set status = p_status,
      ig_container_id = case
        when p_fields ? 'ig_container_id' then nullif(left(p_fields ->> 'ig_container_id', 200), '')
        else ig_container_id
      end,
      meta_photo_id = case
        when p_fields ? 'meta_photo_id' then nullif(left(p_fields ->> 'meta_photo_id', 200), '')
        else meta_photo_id
      end,
      meta_post_id = case
        when p_fields ? 'meta_post_id' then nullif(left(p_fields ->> 'meta_post_id', 200), '')
        else meta_post_id
      end,
      permalink = case
        when p_fields ? 'permalink' then nullif(left(p_fields ->> 'permalink', 2000), '')
        else permalink
      end,
      error = case
        when p_status = 'posted' then null
        when p_fields ? 'error' then nullif(left(p_fields ->> 'error', 500), '')
        else error
      end,
      skipped_reason = case
        when p_fields ? 'skipped_reason' then nullif(left(p_fields ->> 'skipped_reason', 300), '')
        else skipped_reason
      end,
      next_attempt_at = case
        when p_fields ? 'next_attempt_at' and nullif(p_fields ->> 'next_attempt_at', '') is not null
          then (p_fields ->> 'next_attempt_at')::timestamptz
        else next_attempt_at
      end,
      image_path = case
        when p_fields ? 'image_path' then nullif(p_fields ->> 'image_path', '')
        else image_path
      end,
      caption = case
        when p_fields ? 'caption' then nullif(p_fields ->> 'caption', '')
        else caption
      end,
      attempts = case when refund then greatest(attempts - 1, 0) else attempts end,
      posted_at = case when p_status = 'posted' then coalesce(posted_at, now()) else posted_at end,
      locked_until = case when p_status = 'processing' then locked_until else null end,
      updated_at = now()
  where id = p_id;
  if not found then
    raise exception 'Post not found.' using errcode = 'P0002';
  end if;
end;
$$;

create function social_private.ig_posted_last_24h()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.social_posts
  where platform = 'instagram'
    and status = 'posted'
    and posted_at > now() - interval '24 hours';
$$;

create function social_private.live_event(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(d)
  from public.discovery_events d
  where d.id = p_event_id;
$$;

create function social_private.require_reason(p_reason text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if reason is null then
    raise exception 'Enter a reason.' using errcode = '22023';
  end if;
  return left(reason, 1000);
end;
$$;

create function social_private.queue_pair(p_event_id uuid, p_actor uuid, p_when timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  with ins as (
    insert into public.social_posts (event_id, platform, kind, next_attempt_at, created_by)
    select p_event_id, k.platform, k.kind, p_when, p_actor
    from (
      values
        ('instagram', 'feed'),
        ('instagram', 'story'),
        ('facebook', 'feed'),
        ('facebook', 'story')
    ) as k(platform, kind)
    on conflict (event_id, platform, kind) do nothing
    returning 1
  )
  select count(*)::integer into inserted from ins;
  return coalesce(inserted, 0);
end;
$$;

create function public.admin_social_retry(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := admin_private.require_staff();
  post public.social_posts;
begin
  select * into post from public.social_posts where id = p_id for update;
  if not found then
    raise exception 'Post not found.' using errcode = 'P0002';
  end if;
  if post.status not in ('failed', 'skipped') then
    raise exception 'Only a post that did not go out can be tried again.' using errcode = '22023';
  end if;
  if social_private.live_event(post.event_id) is null then
    raise exception 'Event is hidden now.' using errcode = '22023';
  end if;
  update public.social_posts
  set status = 'queued',
      attempts = 0,
      error = null,
      skipped_reason = null,
      next_attempt_at = now(),
      locked_until = null,
      updated_at = now()
  where id = post.id;
  perform social_private.audit(
    actor, 'social_post_retried', 'social_posts', post.id,
    jsonb_build_object('status', post.status),
    jsonb_build_object('status', 'queued'),
    'Try again'
  );
end;
$$;

create function public.admin_social_skip(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := admin_private.require_staff();
  reason text := social_private.require_reason(p_reason);
  post public.social_posts;
begin
  select * into post from public.social_posts where id = p_id for update;
  if not found then
    raise exception 'Post not found.' using errcode = 'P0002';
  end if;
  if post.status not in ('queued', 'failed') then
    raise exception 'Only a waiting or failed post can be skipped.' using errcode = '22023';
  end if;
  update public.social_posts
  set status = 'skipped',
      skipped_reason = left(reason, 300),
      locked_until = null,
      updated_at = now()
  where id = post.id;
  perform social_private.audit(
    actor, 'social_post_skipped', 'social_posts', post.id,
    jsonb_build_object('status', post.status),
    jsonb_build_object('status', 'skipped'),
    reason
  );
end;
$$;

create function public.admin_social_update_caption(p_id uuid, p_caption text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := admin_private.require_staff();
  post public.social_posts;
  clean text := btrim(social_private.clean_caption(p_caption));
  hashtags integer;
  mentions integer;
begin
  select * into post from public.social_posts where id = p_id for update;
  if not found then
    raise exception 'Post not found.' using errcode = 'P0002';
  end if;
  if post.status <> 'queued' then
    raise exception 'You can edit the caption only while it is waiting.' using errcode = '22023';
  end if;
  if clean is null or clean = '' then
    raise exception 'Enter a caption.' using errcode = '22023';
  end if;
  if char_length(clean) > 2200 then
    raise exception 'Caption is too long.' using errcode = '22023';
  end if;
  select count(*) into hashtags from regexp_matches(clean, '#[A-Za-z0-9_]+', 'g');
  select count(*) into mentions from regexp_matches(clean, '@[A-Za-z0-9._]+', 'g');
  if coalesce(hashtags, 0) > 30 then
    raise exception 'Use at most 30 hashtags.' using errcode = '22023';
  end if;
  if coalesce(mentions, 0) > 20 then
    raise exception 'Use at most 20 mentions.' using errcode = '22023';
  end if;
  update public.social_posts
  set caption = clean, updated_at = now()
  where id = post.id;
  perform social_private.audit(
    actor, 'social_caption_changed', 'social_posts', post.id,
    jsonb_build_object('caption', post.caption),
    jsonb_build_object('caption', clean),
    'Caption edited'
  );
end;
$$;

create function public.admin_social_queue_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := admin_private.require_staff();
  paused boolean;
  live jsonb;
  starts timestamptz;
  autopost boolean;
begin
  select autopost_paused into paused from public.platform_social_settings where id;
  if paused is distinct from false then
    raise exception 'Posting is paused.' using errcode = '22023';
  end if;
  live := social_private.live_event(p_event_id);
  if live is null then
    raise exception 'Event is hidden now.' using errcode = '22023';
  end if;
  starts := (live ->> 'starts_at')::timestamptz;
  if starts is null or starts <= now() + interval '3 hours' then
    raise exception 'Event has started.' using errcode = '22023';
  end if;
  select coalesce(s.autopost, true) into autopost
  from public.events e
  left join public.event_social_settings s on s.event_id = e.id
  where e.id = p_event_id;
  if autopost is distinct from true then
    raise exception 'Turned off by admin.' using errcode = '22023';
  end if;
  if social_private.is_test_event(p_event_id) then
    raise exception 'This is a test event.' using errcode = '22023';
  end if;
  perform social_private.queue_pair(p_event_id, actor, now());
  perform social_private.audit(
    actor, 'social_event_queued', 'events', p_event_id,
    null,
    jsonb_build_object('queued', true),
    'Post this event'
  );
end;
$$;

create function public.admin_set_event_social(
  p_event_id uuid,
  p_autopost boolean,
  p_is_test boolean,
  p_ig_collaborator text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := admin_private.require_staff();
  reason text := social_private.require_reason(p_reason);
  prior public.event_social_settings;
  collaborator text := nullif(lower(btrim(coalesce(p_ig_collaborator, ''))), '');
begin
  if p_autopost is null then
    raise exception 'Choose whether to post this event.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found.' using errcode = 'P0002';
  end if;
  if collaborator is not null and left(collaborator, 1) = '@' then
    collaborator := nullif(substr(collaborator, 2), '');
  end if;
  if collaborator is not null and collaborator !~ '^[a-z0-9._]{1,30}$' then
    raise exception 'Enter an Instagram name using letters, numbers, dots or underscores.' using errcode = '22023';
  end if;
  select * into prior from public.event_social_settings where event_id = p_event_id for update;
  insert into public.event_social_settings (event_id, autopost, is_test, ig_collaborator, updated_at, updated_by)
  values (p_event_id, p_autopost, p_is_test, collaborator, now(), actor)
  on conflict (event_id) do update
  set autopost = excluded.autopost,
      is_test = excluded.is_test,
      ig_collaborator = excluded.ig_collaborator,
      updated_at = now(),
      updated_by = excluded.updated_by;
  if not p_autopost then
    update public.social_posts
    set status = 'skipped',
        skipped_reason = 'Turned off by admin',
        locked_until = null,
        updated_at = now()
    where event_id = p_event_id
      and status = 'queued';
  end if;
  perform social_private.audit(
    actor, 'Social posting changed', 'events', p_event_id,
    case when prior.event_id is null then null else jsonb_build_object(
      'autopost', prior.autopost, 'is_test', prior.is_test, 'ig_collaborator', prior.ig_collaborator
    ) end,
    jsonb_build_object('autopost', p_autopost, 'is_test', p_is_test, 'ig_collaborator', collaborator),
    reason
  );
end;
$$;

create function public.admin_update_social_settings(
  p_paused boolean,
  p_window_start time,
  p_window_end time,
  p_ig_daily_cap integer,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := admin_private.require_staff();
  reason text := social_private.require_reason(p_reason);
  prior jsonb;
  changed jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor and role = 'admin' and blocked_at is null
  ) then
    raise exception 'Only an admin can change social settings.' using errcode = '42501';
  end if;
  if p_paused is null or p_window_start is null or p_window_end is null or p_ig_daily_cap is null then
    raise exception 'Choose the social settings.' using errcode = '22023';
  end if;
  if p_window_start >= p_window_end then
    raise exception 'Choose an earlier start than end.' using errcode = '22023';
  end if;
  if p_ig_daily_cap < 1 or p_ig_daily_cap > 50 then
    raise exception 'Choose a daily limit from 1 to 50.' using errcode = '22023';
  end if;
  select to_jsonb(s) into prior from public.platform_social_settings s where id for update;
  update public.platform_social_settings s
  set autopost_paused = p_paused,
      post_window_start = p_window_start,
      post_window_end = p_window_end,
      ig_daily_cap = p_ig_daily_cap,
      updated_at = now(),
      updated_by = actor
  where s.id
  returning to_jsonb(s) into changed;
  perform social_private.audit(
    actor, 'social_settings_changed', 'platform_social_settings', null,
    prior, changed, reason
  );
end;
$$;

-- PostgREST exposes public only. These wrappers are the worker entry points.
create function public.social_enqueue_due(p_limit integer)
returns integer
language sql
security definer
set search_path = ''
as $$
  select social_private.enqueue_due(p_limit);
$$;

create function public.social_claim_due(p_limit integer)
returns setof public.social_posts
language sql
security definer
set search_path = ''
as $$
  select * from social_private.claim_due(p_limit);
$$;

create function public.social_finish(p_id uuid, p_status text, p_fields jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  select social_private.finish(p_id, p_status, p_fields);
$$;

create function public.social_ig_posted_last_24h()
returns integer
language sql
security definer
set search_path = ''
as $$
  select social_private.ig_posted_last_24h();
$$;

create function public.social_live_event(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select social_private.live_event(p_event_id);
$$;

revoke all on function social_private.clean_caption(text) from public, anon, authenticated, service_role;
revoke all on function social_private.is_test_event(uuid) from public, anon, authenticated, service_role;
revoke all on function social_private.audit(uuid, text, text, uuid, jsonb, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function social_private.enqueue_due(integer) from public, anon, authenticated, service_role;
revoke all on function social_private.claim_due(integer) from public, anon, authenticated, service_role;
revoke all on function social_private.finish(uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function social_private.ig_posted_last_24h() from public, anon, authenticated, service_role;
revoke all on function social_private.live_event(uuid) from public, anon, authenticated, service_role;
revoke all on function social_private.require_reason(text) from public, anon, authenticated, service_role;
revoke all on function social_private.queue_pair(uuid, uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function social_private.is_test_event(uuid) to service_role;
grant execute on function social_private.enqueue_due(integer) to service_role;
grant execute on function social_private.claim_due(integer) to service_role;
grant execute on function social_private.finish(uuid, text, jsonb) to service_role;
grant execute on function social_private.ig_posted_last_24h() to service_role;
grant execute on function social_private.live_event(uuid) to service_role;

revoke all on function public.admin_social_retry(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_social_skip(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_social_update_caption(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_social_queue_event(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_set_event_social(uuid, boolean, boolean, text, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_update_social_settings(boolean, time, time, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_social_retry(uuid) to authenticated;
grant execute on function public.admin_social_skip(uuid, text) to authenticated;
grant execute on function public.admin_social_update_caption(uuid, text) to authenticated;
grant execute on function public.admin_social_queue_event(uuid) to authenticated;
grant execute on function public.admin_set_event_social(uuid, boolean, boolean, text, text) to authenticated;
grant execute on function public.admin_update_social_settings(boolean, time, time, integer, text) to authenticated;

revoke all on function public.social_enqueue_due(integer) from public, anon, authenticated, service_role;
revoke all on function public.social_claim_due(integer) from public, anon, authenticated, service_role;
revoke all on function public.social_finish(uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.social_ig_posted_last_24h() from public, anon, authenticated, service_role;
revoke all on function public.social_live_event(uuid) from public, anon, authenticated, service_role;
grant execute on function public.social_enqueue_due(integer) to service_role;
grant execute on function public.social_claim_due(integer) to service_role;
grant execute on function public.social_finish(uuid, text, jsonb) to service_role;
grant execute on function public.social_ig_posted_last_24h() to service_role;
grant execute on function public.social_live_event(uuid) to service_role;
