-- Helpers, redemption, grants, and row level security.

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = auth.uid()
      and profile.role in ('staff', 'admin')
  );
$$;

comment on function public.is_staff() is
  'True when the caller profile role is staff or admin.';

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organiser_members as member
    where member.organiser_id = org_id
      and member.user_id = auth.uid()
  );
$$;

comment on function public.is_org_member(uuid) is
  'True when the caller is a member of the organiser.';

create or replace function public.is_event_team(event_id uuid, roles public.team_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_team as member
    where member.event_id = is_event_team.event_id
      and member.user_id = auth.uid()
      and member.role = any (roles)
  );
$$;

comment on function public.is_event_team(uuid, public.team_role[]) is
  'True when the caller is on the event team in one of the given roles.';

-- Online redemption. sig is lowercase hex HMAC-SHA256 of the ticket code,
-- keyed by tickets.qr_secret. The row lock makes a second concurrent scan wait.
create or replace function public.redeem_ticket(code text, sig text, gate text)
returns public.scan_result
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ticket public.tickets%rowtype;
  v_scanner uuid;
  v_expected text;
  v_result public.scan_result;
begin
  v_scanner := auth.uid();

  if v_scanner is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not public.is_staff()
    and not exists (
      select 1
      from public.event_team as member
      where member.user_id = v_scanner
        and member.role in ('manager', 'door')
    )
  then
    raise exception 'not authorised to scan' using errcode = '42501';
  end if;

  select ticket.*
  into v_ticket
  from public.tickets as ticket
  where ticket.code = redeem_ticket.code
  for update;

  if not found then
    insert into public.scans (ticket_id, event_id, scanner_user_id, result, gate, synced_at)
    values (null, null, v_scanner, 'invalid', redeem_ticket.gate, now());
    return 'invalid';
  end if;

  if not public.is_staff()
    and not public.is_event_team(v_ticket.event_id, array['manager', 'door']::public.team_role[])
  then
    insert into public.scans (ticket_id, event_id, scanner_user_id, result, gate, synced_at)
    values (v_ticket.id, v_ticket.event_id, v_scanner, 'wrong_event', redeem_ticket.gate, now());
    return 'wrong_event';
  end if;

  v_expected := encode(extensions.hmac(v_ticket.code, v_ticket.qr_secret, 'sha256'), 'hex');

  if redeem_ticket.sig is null or lower(redeem_ticket.sig) is distinct from v_expected then
    v_result := 'invalid';
  elsif v_ticket.status = 'used' then
    v_result := 'duplicate';
  elsif v_ticket.status <> 'valid' then
    v_result := 'invalid';
  else
    update public.tickets
    set
      status = 'used',
      used_at = now(),
      used_by = v_scanner,
      gate = redeem_ticket.gate
    where id = v_ticket.id;

    v_result := 'ok';
  end if;

  insert into public.scans (ticket_id, event_id, scanner_user_id, result, gate, synced_at)
  values (v_ticket.id, v_ticket.event_id, v_scanner, v_result, redeem_ticket.gate, now());

  return v_result;
end;
$$;

comment on function public.redeem_ticket(text, text, text) is
  'Door or manager redeems one ticket. Locks the row, records a scan, and returns ok, duplicate, invalid, or wrong_event.';

revoke all on function public.redeem_ticket(text, text, text) from public;
revoke all on function public.is_staff() from public;
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_event_team(uuid, public.team_role[]) from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.add_organiser_owner_membership() from public;
revoke all on function public.prevent_removing_last_owner() from public;
revoke all on function public.protect_organiser_controls() from public;
revoke all on function public.enforce_event_publishable() from public;
revoke all on function public.protect_qty_sold() from public;
revoke all on function public.reject_audit_log_mutation() from public;
revoke all on function public.stamp_audit_actor() from public;
revoke all on function public.reject_pricing_version_mutation() from public;
revoke all on function public.set_updated_at() from public;

