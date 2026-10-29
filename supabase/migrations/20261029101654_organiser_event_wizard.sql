-- PR 08: reuse PR 2's event/guest/ticket_types schema and publish trigger.
-- A draft has no invented event date; non-drafts must have a real date.
alter table public.events alter column starts_at drop not null;
alter table public.events
  add column wizard_step smallint not null default 0 check (wizard_step between 0 and 7),
  add column wizard_revision integer not null default 0 check (wizard_revision >= 0),
  add column wizard_completed_steps smallint[] not null default '{}' check (wizard_completed_steps <@ array[0,1,2,3,4,5,6,7]::smallint[]),
  add constraint events_date_when_not_draft check (status='draft' or starts_at is not null),
  add constraint events_pin_bounds check ((lat is null and lng is null) or (lat is not null and lng is not null and lat between -90 and 90 and lng between -180 and 180));
create index events_organiser_updated_idx on public.events(organiser_id,updated_at desc);

-- Compose with existing RLS. Public published-event reads are unchanged.
-- Staff-only review is separate; writing here requires an actual membership.
create policy events_active_member_insert on public.events as restrictive for insert to authenticated
with check (public.is_org_member(organiser_id) and exists(select 1 from public.profiles where id=auth.uid() and blocked_at is null));
create policy events_active_member_update on public.events as restrictive for update to authenticated
using (public.is_org_member(organiser_id) and exists(select 1 from public.profiles where id=auth.uid() and blocked_at is null))
with check (public.is_org_member(organiser_id) and exists(select 1 from public.profiles where id=auth.uid() and blocked_at is null));
create policy events_active_member_delete on public.events as restrictive for delete to authenticated
using (public.is_org_member(organiser_id) and exists(select 1 from public.profiles where id=auth.uid() and blocked_at is null));

do $$ declare t text; begin
  foreach t in array array['event_guests','ticket_types'] loop
    execute format('create policy wizard_member_insert on public.%I as restrictive for insert to authenticated with check (exists(select 1 from public.events e where e.id=event_id and public.is_org_member(e.organiser_id)) and exists(select 1 from public.profiles where id=auth.uid() and blocked_at is null))',t);
    execute format('create policy wizard_member_update on public.%I as restrictive for update to authenticated using (exists(select 1 from public.events e where e.id=event_id and public.is_org_member(e.organiser_id)) and exists(select 1 from public.profiles where id=auth.uid() and blocked_at is null)) with check (exists(select 1 from public.events e where e.id=event_id and public.is_org_member(e.organiser_id)) and exists(select 1 from public.profiles where id=auth.uid() and blocked_at is null))',t);
    execute format('create policy wizard_member_delete on public.%I as restrictive for delete to authenticated using (exists(select 1 from public.events e where e.id=event_id and public.is_org_member(e.organiser_id)) and exists(select 1 from public.profiles where id=auth.uid() and blocked_at is null))',t);
  end loop;
end $$;

create function public.save_event_wizard(p_event_id uuid,p_organiser_id uuid,p_revision integer,p_step integer,p_next_step integer,p_data jsonb,p_publish boolean default false)
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
revoke all on function public.save_event_wizard(uuid,uuid,integer,integer,integer,jsonb,boolean) from public,anon,service_role;
grant execute on function public.save_event_wizard(uuid,uuid,integer,integer,integer,jsonb,boolean) to authenticated;
