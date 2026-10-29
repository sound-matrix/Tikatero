-- Proves the access rules for published events, organiser orders, ticket writes,
-- the audit log, publishing, and single-use redemption.

begin;

select plan(16);

insert into public.events (
  id,
  organiser_id,
  slug,
  title,
  starts_at,
  timezone,
  city,
  status
)
values (
  'c2222222-2222-4222-8222-222222222222',
  'b2222222-2222-4222-8222-222222222222',
  'harbour-draft',
  'Harbour draft night',
  '2026-12-01 19:00:00+05:30',
  'Asia/Kolkata',
  'Mumbai',
  'draft'
);

insert into public.orders (
  id,
  event_id,
  buyer_name,
  buyer_email,
  subtotal_paise,
  total_paise,
  fee_payer,
  status,
  pricing_version_id
)
values
  (
    'ab111111-1111-4111-8111-111111111111',
    'c1111111-1111-4111-8111-111111111111',
    'Buyer One',
    'buyer.one@tikatero.test',
    99900,
    99900,
    'organiser',
    'paid',
    'e1111111-1111-4111-8111-111111111111'
  ),
  (
    'ab222222-2222-4222-8222-222222222222',
    'c2222222-2222-4222-8222-222222222222',
    'Buyer Two',
    'buyer.two@tikatero.test',
    50000,
    50000,
    'organiser',
    'paid',
    'e1111111-1111-4111-8111-111111111111'
  );

do $test_users$
declare
  person record;
  has_email_confirmed boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'email_confirmed_at'
  ) into has_email_confirmed;

  for person in
    select *
    from (
      values
        (
          'a4444444-4444-4444-8444-444444444444'::uuid,
          'buyer@tikatero.test',
          'Buyer Attendee'
        ),
        (
          'a5555555-5555-4555-8555-555555555555'::uuid,
          'door@tikatero.test',
          'Door Staff'
        )
    ) as test_user (id, email, full_name)
  loop
    if has_email_confirmed then
      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
      )
      values (
        '00000000-0000-0000-0000-000000000000',
        person.id,
        'authenticated',
        'authenticated',
        person.email,
        extensions.crypt('local-dev-password', extensions.gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', person.full_name),
        now(),
        now(),
        '',
        '',
        '',
        ''
      );
    else
      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
      )
      values (
        '00000000-0000-0000-0000-000000000000',
        person.id,
        'authenticated',
        'authenticated',
        person.email,
        extensions.crypt('local-dev-password', extensions.gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', person.full_name),
        false,
        now(),
        now(),
        '',
        '',
        '',
        ''
      );
    end if;
  end loop;
end;
$test_users$;

insert into public.event_team (event_id, user_id, role, invited_by)
values (
  'c1111111-1111-4111-8111-111111111111',
  'a5555555-5555-4555-8555-555555555555',
  'door',
  'a2222222-2222-4222-8222-222222222222'
);

insert into public.tickets (
  order_id,
  event_id,
  ticket_type_id,
  code,
  holder_name,
  qr_secret
)
values (
  'ab111111-1111-4111-8111-111111111111',
  'c1111111-1111-4111-8111-111111111111',
  'd1111111-1111-4111-8111-111111111111',
  'TK-DIW01-01',
  'Buyer One',
  'seed-nonce-diwali-01'
);

insert into public.audit_log (actor_id, action, entity, entity_id, reason)
values (
  'a1111111-1111-4111-8111-111111111111',
  'test.touch',
  'events',
  'c1111111-1111-4111-8111-111111111111',
  'fixture'
);

select set_config(
  'test.redeem_sig',
  encode(extensions.hmac('TK-DIW01-01', 'seed-nonce-diwali-01', 'sha256'), 'hex'),
  true
);

grant update, delete on public.audit_log to service_role;

create function pg_temp.audit_update_as_service()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'service_role', true);
  update public.audit_log set reason = 'changed';
end;
$$;

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select results_eq(
  $$select slug from public.events order by slug$$,
  array['diwali-night']::text[],
  'anon reads only published events'
);

select is_empty(
  $$select id from public.events where status <> 'published'$$,
  'anon cannot read unpublished events'
);

select throws_ok(
  $$select id from public.orders$$,
  '42501',
  'permission denied for table orders',
  'anon cannot read orders'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (select count(*) from public.orders),
  1::bigint,
  'organiser A reads only their own orders'
);

select is_empty(
  $$select id from public.orders where id = 'ab222222-2222-4222-8222-222222222222'$$,
  'organiser A cannot read organiser B orders'
);

select throws_ok(
  $$update public.organisers set sales_paused = true where id = 'b1111111-1111-4111-8111-111111111111'$$,
  '42501',
  'permission denied for table organisers',
  'organiser cannot change payout or sales controls'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'a4444444-4444-4444-8444-444444444444', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select throws_ok(
  $$insert into public.tickets (order_id, event_id, ticket_type_id, code, qr_secret)
    values (
      'ab111111-1111-4111-8111-111111111111',
      'c1111111-1111-4111-8111-111111111111',
      'd1111111-1111-4111-8111-111111111111',
      'TK-DIW01-02',
      'nope'
    )$$,
  '42501',
  'permission denied for table tickets',
  'attendee cannot insert tickets'
);

reset role;

select throws_ok(
  $$update public.audit_log set reason = 'changed'$$,
  'P0001',
  'audit_log is insert-only',
  'audit_log rejects updates'
);

select throws_ok(
  $$delete from public.audit_log$$,
  'P0001',
  'audit_log is insert-only',
  'audit_log rejects deletes'
);

select throws_ok(
  $$select pg_temp.audit_update_as_service()$$,
  'P0001',
  'audit_log is insert-only',
  'service role cannot update the audit log'
);

select set_config('request.jwt.claims', '{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select throws_ok(
  $$update public.events set status = 'published' where id = 'c2222222-2222-4222-8222-222222222222'$$,
  'P0001',
  'publish blocked: organiser must be approved and sales must not be paused',
  'pending organiser cannot publish'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- PR 07 closes direct writes: staff controls must commit an audit row.
select public.admin_organiser_control('b1111111-1111-4111-8111-111111111111', 'sales_paused', true);

select is(
  (select sales_paused from public.organisers where id = 'b1111111-1111-4111-8111-111111111111'),
  true,
  'staff can pause organiser sales'
);

reset role;

insert into public.events (
  id,
  organiser_id,
  slug,
  title,
  starts_at,
  status
)
values (
  'c3333333-3333-4333-8333-333333333333',
  'b1111111-1111-4111-8111-111111111111',
  'diwali-rehearsal',
  'Diwali rehearsal',
  '2026-11-07 19:00:00+05:30',
  'draft'
);

select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select throws_ok(
  $$update public.events set status = 'published' where id = 'c3333333-3333-4333-8333-333333333333'$$,
  'P0001',
  'publish blocked: organiser must be approved and sales must not be paused',
  'sales pause blocks publish'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"a5555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'a5555555-5555-4555-8555-555555555555', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  public.redeem_ticket('TK-DIW01-01', current_setting('test.redeem_sig'), 'Main gate'),
  'ok'::public.scan_result,
  'first scan redeems the ticket'
);

select is(
  public.redeem_ticket('TK-DIW01-01', current_setting('test.redeem_sig'), 'Main gate'),
  'duplicate'::public.scan_result,
  'second scan returns duplicate'
);

select is(
  (select status from public.tickets where code = 'TK-DIW01-01'),
  'used'::public.ticket_status,
  'ticket is marked used after redemption'
);

select * from finish();

rollback;
