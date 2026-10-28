-- Tikatero schema.
-- Money is integer paise (bigint). Times are timestamptz; the product shows them in IST.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('attendee', 'organiser', 'staff', 'admin');

create type public.kyc_status as enum (
  'draft',
  'submitted',
  'auto_passed',
  'needs_docs',
  'approved',
  'rejected'
);

create type public.event_status as enum (
  'draft',
  'pending',
  'published',
  'unpublished',
  'ended',
  'cancelled'
);

create type public.order_status as enum (
  'created',
  'pending',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
  'expired'
);

create type public.ticket_status as enum ('valid', 'used', 'void', 'transferred', 'refunded');

create type public.team_role as enum ('owner', 'manager', 'door');

create type public.fee_payer as enum ('organiser', 'buyer');

create type public.scan_result as enum ('ok', 'duplicate', 'invalid', 'wrong_event');

create type public.payout_status as enum ('scheduled', 'settled', 'failed', 'on_hold');

create type public.gateway_mode as enum ('pass_at_cost', 'absorb');

create type public.refund_status as enum ('requested', 'approved', 'rejected', 'processed', 'failed');

create type public.kyc_region as enum ('IN', 'INTL');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  role public.user_role not null default 'attendee',
  country text,
  blocked_at timestamptz,
  block_reason text,
  created_at timestamptz not null default now(),
  constraint profiles_block_reason_when_blocked check (
    blocked_at is not null or block_reason is null
  )
);

comment on table public.profiles is 'One row per auth user. Role and block columns are staff-controlled.';

create table public.organisers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  display_name text not null,
  slug text not null,
  legal_name text,
  country text not null default 'IN',
  kyc_status public.kyc_status not null default 'draft',
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  payouts_on_hold boolean not null default false,
  sales_paused boolean not null default false,
  cashfree_vendor_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisers_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint organisers_slug_key unique (slug),
  constraint organisers_approved_fields check (
    (kyc_status = 'approved' and approved_at is not null)
    or (kyc_status <> 'approved' and approved_at is null and approved_by is null)
  )
);

comment on table public.organisers is 'Organiser accounts. Verification and payout flags are staff-controlled.';
comment on column public.organisers.cashfree_vendor_id is 'Easy Split vendor id. Server-side only.';

create table public.organiser_members (
  id uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references public.organisers (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  role public.team_role not null,
  invited_email text,
  created_at timestamptz not null default now(),
  constraint organiser_members_role check (role in ('owner', 'manager')),
  constraint organiser_members_identity check (user_id is not null or invited_email is not null),
  constraint organiser_members_user_key unique (organiser_id, user_id)
);

create unique index organiser_members_invite_email_key
  on public.organiser_members (organiser_id, lower(invited_email))
  where invited_email is not null;

create index organiser_members_user_id_idx on public.organiser_members (user_id);

create table public.kyc_applications (
  id uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references public.organisers (id) on delete cascade,
  region public.kyc_region not null,
  -- Identity numbers are stored as last 4 only. Raw documents never land in Postgres.
  pan_last4 text,
  pan_name text,
  pan_name_match boolean,
  aadhaar_last4 text,
  gstin text,
  bank_ifsc text,
  bank_acct_last4 text,
  bank_holder_name text,
  liveness_score numeric,
  face_match_score numeric,
  provider_refs jsonb not null default '{}'::jsonb,
  doc_keys text[] not null default '{}',
  status public.kyc_status not null default 'draft',
  reviewer_id uuid references public.profiles (id),
  reviewer_note text,
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint kyc_pan_last4 check (pan_last4 is null or pan_last4 ~ '^[0-9A-Z]{4}$'),
  constraint kyc_aadhaar_last4 check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$'),
  constraint kyc_bank_last4 check (bank_acct_last4 is null or bank_acct_last4 ~ '^[0-9]{4}$')
);

comment on column public.kyc_applications.doc_keys is
  'Private R2 object keys. Not granted to anon or authenticated.';
comment on column public.kyc_applications.provider_refs is
  'Provider reference ids only. No raw KYC documents.';

create index kyc_applications_organiser_id_idx on public.kyc_applications (organiser_id, created_at desc);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references public.organisers (id) on delete restrict,
  slug text not null,
  title text not null,
  description text,
  category text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  gates_open_at timestamptz,
  timezone text not null default 'Asia/Kolkata',
  venue_name text,
  address text,
  city text,
  country text not null default 'IN',
  lat numeric(9, 6),
  lng numeric(9, 6),
  maps_url text,
  poster_key text,
  theme text,
  status public.event_status not null default 'draft',
  is_free boolean not null default false,
  fee_payer public.fee_payer not null default 'organiser',
  refund_policy text not null default '72h',
  capacity integer,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint events_slug_key unique (slug),
  constraint events_time_order check (ends_at is null or ends_at >= starts_at),
  constraint events_gates check (gates_open_at is null or gates_open_at <= starts_at),
  constraint events_capacity check (capacity is null or capacity > 0)
);

