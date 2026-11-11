-- PR 17. Public contact form storage. Additive only.
-- Visitors cannot read or write this table. The server saves rows with the
-- service role. Staff mark a message replied through an audited function.

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text,
  topic text not null,
  order_ref text,
  message text not null,
  ip_hash text not null,
  status text not null default 'new',
  emailed_at timestamptz,
  constraint contact_messages_name_len check (char_length(name) between 1 and 120),
  constraint contact_messages_email_len check (char_length(email) between 3 and 254),
  constraint contact_messages_phone_len check (phone is null or char_length(phone) between 8 and 16),
  constraint contact_messages_topic check (topic in ('buying', 'refund', 'selling', 'payments', 'other')),
  constraint contact_messages_order_len check (order_ref is null or char_length(order_ref) between 1 and 80),
  constraint contact_messages_message_len check (char_length(message) between 10 and 2000),
  constraint contact_messages_ip_hash check (ip_hash ~ '^[0-9a-f]{64}$'),
  constraint contact_messages_status check (status in ('new', 'replied'))
);

comment on table public.contact_messages is
  'Messages from the public contact form. No anon or authenticated access.';
comment on column public.contact_messages.ip_hash is
  'SHA-256 of the caller address with a server salt. Never a raw address.';

create index contact_messages_created_at_idx
  on public.contact_messages (created_at desc);

create function public.protect_contact_messages()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.created_at is distinct from old.created_at
    or new.name is distinct from old.name
    or new.email is distinct from old.email
    or new.phone is distinct from old.phone
    or new.topic is distinct from old.topic
    or new.order_ref is distinct from old.order_ref
    or new.message is distinct from old.message
    or new.ip_hash is distinct from old.ip_hash
  then
    raise exception 'Contact messages cannot be rewritten' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if current_user not in ('postgres', 'supabase_admin') then
      raise exception 'Use the audited admin functions' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger contact_messages_protect_update
before update on public.contact_messages
for each row
execute function public.protect_contact_messages();

revoke all on function public.protect_contact_messages() from public, anon, authenticated, service_role;

alter table public.contact_messages enable row level security;
revoke all on table public.contact_messages from public, anon, authenticated, service_role;
grant select, insert on table public.contact_messages to service_role;
grant update (emailed_at) on table public.contact_messages to service_role;

create function admin_private.mark_contact_replied(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := admin_private.require_staff();
  row public.contact_messages;
  log_id uuid;
begin
  if p_id is null then
    raise exception 'Choose a message';
  end if;
  select * into row from public.contact_messages where id = p_id for update;
  if not found then
    raise exception 'Message not found';
  end if;
  if row.status = 'replied' then
    raise exception 'This message is already marked as replied';
  end if;
  update public.contact_messages
  set status = 'replied'
  where id = p_id
  returning * into row;
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (
    actor,
    'contact_replied',
    'contact_messages',
    p_id,
    jsonb_build_object('status', 'new'),
    jsonb_build_object('status', row.status)
  )
  returning id into log_id;
  return log_id;
end;
$$;

create function public.admin_mark_contact_replied(p_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select admin_private.mark_contact_replied(p_id);
$$;

revoke all on function admin_private.mark_contact_replied(uuid) from public, anon, authenticated, service_role;
grant execute on function admin_private.mark_contact_replied(uuid) to authenticated;
revoke all on function public.admin_mark_contact_replied(uuid) from public, anon, service_role;
grant execute on function public.admin_mark_contact_replied(uuid) to authenticated;
