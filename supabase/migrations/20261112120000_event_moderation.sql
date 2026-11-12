alter table public.events
  add column hidden_at timestamptz,
  add column hidden_by uuid references public.profiles(id) on delete set null,
  add column hidden_reason text check (char_length(hidden_reason) <= 300),
  add column hidden_by_staff boolean not null default false,
  add column status_before_hide public.event_status,
  drop constraint events_date_when_not_draft,
  add constraint events_date_when_not_draft
    check (status in ('draft', 'cancelled') or starts_at is not null or
      (status = 'unpublished' and status_before_hide = 'draft'));

create table public.event_removal_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  organiser_id uuid not null references public.organisers(id),
  requested_by uuid references public.profiles(id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewer_note text check (char_length(reviewer_note) <= 300),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create unique index event_removal_one_pending on public.event_removal_requests(event_id)
where status = 'pending';
create index event_removal_history on public.event_removal_requests(event_id, created_at desc);
alter table public.event_removal_requests enable row level security;
revoke all on public.event_removal_requests from public, anon, authenticated;
grant select on public.event_removal_requests to authenticated;
create policy event_removal_read on public.event_removal_requests for select to authenticated
using (
  exists (select 1 from public.profiles where id = auth.uid() and blocked_at is null)
  and (public.is_staff() or public.is_org_member(organiser_id))
);
-- All writes go through RPCs so the request, visibility and audit change atomically.

create table public.event_media_cleanup (
  event_id uuid primary key,
  created_at timestamptz not null default now()
);
alter table public.event_media_cleanup enable row level security;
revoke all on public.event_media_cleanup from public, anon, authenticated;
grant select, delete on public.event_media_cleanup to service_role;

alter policy events_public_read on public.events
using (status = 'published' and hidden_at is null and organiser_sales_open);
revoke delete on public.events from authenticated;

-- The wizard still writes ordinary event fields through its invoker permissions.
create function public.guard_event_moderation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'published') or new.hidden_at is not null or new.hidden_by is not null
      or new.hidden_reason is not null or new.hidden_by_staff or new.status_before_hide is not null then
      raise exception 'Use the event review actions.' using errcode = '42501';
    end if;
  elsif row(new.hidden_at, new.hidden_by, new.hidden_reason, new.hidden_by_staff, new.status_before_hide)
      is distinct from row(old.hidden_at, old.hidden_by, old.hidden_reason, old.hidden_by_staff, old.status_before_hide)
    or (old.organiser_id is distinct from new.organiser_id and old.hidden_at is not null)
    or (old.status is distinct from new.status and
      (old.hidden_at is not null or old.status = 'cancelled' or new.status in ('unpublished', 'cancelled'))) then
    raise exception 'Use the event review actions.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_event_moderation() from public, anon, authenticated;
create trigger events_guard_moderation before insert or update on public.events
for each row execute function public.guard_event_moderation();

create schema moderation_private;
revoke all on schema moderation_private from public, anon, authenticated, service_role;

create function moderation_private.reason(p_reason text)
returns text language plpgsql set search_path = '' as $$
declare reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(reason) not between 1 and 300 then
    raise exception 'Enter a reason of up to 300 characters.' using errcode = '22023';
  end if;
  if reason ~* 'sb_secret_|service_role|cashfree_secret|qr_secret' then
    raise exception 'That reason cannot be saved.' using errcode = '22023';
  end if;
  return reason;
end;
$$;

create function moderation_private.lock_event(p_event_id uuid, p_staff boolean, p_confirm boolean)
returns public.events language plpgsql set search_path = '' as $$
declare ev public.events;
begin
  if p_staff then
    perform admin_private.require_staff();
  elsif auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and blocked_at is null
  ) then
    raise exception 'You need to sign in.' using errcode = '42501';
  end if;
  select * into ev from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found.' using errcode = 'P0002'; end if;
  if p_staff and (public.is_org_member(ev.organiser_id)
      or public.is_event_team(ev.id, array['manager']::public.team_role[]))
      and p_confirm is not true then
    raise exception 'Confirm that you belong to this organiser.' using errcode = '42501';
  elsif not p_staff and not public.is_org_member(ev.organiser_id) then
    raise exception 'You cannot change this event.' using errcode = '42501';
  end if;
  return ev;
end;
$$;

create function moderation_private.audit(
  p_event_id uuid, p_action text, p_before jsonb, p_after jsonb, p_reason text
)
returns void language sql set search_path = '' as $$
  insert into public.audit_log(actor_id, action, entity, entity_id, before, after, reason)
  values (auth.uid(), p_action, 'events', p_event_id, p_before, p_after, p_reason);
$$;

create function moderation_private.record_cancellation(p_event public.events, p_reason text)
returns void language plpgsql set search_path = '' as $$
declare request_id uuid;
begin
  if p_event.status = 'cancelled' then return; end if;
  update public.events set status = 'cancelled' where id = p_event.id;
  perform moderation_private.audit(p_event.id, 'event_cancelled',
    jsonb_build_object('status', p_event.status), jsonb_build_object('status', 'cancelled'), p_reason);

  update public.event_removal_requests set status = 'approved', reviewer_id = auth.uid(), decided_at = now()
    where event_id = p_event.id and status = 'pending' returning id into request_id;
  if found then
    perform moderation_private.audit(p_event.id, 'event_removal_approved',
      jsonb_build_object('status', 'pending'),
      jsonb_build_object('request_id', request_id, 'status', 'approved'), p_reason);
  end if;
end;
$$;