grant execute on function public.is_staff() to anon, authenticated, service_role;
grant execute on function public.is_org_member(uuid) to anon, authenticated, service_role;
grant execute on function public.is_event_team(uuid, public.team_role[]) to anon, authenticated, service_role;
grant execute on function public.redeem_ticket(text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

create view public.organisers_public
with (security_invoker = false) as
select
  organiser.id,
  organiser.display_name,
  organiser.slug,
  organiser.country,
  (organiser.kyc_status = 'approved') as verified
from public.organisers as organiser
where exists (
  select 1
  from public.events as event
  where event.organiser_id = organiser.id
    and event.status = 'published'
);

comment on view public.organisers_public is
  'Public organiser card for published events. Omits legal, payout, and vendor fields.';

create view public.event_attendees_v
with (security_invoker = true) as
select
  ticket.id as ticket_id,
  ticket.event_id,
  ticket_type.name as ticket_name,
  ticket.holder_name,
  ticket.status,
  ticket.gate,
  ticket.used_at
from public.tickets as ticket
join public.ticket_types as ticket_type on ticket_type.id = ticket.ticket_type_id;

comment on view public.event_attendees_v is
  'Attendee list without email, phone, payment ids, or the QR nonce.';

-- ---------------------------------------------------------------------------
-- Grants
-- Data API roles receive only what the policies below allow.
-- Orders, tickets, and payouts are not writable by anon or authenticated.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to service_role;
revoke update, delete on public.audit_log from service_role;
revoke update, delete on public.pricing_versions from service_role;
grant execute on all functions in schema public to service_role;

revoke all on all tables in schema public from anon, authenticated;

grant select on public.events to anon, authenticated;
grant select, insert, update, delete on public.events to authenticated;

grant select on public.event_guests to anon, authenticated;
grant select, insert, update, delete on public.event_guests to authenticated;

grant select on public.ticket_types to anon, authenticated;
grant select, insert, update, delete on public.ticket_types to authenticated;

grant select on public.organisers_public to anon, authenticated;
grant select on public.event_attendees_v to authenticated;

grant select (
  id,
  full_name,
  phone,
  role,
  country,
  blocked_at,
  block_reason,
  created_at
) on public.profiles to authenticated;

grant update (full_name, phone, country) on public.profiles to authenticated;

grant select, insert, update, delete on public.organisers to authenticated;
grant select, insert, update, delete on public.organiser_members to authenticated;

grant select (
  id,
  organiser_id,
  region,
  pan_last4,
  pan_name,
  pan_name_match,
  aadhaar_last4,
  gstin,
  bank_ifsc,
  bank_acct_last4,
  bank_holder_name,
  liveness_score,
  face_match_score,
  provider_refs,
  status,
  reviewer_id,
  reviewer_note,
  submitted_at,
  decided_at,
  created_at
) on public.kyc_applications to authenticated;

grant insert (
  organiser_id,
  region,
  pan_last4,
  pan_name,
  pan_name_match,
  aadhaar_last4,
  gstin,
  bank_ifsc,
  bank_acct_last4,
  bank_holder_name,
  liveness_score,
  face_match_score,
  provider_refs,
  status,
  submitted_at
) on public.kyc_applications to authenticated;

grant update (
  region,
  pan_last4,
  pan_name,
  pan_name_match,
  aadhaar_last4,
  gstin,
  bank_ifsc,
  bank_acct_last4,
  bank_holder_name,
  liveness_score,
  face_match_score,
  provider_refs,
  status,
  reviewer_id,
  reviewer_note,
  submitted_at,
  decided_at
) on public.kyc_applications to authenticated;

grant select, insert, update, delete on public.event_team to authenticated;

grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;

grant select (
  id,
  order_id,
  event_id,
  ticket_type_id,
  code,
  holder_name,
  holder_email,
  status,
  used_at,
  used_by,
  gate,
  transferred_to,
  created_at
) on public.tickets to authenticated;

grant select on public.scans to authenticated;
grant select on public.refunds to authenticated;
grant select on public.payouts to authenticated;

grant select, insert, update, delete on public.waitlist to authenticated;
grant select, insert, update, delete on public.coupons to authenticated;

grant select on public.email_log to authenticated;
grant select, insert, update, delete on public.broadcasts to authenticated;
grant select, insert on public.pricing_versions to authenticated;
grant select, insert on public.audit_log to authenticated;
grant select on public.webhook_events to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organisers enable row level security;
alter table public.organiser_members enable row level security;
alter table public.kyc_applications enable row level security;
alter table public.events enable row level security;
alter table public.event_guests enable row level security;
alter table public.ticket_types enable row level security;
alter table public.event_team enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.tickets enable row level security;
alter table public.scans enable row level security;
alter table public.refunds enable row level security;
alter table public.payouts enable row level security;
alter table public.pricing_versions enable row level security;
alter table public.waitlist enable row level security;
alter table public.coupons enable row level security;
alter table public.email_log enable row level security;
alter table public.broadcasts enable row level security;
alter table public.audit_log enable row level security;
alter table public.webhook_events enable row level security;

create policy profiles_select
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_staff());

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy organisers_select
on public.organisers
for select
to authenticated
using (public.is_staff() or public.is_org_member(id));

