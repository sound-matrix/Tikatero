-- refund_policy is text. Keep legacy values readable while moving existing windows to rules.
alter table public.events
  add column refund_auto_approve boolean not null default false,
  add column refunds_paused_at timestamptz,
  add column refunds_paused_by uuid references public.profiles(id) on delete set null,
  add column refunds_paused_reason text check (char_length(refunds_paused_reason) <= 300);

-- Published events retain their existing public fields. Pause notes and actor IDs are staff data.
revoke select on public.events from anon, authenticated;
do $$
declare readable text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into readable
  from pg_catalog.pg_attribute where attrelid = 'public.events'::regclass and attnum > 0
    and not attisdropped and attname not in ('refunds_paused_reason', 'refunds_paused_by');
  execute format('grant select (%s) on public.events to anon, authenticated', readable);
end;
$$;

alter table public.refunds
  add column rule_percent smallint check (rule_percent between 0 and 100),
  add column hours_before_event integer,
  add column offered_paise bigint check (offered_paise > 0),
  add column decided_reason text check (char_length(decided_reason) <= 300),
  add column dispatch_claimed_at timestamptz;

create table public.event_refund_rules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  min_hours_before integer not null check (min_hours_before between 0 and 8760),
  refund_percent smallint not null check (refund_percent between 0 and 100),
  created_at timestamptz not null default now(),
  unique (event_id, min_hours_before)
);
alter table public.event_refund_rules enable row level security;
revoke all on public.event_refund_rules from public, anon, authenticated;
grant select on public.event_refund_rules to anon, authenticated, service_role;
create policy event_refund_rules_read on public.event_refund_rules for select to anon, authenticated
using (exists (select 1 from public.events e where e.id = event_id));

create table public.refund_controls (
  id boolean primary key default true check (id),
  paused_at timestamptz,
  paused_by uuid references public.profiles(id) on delete set null,
  reason text check (char_length(reason) <= 300),
  updated_at timestamptz not null default now()
);
alter table public.refund_controls enable row level security;
revoke all on public.refund_controls from public, anon, authenticated;
insert into public.refund_controls default values;

insert into public.event_refund_rules(event_id, min_hours_before, refund_percent)
select event.id, rule.hours, rule.percent from public.events event
cross join (values (72, 100), (0, 0)) as rule(hours, percent)
where event.refund_policy = '72h';
update public.events set refund_policy = 'schedule' where refund_policy = '72h';

create function refund_private.limit_rules()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform 1 from public.events where id = new.event_id for update;
  if (select count(*) from public.event_refund_rules where event_id = new.event_id
      and id is distinct from new.id) >= 4 then
    raise exception 'Use up to 4 refund rules.';
  end if;
  return new;
end;
$$;
create trigger event_refund_rule_limit before insert or update on public.event_refund_rules
for each row execute function refund_private.limit_rules();

create function refund_private.guard_event_settings()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.refund_policy = '72h' and not new.refund_auto_approve and new.refunds_paused_at is null
      and new.refunds_paused_by is null and new.refunds_paused_reason is null then return new; end if;
  elsif row(new.refund_policy, new.refund_auto_approve, new.refunds_paused_at,
            new.refunds_paused_by, new.refunds_paused_reason)
      is not distinct from row(old.refund_policy, old.refund_auto_approve, old.refunds_paused_at,
                              old.refunds_paused_by, old.refunds_paused_reason) then
    return new;
  end if;
  raise exception 'Use the event refund settings.' using errcode = '42501';
end;
$$;
create trigger events_guard_refund_settings before insert or update on public.events
for each row execute function refund_private.guard_event_settings();

create function refund_private.percent_at(p_rules jsonb, p_hours integer)
returns integer language sql immutable set search_path = '' as $$
  select coalesce((select (r->>'refund_percent')::integer
    from jsonb_array_elements(p_rules) r
    where (r->>'min_hours_before')::integer <= p_hours
    order by (r->>'min_hours_before')::integer desc limit 1), 0);
$$;

