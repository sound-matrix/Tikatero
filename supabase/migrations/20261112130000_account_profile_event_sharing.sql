create extension if not exists citext with schema extensions;
create schema if not exists account_private;
revoke all on schema account_private from public, anon, authenticated;

create type public.social_platform as enum ('instagram','facebook','x','youtube','linkedin','threads','spotify','website');
create type public.checkout_method as enum ('upi','card','netbanking','ask');
create type public.user_consent_kind as enum ('email_marketing','whatsapp_sms_marketing');
create type public.event_share_channel as enum ('whatsapp','instagram','facebook','x','linkedin','telegram','email','copy','native');

alter table public.profiles
  add column display_name text check (length(display_name) <= 100),
  add column avatar_path text check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[a-f0-9-]+\.webp$')),
  add column city text check (length(city) <= 100),
  add column date_of_birth date,
  add column gender text check (gender in ('woman','man','other','prefer_not')),
  add column updated_at timestamptz not null default now();
grant select (display_name, avatar_path, city, date_of_birth, gender, updated_at),
  update (display_name, avatar_path, city, date_of_birth, gender) on public.profiles to authenticated;

create table public.user_phones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, phone_e164)
);
create unique index user_phones_one_primary on public.user_phones(user_id) where is_primary;

create table public.user_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email extensions.citext not null check (length(email::text) between 3 and 254),
  is_primary boolean not null default false,
  is_login boolean not null default false,
  verified_at timestamptz,
  verify_token_hash text,
  verify_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, email)
);
create unique index user_emails_one_primary on public.user_emails(user_id) where is_primary;
create unique index user_emails_one_login on public.user_emails(user_id) where is_login;
create unique index user_emails_verify_token on public.user_emails(verify_token_hash) where verify_token_hash is not null;

create table public.user_social_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform public.social_platform not null,
  handle text check (length(handle) <= 300),
  url text not null check (length(url) <= 500 and url ~ '^https://[a-z0-9.-]+(/[^[:space:]]*)?$' and
    case platform
      when 'website' then true
      when 'instagram' then url ~ '^https://(www\.)?instagram\.com/'
      when 'facebook' then url ~ '^https://(www\.)?facebook\.com/'
      when 'x' then url ~ '^https://(www\.)?(x|twitter)\.com/'
      when 'youtube' then url ~ '^https://((www\.|m\.)?youtube\.com|youtu\.be)/'
      when 'linkedin' then url ~ '^https://(www\.)?linkedin\.com/'
      when 'threads' then url ~ '^https://(www\.)?threads\.(com|net)/'
      when 'spotify' then url ~ '^https://open\.spotify\.com/'
    end),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, platform)
);