create policy organisers_insert
on public.organisers
for insert
to authenticated
with check (public.is_staff() or owner_id = auth.uid());

create policy organisers_update
on public.organisers
for update
to authenticated
using (public.is_staff() or public.is_org_member(id))
with check (public.is_staff() or public.is_org_member(id));

create policy organisers_delete
on public.organisers
for delete
to authenticated
using (public.is_staff());

create policy organiser_members_select
on public.organiser_members
for select
to authenticated
using (
  public.is_staff()
  or public.is_org_member(organiser_id)
  or user_id = auth.uid()
);

create policy organiser_members_insert
on public.organiser_members
for insert
to authenticated
with check (public.is_staff() or public.is_org_member(organiser_id));

create policy organiser_members_update
on public.organiser_members
for update
to authenticated
using (public.is_staff() or public.is_org_member(organiser_id))
with check (public.is_staff() or public.is_org_member(organiser_id));

create policy organiser_members_delete
on public.organiser_members
for delete
to authenticated
using (public.is_staff() or public.is_org_member(organiser_id));

create policy kyc_applications_select
on public.kyc_applications
for select
to authenticated
using (public.is_staff() or public.is_org_member(organiser_id));

create policy kyc_applications_insert
on public.kyc_applications
for insert
to authenticated
with check (
  public.is_org_member(organiser_id)
  and status in ('draft', 'submitted')
  and reviewer_id is null
  and reviewer_note is null
  and decided_at is null
);

create policy kyc_applications_update
on public.kyc_applications
for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

create policy events_public_read
on public.events
for select
to anon, authenticated
using (status = 'published');

create policy events_member_all
on public.events
for all
to authenticated
using (public.is_staff() or public.is_org_member(organiser_id))
with check (public.is_staff() or public.is_org_member(organiser_id));

create policy event_guests_public_read
on public.event_guests
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.events as event
    where event.id = event_guests.event_id
      and event.status = 'published'
  )
);

create policy event_guests_member_all
on public.event_guests
for all
to authenticated
using (
  public.is_staff()
  or exists (
    select 1
    from public.events as event
    where event.id = event_guests.event_id
      and public.is_org_member(event.organiser_id)
  )
)
with check (
  public.is_staff()
  or exists (
    select 1
    from public.events as event
    where event.id = event_guests.event_id
      and public.is_org_member(event.organiser_id)
  )
);

create policy ticket_types_public_read
on public.ticket_types
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.events as event
    where event.id = ticket_types.event_id
      and event.status = 'published'
  )
);

create policy ticket_types_member_all
on public.ticket_types
for all
to authenticated
using (
  public.is_staff()
  or exists (
    select 1
    from public.events as event
    where event.id = ticket_types.event_id
      and public.is_org_member(event.organiser_id)
  )
)
with check (
  public.is_staff()
  or exists (
    select 1
    from public.events as event
    where event.id = ticket_types.event_id
      and public.is_org_member(event.organiser_id)
  )
);