create function refund_private.event_rules(p_event_id uuid, p_policy text)
returns jsonb language sql stable set search_path = '' as $$
  select case when p_policy = '72h'
    then '[{"min_hours_before":72,"refund_percent":100},{"min_hours_before":0,"refund_percent":0}]'::jsonb
    else coalesce((select jsonb_agg(jsonb_build_object('min_hours_before', min_hours_before,
      'refund_percent', refund_percent) order by min_hours_before desc)
      from public.event_refund_rules where event_id = p_event_id), '[]'::jsonb)
    end;
$$;

create function refund_private.save_rules(p_event_id uuid, p_policy text, p_rules jsonb,
  p_auto boolean, p_reason text, p_staff boolean)
returns void language plpgsql set search_path = '' as $$
declare
  ev public.events;
  previous jsonb;
  proposed jsonb := coalesce(p_rules, '[]'::jsonb);
  policy text := btrim(coalesce(p_policy, ''));
  auto_approve boolean;
begin
  select * into ev from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found.' using errcode = 'P0002'; end if;
  auto_approve := coalesce(p_auto, ev.refund_auto_approve);
  if not p_staff and (not public.is_org_member(ev.organiser_id)
    or (auto_approve is distinct from ev.refund_auto_approve and not exists (
      select 1 from public.organisers where id = ev.organiser_id and owner_id = auth.uid()
    ))) then
    raise exception 'Only the event owner can change automatic refunds.' using errcode = '42501';
  end if;
  if policy = '72h' then
    policy := 'schedule';
    proposed := refund_private.event_rules(ev.id, '72h');
  end if;
  if policy not in ('schedule', 'none') and (left(policy, 8) <> 'custom: ' or
     char_length(policy) not between 18 and 2008) then
    raise exception 'Choose a refund rule or write at least 10 characters.';
  end if;
  previous := refund_private.event_rules(ev.id, ev.refund_policy);
  if policy = 'schedule' then
    if jsonb_typeof(proposed) <> 'array' or jsonb_array_length(proposed) not between 1 and 4 then
      raise exception 'Use between 1 and 4 refund rules.';
    end if;
    if exists (select 1 from jsonb_array_elements(proposed) r
      where coalesce(r->>'min_hours_before', '') !~ '^[0-9]{1,4}$'
        or coalesce(r->>'refund_percent', '') !~ '^[0-9]{1,3}$') then
      raise exception 'Use whole hours and whole percentages.';
    end if;
    select jsonb_agg(jsonb_build_object('min_hours_before', hours, 'refund_percent', percent)
      order by hours desc)
    into proposed from jsonb_to_recordset(proposed) as r(min_hours_before integer, refund_percent integer),
    lateral (select min_hours_before as hours, refund_percent as percent) fields;
    if exists (
      select 1 from (
        select *, lag(refund_percent) over (order by min_hours_before) as lower_percent,
          lag(min_hours_before) over (order by min_hours_before) as lower_hours
        from jsonb_to_recordset(proposed) as r(min_hours_before integer, refund_percent integer)
      ) r where min_hours_before not between 0 and 8760 or refund_percent not between 0 and 100
        or refund_percent < lower_percent or min_hours_before = lower_hours
    ) then
      raise exception 'Use different times and keep refunds the same or smaller as the event gets closer.';
    end if;
  else
    proposed := '[]'::jsonb;
    auto_approve := false;
  end if;
  if row(policy, proposed, auto_approve) is not distinct from
     row(ev.refund_policy, previous, ev.refund_auto_approve) then return; end if;

  if exists (select 1 from public.orders where event_id = ev.id
      and (paid_at is not null or status in ('paid','partially_refunded','refunded'))) and (
    (ev.refund_policy not in ('72h', 'schedule', 'none') and policy <> ev.refund_policy
      and policy <> 'custom: ' || ev.refund_policy
      and not (policy = 'schedule' and refund_private.percent_at(proposed, 0) = 100))
    or (ev.refund_policy in ('72h', 'schedule') and (
      policy not in ('schedule', 'none') or exists (
        select 1 from (
          select 0 as hours union
          select (r->>'min_hours_before')::integer from jsonb_array_elements(previous || proposed) r
        ) boundaries where refund_private.percent_at(proposed, hours) <
                           refund_private.percent_at(previous, hours)
      )
    ))
  ) then
    raise exception 'People have already booked under these rules, so you can only make them more generous.';
  end if;
  delete from public.event_refund_rules where event_id = ev.id;
  insert into public.event_refund_rules(event_id, min_hours_before, refund_percent)
  select ev.id, min_hours_before, refund_percent from jsonb_to_recordset(proposed)
    as rule(min_hours_before integer, refund_percent smallint);
  update public.events set refund_policy = policy, refund_auto_approve = auto_approve,
    wizard_revision = wizard_revision + case when p_staff then 1 else 0 end
    where id = ev.id;
  perform moderation_private.audit(ev.id, 'event_refund_rules_changed',
    jsonb_build_object('policy', ev.refund_policy, 'rules', previous, 'auto_approve', ev.refund_auto_approve),
    jsonb_build_object('policy', policy, 'rules', proposed, 'auto_approve', auto_approve), p_reason);
