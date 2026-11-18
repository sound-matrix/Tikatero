-- Tikatero free-event entitlement: one lifetime self-serve free event per organiser.
-- Subsequent free events require an event-specific admin decision.
create table if not exists public.free_event_publications (
  event_id uuid primary key references public.events(id) on delete restrict,
  organiser_id uuid not null references public.organisers(id),
  published_at timestamptz not null default now()
);
create index if not exists free_event_publications_organiser_idx on public.free_event_publications(organiser_id);
create table if not exists public.free_event_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  organiser_id uuid not null references public.organisers(id),
  reason text not null check (char_length(btrim(reason)) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.free_event_decisions (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.free_event_requests(id),
  event_id uuid not null,
  decision text not null check (decision in ('approved','rejected')),
  reason text not null,
  admin_id uuid not null references public.profiles(id),
  decided_at timestamptz not null default now()
);
alter table public.free_event_publications enable row level security;
alter table public.free_event_requests enable row level security;
alter table public.free_event_decisions enable row level security;
revoke all on public.free_event_publications, public.free_event_requests, public.free_event_decisions from anon, authenticated;
revoke all on sequence public.free_event_decisions_id_seq from anon, authenticated;
-- Existing published free events permanently consume the free quota.
insert into public.free_event_publications(event_id, organiser_id, published_at)
select id, organiser_id, coalesce(created_at, now())
from public.events
where is_free and status::text = 'published'
on conflict (event_id) do nothing;

create or replace function public.enforce_free_event_publication()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  already_used boolean;
  approved boolean;
begin
  if new.is_free and new.status::text = 'published'
    and (tg_op = 'INSERT' or old.status::text is distinct from 'published'
         or old.is_free is distinct from true) then
    -- Lock across concurrent publish requests for the same organiser.
    perform pg_advisory_xact_lock(hashtextextended(new.organiser_id::text, 40));
    select exists(select 1 from public.free_event_publications
                  where organiser_id = new.organiser_id) into already_used;
    select exists(select 1 from public.free_event_requests
                  where event_id = new.id and organiser_id = new.organiser_id
                  and status = 'approved') into approved;
    if already_used and not approved then
      raise exception 'FREE_EVENT_APPROVAL_REQUIRED' using errcode = 'P0001';
    end if;
    insert into public.free_event_publications(event_id,organiser_id)
    values (new.id,new.organiser_id) on conflict (event_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists enforce_free_event_publication_trigger on public.events;
create trigger enforce_free_event_publication_trigger
after insert or update of status, is_free on public.events
for each row execute function public.enforce_free_event_publication();

-- Reject any paid tier attached to a free event even via direct client/API access.
create or replace function public.enforce_zero_price_for_free_event()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.price_paise <> 0
     and exists(select 1 from public.events where id = new.event_id and is_free) then
    raise exception 'FREE_EVENT_TICKET_MUST_BE_ZERO' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists enforce_zero_price_for_free_event_trigger on public.ticket_types;
create trigger enforce_zero_price_for_free_event_trigger
before insert or update of price_paise, event_id on public.ticket_types
for each row execute function public.enforce_zero_price_for_free_event();

create or replace function public.enforce_free_event_tier_prices_on_event()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.is_free and not old.is_free then
    update public.ticket_types
      set price_paise = 0
      where event_id = new.id and price_paise <> 0 and qty_sold = 0;
  end if;
  if new.is_free and exists(
    select 1 from public.ticket_types where event_id = new.id and price_paise <> 0
  ) then
    raise exception 'FREE_EVENT_TICKET_MUST_BE_ZERO' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists enforce_free_event_tier_prices_trigger on public.events;
create trigger enforce_free_event_tier_prices_trigger
before update of is_free on public.events
for each row execute function public.enforce_free_event_tier_prices_on_event();

-- No client/API permission to rewrite historic entitlement or admin approval.
revoke all on function public.enforce_free_event_publication() from public, anon, authenticated;
revoke all on function public.enforce_zero_price_for_free_event() from public, anon, authenticated;
revoke all on function public.enforce_free_event_tier_prices_on_event() from public, anon, authenticated;
