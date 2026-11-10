-- PR 13. Server-only check-in, offline devices, and organiser team invites.
-- The master ticket secret never enters the database. Signatures are verified
-- in the application before scan_redeem is called.

create schema if not exists scan_private;
revoke all on schema scan_private from public, anon, authenticated, service_role;

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  email text not null,
  role public.team_role not null,
  token_hash text not null,
  invited_by uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint team_invites_role check (role in ('manager', 'door')),
  constraint team_invites_email check (
    email = lower(email)
    and char_length(email) between 6 and 254
    and email !~ '[[:space:][:cntrl:]]'
    and email ~ '^[^@]+@[^@]+\.[^@]+$'
  ),
  constraint team_invites_hash check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint team_invites_expiry check (expires_at > created_at)
);

comment on table public.team_invites is
  'Single-use team invitations. token_hash is SHA-256 of the email token. The token itself is never stored.';
comment on column public.team_invites.token_hash is
  'Hex SHA-256 of the single-use invitation token. Not the token, and not a ticket secret.';

create unique index team_invites_token_hash_key on public.team_invites (token_hash);
create unique index team_invites_open_email_key
  on public.team_invites (event_id, email)
  where accepted_at is null and revoked_at is null;
create index team_invites_event_idx on public.team_invites (event_id, created_at desc);

create table public.scan_devices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint scan_devices_id_format check (device_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  constraint scan_devices_event_user_device unique (event_id, user_id, device_id)
);

comment on table public.scan_devices is
  'Phones allowed to download one event''s offline check-in pack. Revoked devices cannot scan or refresh the pack.';

create index scan_devices_event_idx on public.scan_devices (event_id) where revoked_at is null;

alter table public.team_invites enable row level security;
alter table public.scan_devices enable row level security;
revoke all on public.team_invites from public, anon, authenticated;
revoke all on public.scan_devices from public, anon, authenticated;
grant select, insert, update, delete on public.team_invites to service_role;
grant select, insert, update, delete on public.scan_devices to service_role;

-- Door and manager can read the event they were invited to, including drafts.
create policy events_team_read
on public.events
for select
to authenticated
using (
  public.is_event_team(id, array['manager', 'door']::public.team_role[])
);

-- Managers can see the rest of the team. Doors still see only their own row.
create policy event_team_manager_read
on public.event_team
for select
to authenticated
using (
  public.is_event_team(event_id, array['manager']::public.team_role[])
);

create function scan_private.format_ist(p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_at at time zone 'Asia/Kolkata', 'FMDD Mon YYYY')
    || ', '
    || ltrim(to_char(p_at at time zone 'Asia/Kolkata', 'HH12'), '0')
    || to_char(p_at at time zone 'Asia/Kolkata', ':MI ')
    || upper(to_char(p_at at time zone 'Asia/Kolkata', 'AM'))
    || ' IST';
$$;

create function scan_private.can_manage(p_user uuid, p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = p_user
      and profile.blocked_at is null
      and (
        profile.role in ('staff', 'admin')
        or exists (
          select 1
          from public.events as event
          join public.organiser_members as member on member.organiser_id = event.organiser_id
          where event.id = p_event
            and member.user_id = p_user
        )
        or exists (
          select 1
          from public.event_team as team
          where team.event_id = p_event
            and team.user_id = p_user
            and team.role = 'manager'
        )
      )
  );
$$;