create table public.user_checkout_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  ticket_name text check (length(ticket_name) between 2 and 120),
  ticket_email text check (length(ticket_email) <= 254),
  ticket_phone_e164 text check (ticket_phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  preferred_method public.checkout_method not null default 'ask',
  upi_id text check (length(upi_id) <= 100 and upi_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.user_checkout_preferences is 'No card data. Cards stay with Cashfree.';

create table public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.user_consent_kind not null,
  granted boolean not null,
  changed_at timestamptz not null default clock_timestamp(),
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index user_consents_latest on public.user_consents(user_id, kind, changed_at desc);

create table public.event_shares (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  channel public.event_share_channel not null,
  created_at timestamptz not null default now()
);
create index event_shares_event_channel on public.event_shares(event_id, channel);
create index event_shares_user on public.event_shares(user_id) where user_id is not null;

create table public.event_ref_visits (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  channel public.event_share_channel not null,
  visitor_hash text not null check (visitor_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique(event_id, channel, visitor_hash)
);
alter table public.orders add column ref_channel text
  check (ref_channel in ('whatsapp','instagram','facebook','x','linkedin','telegram','email','copy','native'));
grant select (ref_channel) on public.orders to authenticated;
create index orders_event_ref_channel on public.orders(event_id, ref_channel) where ref_channel is not null;

do $$
declare name text;
begin
  foreach name in array array['user_phones','user_emails','user_social_links','user_checkout_preferences','user_consents','event_shares','event_ref_visits']
  loop
    execute format('alter table public.%I enable row level security', name);
    execute format('revoke all on public.%I from public, anon, authenticated', name);
    execute format('grant all on public.%I to service_role', name);
  end loop;
  foreach name in array array['user_phones','user_emails','user_social_links','user_checkout_preferences','user_consents']
  loop
    execute format('create policy read_own_or_staff on public.%I for select to authenticated using (user_id = (select auth.uid()) or (select public.is_staff()))', name);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.set_updated_at()', name);
  end loop;
end $$;
grant select on public.user_phones, public.user_social_links, public.user_checkout_preferences, public.user_consents to authenticated;
grant select (id,user_id,email,is_primary,is_login,verified_at,verify_sent_at,created_at,updated_at) on public.user_emails to authenticated;
grant select on public.event_shares, public.event_ref_visits to authenticated;
create policy staff_read_shares on public.event_shares for select to authenticated using ((select public.is_staff()));
create policy staff_read_visits on public.event_ref_visits for select to authenticated using ((select public.is_staff()));
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

grant insert (user_id,platform,handle,url,is_public), update (user_id,platform,handle,url,is_public), delete
on public.user_social_links to authenticated;
grant insert (user_id,ticket_name,ticket_email,ticket_phone_e164,preferred_method,upi_id),
  update (user_id,ticket_name,ticket_email,ticket_phone_e164,preferred_method,upi_id), delete
on public.user_checkout_preferences to authenticated;
do $$
declare name text;
  own text := 'user_id = (select auth.uid()) and exists (select 1 from public.profiles where id = (select auth.uid()) and blocked_at is null)';
begin
  foreach name in array array['user_social_links','user_checkout_preferences'] loop
    execute format('create policy insert_own on public.%I for insert to authenticated with check (%s)', name, own);
    execute format('create policy update_own on public.%I for update to authenticated using (%s) with check (%s)', name, own, own);
    execute format('create policy delete_own on public.%I for delete to authenticated using (%s)', name, own);
  end loop;
end $$;

create function account_private.audit_profile_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
  verb text := case tg_op when 'INSERT' then 'added' when 'DELETE' then 'removed' else 'updated' end;
begin
  if tg_table_name = 'profiles' then
    if (new.full_name,new.display_name,new.avatar_path,new.city,new.date_of_birth,new.gender)
      is not distinct from (old.full_name,old.display_name,old.avatar_path,old.city,old.date_of_birth,old.gender)
      then return null; end if;
    owner_id := new.id;
  else
    owner_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  end if;
  if not exists (select 1 from public.profiles where id = owner_id) then return null; end if;
  insert into public.audit_log(actor_id, action, entity, entity_id)
  values (auth.uid(), tg_argv[0] || '_' || verb, tg_table_name, owner_id);
  return null;
end $$;
create trigger audit_profile_changes after update on public.profiles
for each row execute function account_private.audit_profile_change('profile');
create trigger audit_phone_changes after insert or update or delete on public.user_phones
for each row execute function account_private.audit_profile_change('phone');
create trigger audit_email_changes after insert or update or delete on public.user_emails
for each row execute function account_private.audit_profile_change('email');
create trigger audit_social_changes after insert or update or delete on public.user_social_links
for each row execute function account_private.audit_profile_change('social_link');
create trigger audit_checkout_changes after insert or update or delete on public.user_checkout_preferences
for each row execute function account_private.audit_profile_change('checkout_preference');
create trigger audit_consent_changes after insert on public.user_consents
for each row execute function account_private.audit_profile_change('consent');

-- Keep older callers working, including the original settings form.
create function account_private.normalise_phone(value text) returns text
language sql immutable set search_path = '' as $$
  select case
    when cleaned ~ '^\+[1-9][0-9]{6,14}$' then cleaned
    when cleaned ~ '^[6-9][0-9]{9}$' then '+91' || cleaned
    when cleaned ~ '^91[6-9][0-9]{9}$' then '+' || cleaned
  end
  from (select regexp_replace(value, '[[:space:]().-]', '', 'g') as cleaned) parsed
$$;
insert into public.user_phones(user_id, phone_e164, is_primary)
select id, account_private.normalise_phone(phone), true
from public.profiles where blocked_at is null and account_private.normalise_phone(phone) is not null;
update public.profiles p set phone = n.phone_e164 from public.user_phones n
where n.user_id = p.id and n.is_primary and p.phone is distinct from n.phone_e164;

create function account_private.phone_from_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare clean text := account_private.normalise_phone(new.phone);
begin
  if (pg_trigger_depth() > 1 and tg_op <> 'INSERT') or new.blocked_at is not null then return null; end if;
  update public.user_phones set is_primary = false
  where user_id = new.id and is_primary and phone_e164 is distinct from clean;
  if clean is not null then
    insert into public.user_phones(user_id,phone_e164,is_primary) values (new.id,clean,true)
    on conflict (user_id,phone_e164) do update set is_primary = true where not public.user_phones.is_primary;
  end if;
  if new.phone is distinct from clean then
    update public.profiles set phone = clean where id = new.id;
  end if;
  return null;
end $$;
create trigger profile_phone_insert after insert on public.profiles
for each row when (new.phone is not null) execute function account_private.phone_from_profile();
create trigger profile_phone_update after update of phone on public.profiles
for each row when (old.phone is distinct from new.phone) execute function account_private.phone_from_profile();

create function account_private.sync_primary_phone() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  current_phone text;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  select phone_e164 into current_phone from public.user_phones where user_id = owner_id and is_primary;
  update public.profiles set phone = current_phone
  where id = owner_id and phone is distinct from current_phone;
  return null;
end $$;
create trigger sync_primary_phone after insert or update or delete on public.user_phones
for each row execute function account_private.sync_primary_phone();

create function account_private.active_actor() returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  perform 1 from public.profiles where id = actor and blocked_at is null for update;
  if not found then raise exception 'You need to sign in.' using errcode = '42501'; end if;
  return actor;
end $$;

create function public.change_profile_phone(p_action text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := account_private.active_actor();
  target public.user_phones;
begin
  if p_action = 'add' then
    if (select count(*) from public.user_phones where user_id = actor) >= 10 then
      raise exception 'You can save up to 10 phone numbers.';
    end if;
    insert into public.user_phones(user_id,phone_e164,is_primary)
    values(actor,p_value,not exists(select 1 from public.user_phones where user_id = actor and is_primary))
    on conflict (user_id,phone_e164) do nothing;
  elsif p_action in ('primary','remove') then
    select * into target from public.user_phones where id = p_value::uuid and user_id = actor;
    if not found then raise exception 'This phone number could not be found.'; end if;
    if p_action = 'remove' then
      delete from public.user_phones where id = target.id;
      if target.is_primary then
        update public.user_phones set is_primary = true where id = (
          select id from public.user_phones where user_id = actor order by created_at,id limit 1
        );
      end if;
    elsif not target.is_primary then
      update public.user_phones set is_primary = false where user_id = actor and is_primary;
      update public.user_phones set is_primary = true where id = target.id;
    end if;
  else
    raise exception 'Choose a phone action.';
  end if;
end $$;

-- Login email rows follow Auth, including its actual confirmation time.
insert into public.user_emails(user_id,email,is_login,is_primary,verified_at)
select u.id,u.email,true,true,u.email_confirmed_at from auth.users u
join public.profiles p on p.id = u.id
where nullif(u.email,'') is not null and u.deleted_at is null and p.block_reason is distinct from 'Account deleted';
create function account_private.sync_login_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.profiles where id = new.id for update;
  if not found then return null; end if;
  delete from public.user_emails
  where user_id = new.id and is_login and
    (new.email is null or new.deleted_at is not null or lower(email::text) <> lower(new.email));
  if nullif(new.email,'') is not null and new.deleted_at is null and not exists (
    select 1 from public.profiles where id = new.id and block_reason = 'Account deleted'
  ) then
    insert into public.user_emails(user_id,email,is_login,is_primary,verified_at)
    values(new.id,new.email,true,true,new.email_confirmed_at)
    on conflict (user_id,email) do update
    set is_login = true, is_primary = true, verified_at = excluded.verified_at, verify_token_hash = null;
  end if;
  return null;
end $$;
-- The name orders this trigger after on_auth_user_created, which creates the profile.
create trigger z_account_login_email_insert after insert on auth.users
for each row execute function account_private.sync_login_email();
create trigger z_account_login_email_update after update of email,email_confirmed_at,deleted_at on auth.users
for each row when ((old.email,old.email_confirmed_at,old.deleted_at) is distinct from (new.email,new.email_confirmed_at,new.deleted_at))
execute function account_private.sync_login_email();

create function public.remove_backup_email(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := account_private.active_actor();
begin
  delete from public.user_emails where id = p_id and user_id = actor and not is_login;
end $$;
create function public.claim_backup_email(p_user_id uuid,p_email text,p_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare claimed uuid;
begin
  perform 1 from public.profiles where id = p_user_id and blocked_at is null for update;
  if not found or p_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  if (select count(*) from public.user_emails where user_id = p_user_id and not is_login) >= 5 and
    not exists(select 1 from public.user_emails where user_id = p_user_id and lower(email::text) = lower(p_email))
    then return false; end if;
  insert into public.user_emails(user_id,email,verify_token_hash,verify_sent_at)
  values (p_user_id,p_email,p_hash,now())
  on conflict (user_id,email) do update set verify_token_hash = excluded.verify_token_hash, verify_sent_at = excluded.verify_sent_at
  where not public.user_emails.is_login and public.user_emails.verified_at is null and
    (public.user_emails.verify_sent_at is null or public.user_emails.verify_sent_at < now() - interval '1 minute')
  returning id into claimed;
  return claimed is not null;
end $$;
create function public.release_backup_email(p_user_id uuid,p_hash text) returns void
language sql security definer set search_path = '' as $$
  update public.user_emails set verify_token_hash = null, verify_sent_at = null
  where user_id = p_user_id and verify_token_hash = p_hash and not is_login
$$;

create function public.verify_backup_email(p_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.user_emails e set verified_at = now(), verify_token_hash = null
  where e.verify_token_hash = p_hash and e.verify_sent_at > now() - interval '24 hours' and not e.is_login
    and exists(select 1 from public.profiles where id = e.user_id and blocked_at is null);
  return found;
end $$;

create function public.save_profile_consents(p_email boolean,p_phone boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := account_private.active_actor();
begin
  insert into public.user_consents(user_id,kind,granted,source)
  select actor,requested.kind,requested.granted,'profile'
  from (values ('email_marketing'::public.user_consent_kind,p_email), ('whatsapp_sms_marketing'::public.user_consent_kind,p_phone)) requested(kind,granted)
  where requested.granted is distinct from coalesce((
    select c.granted from public.user_consents c where c.user_id = actor and c.kind = requested.kind
    order by c.changed_at desc limit 1
  ),false);
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('avatars','avatars',true,2097152,array['image/jpeg','image/png','image/webp']);
create policy avatars_select on storage.objects for select to authenticated
using (bucket_id = 'avatars' and storage.foldername(name) = array[(select auth.uid())::text]);
create policy avatars_insert on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and storage.foldername(name) = array[(select auth.uid())::text]
  and exists(select 1 from public.profiles where id = (select auth.uid()) and blocked_at is null));
create policy avatars_update on storage.objects for update to authenticated
using (bucket_id = 'avatars' and storage.foldername(name) = array[(select auth.uid())::text])
with check (bucket_id = 'avatars' and storage.foldername(name) = array[(select auth.uid())::text]
  and exists(select 1 from public.profiles where id = (select auth.uid()) and blocked_at is null));
create policy avatars_delete on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and storage.foldername(name) = array[(select auth.uid())::text]);

create function public.event_share_stats(p_event_id uuid)
returns table(channel public.event_share_channel, shares bigint, visits bigint, bookings bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.events e join public.profiles p on p.id = auth.uid() and p.blocked_at is null
    where e.id = p_event_id and public.is_org_member(e.organiser_id)
  ) then raise exception 'You do not have access to these figures.' using errcode = '42501'; end if;
  return query
  select c.value, coalesce(s.n,0), coalesce(v.n,0), coalesce(o.n,0)
  from unnest(enum_range(null::public.event_share_channel)) c(value)
  left join (select es.channel,count(*) as n from public.event_shares es where es.event_id = p_event_id group by es.channel) s on s.channel = c.value
  left join (select ev.channel,count(*) as n from public.event_ref_visits ev where ev.event_id = p_event_id group by ev.channel) v on v.channel = c.value
  left join (select ord.ref_channel,count(*) as n from public.orders ord where ord.event_id = p_event_id and ord.paid_at is not null and not ord.is_test group by ord.ref_channel) o on o.ref_channel = c.value::text;
end $$;

create view public.admin_user_overview with (security_invoker = true) as
select p.id, p.full_name, e.email::text as primary_email, p.phone as primary_phone, p.city,
  count(o.id) as order_count,
  coalesce(sum(o.total_paise) filter (where o.status = 'paid' and not o.is_test),0) as total_spent_paise,
  p.signup_intent, p.created_at,
  jsonb_build_object('email_marketing',coalesce(consent.email,false),
    'whatsapp_sms_marketing',coalesce(consent.phone,false)) as consents
from public.profiles p
left join public.user_emails e on e.user_id = p.id and e.is_primary
left join public.orders o on o.buyer_id = p.id
left join lateral (
  select
    (select granted from public.user_consents where user_id = p.id and kind = 'email_marketing' order by changed_at desc limit 1) as email,
    (select granted from public.user_consents where user_id = p.id and kind = 'whatsapp_sms_marketing' order by changed_at desc limit 1) as phone
) consent on true
where (select public.is_staff())
group by p.id,e.email,consent.email,consent.phone;
revoke all on public.admin_user_overview from public, anon, authenticated;
grant select on public.admin_user_overview to authenticated;

create function public.public_host_profile(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name',o.display_name,'verified',o.kyc_status = 'approved',
    'links',coalesce((
      select jsonb_agg(jsonb_build_object('platform',s.platform,'url',s.url) order by s.platform)
      from public.user_social_links s
      where s.user_id = o.owner_id and s.is_public
    ),'[]'::jsonb))
  from public.organisers o join public.profiles p on p.id = o.owner_id
  where o.slug = p_slug and o.kyc_status = 'approved' and not o.sales_paused and p.blocked_at is null
$$;
create function public.event_host_slug(p_event_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select o.slug from public.events e join public.organisers o on o.id = e.organiser_id
  where e.id = p_event_id and e.status = 'published' and e.hidden_at is null
    and o.kyc_status = 'approved' and not o.sales_paused
$$;

-- The server alone supplies the verified session's login email and buyer identity.
-- Use the existing hold verbatim, then attach delivery and referral data atomically.
create function public.checkout_hold_with_profile(p_order_id uuid,p_buyer_id uuid,p_slug text,p_name text,p_email text,p_phone text,
  p_lines jsonb,p_pricing_version_id uuid,p_fee_payer public.fee_payer,p_is_free boolean,p_amounts jsonb,
  p_provider text,p_token_hash text,p_attendees jsonb,p_is_test boolean,p_login_email text,p_ref_channel text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.orders;
begin
  perform public.checkout_hold(p_order_id,p_buyer_id,p_slug,p_name,coalesce(p_login_email,p_email),p_phone,
    p_lines,p_pricing_version_id,p_fee_payer,p_is_free,p_amounts,p_provider,p_token_hash,p_attendees,p_is_test);
  update public.orders set buyer_email = p_email, ref_channel = p_ref_channel
  where id = p_order_id returning * into saved;
  return to_jsonb(saved);
end $$;

revoke all on function public.change_profile_phone(text,text), public.remove_backup_email(uuid),
  public.claim_backup_email(uuid,text,text), public.release_backup_email(uuid,text), public.verify_backup_email(text),
  public.save_profile_consents(boolean,boolean), public.event_share_stats(uuid),
  public.public_host_profile(text), public.event_host_slug(uuid),
  public.checkout_hold_with_profile(uuid,uuid,text,text,text,text,jsonb,uuid,public.fee_payer,boolean,jsonb,text,text,jsonb,boolean,text,text)
from public, anon, authenticated, service_role;
grant execute on function public.change_profile_phone(text,text), public.remove_backup_email(uuid),
  public.save_profile_consents(boolean,boolean), public.event_share_stats(uuid) to authenticated;
grant execute on function public.claim_backup_email(uuid,text,text), public.release_backup_email(uuid,text), public.verify_backup_email(text),
  public.checkout_hold_with_profile(uuid,uuid,text,text,text,text,jsonb,uuid,public.fee_payer,boolean,jsonb,text,text,jsonb,boolean,text,text) to service_role;
grant execute on function public.public_host_profile(text), public.event_host_slug(uuid) to anon, authenticated;

create function public.mark_profile_phone_verified(p_user_id uuid,p_id uuid,p_phone text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.user_phones n set verified_at = now()
  where n.user_id = p_user_id and n.id = p_id and n.phone_e164 = p_phone
    and exists(select 1 from public.profiles where id = n.user_id and blocked_at is null);
  return found;
end $$;
revoke all on function public.mark_profile_phone_verified(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.mark_profile_phone_verified(uuid,uuid,text) to service_role;

-- Storage objects must be removed through the Storage API, not deleted in SQL.
create table public.avatar_cleanup (
  user_id uuid not null,
  path text not null,
  created_at timestamptz not null default now(),
  primary key(user_id,path)
);
alter table public.avatar_cleanup enable row level security;
revoke all on public.avatar_cleanup from public, anon, authenticated;
grant select,delete on public.avatar_cleanup to service_role;

create function account_private.queue_avatar_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.avatar_path is not null then
    insert into public.avatar_cleanup(user_id,path) values(old.id,old.avatar_path)
    on conflict do nothing;
  end if;
  return null;
end $$;
create trigger queue_avatar_cleanup after update of avatar_path on public.profiles
for each row when (old.avatar_path is distinct from new.avatar_path)
execute function account_private.queue_avatar_cleanup();

create function account_private.clear_deleted_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.user_phones where user_id = new.id;
  delete from public.user_emails where user_id = new.id;
  delete from public.user_social_links where user_id = new.id;
  delete from public.user_checkout_preferences where user_id = new.id;
  delete from public.user_consents where user_id = new.id;
  update public.event_shares set user_id = null where user_id = new.id;
  insert into public.avatar_cleanup(user_id,path) values (new.id,'') on conflict do nothing;
  new.avatar_path := null;
  new.display_name := null;
  new.city := null;
  new.date_of_birth := null;
  new.gender := null;
  return new;
end $$;
create trigger clear_deleted_profile before update on public.profiles
for each row when (old.block_reason is distinct from 'Account deleted' and new.block_reason = 'Account deleted')
execute function account_private.clear_deleted_profile();

create or replace function public.export_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  payload jsonb;
begin
  if actor is null then
    raise exception 'You need to sign in.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'profile', (
      select jsonb_build_object('full_name', full_name, 'phone', phone, 'display_name', display_name,
        'avatar_path', avatar_path, 'city', city, 'date_of_birth', date_of_birth, 'gender', gender, 'updated_at', updated_at)
      from public.profiles where id = actor
    ),
    'phones', coalesce((select jsonb_agg(to_jsonb(n) - 'user_id' order by n.created_at)
      from public.user_phones n where n.user_id = actor),'[]'::jsonb),
    'emails', coalesce((select jsonb_agg(to_jsonb(e) - 'user_id' - 'verify_token_hash' order by e.created_at)
      from public.user_emails e where e.user_id = actor),'[]'::jsonb),
    'social_links', coalesce((select jsonb_agg(to_jsonb(s) - 'user_id' order by s.created_at)
      from public.user_social_links s where s.user_id = actor),'[]'::jsonb),
    'checkout_preferences', (select to_jsonb(c) - 'user_id' - 'upi_id'
      || jsonb_build_object('upi_id',case when c.upi_id is not null then
        left(split_part(c.upi_id,'@',1),least(2,length(split_part(c.upi_id,'@',1))-1)) || '•••@' || split_part(c.upi_id,'@',2) end)
      from public.user_checkout_preferences c where c.user_id = actor),
    'consents', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id' order by c.changed_at)
      from public.user_consents c where c.user_id = actor),'[]'::jsonb),
    'event_shares', coalesce((select jsonb_agg(to_jsonb(s) - 'user_id' order by s.created_at)
      from public.event_shares s where s.user_id = actor),'[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', checkout.id,
        'event_title', event.title,
        'status', checkout.status,
        'paid_at', checkout.paid_at,
        'total_paise', checkout.total_paise,
        'is_test', checkout.is_test,
        'ref_channel', checkout.ref_channel
      ) order by checkout.created_at)
      from public.orders as checkout
      join public.events as event on event.id = checkout.event_id
      where checkout.buyer_id = actor
    ), '[]'::jsonb),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', ticket.code,
        'event_title', event.title,
        'status', ticket.status,
        'starts_at', event.starts_at,
        'is_test', checkout.is_test
      ) order by event.starts_at)
      from public.tickets as ticket
      join public.orders as checkout on checkout.id = ticket.order_id
      join public.events as event on event.id = ticket.event_id
      where checkout.buyer_id = actor
    ), '[]'::jsonb),
    'refunds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', refund.id,
        'order_id', refund.order_id,
        'amount_paise', refund.amount_paise,
        'status', refund.status,
        'created_at', refund.created_at
      ) order by refund.created_at)
      from public.refunds as refund
      join public.orders as checkout on checkout.id = refund.order_id
      where checkout.buyer_id = actor
    ), '[]'::jsonb)
  ) into payload;
  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (actor, 'account_export', 'profiles', actor, jsonb_build_object('exported', true));
  return payload;
end;
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
    'event_cancelled', 'refund_processed', 'kyc_submitted', 'kyc_needs_docs',
    'kyc_approved', 'kyc_rejected', 'team_invite', 'payout_settled', 'payout_on_hold',
    'account_blocked', 'staff_alert', 'welcome_attendee', 'welcome_organiser',
    'event_hidden_by_admin', 'event_removal_approved', 'event_removal_rejected', 'backup_email_verification'
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
