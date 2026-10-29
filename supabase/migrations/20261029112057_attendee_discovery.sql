create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- A boolean visibility helper keeps organiser controls out of the public API.
-- private is not an exposed PostgREST schema; this function returns no account data.
create or replace function private.organiser_sales_open(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organisers where id = p_id and not sales_paused);
$$;
revoke all on function private.organiser_sales_open(uuid) from public;
grant usage on schema private to anon;
grant execute on function private.organiser_sales_open(uuid) to anon, authenticated;

alter policy events_public_read on public.events
using (status = 'published' and private.organiser_sales_open(organiser_id));

-- Invoker view: table RLS still applies. Explicit columns prevent wizard/account
-- internals reaching public pages. Reuse the existing safe organiser projection.
create view public.discovery_events with (security_invoker = true) as
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
where e.status='published' and private.organiser_sales_open(e.organiser_id);
revoke all on public.discovery_events from public, anon, authenticated;
grant select on public.discovery_events to anon, authenticated;
comment on view public.discovery_events is 'Read-only public event projection; RLS and explicit visibility exclude drafts and paused sales. No KYC, contacts, payment or wizard fields.';
create index events_discovery_idx on public.events (country, city, starts_at, id) where status='published';