end;
$$;

create function public.admin_save_refund_rules(p_event_id uuid, p_policy text, p_rules jsonb,
  p_auto boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform admin_private.require_staff();
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  perform refund_private.save_rules(p_event_id, p_policy, p_rules, p_auto,
    moderation_private.reason(p_reason), true);
end;
$$;

create function refund_private.is_paused(p_event_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.refund_controls where paused_at is not null)
    or exists (select 1 from public.events where id = p_event_id and refunds_paused_at is not null);
$$;

-- Approval and dispatch claims share the locks. The stop switch takes the exclusive lock.
create function refund_private.lock_dispatch(p_event_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('tikatero:refunds', 0));
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('tikatero:refund:' || p_event_id, 0));
end;
$$;

create function public.admin_pause_refunds(p_event_id uuid, p_pause boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  reason_text text;
  paused_time timestamptz;
  prior timestamptz;
begin
  perform admin_private.require_staff();
  if not exists (select 1 from public.profiles where id = actor and role = 'admin') then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  reason_text := moderation_private.reason(p_reason);
  if p_pause is null then raise exception 'Choose whether to pause refunds.'; end if;
  if p_pause then paused_time := now(); end if;
  if p_event_id is null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tikatero:refunds', 0));
    select paused_at into prior from public.refund_controls where id;
    update public.refund_controls set paused_at = paused_time, paused_by = actor,
      reason = reason_text, updated_at = now() where id;
  else
    perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('tikatero:refunds', 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tikatero:refund:' || p_event_id, 0));
    select refunds_paused_at into prior from public.events where id = p_event_id for update;
    if not found then raise exception 'Event not found.' using errcode = 'P0002'; end if;
    update public.events set refunds_paused_at = paused_time, refunds_paused_by = actor,
      refunds_paused_reason = reason_text where id = p_event_id;
  end if;
  insert into public.audit_log(actor_id, action, entity, entity_id, before, after, reason)
  values (actor, case when p_pause then 'refunds_paused' else 'refunds_resumed' end,
    case when p_event_id is null then 'refund_controls' else 'events' end, p_event_id,
    jsonb_build_object('paused_at', prior), jsonb_build_object('paused_at', paused_time), reason_text);
end;
$$;

create function public.refund_pause_status(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_event_id is null then
    if not public.is_staff() or not exists (select 1 from public.profiles
      where id = auth.uid() and blocked_at is null) then
      raise exception 'Staff access required.' using errcode = '42501';
    end if;
  elsif not payout_private.can_view_sales(p_event_id) then
    raise exception 'You cannot view this event.' using errcode = '42501';
  end if;
  select jsonb_build_object('site_paused', (select paused_at is not null from public.refund_controls where id),
    'event_paused', exists (select 1 from public.events where id = p_event_id and refunds_paused_at is not null),
    'waiting', count(*), 'waiting_paise', coalesce(sum(r.amount_paise), 0))
  into result from public.refunds r join public.orders o on o.id = r.order_id
  where o.event_id = p_event_id and not o.is_test and r.status in ('requested', 'approved') and r.cf_refund_id is null;
  return result;
end;
$$;

create function public.claim_refund_dispatch(p_refund_id uuid, p_order_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare event_id uuid;
begin
  select o.event_id into event_id from public.orders o where o.id = p_order_id;
  if not found then return 'skip'; end if;
  perform refund_private.lock_dispatch(event_id);
  if refund_private.is_paused(event_id) then return 'paused'; end if;
  update public.refunds set dispatch_claimed_at = clock_timestamp()
  where id = p_refund_id and order_id = p_order_id and status = 'approved' and cf_refund_id is null
    and (dispatch_claimed_at is null or dispatch_claimed_at < clock_timestamp() - interval '5 minutes');
  return case when found then 'claimed' else 'skip' end;
end;
$$;

revoke all on function public.admin_save_refund_rules(uuid, text, jsonb, boolean, text),
  public.admin_pause_refunds(uuid, boolean, text), public.refund_pause_status(uuid),
  public.claim_refund_dispatch(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_save_refund_rules(uuid, text, jsonb, boolean, text),
  public.admin_pause_refunds(uuid, boolean, text), public.refund_pause_status(uuid) to authenticated;
grant execute on function public.claim_refund_dispatch(uuid, uuid) to service_role;

create or replace function public.save_event_wizard(p_event_id uuid,p_organiser_id uuid,p_revision integer,p_step integer,p_next_step integer,p_data jsonb,p_publish boolean default false)
returns setof public.events language plpgsql security definer set search_path='' as $$
declare ev public.events; base text; candidate text; suffix integer:=1; item jsonb; item_id uuid; tier public.ticket_types;
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

create function refund_private.buyer_quote(ord public.orders)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  ev public.events;
  hours_before integer;
  remaining bigint;
  percent integer;
  amount bigint;
begin
  select * into ev from public.events where id = ord.event_id;
  if ord.status = 'refunded' then raise exception 'This booking has already been refunded.'; end if;
  if ord.status not in ('paid', 'partially_refunded') then raise exception 'This booking cannot be refunded.'; end if;
  if exists (select 1 from public.refunds where order_id = ord.id and status in ('requested', 'approved')) then
    raise exception 'A refund is already in progress for this booking.';
  end if;
  -- A partial cancellation voids the booking's unused tickets. A second request
  -- must not apply the same percentage again to the balance.
  if exists (select 1 from public.refunds where order_id = ord.id and status = 'processed'
    and offered_paise is not null) then
    raise exception 'You have already cancelled this booking.';
  end if;
  if ev.refund_policy = 'none' then raise exception 'This event does not offer refunds.'; end if;
  if ev.starts_at is null or ev.starts_at <= statement_timestamp() or ev.status = 'cancelled' then
    raise exception 'You can only cancel before the event starts.';
  end if;
  if exists (select 1 from public.tickets where order_id = ord.id and status = 'used') then
    raise exception 'A ticket from this booking has already been used.';
  end if;
  hours_before := floor(extract(epoch from ev.starts_at - statement_timestamp()) / 3600)::integer;
  remaining := ord.total_paise - coalesce((select sum(amount_paise)::bigint from public.refunds
    where order_id = ord.id and status = 'processed'), 0);
  if ev.refund_policy in ('72h', 'schedule') then
    percent := refund_private.percent_at(refund_private.event_rules(ev.id, ev.refund_policy), hours_before);
  end if;
  amount := floor(remaining::numeric * coalesce(percent, 100) / 100)::bigint;
  if amount <= 0 then raise exception 'There is no refund for a cancellation at this time.'; end if;
  return jsonb_build_object('hours', hours_before, 'percent', percent, 'remaining', remaining,
    'amount', amount, 'paused', refund_private.is_paused(ev.id),
    'automatic', ev.refund_auto_approve and percent is not null and not refund_private.is_paused(ev.id));
end;
$$;

create function public.buyer_refund_quote(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ord public.orders;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and blocked_at is null) then
    raise exception 'You need to sign in.' using errcode = '42501';
  end if;
  select * into ord from public.orders where id = p_order_id and buyer_id = auth.uid();
  if not found then raise exception 'Booking not found.' using errcode = '42501'; end if;
  return refund_private.buyer_quote(ord);
end;
$$;
revoke all on function public.buyer_refund_quote(uuid) from public, anon, authenticated;
grant execute on function public.buyer_refund_quote(uuid) to authenticated;

create or replace function public.refund_action(
  p_action text,
  p_order_id uuid,
  p_refund_id uuid,
  p_amount bigint,
  p_ticket_ids uuid[],
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
  ord public.orders;
  existing public.refunds;
  result jsonb;
  event_id_for_lock uuid;
  remaining bigint;
  refunded bigint;
  reversed bigint;
  gateway_returned bigint;
  amount bigint;
  percent integer;
  hours_before integer;
  paused boolean;
  automatic boolean;
  decision_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  status_to_open public.refund_status;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor and blocked_at is null) then
    raise exception 'You need to sign in.' using errcode = '42501';
  end if;
  if char_length(decision_reason) > 300 or decision_reason ~* 'sb_secret_|service_role|cashfree_secret|qr_secret' then
    raise exception 'Enter a reason of up to 300 characters.';
  end if;

  select o.event_id into event_id_for_lock from public.orders o
  where o.id = case when p_action in ('approve', 'reject')
    then (select order_id from public.refunds where id = p_refund_id) else p_order_id end;
  if event_id_for_lock is not null then
    perform refund_private.lock_dispatch(event_id_for_lock);
  end if;

  if p_action = 'approve' or p_action = 'reject' then
    select * into existing from public.refunds where id = p_refund_id for update;
    if not found or existing.status <> 'requested' then
      raise exception 'That refund request is not waiting for a decision.';
    end if;
    select * into ord from public.orders where id = existing.order_id for update;
    perform refund_private.assert_manager(ord.event_id, p_as, p_confirm);
    if p_action = 'reject' then
      decision_reason := moderation_private.reason(p_reason);
      update public.refunds
      set status = 'rejected', approved_by = actor, decided_reason = decision_reason
      where id = existing.id;
      insert into public.audit_log (actor_id, action, entity, entity_id, after, reason)
      values (
        actor, 'refund_rejected', 'refunds', existing.id,
        jsonb_build_object('order_id', ord.id, 'amount_paise', existing.amount_paise),
        decision_reason
      );
      return jsonb_build_object(
        'outcome', 'rejected',
        'refund_id', existing.id,
        'order_id', ord.id,
        'needs_provider', false,
        'is_test', ord.is_test
      );
    end if;
    if refund_private.is_paused(ord.event_id) then raise exception 'Refunds are on hold for this event.'; end if;
    perform 1 from public.tickets where order_id = ord.id order by id for update;
    if exists (select 1 from public.tickets where order_id = ord.id and status = 'used') then
      raise exception 'A ticket from this booking has already been used.';
    end if;
    select coalesce(sum(amount_paise), 0), coalesce(sum(organiser_reversal_paise), 0),
      coalesce(sum(gateway_shortfall_paise), 0) into refunded, reversed, gateway_returned
    from public.refunds where order_id = ord.id and status = 'processed';
    remaining := ord.total_paise - refunded;
    amount := coalesce(p_amount, existing.amount_paise);
    if amount <= 0 or amount > remaining or (p_amount is not null and amount < 100
      and amount <> existing.amount_paise) then
      raise exception 'Enter an amount from ₹1 up to the amount left on this booking.';
    end if;
    if amount < coalesce(existing.offered_paise, existing.amount_paise) then
      decision_reason := moderation_private.reason(p_reason);
    end if;
    update public.refunds
    set status = 'approved', approved_by = actor, amount_paise = amount, decided_reason = decision_reason,
      organiser_reversal_paise = refund_private.scaled_paise(amount, ord.organiser_share_paise,
        ord.total_paise, reversed, refunded),
      gateway_shortfall_paise = refund_private.scaled_paise(amount, ord.gateway_fee_paise,
        ord.total_paise, gateway_returned, refunded)
    where id = existing.id returning * into existing;
    insert into public.audit_log (actor_id, action, entity, entity_id, after, reason)
    values (
      actor, 'refund_approved', 'refunds', existing.id,
      jsonb_build_object(
        'order_id', ord.id, 'offered_paise', existing.offered_paise,
        'amount_paise', existing.amount_paise,
        'organiser_reversal_paise', existing.organiser_reversal_paise,
        'is_test', ord.is_test
      ), decision_reason
    );
    return jsonb_build_object(
      'outcome', 'opened',
      'refund_id', existing.id,
      'order_id', ord.id,
      'event_id', ord.event_id,
      'amount_paise', existing.amount_paise,
      'reversal_paise', existing.organiser_reversal_paise,
      'needs_provider', true,
      'is_test', ord.is_test
    );
  end if;

  if p_order_id is null then
    raise exception 'Choose a booking.';
  end if;
  select * into ord from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  if ord.status not in ('paid', 'partially_refunded') then
    raise exception 'This booking cannot be refunded.';
  end if;
  if p_action = 'request' then
    if ord.buyer_id is distinct from actor then
      raise exception 'You cannot refund this booking.' using errcode = '42501';
    end if;
    perform 1 from public.tickets where order_id = ord.id order by id for update;
    result := refund_private.buyer_quote(ord);
    hours_before := (result->>'hours')::integer;
    percent := (result->>'percent')::integer;
    amount := (result->>'amount')::bigint;
    paused := (result->>'paused')::boolean;
    automatic := (result->>'automatic')::boolean;
    status_to_open := case when automatic then 'approved' else 'requested' end;
    result := refund_private.insert_refund(
      ord, amount, status_to_open, p_reason, actor, null, true, 'refund_requested'
    );
    update public.refunds set rule_percent = percent, hours_before_event = hours_before, offered_paise = amount
      where id = (result->>'refund_id')::uuid;
    if automatic then
      insert into public.audit_log(actor_id, action, entity, entity_id, after, reason)
      values (actor, 'refund_approved', 'refunds', (result->>'refund_id')::uuid,
        jsonb_build_object('amount_paise', amount, 'rule_percent', percent), 'Automatic approval under event rules.');
    end if;
    return result || jsonb_build_object('paused', paused);
  end if;

  if p_action = 'issue' then
    perform refund_private.assert_manager(ord.event_id, p_as, p_confirm);
    if refund_private.is_paused(ord.event_id) then raise exception 'Refunds are on hold for this event.'; end if;
    return refund_private.insert_refund(
      ord, p_amount, 'approved', p_reason, actor, p_ticket_ids, false
    );
  end if;

  raise exception 'Choose a refund action.';
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
      opened := opened || jsonb_build_array(row || jsonb_build_object(
        'needs_provider', not refund_private.is_paused(ev.id)));
    end if;
  end loop;
  update public.payouts set status = 'cancelled' where event_id = ev.id
    and status in ('scheduled', 'on_hold', 'failed');
  return jsonb_build_object('outcome', 'cancelled', 'event_id', p_event_id, 'refunds', opened);
end;
$$;

create or replace function public.queued_event_refunds(p_limit integer)
returns table (id uuid, event_id uuid)
language sql stable security definer set search_path = '' as $$
  select checkout.id, checkout.event_id
  from public.refunds as refund
  join public.orders as checkout on checkout.id = refund.order_id
  join public.events as event on event.id = checkout.event_id
  where refund.status = 'approved' and refund.cf_refund_id is null
    and not refund_private.is_paused(event.id)
    and (refund.dispatch_claimed_at is null or refund.dispatch_claimed_at < statement_timestamp() - interval '5 minutes')
  order by refund.id
  limit greatest(0, least(coalesce(p_limit, 0), 500));
$$;

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
    'event_cancelled', 'refund_processed', 'refund_request_rejected', 'kyc_submitted', 'kyc_needs_docs',
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
