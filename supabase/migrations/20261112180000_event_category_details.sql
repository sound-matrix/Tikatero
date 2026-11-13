create schema event_details_private;
revoke all on schema event_details_private from public;
grant usage on schema event_details_private to anon, authenticated, service_role;

alter table public.events
  add column details jsonb not null default '{}'::jsonb,
  add column is_unlisted boolean not null default false,
  add constraint events_details_object_and_size
    check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 16384),
  add constraint events_unlisted_category
    check (not is_unlisted or coalesce(category in ('Wedding / Private', 'Other'), false));

grant select (details, is_unlisted) on public.events to anon, authenticated;

create function event_details_private.event_detail_keys(p_category text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_category
    when 'Concert' then array['lineup','genre','age_limit','languages']
    when 'Festival party' then array['lineup','dress_code','age_limit','food_drinks']
    when 'Conference' then array['agenda','speakers','who_for','certificate']
    when 'Comedy' then array['comedians','languages','age_limit']
    when 'Workshop' then array['trainer','level','bring','materials_included','certificate']
    when 'Sports' then array['teams','sport','format']
    when 'Wedding / Private' then array['hosts','dress_code','invite_note']
    when 'Other' then array['event_kind','who_for','what_to_expect','extra']
    else array[]::text[]
  end
$$;

create function event_details_private.event_detail_text(p_value jsonb, p_max int) returns text
language plpgsql immutable set search_path = '' as $$
declare result text;
begin
  if jsonb_typeof(p_value) is distinct from 'string' then
    raise exception 'Enter text for this event detail.';
  end if;
  result := regexp_replace(p_value #>> '{}', U&'^[[:space:]\00A0\FEFF]+|[[:space:]\00A0\FEFF]+$', '', 'g');
  if char_length(result) > p_max then
    raise exception 'Enter up to % characters for this event detail.', p_max;
  end if;
  return nullif(result, '');
end;
$$;

create function event_details_private.clean_event_details(p_category text, p_details jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  result jsonb := '{}'::jsonb;
  detail_key text;
  detail jsonb;
  rows jsonb;
  item jsonb;
  clean_item jsonb;
  item_key text;
  item_keys text[];
  answer text;
begin
  if jsonb_typeof(p_details) is distinct from 'object' then
    raise exception 'Check the extra event details.';
  end if;
  foreach detail_key in array event_details_private.event_detail_keys(p_category) loop
    detail := p_details->detail_key;
    if detail is null then continue; end if;
    if detail_key in ('certificate','materials_included') then
      if jsonb_typeof(detail) is distinct from 'boolean' then
        raise exception 'Choose yes or no for this event detail.';
      end if;
      result := result || jsonb_build_object(detail_key, detail);
    elsif detail_key in ('lineup','languages','agenda','speakers','comedians','teams','extra') then
      if jsonb_typeof(detail) is distinct from 'array' then
        raise exception 'Check the list in your event details.';
      end if;
      if jsonb_array_length(detail) > (case when detail_key = 'extra' then 5 else 20 end) then
        raise exception 'There are too many answers in one list.';
      end if;
      rows := '[]'::jsonb;
      item_keys := case detail_key
        when 'lineup' then array['name','role','time']
        when 'agenda' then array['time','title','speaker']
        when 'speakers' then array['name','about']
        when 'extra' then array['label','value']
        else array['name']
      end;
      for item in select value from jsonb_array_elements(detail) loop
        if detail_key = 'languages' then
          answer := event_details_private.event_detail_text(item, 120);
          if answer is not null then rows := rows || jsonb_build_array(answer); end if;
          continue;
        end if;
        if jsonb_typeof(item) is distinct from 'object' then
          raise exception 'Check the answers in your event list.';
        end if;
        clean_item := '{}'::jsonb;
        foreach item_key in array item_keys loop
          if not item ? item_key then continue; end if;
          answer := event_details_private.event_detail_text(item->item_key, case item_key
            when 'about' then 1000 when 'label' then 40 when 'value' then 300
            when 'time' then 5 else 120 end);
          if item_key = 'time' and answer !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
            raise exception 'Enter a valid time in IST.';
          end if;
          if answer is not null then clean_item := clean_item || jsonb_build_object(item_key, answer); end if;
        end loop;
        if clean_item <> '{}'::jsonb then rows := rows || jsonb_build_array(clean_item); end if;
      end loop;
      if rows <> '[]'::jsonb then result := result || jsonb_build_object(detail_key, rows); end if;
    else
      answer := event_details_private.event_detail_text(detail,
        case when detail_key in ('bring','invite_note','what_to_expect') then 1000 else 120 end);
      if (detail_key = 'age_limit' and (answer is null or answer not in ('all','12+','16+','18+','21+')))
        or (detail_key = 'food_drinks' and (answer is null or answer not in ('included','sold_there','none')))
        or (detail_key = 'level' and (answer is null or answer not in ('beginner','some_experience','advanced'))) then
        raise exception 'Choose one of the available answers.';
      end if;
      if answer is not null then result := result || jsonb_build_object(detail_key, answer); end if;
    end if;
  end loop;
  if pg_column_size(result) > 16384 then
    raise exception 'Shorten the extra event details and try again.';
  end if;
  return result;
end;
$$;

create function event_details_private.event_detail_missing(p_category text, p_details jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_category = 'Comedy' and not exists (
      select 1 from jsonb_array_elements(coalesce(p_details->'comedians','[]'::jsonb)) as item
      where item->>'name' is not null
    ) then 'Add at least one comedian before publishing.'
    when p_category in ('Festival party','Comedy') and not p_details ? 'age_limit'
      then 'Choose an age limit before publishing.'
    when p_category = 'Workshop' and not p_details ? 'trainer'
      then 'Enter who is teaching before publishing.'
    when p_category = 'Sports' and not p_details ? 'sport'
      then 'Enter the sport before publishing.'
    when p_category = 'Other' and not p_details ? 'event_kind'
      then 'Enter the kind of event before publishing.'
  end
$$;

create function event_details_private.guard_event_category_details() returns trigger
language plpgsql set search_path = '' as $$
declare missing text;
begin
  if new.is_unlisted and not coalesce(new.category in ('Wedding / Private', 'Other'), false) then
    raise exception 'Only Wedding / Private and Other events can be unlisted.' using errcode = '22023';
  end if;
  new.details := event_details_private.clean_event_details(new.category, new.details);
  if current_user = 'authenticated' and new.status = 'published'
    and (tg_op = 'INSERT' or old.status = 'draft') then
    missing := event_details_private.event_detail_missing(new.category, new.details);
    if missing is not null then raise exception '%', missing; end if;
  end if;
  return new;
end;
$$;

revoke all on function event_details_private.guard_event_category_details() from public, anon, authenticated;
create trigger events_guard_category_details
before insert or update of category, details, is_unlisted, status on public.events
for each row execute function event_details_private.guard_event_category_details();

create or replace function public.save_event_wizard(p_event_id uuid,p_organiser_id uuid,p_revision integer,p_step integer,p_next_step integer,p_data jsonb,p_publish boolean default false)
returns setof public.events language plpgsql security definer set search_path='' as $$
declare ev public.events; base text; candidate text; suffix integer:=1; item jsonb; item_id uuid; tier public.ticket_types;
  category_details jsonb; unlisted boolean; missing text;
begin
  if p_event_id is null or p_organiser_id is null or auth.uid() is null then raise exception 'Sign in to save this event' using errcode='42501'; end if;
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
      category_details := coalesce(p_data->'details', ev.details);
      if p_data ? 'is_unlisted' and jsonb_typeof(p_data->'is_unlisted') is distinct from 'boolean' then
        raise exception 'Choose who can find this event.';
      end if;
      unlisted := coalesce((p_data->>'is_unlisted')::boolean,
        case when p_data->>'category' is not distinct from ev.category then ev.is_unlisted
          else coalesce(p_data->>'category' = 'Wedding / Private', false) end);
      update public.events set title=p_data->>'title',category=p_data->>'category',description=p_data->>'description',theme=p_data->>'theme',is_free=(p_data->>'is_free')::boolean,
        details=category_details,is_unlisted=unlisted where id=ev.id;
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
    when 6 then
      perform refund_private.save_rules(ev.id, p_data->>'refund_policy', p_data->'refund_rules',
        (p_data->>'refund_auto_approve')::boolean, 'Updated in event setup.', false);
      update public.events set fee_payer=(p_data->>'fee_payer')::public.fee_payer where id=ev.id;
    else null;
  end case;
  if p_publish then
    if ev.hidden_at is not null then raise exception 'Show this event before publishing it.'; end if;
    -- Lock the organiser while publishing so a staff pause/approval change cannot
    -- race the publish. PR 2's trigger remains the authoritative KYC guard.
    perform 1 from public.organisers where id=p_organiser_id and kyc_status='approved' and not sales_paused for share;
    if not found then raise exception 'publish blocked: organiser must be approved and sales must not be paused' using errcode='P0001';end if;
    select * into ev from public.events where id=ev.id;
    if not ev.wizard_completed_steps @> array[0,1,2,3,4,5,6]::smallint[] then raise exception 'Complete each step before publishing';end if;
    missing := event_details_private.event_detail_missing(ev.category, ev.details);
    if missing is not null then raise exception '%', missing; end if;
    update public.events set status='published' where id=ev.id;
  end if;
  update public.events set wizard_step=p_next_step,wizard_revision=wizard_revision+1,
    wizard_completed_steps=array(select distinct s from unnest(wizard_completed_steps||case when coalesce((p_data->>'_complete')::boolean,false) then array[p_step::smallint] else '{}'::smallint[] end) s where s<>p_step or coalesce((p_data->>'_complete')::boolean,false) order by s)
    where id=ev.id returning * into ev;
  ev.refunds_paused_by := null;
  ev.refunds_paused_reason := null;
  return next ev;
end;
$$;

create view event_details_private.public_event_details with (security_invoker = true) as
select e.id, e.slug, e.title, e.description, e.category, e.starts_at, e.ends_at,
  e.gates_open_at, e.venue_name, e.address, e.city, e.country, e.lat, e.lng,
  e.maps_url, e.poster_key, e.theme, e.is_free, e.refund_policy, e.published_at,
  e.created_at, o.display_name as organiser_name, o.verified,
  coalesce(t.sold, 0)::bigint as tickets_sold, t.min_price_paise,
  coalesce(t.tiers, '[]'::jsonb) as tiers,
  coalesce(g.guests, '[]'::jsonb) as guests, e.capacity, e.details, e.is_unlisted
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

create or replace view public.discovery_events with (security_invoker = true) as
select id, slug, title, description, category, starts_at, ends_at, gates_open_at,
  venue_name, address, city, country, lat, lng, maps_url, poster_key, theme,
  is_free, refund_policy, published_at, created_at, organiser_name, verified,
  tickets_sold, min_price_paise, tiers, guests, capacity, details
from event_details_private.public_event_details
where not is_unlisted;

revoke all on event_details_private.public_event_details from public;
grant select on event_details_private.public_event_details to anon, authenticated, service_role;

-- Use the same public projection for a single exact link, including unlisted events.
create function public.public_event_by_slug(p_slug text)
returns setof event_details_private.public_event_details language sql stable security invoker set search_path = '' as $$
  select * from event_details_private.public_event_details where slug = p_slug
$$;
revoke all on function public.public_event_by_slug(text) from public;
grant execute on function public.public_event_by_slug(text) to anon, authenticated;

create function public.admin_set_event_unlisted(
  p_event_id uuid, p_is_unlisted boolean, p_reason text, p_revision integer
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := admin_private.require_staff();
  reason text := moderation_private.reason(p_reason);
  ev public.events;
begin
  if not exists (select 1 from public.profiles where id = actor and role = 'admin' and blocked_at is null) then
    raise exception 'Only an admin can change who can find this event.' using errcode = '42501';
  end if;
  select * into ev from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found.' using errcode = 'P0002'; end if;
  if ev.wizard_revision is distinct from p_revision then
    raise exception 'This event changed. Reload the page and try again.' using errcode = '40001';
  end if;
  if p_is_unlisted is null then
    raise exception 'Choose who can find this event.' using errcode = '22023';
  end if;
  if ev.is_unlisted = p_is_unlisted then return; end if;
  update public.events set is_unlisted = p_is_unlisted, wizard_revision = wizard_revision + 1
  where id = ev.id;
  perform moderation_private.audit(ev.id, 'event_unlisted_changed',
    jsonb_build_object('is_unlisted', ev.is_unlisted),
    jsonb_build_object('is_unlisted', p_is_unlisted), reason);
end;
$$;
revoke all on function public.admin_set_event_unlisted(uuid, boolean, text, integer)
from public, anon, authenticated, service_role;
grant execute on function public.admin_set_event_unlisted(uuid, boolean, text, integer) to authenticated;