create index events_status_starts_at_idx on public.events (status, starts_at);
create index events_organiser_id_idx on public.events (organiser_id);
create index events_city_idx on public.events (city);

create table public.event_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  title text,
  photo_key text,
  sort integer not null default 0,
  is_vip boolean not null default false
);

create index event_guests_event_id_idx on public.event_guests (event_id, sort);

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  price_paise bigint not null,
  qty_total integer not null,
  qty_sold integer not null default 0,
  per_order_max integer,
  sales_start timestamptz,
  sales_end timestamptz,
  is_vip boolean not null default false,
  design jsonb not null default '{}'::jsonb,
  sort integer not null default 0,
  constraint ticket_types_price check (price_paise >= 0),
  constraint ticket_types_qty check (qty_total >= 0 and qty_sold >= 0 and qty_sold <= qty_total),
  constraint ticket_types_per_order check (per_order_max is null or per_order_max > 0),
  constraint ticket_types_sales_window check (
    sales_start is null or sales_end is null or sales_end >= sales_start
  )
);

comment on column public.ticket_types.price_paise is 'Ticket price in paise, GST inclusive, as shown to the buyer.';
comment on column public.ticket_types.qty_sold is 'Maintained by the server when orders are paid. Clients cannot change it.';

create index ticket_types_event_id_idx on public.ticket_types (event_id, sort);

create table public.event_team (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  email text,
  role public.team_role not null,
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint event_team_role check (role in ('manager', 'door')),
  constraint event_team_identity check (user_id is not null or email is not null)
);

create unique index event_team_user_key
  on public.event_team (event_id, user_id)
  where user_id is not null;

create unique index event_team_email_key
  on public.event_team (event_id, lower(email))
  where email is not null;

create index event_team_user_id_idx on public.event_team (user_id);

create table public.pricing_versions (
  id uuid primary key default gen_random_uuid(),
  -- Basis points. 150 = 1.5%.
  platform_pct integer not null,
  fixed_fee_paise bigint not null,
  gst_bps integer not null,
  gateway_mode public.gateway_mode not null,
  gateway_bps integer not null,
  payout_days integer not null,
  effective_from timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint pricing_versions_bps check (
    platform_pct >= 0
    and platform_pct <= 10000
    and gst_bps >= 0
    and gst_bps <= 10000
    and gateway_bps >= 0
    and gateway_bps <= 10000
  ),
  constraint pricing_versions_fee check (fixed_fee_paise >= 0),
  constraint pricing_versions_payout_days check (payout_days >= 0)
);

comment on table public.pricing_versions is 'Immutable fee schedule. Insert a new row to change pricing.';
comment on column public.pricing_versions.platform_pct is 'Platform fee in basis points. 150 = 1.5%.';
comment on column public.pricing_versions.fixed_fee_paise is 'Fixed fee per paid ticket, in paise. 500 = ₹5.';

create index pricing_versions_effective_from_idx
  on public.pricing_versions (effective_from desc);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  buyer_id uuid references public.profiles (id),
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text,
  subtotal_paise bigint not null,
  platform_fee_paise bigint not null default 0,
  platform_fee_gst_paise bigint not null default 0,
  gateway_fee_paise bigint not null default 0,
  total_paise bigint not null,
  fee_payer public.fee_payer not null,
  status public.order_status not null default 'created',
  cf_order_id text,
  cf_payment_id text,
  pricing_version_id uuid references public.pricing_versions (id),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint orders_amounts check (
    subtotal_paise >= 0
    and platform_fee_paise >= 0
    and platform_fee_gst_paise >= 0
    and gateway_fee_paise >= 0
    and total_paise >= 0
  )
);