create policy event_team_select
on public.event_team
for select
to authenticated
using (
  public.is_staff()
  or user_id = auth.uid()
  or exists (
    select 1
    from public.events as event
    where event.id = event_team.event_id
      and public.is_org_member(event.organiser_id)
  )
);

create policy event_team_write
on public.event_team
for all
to authenticated
using (
  public.is_staff()
  or exists (
    select 1
    from public.events as event
    where event.id = event_team.event_id
      and public.is_org_member(event.organiser_id)
  )
)
with check (
  public.is_staff()
  or exists (
    select 1
    from public.events as event
    where event.id = event_team.event_id
      and public.is_org_member(event.organiser_id)
  )
);

create policy orders_select
on public.orders
for select
to authenticated
using (
  buyer_id = auth.uid()
  or public.is_staff()
  or exists (
    select 1
    from public.events as event
    where event.id = orders.event_id
      and public.is_org_member(event.organiser_id)
  )
);

create policy order_items_select
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders as checkout
    where checkout.id = order_items.order_id
      and (
        checkout.buyer_id = auth.uid()
        or public.is_staff()
        or exists (
          select 1
          from public.events as event
          where event.id = checkout.event_id
            and public.is_org_member(event.organiser_id)
        )
      )
  )
);

create policy tickets_select
on public.tickets
for select
to authenticated
using (
  public.is_staff()
  or public.is_event_team(event_id, array['manager', 'door']::public.team_role[])
  or exists (
    select 1
    from public.events as event
    where event.id = tickets.event_id
      and public.is_org_member(event.organiser_id)
  )
  or exists (
    select 1
    from public.orders as checkout
    where checkout.id = tickets.order_id
      and checkout.buyer_id = auth.uid()
  )
);

create policy scans_select
on public.scans
for select
to authenticated
using (
  public.is_staff()
  or (
    event_id is not null
    and public.is_event_team(event_id, array['manager', 'door']::public.team_role[])
  )
  or exists (
    select 1
    from public.events as event
    where event.id = scans.event_id
      and public.is_org_member(event.organiser_id)
  )
);

create policy refunds_select
on public.refunds
for select
to authenticated
using (
  public.is_staff()
  or exists (
    select 1
    from public.orders as checkout
    join public.events as event on event.id = checkout.event_id
    where checkout.id = refunds.order_id
      and (
        checkout.buyer_id = auth.uid()
        or public.is_org_member(event.organiser_id)
      )
  )
);

create policy payouts_select
on public.payouts
for select
to authenticated
using (public.is_staff() or public.is_org_member(organiser_id));

create policy pricing_versions_select
on public.pricing_versions
for select
to authenticated
using (public.is_staff());

create policy pricing_versions_insert
on public.pricing_versions
for insert
to authenticated
with check (public.is_staff());

create policy waitlist_all
on public.waitlist
for all
to authenticated
using (
  public.is_staff()
  or exists (
    select 1
    from public.events as event
    where event.id = waitlist.event_id
      and public.is_org_member(event.organiser_id)
  )
)
with check (
  public.is_staff()
  or exists (
    select 1
    from public.events as event
    where event.id = waitlist.event_id
      and public.is_org_member(event.organiser_id)
  )
);

create policy coupons_all
on public.coupons
for all
to authenticated
using (
  public.is_staff()
  or exists (
    select 1
    from public.events as event
    where event.id = coupons.event_id
      and public.is_org_member(event.organiser_id)
  )
)
with check (
  public.is_staff()
  or exists (
    select 1
    from public.events as event
    where event.id = coupons.event_id
      and public.is_org_member(event.organiser_id)
  )
);

create policy email_log_select
on public.email_log
for select
to authenticated
using (public.is_staff());

create policy broadcasts_all
on public.broadcasts
for all
to authenticated
using (public.is_staff())
with check (public.is_staff());

create policy audit_log_select
on public.audit_log
for select
to authenticated
using (public.is_staff());

create policy audit_log_insert
on public.audit_log
for insert
to authenticated
with check (public.is_staff());

create policy webhook_events_select
on public.webhook_events
for select
to authenticated
using (public.is_staff());