create function moderation_private.hide(p_event public.events, p_reason text, p_staff boolean)
returns void language plpgsql set search_path = '' as $$
begin
  update public.events set
    status = 'unpublished', hidden_at = now(), hidden_by = auth.uid(),
    hidden_reason = p_reason, hidden_by_staff = p_staff,
    status_before_hide = coalesce(p_event.status_before_hide, p_event.status)
  where id = p_event.id;
  perform moderation_private.audit(p_event.id, 'event_hidden',
    jsonb_build_object('status', p_event.status, 'hidden_by_staff', p_event.hidden_by_staff),
    jsonb_build_object('status', 'unpublished', 'hidden_by_staff', p_staff), p_reason);
end;
$$;

create function public.hide_event(
  p_event_id uuid, p_reason text, p_as_staff boolean default false, p_confirm boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  staff boolean := coalesce(p_as_staff, false);
  ev public.events := moderation_private.lock_event(p_event_id, staff, p_confirm);
  reason text := moderation_private.reason(p_reason);
begin
  if ev.status in ('ended', 'cancelled') then
    raise exception 'This event can no longer be hidden.' using errcode = '22023';
  end if;
  if not staff and (ev.hidden_by_staff or exists (
    select 1 from public.event_removal_requests where event_id = ev.id and status = 'pending'
  )) then raise exception 'Tikatero is reviewing this event.' using errcode = '42501'; end if;
  perform moderation_private.hide(ev, reason, staff);
end;
$$;

create function public.unhide_event(
  p_event_id uuid, p_reason text default null, p_as_staff boolean default false,
  p_confirm boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  staff boolean := coalesce(p_as_staff, false);
  ev public.events := moderation_private.lock_event(p_event_id, staff, p_confirm);
  reason text := case when staff then moderation_private.reason(p_reason) end;
begin
  if ev.hidden_by_staff and not staff then
    raise exception 'Only Tikatero can show this event again.' using errcode = '42501';
  end if;
  if exists (select 1 from public.event_removal_requests where event_id = ev.id and status = 'pending') then
    raise exception 'Decide or withdraw the removal request first.' using errcode = '22023';
  end if;
  if ev.status <> 'unpublished' or ev.hidden_at is null then return; end if;
  update public.events set status = coalesce(ev.status_before_hide, 'unpublished'),
    hidden_at = null, hidden_by = null, hidden_reason = null, hidden_by_staff = false,
    status_before_hide = null
  where id = ev.id;
  perform moderation_private.audit(ev.id, 'event_unhidden',
    jsonb_build_object('status', ev.status),
    jsonb_build_object('status', coalesce(ev.status_before_hide, 'unpublished')), reason);
end;
$$;

create function public.request_event_removal(p_event_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  ev public.events := moderation_private.lock_event(p_event_id, false, false);
  reason text := moderation_private.reason(p_reason);
  request_id uuid;
begin
  if ev.status = 'cancelled' then
    raise exception 'This event is already cancelled.' using errcode = '22023';
  end if;
  if exists (select 1 from public.event_removal_requests where event_id = ev.id and status = 'pending') then
    raise exception 'Tikatero is already reviewing a request for this event.' using errcode = '23505';
  end if;
  insert into public.event_removal_requests(event_id, organiser_id, requested_by, reason)
  values (ev.id, ev.organiser_id, auth.uid(), reason) returning id into request_id;
  if not ev.hidden_by_staff then
    perform moderation_private.hide(ev, 'Removal requested', false);
  end if;
  perform moderation_private.audit(ev.id, 'event_removal_requested', null,
    jsonb_build_object('request_id', request_id, 'status', 'pending'), reason);
  return request_id;
end;
$$;

create function public.withdraw_event_removal(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare ev public.events;
begin
  ev := moderation_private.lock_event(
    (select event_id from public.event_removal_requests where id = p_request_id), false, false);
  update public.event_removal_requests set status = 'withdrawn', decided_at = now()
    where id = p_request_id and status = 'pending';
  if not found then raise exception 'This request is no longer waiting for a decision.' using errcode = '22023'; end if;
  perform moderation_private.audit(ev.id, 'event_removal_withdrawn',
    jsonb_build_object('status', 'pending'), jsonb_build_object('request_id', p_request_id, 'status', 'withdrawn'), null);
end;
$$;

create function public.admin_decide_event_removal(
  p_request_id uuid, p_decision text, p_note text, p_confirm boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ev public.events;
  request public.event_removal_requests;
  note text;
  result jsonb := '{}'::jsonb;
begin
  ev := moderation_private.lock_event(
    (select event_id from public.event_removal_requests where id = p_request_id), true, p_confirm);
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Choose whether to approve or reject the request.' using errcode = '22023';
  end if;
  select * into request from public.event_removal_requests where id = p_request_id for update;
  if request.status = p_decision then
    return jsonb_build_object('status', request.status, 'reason', request.reason, 'note', request.reviewer_note);
  end if;
  if request.status <> 'pending' then
    raise exception 'This request is no longer waiting for a decision.' using errcode = '22023';
  end if;
  note := case when p_decision = 'rejected' or nullif(btrim(p_note), '') is not null
    then moderation_private.reason(p_note) end;
  update public.event_removal_requests set status = p_decision, reviewer_id = auth.uid(),
    reviewer_note = note, decided_at = now() where id = request.id;
  if p_decision = 'approved' then
    result := public.cancel_event_refunds(ev.id, request.reason, 'staff', p_confirm);
  end if;
  perform moderation_private.audit(ev.id, 'event_removal_' || p_decision,
    jsonb_build_object('status', 'pending'), jsonb_build_object('request_id', request.id, 'status', p_decision), note);
  return result || jsonb_build_object('status', p_decision, 'reason', request.reason, 'note', note);
end;
$$;

create function public.admin_delete_event(p_event_id uuid, p_reason text, p_confirm boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ev public.events := moderation_private.lock_event(p_event_id, true, p_confirm);
  reason text := moderation_private.reason(p_reason);
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Only an admin can permanently delete this event.' using errcode = '42501';
  end if;
  if exists (select 1 from public.orders where event_id = ev.id) then
    raise exception 'Events with bookings are cancelled and refunded, not deleted.' using errcode = '22023';
  end if;
  perform moderation_private.audit(ev.id, 'event_deleted',
    jsonb_build_object('title', ev.title, 'organiser_id', ev.organiser_id,
      'organiser', (select display_name from public.organisers where id = ev.organiser_id)),
    null, reason);
  insert into public.event_media_cleanup(event_id) values (ev.id);
  delete from public.events where id = ev.id;
end;
$$;

revoke all on function
  public.hide_event(uuid, text, boolean, boolean), public.unhide_event(uuid, text, boolean, boolean),
  public.request_event_removal(uuid, text), public.withdraw_event_removal(uuid),
  public.admin_decide_event_removal(uuid, text, text, boolean), public.admin_delete_event(uuid, text, boolean)
from public, anon;
grant execute on function
  public.hide_event(uuid, text, boolean, boolean), public.unhide_event(uuid, text, boolean, boolean),
  public.request_event_removal(uuid, text), public.withdraw_event_removal(uuid),
  public.admin_decide_event_removal(uuid, text, text, boolean), public.admin_delete_event(uuid, text, boolean)
to authenticated;

create or replace function public.save_event_wizard(p_event_id uuid,p_organiser_id uuid,p_revision integer,p_step integer,p_next_step integer,p_data jsonb,p_publish boolean default false)
returns setof public.events language plpgsql security invoker set search_path='' as $$
declare ev public.events; base text; candidate text; suffix integer:=1; item jsonb; item_id uuid; tier public.ticket_types;
begin
  if auth.uid() is null then raise exception 'Sign in to save this event' using errcode='42501'; end if;
  perform 1 from public.profiles where id=auth.uid() and blocked_at is null for share;
  if not found then raise exception 'Event access denied' using errcode='42501'; end if;
  perform 1 from public.organiser_members where user_id=auth.uid() and organiser_id=p_organiser_id for share;
  if not found then raise exception 'Event access denied' using errcode='42501'; end if;
  if p_step is null or p_step not between 0 and 7 or p_next_step is null or p_next_step not between 0 and 7 or p_revision is null or p_revision<0 or jsonb_typeof(p_data) is distinct from 'object' or p_publish is null or (p_publish and p_step<>7) then raise exception 'Invalid event step'; end if;
  -- Serialize first-save retries of the same client-generated id as well as edits.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_event_id::text,0));
  select * into ev from public.events where id=p_event_id for update;
  if not found then
    if p_step<>0 or p_revision<>0 then raise exception 'Save the event basics first'; end if;
    if length(btrim(coalesce(p_data->>'title','')))<3 then raise exception 'Enter an event name'; end if;
    base:=left(coalesce(p_data->>'slug','event'),80);
    if base !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid event link'; end if;
    loop
      candidate:=base||case when suffix=1 then '' else '-'||suffix::text end;
      insert into public.events(id,organiser_id,slug,title,starts_at) values(p_event_id,p_organiser_id,candidate,p_data->>'title',null)
        on conflict(slug) do nothing returning * into ev;
      exit when found;
      suffix:=suffix+1;if suffix>10000 then raise exception 'Please choose a different event name';end if;
    end loop;
  end if;
  if ev.organiser_id<>p_organiser_id then raise exception 'Event access denied' using errcode='42501'; end if;
  if ev.wizard_revision<>p_revision then raise exception 'This event changed. Reload before saving.' using errcode='40001'; end if;
  if ev.status not in ('draft','published','unpublished') then raise exception 'This event can no longer be edited'; end if;
  case p_step
    when 0 then
      if ev.is_free is distinct from (p_data->>'is_free')::boolean and exists(select 1 from public.ticket_types where event_id=ev.id and qty_sold>0) then raise exception 'An event with sold tickets cannot change to free or paid';end if;
      update public.events set title=p_data->>'title',category=p_data->>'category',description=p_data->>'description',theme=p_data->>'theme',is_free=(p_data->>'is_free')::boolean where id=ev.id;
      if (p_data->>'is_free')::boolean then update public.ticket_types set price_paise=0 where event_id=ev.id;end if;
    when 1 then update public.events set starts_at=(p_data->>'starts_at')::timestamptz,ends_at=(p_data->>'ends_at')::timestamptz,gates_open_at=(p_data->>'gates_open_at')::timestamptz,timezone='Asia/Kolkata' where id=ev.id;
    when 2 then update public.events set venue_name=p_data->>'venue_name',address=p_data->>'address',city=p_data->>'city',country=p_data->>'country',maps_url=p_data->>'maps_url',lat=(p_data->>'lat')::numeric,lng=(p_data->>'lng')::numeric where id=ev.id;
    when 3 then update public.events set poster_key=p_data->>'poster_key' where id=ev.id;
    when 4 then
      if jsonb_typeof(p_data->'guests') is distinct from 'array' or jsonb_array_length(p_data->'guests')>20 then raise exception 'Choose up to 20 guests';end if;
      delete from public.event_guests where event_id=ev.id and id not in(select (g->>'id')::uuid from jsonb_array_elements(p_data->'guests') g);
      for item in select * from jsonb_array_elements(p_data->'guests') loop
        item_id:=(item->>'id')::uuid;
        update public.event_guests set name=item->>'name',title=item->>'title',photo_key=item->>'photo_key',is_vip=(item->>'is_vip')::boolean,sort=(item->>'sort')::integer where id=item_id and event_id=ev.id;
        if not found then insert into public.event_guests(id,event_id,name,title,photo_key,is_vip,sort) values(item_id,ev.id,item->>'name',item->>'title',item->>'photo_key',(item->>'is_vip')::boolean,(item->>'sort')::integer);end if;
      end loop;
    when 5 then
      if p_data ? 'capacity' then
        if p_data->>'capacity' is not null and (p_data->>'capacity' !~ '^[0-9]{1,7}$'
          or (p_data->>'capacity')::integer not between 1 and 1000000) then
          raise exception 'Total seats must be a whole number from 1 to 10,00,000.';
        end if;
        update public.events set capacity=(p_data->>'capacity')::integer where id=ev.id;
      end if;
      if jsonb_typeof(p_data->'tiers') is distinct from 'array' or jsonb_array_length(p_data->'tiers') not between 0 and 20 then raise exception 'Add between 1 and 20 ticket tiers';end if;
      if exists(select 1 from public.ticket_types where event_id=ev.id and qty_sold>0 and id not in(select (t->>'id')::uuid from jsonb_array_elements(p_data->'tiers') t)) then raise exception 'A tier with sold tickets cannot be removed';end if;
      delete from public.ticket_types where event_id=ev.id and id not in(select (t->>'id')::uuid from jsonb_array_elements(p_data->'tiers') t);
      for item in select * from jsonb_array_elements(p_data->'tiers') loop
        item_id:=(item->>'id')::uuid;
        select * into tier from public.ticket_types where id=item_id and event_id=ev.id;
        if found and tier.qty_sold>0 and tier.price_paise<>(item->>'price_paise')::bigint then raise exception 'A tier with sold tickets cannot change price';end if;
        update public.ticket_types set name=item->>'name',price_paise=case when ev.is_free then 0 else (item->>'price_paise')::bigint end,qty_total=(item->>'qty_total')::integer,per_order_max=(item->>'per_order_max')::integer,sales_start=(item->>'sales_start')::timestamptz,sales_end=(item->>'sales_end')::timestamptz,is_vip=(item->>'is_vip')::boolean,sort=(item->>'sort')::integer where id=item_id and event_id=ev.id;
        if not found then insert into public.ticket_types(id,event_id,name,price_paise,qty_total,per_order_max,sales_start,sales_end,is_vip,sort) values(item_id,ev.id,item->>'name',case when ev.is_free then 0 else (item->>'price_paise')::bigint end,(item->>'qty_total')::integer,(item->>'per_order_max')::integer,(item->>'sales_start')::timestamptz,(item->>'sales_end')::timestamptz,(item->>'is_vip')::boolean,(item->>'sort')::integer);end if;
      end loop;
    when 6 then update public.events set fee_payer=(p_data->>'fee_payer')::public.fee_payer,refund_policy=p_data->>'refund_policy' where id=ev.id;
    else null;
  end case;
  if p_publish then
    -- Lock the organiser while publishing so a staff pause/approval change cannot
    -- race the publish. PR 2's trigger remains the authoritative KYC guard.
    perform 1 from public.organisers where id=p_organiser_id and kyc_status='approved' and not sales_paused for share;
    if not found then raise exception 'publish blocked: organiser must be approved and sales must not be paused' using errcode='P0001';end if;
    select * into ev from public.events where id=ev.id;
    if not ev.wizard_completed_steps @> array[0,1,2,3,4,5,6]::smallint[] then raise exception 'Complete each step before publishing';end if;
    update public.events set status='published' where id=ev.id;
  end if;
  update public.events set wizard_step=p_next_step,wizard_revision=wizard_revision+1,
    wizard_completed_steps=array(select distinct s from unnest(wizard_completed_steps||case when coalesce((p_data->>'_complete')::boolean,false) then array[p_step::smallint] else '{}'::smallint[] end) s where s<>p_step or coalesce((p_data->>'_complete')::boolean,false) order by s)
    where id=ev.id returning * into ev;
  return next ev;
end;
$$;

create or replace view public.discovery_events with (security_invoker = true) as
select e.id, e.slug, e.title, e.description, e.category, e.starts_at, e.ends_at,
  e.gates_open_at, e.venue_name, e.address, e.city, e.country, e.lat, e.lng,
  e.maps_url, e.poster_key, e.theme, e.is_free, e.refund_policy, e.published_at,
  e.created_at, o.display_name as organiser_name, o.verified,
  coalesce(t.sold, 0)::bigint as tickets_sold, t.min_price_paise,
  coalesce(t.tiers, '[]'::jsonb) as tiers,
  coalesce(g.guests, '[]'::jsonb) as guests, e.capacity
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
where e.status = 'published' and e.hidden_at is null and e.organiser_sales_open;

create or replace function public.checkout_hold(p_order_id uuid,p_buyer_id uuid,p_slug text,p_name text,p_email text,p_phone text,
  p_lines jsonb,p_pricing_version_id uuid,p_fee_payer public.fee_payer,p_is_free boolean,p_amounts jsonb,
  p_provider text,p_token_hash text,p_attendees jsonb,p_is_test boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ev public.events; org public.organisers; tier public.ticket_types; item jsonb; current_version uuid;
  requested integer:=0; occupied bigint; held bigint; qty integer; saved public.orders;
begin
  select * into ev from public.events where slug=p_slug for update;
  if not found or ev.status<>'published' or ev.hidden_at is not null or coalesce(ev.ends_at,ev.starts_at)<=now() then raise exception 'This event is not accepting bookings.'; end if;
  select * into org from public.organisers where id=ev.organiser_id for share;
  if org.kyc_status<>'approved' then raise exception 'This organiser is awaiting approval.'; end if;
  if org.sales_paused then raise exception 'Ticket sales are temporarily paused.'; end if;
  if p_provider not in ('mock','cashfree','free') then raise exception 'Invalid payment provider.'; end if;
  if p_provider='cashfree' and nullif(btrim(org.cashfree_vendor_id),'') is null then raise exception 'This organiser is not ready to accept payments.'; end if;
  if not exists(select 1 from public.profiles where id=p_buyer_id and blocked_at is null) then raise exception 'This account cannot book tickets.'; end if;
  if not exists(select 1 from auth.users where id=p_buyer_id and lower(email)=p_email and deleted_at is null) then raise exception 'Buyer email does not match.'; end if;
  select id into current_version from public.active_pricing_version();
  if current_version is distinct from p_pricing_version_id or ev.fee_payer<>p_fee_payer or ev.is_free<>p_is_free then raise exception 'Pricing changed. Please refresh checkout.'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 30
    or (select count(distinct x->>'id') from jsonb_array_elements(p_lines) x)<>jsonb_array_length(p_lines) then raise exception 'Choose valid ticket quantities.'; end if;
  -- Prices are recomputed by the TS engine, then compared here under the locks.
  for item in select x from jsonb_array_elements(p_lines) x order by x->>'id' loop
    select * into tier from public.ticket_types where id=(item->>'id')::uuid and event_id=ev.id for update;
    qty:=(item->>'qty')::integer;
    if not found or qty is null or qty<1 or qty>least(coalesce(tier.per_order_max,50),50) then raise exception 'Choose valid ticket quantities.'; end if;
    if tier.price_paise<>(item->>'price_paise')::bigint then raise exception 'Ticket prices changed. Please refresh checkout.'; end if;
    if (tier.sales_start is not null and tier.sales_start>now()) or (tier.sales_end is not null and tier.sales_end<=now()) then raise exception 'This ticket is not on sale right now.'; end if;
    select coalesce(sum(h.qty),0) into held from public.checkout_holds h where h.ticket_type_id=tier.id and h.released_at is null and h.consumed_at is null and h.expires_at>now();
    if tier.qty_sold+held+qty>tier.qty_total then raise exception 'These tickets just sold out. Please choose another ticket.'; end if;
    requested:=requested+qty;
  end loop;
  if requested>50 then raise exception 'Choose up to 50 tickets per order.'; end if;
  select coalesce(sum(t.qty_sold),0) into occupied from public.ticket_types t where t.event_id=ev.id;
  select occupied+coalesce(sum(h.qty),0) into occupied from public.checkout_holds h join public.orders o on o.id=h.order_id
    where o.event_id=ev.id and h.released_at is null and h.consumed_at is null and h.expires_at>now();
  if ev.capacity is not null and occupied+requested>ev.capacity then raise exception 'This event is sold out.'; end if;
  if (p_amounts->>'buyer_total')::bigint>0 and (p_amounts->>'organiser_share')::bigint<=0 then raise exception 'This ticket cannot be booked at its current price.'; end if;
  if (p_provider='free') is distinct from ((p_amounts->>'buyer_total')::bigint=0) then raise exception 'Payment provider does not match the amount.'; end if;
  insert into public.orders(id,event_id,buyer_id,buyer_name,buyer_email,buyer_phone,subtotal_paise,platform_fee_paise,platform_fee_gst_paise,gateway_fee_paise,total_paise,fee_payer,status,cf_order_id,pricing_version_id,payment_provider,vendor_id,organiser_share_paise,platform_share_paise,access_token_hash,hold_expires_at,attendee_names,consent_at,is_test)
  values(p_order_id,ev.id,p_buyer_id,p_name,p_email,p_phone,(p_amounts->>'subtotal')::bigint,(p_amounts->>'platform_fee')::bigint,(p_amounts->>'platform_fee_gst')::bigint,(p_amounts->>'gateway_fee')::bigint,(p_amounts->>'buyer_total')::bigint,ev.fee_payer,'pending',case when p_provider='cashfree' then p_order_id::text end,p_pricing_version_id,p_provider,org.cashfree_vendor_id,(p_amounts->>'organiser_share')::bigint,(p_amounts->>'platform_share')::bigint,p_token_hash,now()+interval '10 minutes',p_attendees,now(),p_is_test)
  returning * into saved;
  for item in select x from jsonb_array_elements(p_lines) x loop
    insert into public.order_items(order_id,ticket_type_id,qty,unit_price_paise) values(saved.id,(item->>'id')::uuid,(item->>'qty')::integer,case when ev.is_free then 0 else (item->>'price_paise')::bigint end);
    insert into public.checkout_holds(order_id,ticket_type_id,qty,expires_at) values(saved.id,(item->>'id')::uuid,(item->>'qty')::integer,saved.hold_expires_at);
  end loop;
  return to_jsonb(saved);
end; $$;

create or replace function public.checkout_protect_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
declare sold bigint; occupied bigint;
begin
  if new.capacity is distinct from old.capacity and new.capacity is not null then
    select coalesce(sum(qty_sold),0) into sold from public.ticket_types where event_id=old.id;
    select sold+coalesce(sum(h.qty),0) into occupied from public.checkout_holds h join public.orders o on o.id=h.order_id
      where o.event_id=old.id and h.released_at is null and h.consumed_at is null and h.expires_at>now();
    if new.capacity < sold then
      raise exception 'You''ve already sold % tickets, so total seats can''t be less than %.', sold, sold;
    elsif new.capacity < occupied then
      raise exception 'You''ve already sold or reserved % seats, so total seats can''t be less than %.', occupied, occupied;
    end if;
  end if;
  return new;
end; $$;

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
    'account_blocked', 'staff_alert', 'welcome_attendee', 'welcome_organiser',
    'event_hidden_by_admin', 'event_removal_approved', 'event_removal_rejected'
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

create or replace function public.cancel_event_refunds(
  p_event_id uuid,
  p_reason text,
  p_as text,
  p_confirm boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  ev public.events;
  ord public.orders;
  opened jsonb := '[]'::jsonb;
  row jsonb;
  reason text := left(btrim(coalesce(p_reason, '')), 300);
begin
  if p_as is distinct from 'staff' then
    raise exception 'Ask Tikatero to cancel this event.' using errcode = '42501';
  end if;
  perform refund_private.assert_manager(p_event_id, p_as, p_confirm);
  select * into ev from public.events where id = p_event_id for update;
  if ev.status <> 'cancelled' and not exists (
    select 1 from public.event_removal_requests where event_id = ev.id and status = 'approved'
  ) then
    raise exception 'Approve a removal request or use emergency cancellation.' using errcode = '42501';
  end if;
  if reason is null or reason = '' then
    raise exception 'Add a short reason for the cancellation.';
  end if;
  if reason ~* 'sb_secret_|service_role|cashfree_secret' then
    raise exception 'That reason cannot be saved.';
  end if;
  perform moderation_private.record_cancellation(ev, reason);
  -- An unpaid free pass has no money to return.
  update public.tickets as ticket set status = 'void'
    from public.orders as checkout
    where checkout.event_id = ev.id and checkout.total_paise = 0
      and ticket.order_id = checkout.id and ticket.status in ('valid', 'transferred');
  -- Follow finish_refund's refund-before-order lock order for existing requests.
  perform 1 from public.refunds as refund
    join public.orders as checkout on checkout.id = refund.order_id
    where checkout.event_id = ev.id and refund.status in ('requested', 'approved')
    order by refund.id for update of refund;
  for ord in
    select *
    from public.orders
    where event_id = p_event_id
      and status in ('paid', 'partially_refunded')
    order by id
    for update
  loop
    -- A refund already sent for this booking must finish before the balance is opened.
    if exists (select 1 from public.refunds where order_id = ord.id and status = 'approved') then
      continue;
    end if;
    with replaced as (
      update public.refunds set status = 'rejected', approved_by = actor
      where order_id = ord.id and status = 'requested'
      returning id
    )
    insert into public.audit_log(actor_id, action, entity, entity_id, after, reason)
    select actor, 'refund_rejected', 'refunds', id, jsonb_build_object('order_id', ord.id),
      'Replaced by the full event refund.' from replaced;
    if ord.total_paise > coalesce((
      select sum(amount_paise)::bigint from public.refunds
      where order_id = ord.id and status = 'processed'
    ), 0) then
      row := refund_private.insert_refund(
        ord,
        ord.total_paise - coalesce((
          select sum(amount_paise)::bigint from public.refunds
          where order_id = ord.id and status = 'processed'
        ), 0),
        'approved',
        reason,
        actor,
        null,
        true
      );
      opened := opened || jsonb_build_array(row);
    end if;
  end loop;
  update public.payouts set status = 'cancelled' where event_id = ev.id
    and status in ('scheduled', 'on_hold', 'failed');
  return jsonb_build_object('outcome', 'cancelled', 'event_id', p_event_id, 'refunds', opened);
end;
$$;

create or replace function payout_private.schedule_order_payout(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ord public.orders;
  ev public.events;
  org public.organisers;
  days integer;
  payout_status public.payout_status;
begin
  select * into ord from public.orders where id = p_order_id for update;
  if not found or ord.status <> 'paid' or ord.paid_at is null then return; end if;
  select * into ev from public.events where id = ord.event_id;
  if not found or ev.status = 'cancelled' then return; end if;
  select * into org from public.organisers where id = ev.organiser_id;
  update public.orders
  set absorbed_gateway_paise = payout_private.absorbed_cost(ord.id)
  where id = ord.id
    and absorbed_gateway_paise is distinct from payout_private.absorbed_cost(ord.id);
  if ord.total_paise is distinct from
    ord.organiser_share_paise + ord.platform_share_paise + ord.gateway_fee_paise
  then
    perform payout_private.note_exception(ord, org.id, 'Paid order does not balance and was left out of payouts.');
    return;
  end if;
  if ord.organiser_share_paise < 0 then
    perform payout_private.note_exception(ord, org.id, 'Paid order has a negative organiser share and was left out of payouts.');
    return;
  end if;
  if ord.organiser_share_paise = 0 then return; end if;
  select coalesce(v.payout_days, 2) into days
  from public.pricing_versions v
  where v.id = ord.pricing_version_id;
  days := coalesce(days, 2);
  payout_status := case when org.payouts_on_hold then 'on_hold'::public.payout_status else 'scheduled'::public.payout_status end;
  insert into public.payouts (
    organiser_id, event_id, order_id, amount_paise, status, expected_at, is_test
  )
  values (
    org.id,
    ev.id,
    ord.id,
    ord.organiser_share_paise,
    payout_status,
    payout_private.expected_payout_at(ord.paid_at, days, null),
    ord.is_test
  )
  on conflict (order_id) where order_id is not null do nothing;
end;
$$;

create or replace function public.checkout_transition(p_order_id uuid,p_state text,p_amount bigint,p_currency text,p_payment_id text default null,
  p_source text default null,p_event_id text default null,p_payload jsonb default '{}')
returns text language plpgsql security definer set search_path='' as $$
declare ord public.orders; ev public.events; item record; tier public.ticket_types; held bigint; occupied bigint; duplicate_id uuid; unavailable boolean:=false;
begin
  select e.* into ev from public.events e join public.orders o on o.event_id=e.id where o.id=p_order_id for update of e;
  if not found then raise exception 'Order not found.'; end if;
  perform 1 from public.ticket_types where event_id=ev.id order by id for update;
  select * into ord from public.orders where id=p_order_id for update;
  if p_source is not null then
    insert into public.webhook_events(source,event_id,payload) values(p_source,p_event_id,p_payload)
      on conflict(source,event_id) do nothing returning id into duplicate_id;
    if duplicate_id is null then return ord.status::text; end if;
  end if;
  if p_state not in ('paid','failed','expired','pending') then raise exception 'Invalid payment state.'; end if;
  if p_currency<>'INR' or p_amount is distinct from ord.total_paise then raise exception 'Payment amount does not match the order.'; end if;
  if p_source='cashfree' and ord.payment_provider<>'cashfree' then raise exception 'Payment provider does not match the order.'; end if;
  if ord.paid_at is not null then
    -- A later failed attempt can never undo a successful payment.
    null;
  elsif exists(select 1 from public.order_outbox where order_id=ord.id and topic='payment.review_required') then
    null; -- A review case is resolved by an operator, never by another automatic attempt.
  elsif p_state='paid' and ev.status='cancelled' then
    -- A held payment can succeed after cancellation. Save the captured money and
    -- queue its full refund without consuming seats or creating tickets.
    update public.checkout_holds set released_at=coalesce(released_at,now()) where order_id=ord.id and consumed_at is null;
    update public.orders set status='paid',paid_at=now(),cf_payment_id=p_payment_id where id=ord.id returning * into ord;
    if ord.total_paise > 0 then
      perform refund_private.insert_refund(ord, ord.total_paise, 'approved', 'The event was cancelled.',
        null, null, true);
    end if;
  elsif p_state='paid' then
    -- A late success may arrive after expiry/failure and seat reallocation. Reacquire
    -- under the same locks or queue review; never oversell or silently issue tickets.
    for item in select * from public.order_items where order_id=ord.id order by ticket_type_id loop
      select * into tier from public.ticket_types where id=item.ticket_type_id;
      select coalesce(sum(qty),0) into held from public.checkout_holds where ticket_type_id=tier.id and order_id<>ord.id and released_at is null and consumed_at is null and expires_at>now();
      if tier.qty_sold+held+item.qty>tier.qty_total then unavailable:=true; end if;
    end loop;
    select coalesce(sum(qty_sold),0) into occupied from public.ticket_types where event_id=ev.id;
    select occupied+coalesce(sum(h.qty),0) into occupied from public.checkout_holds h join public.orders o on o.id=h.order_id
      where o.event_id=ev.id and o.id<>ord.id and h.released_at is null and h.consumed_at is null and h.expires_at>now();
    if ev.capacity is not null and occupied+(select sum(qty) from public.order_items where order_id=ord.id)>ev.capacity then unavailable:=true; end if;
    if unavailable then
      insert into public.order_outbox(order_id,topic,payload) values(ord.id,'payment.review_required',jsonb_build_object('order_id',ord.id,'reason','Paid after inventory was reallocated')) on conflict do nothing;
      update public.orders set status='expired' where id=ord.id;
      update public.checkout_holds set released_at=coalesce(released_at,now()) where order_id=ord.id and consumed_at is null;
    else
      update public.checkout_holds set consumed_at=now(),released_at=null where order_id=ord.id;
      update public.ticket_types t set qty_sold=t.qty_sold+i.qty from public.order_items i where i.order_id=ord.id and i.ticket_type_id=t.id;
      update public.orders set status='paid',paid_at=now(),cf_payment_id=p_payment_id where id=ord.id;
      insert into public.order_outbox(order_id,topic,payload) values(ord.id,'order.paid',jsonb_build_object('order_id',ord.id,'is_test',ord.is_test,'payment_provider',ord.payment_provider)) on conflict do nothing;
    end if;
  elsif p_state in ('failed','expired') then
    update public.checkout_holds set released_at=coalesce(released_at,now()) where order_id=ord.id and consumed_at is null;
    update public.orders set status=p_state::public.order_status where id=ord.id;
  end if;
  if p_source is not null then update public.webhook_events set processed_at=now() where source=p_source and event_id=p_event_id; end if;
  update public.orders set reconciled_at=now() where id=ord.id;
  return (select status::text from public.orders where id=ord.id);
end; $$;

create or replace function public.issue_tickets(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ord public.orders;
  box_id uuid;
  consumed timestamptz;
  existing integer;
  seats integer;
  names jsonb;
  prefix text;
  attempt integer;
  seq integer;
  seat integer;
  item record;
  holder text;
begin
  if p_order_id is null then
    return 0;
  end if;

  select * into ord from public.orders where id = p_order_id for update;
  if not found or ord.status is distinct from 'paid' then
    return 0;
  end if;

  if exists (select 1 from public.events where id = ord.event_id and status = 'cancelled') then
    return 0;
  end if;

  -- A review case is never fulfilled, even if an order.paid row also exists.
  if exists (
    select 1 from public.order_outbox
    where order_id = ord.id and topic = 'payment.review_required'
  ) then
    return 0;
  end if;

  select id, consumed_at into box_id, consumed
  from public.order_outbox
  where order_id = ord.id and topic = 'order.paid'
  for update;
  if not found then
    return 0;
  end if;

  select count(*)::integer into existing from public.tickets where order_id = ord.id;
  if existing > 0 then
    update public.order_outbox
    set consumed_at = coalesce(consumed_at, now())
    where id = box_id;
    return existing;
  end if;

  if consumed is not null then
    return 0;
  end if;

  select coalesce(sum(qty), 0)::integer into seats
  from public.order_items
  where order_id = ord.id;
  if seats < 1 or seats > 99 then
    return 0;
  end if;

  names := case
    when jsonb_typeof(ord.attendee_names) = 'array' then ord.attendee_names
    else '[]'::jsonb
  end;

  for attempt in 1..8 loop
    prefix := public.ticket_code_prefix();
    begin
      seq := 0;
      for item in
        select oi.ticket_type_id, oi.qty
        from public.order_items oi
        join public.ticket_types tt on tt.id = oi.ticket_type_id
        where oi.order_id = ord.id
        order by tt.sort, oi.ticket_type_id
      loop
        for seat in 1..item.qty loop
          seq := seq + 1;
          holder := null;
          if jsonb_typeof(names -> (seq - 1)) = 'string' then
            holder := nullif(left(btrim(names ->> (seq - 1)), 120), '');
          end if;
          insert into public.tickets (
            order_id, event_id, ticket_type_id, code, seq,
            holder_name, holder_email, qr_secret
          ) values (
            ord.id,
            ord.event_id,
            item.ticket_type_id,
            'TK-' || prefix || '-' || lpad(seq::text, 2, '0'),
            seq,
            coalesce(holder, ord.buyer_name),
            ord.buyer_email,
            'v1'
          );
        end loop;
      end loop;
      exit;
    exception
      when unique_violation then
        if attempt = 8 then
          raise exception 'Ticket codes could not be issued.' using errcode = 'P0001';
        end if;
    end;
  end loop;

  update public.order_outbox
  set consumed_at = now()
  where id = box_id and consumed_at is null;

  return (select count(*)::integer from public.tickets where order_id = ord.id);
end;
$$;

-- Staff cannot list financial data before their account is authorised.
create function public.admin_event_review_list(
  p_search text, p_status text, p_filter text, p_offset integer, p_event_id uuid default null
)
returns table (
  id uuid, title text, organiser_name text, city text, starts_at timestamptz,
  status public.event_status, hidden boolean, removal_requested boolean,
  tickets_sold bigint, gross_paise bigint, total_count bigint
)
language plpgsql security definer set search_path = '' as $$
begin
  perform admin_private.require_staff();
  return query
    select e.id, e.title, o.display_name, e.city, e.starts_at, e.status,
      e.hidden_at is not null, r.pending,
      coalesce((select sum(t.qty_sold) from public.ticket_types t where t.event_id = e.id), 0),
      coalesce((select sum(b.total_paise)::bigint from public.orders b
        where b.event_id = e.id and not b.is_test and b.paid_at is not null), 0),
      count(*) over ()
    from public.events e
    join public.organisers o on o.id = e.organiser_id
    cross join lateral (select exists (select 1 from public.event_removal_requests request
      where request.event_id = e.id and request.status = 'pending') as pending) r
    where (p_event_id is null or e.id = p_event_id)
      and (coalesce(p_search, '') = '' or strpos(lower(e.title), lower(p_search)) > 0
      or strpos(lower(o.display_name), lower(p_search)) > 0)
      and (coalesce(p_status, '') = '' or e.status::text = p_status)
      and (coalesce(p_filter, '') = '' or p_filter = 'hidden' and e.status = 'unpublished' and e.hidden_at is not null
        or p_filter = 'removal' and r.pending)
    order by e.created_at desc, e.id
    limit 30 offset greatest(0, least(coalesce(p_offset, 0), 30000));
end;
$$;
revoke all on function public.admin_event_review_list(text, text, text, integer, uuid) from public, anon;
grant execute on function public.admin_event_review_list(text, text, text, integer, uuid) to authenticated;

create function public.admin_emergency_cancel_event(
  p_event_id uuid, p_reason text, p_title text, p_confirm boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ev public.events := moderation_private.lock_event(p_event_id, true, p_confirm);
  reason text := moderation_private.reason(p_reason);
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Only an admin can cancel without a removal request.' using errcode = '42501';
  end if;
  if p_title is distinct from ev.title then
    raise exception 'Type the event title exactly as shown.' using errcode = '22023';
  end if;
  perform moderation_private.record_cancellation(ev, reason);
  return public.cancel_event_refunds(ev.id, reason, 'staff', p_confirm);
end;
$$;
revoke all on function public.admin_emergency_cancel_event(uuid, text, text, boolean) from public, anon;
grant execute on function public.admin_emergency_cancel_event(uuid, text, text, boolean) to authenticated;

-- When a refund was already with the payment provider, queue the balance as soon
-- as that refund completes. The refund helper keeps the original reversal maths.
create function moderation_private.queue_refund_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  done_amount bigint;
  cancellation public.audit_log;
begin
  select * into cancellation from public.audit_log
    where entity = 'events' and entity_id = new.event_id and action = 'event_cancelled'
    order by created_at desc limit 1;
  if not found then return new; end if;
  select coalesce(sum(amount_paise), 0) into done_amount from public.refunds
    where order_id = new.id and status = 'processed';
  if done_amount < new.total_paise and not exists (
    select 1 from public.refunds where order_id = new.id and status in ('requested', 'approved')
  ) then
    perform refund_private.insert_refund(new, new.total_paise - done_amount, 'approved',
      cancellation.reason, cancellation.actor_id, null, true);
  end if;
  return new;
end;
$$;
create trigger orders_queue_event_refund_balance after update of status on public.orders
for each row when (new.status = 'partially_refunded')
execute function moderation_private.queue_refund_balance();

create function public.queued_event_refunds(p_limit integer)
returns table (id uuid, event_id uuid)
language sql stable security invoker set search_path = '' as $$
  select checkout.id, checkout.event_id
  from public.refunds as refund
  join public.orders as checkout on checkout.id = refund.order_id
  join public.events as event on event.id = checkout.event_id
  where event.status = 'cancelled' and refund.status = 'approved' and refund.cf_refund_id is null
  order by refund.id
  limit greatest(0, least(coalesce(p_limit, 0), 500));
$$;
revoke all on function public.queued_event_refunds(integer) from public, anon, authenticated;
grant execute on function public.queued_event_refunds(integer) to service_role;