comment on table public.orders is 'Checkout orders. Inserts and updates run as the service role.';

create unique index orders_cf_order_id_key on public.orders (cf_order_id) where cf_order_id is not null;
create index orders_event_id_idx on public.orders (event_id);
create index orders_buyer_id_idx on public.orders (buyer_id);
create index orders_buyer_email_idx on public.orders (lower(buyer_email));

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types (id) on delete restrict,
  qty integer not null,
  unit_price_paise bigint not null,
  constraint order_items_qty check (qty > 0),
  constraint order_items_price check (unit_price_paise >= 0),
  constraint order_items_order_type_key unique (order_id, ticket_type_id)
);

create index order_items_ticket_type_id_idx on public.order_items (ticket_type_id);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  event_id uuid not null references public.events (id) on delete restrict,
  ticket_type_id uuid not null references public.ticket_types (id) on delete restrict,
  code text not null,
  holder_name text,
  holder_email text,
  qr_secret text not null,
  status public.ticket_status not null default 'valid',
  used_at timestamptz,
  used_by uuid references public.profiles (id),
  gate text,
  transferred_to uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint tickets_code_format check (code ~ '^TK-[A-Z0-9]{5}-[0-9]{2}$'),
  constraint tickets_code_key unique (code)
);

comment on column public.tickets.code is 'Public ticket code, shaped TK-XXXXX-NN.';
comment on column public.tickets.qr_secret is
  'Per-ticket HMAC nonce. Not granted to anon or authenticated. Signature is hex HMAC-SHA256 of the code, keyed by this nonce.';

create index tickets_event_id_idx on public.tickets (event_id);
create index tickets_order_id_idx on public.tickets (order_id);

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  scanner_user_id uuid references public.profiles (id),
  result public.scan_result not null,
  gate text,
  scanned_at timestamptz not null default now(),
  device_id text,
  synced_at timestamptz
);

create index scans_event_scanned_at_idx on public.scans (event_id, scanned_at desc);
create index scans_ticket_id_idx on public.scans (ticket_id);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  amount_paise bigint not null,
  reason text,
  status public.refund_status not null default 'requested',
  requested_by uuid references public.profiles (id),
  approved_by uuid references public.profiles (id),
  cf_refund_id text,
  created_at timestamptz not null default now(),
  constraint refunds_amount check (amount_paise >= 0)
);

create index refunds_order_id_idx on public.refunds (order_id);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references public.organisers (id) on delete restrict,
  event_id uuid references public.events (id) on delete restrict,
  order_id uuid references public.orders (id) on delete restrict,
  cf_split_ref text,
  amount_paise bigint not null,
  status public.payout_status not null default 'scheduled',
  expected_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payouts_amount check (amount_paise >= 0)
);

comment on table public.payouts is 'Easy Split payouts. Inserts and updates run as the service role.';

create index payouts_organiser_id_idx on public.payouts (organiser_id, created_at desc);
create index payouts_event_id_idx on public.payouts (event_id);

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  ticket_type_id uuid references public.ticket_types (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

comment on table public.waitlist is 'Reserved for later waitlist work. Unused by the app.';

create index waitlist_event_id_idx on public.waitlist (event_id, created_at);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  code text not null,
  pct integer,
  amount_paise bigint,
  max_uses integer,
  used integer not null default 0,
  created_at timestamptz not null default now(),
  constraint coupons_code_key unique (event_id, code),
  constraint coupons_discount check (pct is not null or amount_paise is not null),
  constraint coupons_pct check (pct is null or (pct > 0 and pct <= 100)),
  constraint coupons_amount check (amount_paise is null or amount_paise > 0),
  constraint coupons_uses check (
    used >= 0 and (max_uses is null or (max_uses >= 0 and used <= max_uses))
  )
);

comment on table public.coupons is 'Reserved for later coupon work. Unused by the app.';

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null,
  entity_ref text,
  resend_id text,
  status text not null,
  created_at timestamptz not null default now()
);

create index email_log_created_at_idx on public.email_log (created_at desc);
create index email_log_entity_ref_idx on public.email_log (entity_ref);

create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  segment jsonb not null default '{}'::jsonb,
  channel text not null,
  subject text,
  body text,
  sent_count integer not null default 0,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint broadcasts_sent_count check (sent_count >= 0)
);

