-- PR 16. Additive launch hardening. No seed data and no dropped tables.
-- Closes staff-on-staff blocks, direct organiser-control updates, and the public
-- sales-open helper. Paused organisers stay hidden from discovery.

-- ---------------------------------------------------------------------------
-- Staff cannot block, suspend, or unblock staff or admin accounts.
-- The refusal is saved and the account is left unchanged. Returning null keeps
-- that audit row; the plain-English sentence is the audit reason.
-- ---------------------------------------------------------------------------

create or replace function admin_private.record_account_refusal(
  p_actor uuid,
  p_target uuid,
  p_action text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor is null or p_target is null or p_action not in ('block', 'suspend', 'unblock', 'self') then
    return;
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after, reason)
  values (
    p_actor,
    case when p_action = 'self' then 'account_self_refused' else 'account_staff_refused' end,
    'profiles',
    p_target,
    '{"refused":true}'::jsonb,
    jsonb_build_object('refused', true, 'attempt', p_action),
    case
      when p_action = 'self' then 'You cannot restrict your own account'
      else 'Staff accounts cannot be blocked from here.'
    end
  );
end;
$$;

revoke all on function admin_private.record_account_refusal(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function admin_private.account_action(p_id uuid, p_action text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := admin_private.require_staff();
  profile public.profiles;
  old_state jsonb;
  log_id uuid;
  reason text := admin_private.safe_note(p_reason);
begin
  if p_action is null or p_action not in ('block', 'suspend', 'unblock') then
    raise exception 'Choose an account action';
  end if;
  if p_id = actor then
    perform admin_private.record_account_refusal(actor, p_id, 'self', reason);
    return null;
  end if;
  select * into profile from public.profiles where id = p_id for update;
  if not found then raise exception 'Account not found'; end if;
  if profile.role in ('staff', 'admin') then
    perform admin_private.record_account_refusal(actor, p_id, p_action, reason);
    return null;
  end if;
  if p_action <> 'unblock' and reason is null then
    raise exception 'A reason is required';
  end if;
  old_state := jsonb_build_object(
    'blocked_at', profile.blocked_at,
    'block_reason', admin_private.safe_note(profile.block_reason)
  );
  update public.profiles
  set
    blocked_at = case when p_action <> 'unblock' then now() end,
    block_reason = case when p_action <> 'unblock' then reason end
  where id = p_id
  returning * into profile;
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after, reason)
  values (
    actor,
    'account_' || p_action,
    'profiles',
    p_id,
    old_state,
    jsonb_build_object('blocked_at', profile.blocked_at, 'block_reason', profile.block_reason),
    reason
  )
  returning id into log_id;
  return log_id;
end;
$$;

-- Direct table updates cannot skip the audited control, including after a column grant.
create or replace function public.protect_organiser_controls()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payouts_on_hold is distinct from old.payouts_on_hold
     or new.sales_paused is distinct from old.sales_paused then
    if current_user not in ('postgres', 'supabase_admin', 'service_role') then
      if auth.uid() is not null and (
        old.owner_id = auth.uid()
        or exists (
          select 1
          from public.organiser_members as member
          where member.organiser_id = old.id and member.user_id = auth.uid()
        )
      ) then
        raise exception 'You cannot change payouts or sales on your own organiser' using errcode = '42501';
      end if;
      raise exception 'Use the audited admin functions' using errcode = '42501';
    end if;
  end if;

  if current_user in ('postgres', 'supabase_admin', 'service_role') or public.is_staff() then
    return new;
  end if;

  if new.kyc_status is distinct from old.kyc_status
    or new.approved_at is distinct from old.approved_at
    or new.approved_by is distinct from old.approved_by
    or new.payouts_on_hold is distinct from old.payouts_on_hold
    or new.sales_paused is distinct from old.sales_paused
    or new.cashfree_vendor_id is distinct from old.cashfree_vendor_id
    or new.owner_id is distinct from old.owner_id
  then
    raise exception 'only staff can change verification, payout, or ownership controls'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- A live payout account could not be created. No bank numbers or documents.
create function admin_private.note_vendor_failure(p_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := admin_private.require_staff();
  note text := admin_private.safe_note(p_reason);
  log_id uuid;
begin
  if not exists (select 1 from public.organisers where id = p_id) then
    raise exception 'Organiser not found';
  end if;
  if note is null then
    note := 'A live payout account cannot be created yet.';
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, after, reason)
  values (
    actor,
    'vendor_provision_failed',
    'organisers',
    p_id,
    jsonb_build_object('saved', false),
    note
  )
  returning id into log_id;
  return log_id;
end;
$$;

create function public.admin_note_vendor_failure(p_id uuid, p_reason text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select admin_private.note_vendor_failure(p_id, p_reason);
$$;

revoke all on function admin_private.note_vendor_failure(uuid, text),
  public.admin_note_vendor_failure(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function admin_private.note_vendor_failure(uuid, text),
  public.admin_note_vendor_failure(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Bounded counters for login, refunds, exports, and signed webhooks.
-- Checkout keeps its own table. Failed webhook signatures never call this.
-- ---------------------------------------------------------------------------

create table public.request_rate_limits (
  key_hash text not null,
  bucket timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key (key_hash, bucket)
);

alter table public.request_rate_limits enable row level security;
revoke all on public.request_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.request_rate_limits to service_role;

create function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  window_seconds integer := least(greatest(coalesce(p_window_seconds, 60), 1), 86400);
  cap integer := least(greatest(coalesce(p_limit, 1), 1), 10000);
begin
  if p_key is null or length(p_key) < 16 or length(p_key) > 128 then
    return false;
  end if;
  delete from public.request_rate_limits where bucket < now() - interval '2 days';
  insert into public.request_rate_limits (key_hash, bucket, attempts)
  values (
    p_key,
    date_bin(make_interval(secs => window_seconds), now(), '2026-01-01'::timestamptz),
    1
  )
  on conflict (key_hash, bucket) do update
    set attempts = public.request_rate_limits.attempts + 1
  returning attempts into n;
  return n <= cap;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Public discovery no longer calls a helper anon can execute.
-- The boolean is maintained from organisers.sales_paused and is not a new fact.
-- ---------------------------------------------------------------------------

alter table public.events
  add column organiser_sales_open boolean not null default true;

comment on column public.events.organiser_sales_open is
  'True when the organiser has not paused ticket sales. Kept in step with organisers.sales_paused so public reads do not call a helper.';

update public.events as event
set organiser_sales_open = not organiser.sales_paused
from public.organisers as organiser
where organiser.id = event.organiser_id;

create function public.stamp_event_sales_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  open_sales boolean;
begin
  select not organiser.sales_paused into open_sales
  from public.organisers as organiser
  where organiser.id = new.organiser_id;
  new.organiser_sales_open := coalesce(open_sales, false);
  return new;
end;
$$;

create function public.sync_organiser_sales_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.events
  set organiser_sales_open = not new.sales_paused
  where organiser_id = new.id
    and organiser_sales_open is distinct from (not new.sales_paused);
  return null;
end;
$$;

revoke all on function public.stamp_event_sales_open(), public.sync_organiser_sales_open()
  from public, anon, authenticated, service_role;
grant execute on function public.stamp_event_sales_open(), public.sync_organiser_sales_open()
  to authenticated, service_role;

create trigger events_stamp_sales_open
before insert or update of organiser_id, organiser_sales_open on public.events
for each row
execute function public.stamp_event_sales_open();

create trigger organisers_sync_sales_open
after update of sales_paused on public.organisers
for each row
when (old.sales_paused is distinct from new.sales_paused)
execute function public.sync_organiser_sales_open();

alter policy events_public_read on public.events
using (status = 'published' and organiser_sales_open);

create or replace view public.discovery_events with (security_invoker = true) as
select e.id, e.slug, e.title, e.description, e.category, e.starts_at, e.ends_at,
  e.gates_open_at, e.venue_name, e.address, e.city, e.country, e.lat, e.lng,
  e.maps_url, e.poster_key, e.theme, e.is_free, e.refund_policy, e.published_at,
  e.created_at, o.display_name as organiser_name, o.verified,
  coalesce(t.sold, 0)::bigint as tickets_sold, t.min_price_paise,
  coalesce(t.tiers, '[]'::jsonb) as tiers,
  coalesce(g.guests, '[]'::jsonb) as guests
from public.events e
join public.organisers_public o on o.id = e.organiser_id
left join lateral (
  select sum(qty_sold) as sold, min(price_paise) as min_price_paise,
    jsonb_agg(jsonb_build_object('id',id,'name',name,'price_paise',price_paise,
      'qty_total',qty_total,'qty_sold',qty_sold,'sales_start',sales_start,
      'sales_end',sales_end,'is_vip',is_vip) order by sort,id) as tiers
  from public.ticket_types where event_id=e.id
) t on true
left join lateral (
  select jsonb_agg(jsonb_build_object('name',name,'title',title,'photo_key',photo_key,
    'is_vip',is_vip) order by sort,id) as guests
  from public.event_guests where event_id=e.id
) g on true
where e.status = 'published' and e.organiser_sales_open;

revoke all on public.discovery_events from public, anon, authenticated;
grant select on public.discovery_events to anon, authenticated;

drop function if exists private.organiser_sales_open(uuid);
revoke usage on schema private from anon, authenticated, public;