create function scan_private.can_scan(p_user uuid, p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select scan_private.can_manage(p_user, p_event)
    or exists (
      select 1
      from public.profiles as profile
      join public.event_team as team on team.user_id = profile.id
      where profile.id = p_user
        and profile.blocked_at is null
        and team.event_id = p_event
        and team.role = 'door'
    );
$$;

create function scan_private.ensure_device(p_event uuid, p_user uuid, p_device text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_device is null or p_device !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'This device is not authorised for this event.' using errcode = '42501';
  end if;

  insert into public.scan_devices (event_id, user_id, device_id)
  values (p_event, p_user, p_device)
  on conflict (event_id, user_id, device_id) do nothing;

  if exists (
    select 1
    from public.scan_devices as device
    where device.event_id = p_event
      and device.user_id = p_user
      and device.device_id = p_device
      and device.revoked_at is not null
  ) then
    raise exception 'This device is not authorised for this event.' using errcode = '42501';
  end if;
end;
$$;

create function scan_private.log_scan(
  p_ticket uuid,
  p_event uuid,
  p_user uuid,
  p_result public.scan_result,
  p_at timestamptz,
  p_device text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.scans (
    ticket_id,
    event_id,
    scanner_user_id,
    result,
    scanned_at,
    device_id,
    synced_at
  )
  values (p_ticket, p_event, p_user, p_result, p_at, p_device, pg_catalog.now());
$$;

create function scan_private.audit(
  p_actor uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (p_actor, p_action, p_entity, p_entity_id, p_before, p_after);
$$;

-- Marks one ticket checked in. The application verifies code.sig first.
-- Earliest scanned_at wins when two offline devices sync the same ticket.
create function public.scan_redeem(
  ticket_code text,
  event_id uuid,
  device_id text,
  scanned_at timestamptz,
  staff_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(btrim(coalesce(ticket_code, '')));
  v_event uuid := event_id;
  v_device text := device_id;
  v_at timestamptz := scanned_at;
  v_staff uuid := staff_user_id;
  v_ticket public.tickets%rowtype;
  v_test boolean := false;
begin
  if v_staff is null or not scan_private.can_scan(v_staff, v_event) then
    raise exception 'not authorised to scan' using errcode = '42501';
  end if;

  perform scan_private.ensure_device(v_event, v_staff, v_device);

  if v_code !~ '^TK-[A-Z0-9]{5}-[0-9]{2}$'
    or v_at is null
    or v_at > pg_catalog.now() + interval '2 minutes'
    or v_at < pg_catalog.now() - interval '36 hours'
  then
    return 'Invalid';
  end if;

  if not exists (select 1 from public.events as event where event.id = v_event) then
    return 'Invalid';
  end if;

  select ticket.*
  into v_ticket
  from public.tickets as ticket
  where ticket.code = v_code
  for update;

  if not found then
    perform scan_private.log_scan(null, v_event, v_staff, 'invalid', v_at, v_device);
    return 'Invalid';
  end if;

  if v_ticket.event_id is distinct from v_event then
    perform scan_private.log_scan(v_ticket.id, v_ticket.event_id, v_staff, 'wrong_event', v_at, v_device);
    return 'Wrong event';
  end if;

  if v_ticket.status not in ('valid', 'used') then
    perform scan_private.log_scan(v_ticket.id, v_event, v_staff, 'invalid', v_at, v_device);
    return 'Invalid';
  end if;

  select checkout.is_test
  into v_test
  from public.orders as checkout
  where checkout.id = v_ticket.order_id;

  if coalesce(v_test, false) then
    perform scan_private.log_scan(v_ticket.id, v_event, v_staff, 'test', v_at, v_device);
    return 'Test ticket';
  end if;

  if v_ticket.status = 'used' and v_ticket.used_at is not null and v_at >= v_ticket.used_at then
    perform scan_private.log_scan(v_ticket.id, v_event, v_staff, 'duplicate', v_at, v_device);
    return 'Already checked in at ' || scan_private.format_ist(v_ticket.used_at);
  end if;

  if v_ticket.status = 'used' then
    update public.scans as recorded
    set result = 'duplicate'
    where recorded.ticket_id = v_ticket.id
      and recorded.result = 'ok'
      and recorded.scanned_at > v_at;
  end if;

  update public.tickets
  set
    status = 'used',
    used_at = v_at,
    used_by = v_staff
  where id = v_ticket.id;

  perform scan_private.log_scan(v_ticket.id, v_event, v_staff, 'ok', v_at, v_device);
  return 'Valid';
end;
$$;

comment on function public.scan_redeem(text, uuid, text, timestamptz, uuid) is
  'Server check-in. Call only after the ticket signature matches the event key. Earliest scanned_at wins. Returns a plain result.';

create function public.scan_progress(p_event_id uuid, p_user_id uuid)
returns table (checked_in integer, total integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or not scan_private.can_scan(p_user_id, p_event_id) then
    raise exception 'not authorised to scan' using errcode = '42501';
  end if;

  return query
  select
    (count(*) filter (where ticket.status = 'used'))::integer,
    (count(*))::integer
  from public.tickets as ticket
  join public.orders as checkout on checkout.id = ticket.order_id
  where ticket.event_id = p_event_id
    and checkout.is_test = false
    and ticket.status in ('valid', 'used');
end;
$$;

comment on function public.scan_progress(uuid, uuid) is
  'Checked-in and remaining real tickets for one event. Test bookings are left out. No prices.';

create function public.authorise_scan_device(p_event_id uuid, p_user_id uuid, p_device_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or not scan_private.can_scan(p_user_id, p_event_id) then
    raise exception 'not authorised to scan' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events as event where event.id = p_event_id) then
    raise exception 'not authorised to scan' using errcode = '42501';
  end if;
  perform scan_private.ensure_device(p_event_id, p_user_id, p_device_id);
end;
$$;

comment on function public.authorise_scan_device(uuid, uuid, text) is
  'Registers one team phone for one event. Revoked phones are refused. Does not return a signing key.';

create function public.revoke_scan_device(p_device uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.scan_devices%rowtype;
begin
  select device.*
  into v_device
  from public.scan_devices as device
  where device.id = p_device
  for update;

  if not found then
    raise exception 'That device was not found.' using errcode = 'P0001';
  end if;
  if not scan_private.can_manage(p_actor, v_device.event_id) then
    raise exception 'not authorised to scan' using errcode = '42501';
  end if;
  if v_device.revoked_at is not null then
    return;
  end if;

  update public.scan_devices
  set revoked_at = pg_catalog.now()
  where id = v_device.id;

  perform scan_private.audit(
    p_actor,
    'scan_device_revoked',
    'scan_devices',
    v_device.id,
    jsonb_build_object('event_id', v_device.event_id, 'user_id', v_device.user_id),
    jsonb_build_object('revoked', true)
  );
end;
$$;

create function public.create_team_invite(
  p_event_id uuid,
  p_email text,
  p_role text,
  p_actor uuid,
  p_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_role public.team_role;
  v_id uuid;
  v_existing uuid;
begin
  if p_actor is null or not scan_private.can_manage(p_actor, p_event_id) then
    raise exception 'not authorised to invite' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('manager', 'door') then
    raise exception 'Choose a team role.' using errcode = '22023';
  end if;
  v_role := p_role::public.team_role;
  if char_length(v_email) < 6
    or char_length(v_email) > 254
    or v_email ~ '[[:space:][:cntrl:]]'
    or v_email !~ '^[^@]+@[^@]+\.[^@]+$'
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;

  perform 1 from public.events as event where event.id = p_event_id for update;
  if not found then
    raise exception 'not authorised to invite' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.event_team as team
    where team.event_id = p_event_id
      and team.user_id is not null
      and (
        lower(team.email) = v_email
        or team.user_id = (select users.id from auth.users as users where lower(users.email) = v_email)
      )
  ) then
    raise exception 'This person is already on the team.' using errcode = 'P0001';
  end if;

  update public.team_invites
  set revoked_at = pg_catalog.now()
  where event_id = p_event_id
    and email = v_email
    and accepted_at is null
    and revoked_at is null
    and expires_at <= pg_catalog.now();

  if exists (
    select 1
    from public.team_invites as invite
    where invite.event_id = p_event_id
      and invite.email = v_email
      and invite.accepted_at is null
      and invite.revoked_at is null
      and invite.expires_at > pg_catalog.now()
  ) then
    raise exception 'This person already has an invitation.' using errcode = 'P0001';
  end if;

  insert into public.team_invites (event_id, email, role, token_hash, invited_by, expires_at)
  values (p_event_id, v_email, v_role, p_token_hash, p_actor, pg_catalog.now() + interval '72 hours')
  returning id into v_id;

  select team.id
  into v_existing
  from public.event_team as team
  where team.event_id = p_event_id
    and lower(team.email) = v_email
  for update;

  if found then
    update public.event_team
    set role = v_role, invited_by = p_actor
    where id = v_existing
      and user_id is null;
  else
    insert into public.event_team (event_id, email, role, invited_by)
    values (p_event_id, v_email, v_role, p_actor);
  end if;

  perform scan_private.audit(
    p_actor,
    'team_member_invited',
    'event_team',
    p_event_id,
    null,
    jsonb_build_object('email', v_email, 'role', v_role, 'invite_id', v_id)
  );

  return v_id;
end;
$$;

comment on function public.create_team_invite(uuid, text, text, uuid, text) is
  'Stores a hashed 72-hour single-use team invitation and an audit row. The raw token is not stored.';

create function public.accept_team_invite(p_token_hash text, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.team_invites%rowtype;
  v_email text;
  v_blocked timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_user_id is null then
    return 'invalid';
  end if;

  select invite.*
  into v_invite
  from public.team_invites as invite
  where invite.token_hash = p_token_hash
  for update;

  if not found or v_invite.revoked_at is not null then
    return 'invalid';
  end if;
  if v_invite.accepted_at is not null then
    return 'used';
  end if;
  if v_invite.expires_at <= pg_catalog.now() then
    return 'expired';
  end if;

  select lower(users.email), profile.blocked_at
  into v_email, v_blocked
  from auth.users as users
  join public.profiles as profile on profile.id = users.id
  where users.id = p_user_id;

  if v_email is null then
    return 'invalid';
  end if;
  if v_blocked is not null then
    return 'blocked';
  end if;
  if v_email is distinct from v_invite.email then
    return 'email';
  end if;

  if exists (
    select 1
    from public.event_team as team
    where team.event_id = v_invite.event_id
      and team.user_id = p_user_id
  ) then
    update public.team_invites
    set accepted_at = pg_catalog.now()
    where id = v_invite.id;
    return 'already|' || v_invite.event_id::text || '|' || v_invite.role::text;
  end if;

  update public.event_team
  set user_id = p_user_id, role = v_invite.role
  where event_id = v_invite.event_id
    and lower(email) = v_invite.email
    and user_id is null;

  if not found then
    insert into public.event_team (event_id, user_id, email, role, invited_by)
    values (v_invite.event_id, p_user_id, v_invite.email, v_invite.role, v_invite.invited_by);
  end if;

  update public.team_invites
  set accepted_at = pg_catalog.now()
  where id = v_invite.id
    and accepted_at is null;

  perform scan_private.audit(
    p_user_id,
    'team_member_accepted',
    'event_team',
    v_invite.event_id,
    jsonb_build_object('email', v_invite.email, 'role', v_invite.role),
    jsonb_build_object('user_id', p_user_id, 'role', v_invite.role)
  );

  return 'accepted|' || v_invite.event_id::text || '|' || v_invite.role::text;
end;
$$;

comment on function public.accept_team_invite(text, uuid) is
  'Accepts one unexpired invitation when the signed-in email matches. The token cannot be used twice.';

create function public.remove_event_team_member(p_member uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.event_team%rowtype;
  v_email text;
begin
  select team.*
  into v_member
  from public.event_team as team
  where team.id = p_member
  for update;

  if not found then
    raise exception 'That team member was not found.' using errcode = 'P0001';
  end if;
  if not scan_private.can_manage(p_actor, v_member.event_id) then
    raise exception 'not authorised to invite' using errcode = '42501';
  end if;

  v_email := lower(coalesce(v_member.email, ''));
  if v_email = '' and v_member.user_id is not null then
    select lower(users.email)
    into v_email
    from auth.users as users
    where users.id = v_member.user_id;
  end if;

  if v_email is not null and v_email <> '' then
    update public.team_invites
    set revoked_at = pg_catalog.now()
    where event_id = v_member.event_id
      and email = v_email
      and accepted_at is null
      and revoked_at is null;
  end if;

  if v_member.user_id is not null then
    update public.scan_devices
    set revoked_at = pg_catalog.now()
    where event_id = v_member.event_id
      and user_id = v_member.user_id
      and revoked_at is null;
  end if;

  delete from public.event_team where id = v_member.id;

  perform scan_private.audit(
    p_actor,
    'team_member_removed',
    'event_team',
    v_member.event_id,
    jsonb_build_object(
      'email', nullif(v_email, ''),
      'role', v_member.role,
      'user_id', v_member.user_id
    ),
    jsonb_build_object('removed', true)
  );
end;
$$;

comment on function public.remove_event_team_member(uuid, uuid) is
  'Removes one event team member, revokes their open invitation and phones, and writes an audit row.';

revoke all on all functions in schema scan_private from public, anon, authenticated, service_role;
revoke all on function public.scan_redeem(text, uuid, text, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.scan_progress(uuid, uuid) from public, anon, authenticated;
revoke all on function public.authorise_scan_device(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.revoke_scan_device(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_team_invite(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.accept_team_invite(text, uuid) from public, anon, authenticated;
revoke all on function public.remove_event_team_member(uuid, uuid) from public, anon, authenticated;

grant execute on function public.scan_redeem(text, uuid, text, timestamptz, uuid) to service_role;
grant execute on function public.scan_progress(uuid, uuid) to service_role;
grant execute on function public.authorise_scan_device(uuid, uuid, text) to service_role;
grant execute on function public.revoke_scan_device(uuid, uuid) to service_role;
grant execute on function public.create_team_invite(uuid, text, text, uuid, text) to service_role;
grant execute on function public.accept_team_invite(text, uuid) to service_role;
grant execute on function public.remove_event_team_member(uuid, uuid) to service_role;