comment on table public.broadcasts is 'Reserved for later broadcast work. Staff only.';

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

comment on table public.audit_log is 'Append-only. A trigger rejects UPDATE and DELETE for every role.';

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  event_id text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint webhook_events_source_event_key unique (source, event_id)
);

comment on table public.webhook_events is 'Idempotency log for inbound webhooks. Writes run as the service role.';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger organisers_set_updated_at
before update on public.organisers
for each row
execute function public.set_updated_at();

create trigger events_set_updated_at
before update on public.events
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(coalesce(new.raw_user_meta_data, '{}'::jsonb) ->> 'full_name', ''),
    -- auth.users.phone arrives with the GoTrue migration; to_jsonb stays valid either way.
    nullif(to_jsonb(new) ->> 'phone', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.add_organiser_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organiser_members (organiser_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (organiser_id, user_id) do nothing;

  return new;
end;
$$;

create trigger organisers_add_owner
after insert on public.organisers
for each row
execute function public.add_organiser_owner_membership();

create or replace function public.prevent_removing_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and old.role = 'owner' then
    if not exists (
      select 1
      from public.organiser_members as member
      where member.organiser_id = old.organiser_id
        and member.role = 'owner'
        and member.id <> old.id
    ) then
      raise exception 'an organiser must keep an owner' using errcode = 'P0001';
    end if;
  elsif tg_op = 'UPDATE' and old.role = 'owner' and new.role is distinct from 'owner' then
    if not exists (
      select 1
      from public.organiser_members as member
      where member.organiser_id = old.organiser_id
        and member.role = 'owner'
        and member.id <> old.id
    ) then
      raise exception 'an organiser must keep an owner' using errcode = 'P0001';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger organiser_members_keep_owner
before update or delete on public.organiser_members
for each row
execute function public.prevent_removing_last_owner();

create or replace function public.protect_organiser_controls()
returns trigger
language plpgsql
set search_path = public
as $$
begin
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

-- is_staff() is created in the next migration. The function body is checked at call time.
create trigger organisers_protect_controls
before update on public.organisers
for each row
execute function public.protect_organiser_controls();

create or replace function public.enforce_event_publishable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  organiser_ok boolean;
begin
  if new.status = 'published'
    and (
      tg_op = 'INSERT'
      or old.status is distinct from 'published'
      or new.organiser_id is distinct from old.organiser_id
    )
  then
    select
      organiser.kyc_status = 'approved' and organiser.sales_paused = false
    into organiser_ok
    from public.organisers as organiser
    where organiser.id = new.organiser_id;

    if coalesce(organiser_ok, false) is false then
      raise exception 'publish blocked: organiser must be approved and sales must not be paused'
        using errcode = 'P0001';
    end if;

    if new.published_at is null then
      new.published_at := now();
    end if;
  end if;

  return new;
end;
$$;

create trigger events_enforce_publish
before insert or update on public.events
for each row
execute function public.enforce_event_publishable();

create or replace function public.protect_qty_sold()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.qty_sold is distinct from old.qty_sold
    and current_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'qty_sold is maintained by the server' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger ticket_types_protect_qty_sold
before update on public.ticket_types
for each row
execute function public.protect_qty_sold();

create or replace function public.reject_audit_log_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'audit_log is insert-only' using errcode = 'P0001';
end;
$$;

create trigger audit_log_reject_update
before update on public.audit_log
for each row
execute function public.reject_audit_log_mutation();

create trigger audit_log_reject_delete
before delete on public.audit_log
for each row
execute function public.reject_audit_log_mutation();

create or replace function public.stamp_audit_actor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  new.actor_id := auth.uid();
  return new;
end;
$$;

create trigger audit_log_stamp_actor
before insert on public.audit_log
for each row
execute function public.stamp_audit_actor();

create or replace function public.reject_pricing_version_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'pricing_versions are immutable; insert a new version'
    using errcode = 'P0001';
end;
$$;

create trigger pricing_versions_reject_update
before update on public.pricing_versions
for each row
execute function public.reject_pricing_version_mutation();

create trigger pricing_versions_reject_delete
before delete on public.pricing_versions
for each row
execute function public.reject_pricing_version_mutation();
