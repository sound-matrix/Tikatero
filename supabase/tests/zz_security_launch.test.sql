begin;
select plan(30);

-- Profiles must be committed. A refusal audit uses a second connection, which
-- cannot see rows from this test transaction, and audit_log.actor_id is a foreign key.
do $$
begin
  begin
    perform extensions.dblink_disconnect('launch_fixture');
  exception
    when others then null;
  end;
  perform extensions.dblink_connect('launch_fixture', 'dbname=' || current_database());
  perform extensions.dblink_exec(
    'launch_fixture',
    'insert into auth.users (id, email) values
      (''a1600001-0000-4000-8000-000000000001'', ''launch-staff@example.test''),
      (''a1600002-0000-4000-8000-000000000002'', ''launch-colleague@example.test''),
      (''a1600003-0000-4000-8000-000000000003'', ''launch-admin@example.test''),
      (''a1600004-0000-4000-8000-000000000004'', ''launch-attendee@example.test''),
      (''a1600005-0000-4000-8000-000000000005'', ''launch-owner@example.test'')
     on conflict (id) do nothing'
  );
  perform extensions.dblink_disconnect('launch_fixture');
end
$$;

update public.profiles set role = 'staff' where id = 'a1600001-0000-4000-8000-000000000001';
update public.profiles set role = 'staff' where id = 'a1600002-0000-4000-8000-000000000002';
update public.profiles set role = 'admin' where id = 'a1600003-0000-4000-8000-000000000003';

insert into public.organisers (id, owner_id, display_name, slug, kyc_status, approved_at) values
  ('a1610001-0000-4000-8000-000000000001', 'a1600001-0000-4000-8000-000000000001', 'Staff Own', 'launch-staff-own', 'approved', now()),
  ('a1610002-0000-4000-8000-000000000002', 'a1600005-0000-4000-8000-000000000005', 'Other Live', 'launch-other', 'approved', now()),
  ('a1610004-0000-4000-8000-000000000004', 'a1600005-0000-4000-8000-000000000005', 'Paused Host', 'launch-paused', 'approved', now()),
  ('a1610005-0000-4000-8000-000000000005', 'a1600005-0000-4000-8000-000000000005', 'Open Host', 'launch-open', 'approved', now());
insert into public.organiser_members (organiser_id, user_id, role) values
  ('a1610002-0000-4000-8000-000000000002', 'a1600001-0000-4000-8000-000000000001', 'manager');
insert into public.events (id, organiser_id, slug, title, starts_at, status) values
  ('a1620001-0000-4000-8000-000000000001', 'a1610004-0000-4000-8000-000000000004', 'launch-paused-night', 'Paused night', now() + interval '1 day', 'published'),
  ('a1620002-0000-4000-8000-000000000002', 'a1610005-0000-4000-8000-000000000005', 'launch-open-night', 'Open night', now() + interval '1 day', 'published');
update public.organisers set sales_paused = true where id = 'a1610004-0000-4000-8000-000000000004';

select ok(to_regprocedure('private.organiser_sales_open(uuid)') is null, 'sales-open helper is gone');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot use schema private');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated cannot use schema private');

set local role anon;
select is((select count(*) from public.events where id = 'a1620001-0000-4000-8000-000000000001'), 0::bigint, 'anon cannot read a paused organiser event');
select is((select count(*) from public.discovery_events where slug = 'launch-paused-night'), 0::bigint, 'paused event stays off discovery');
select is((select count(*) from public.discovery_events where slug = 'launch-open-night'), 1::bigint, 'open event stays on discovery');
select throws_ok(
  $$select public.consume_rate_limit('0123456789abcdef', 1, 60)$$,
  '42501',
  null,
  'anon cannot consume the rate limit'
);
set local role authenticated;
select is((select count(*) from public.events where id = 'a1620001-0000-4000-8000-000000000001'), 0::bigint, 'signed-in buyers cannot read a paused event');
select throws_ok(
  $$select public.consume_rate_limit('0123456789abcdef', 1, 60)$$,
  '42501',
  null,
  'authenticated cannot consume the rate limit'
);
reset role;
select ok(public.consume_rate_limit(repeat('ab', 16), 1, 60), 'first rate-limit attempt is allowed');
select ok(not public.consume_rate_limit(repeat('ab', 16), 1, 60), 'the next attempt in the window is refused');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1600001-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'a1600001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.admin_account_action('a1600002-0000-4000-8000-000000000002', 'block', 'Please stop')$$,
  '42501',
  'Staff accounts cannot be blocked from here.',
  'staff cannot block another staff account'
);
select ok(
  (select blocked_at is null from public.profiles where id = 'a1600002-0000-4000-8000-000000000002'),
  'colleague stays active'
);
select ok(
  exists (
    select 1 from public.audit_log
    where action = 'account_staff_refused'
      and entity_id = 'a1600002-0000-4000-8000-000000000002'
      and actor_id = 'a1600001-0000-4000-8000-000000000001'
      and after->>'attempt' = 'block'
  ),
  'blocking a staff account is audited'
);
select throws_ok(
  $$select public.admin_account_action('a1600003-0000-4000-8000-000000000003', 'suspend', 'Review')$$,
  '42501',
  'Staff accounts cannot be blocked from here.',
  'staff cannot suspend an admin'
);
select throws_ok(
  $$select public.admin_account_action('a1600003-0000-4000-8000-000000000003', 'unblock', '')$$,
  '42501',
  'Staff accounts cannot be blocked from here.',
  'staff cannot unblock an admin'
);
select throws_ok(
  $$select public.admin_account_action('a1600001-0000-4000-8000-000000000001', 'block', 'Myself')$$,
  '42501',
  'You cannot restrict your own account',
  'staff cannot restrict their own account'
);
select ok(
  exists (
    select 1 from public.audit_log
    where action = 'account_self_refused'
      and entity_id = 'a1600001-0000-4000-8000-000000000001'
  ),
  'self-block attempt is audited'
);
select lives_ok(
  $$select public.admin_account_action('a1600004-0000-4000-8000-000000000004', 'suspend', 'Review required')$$,
  'staff can still suspend an attendee'
);
select lives_ok(
  $$select public.admin_account_action('a1600004-0000-4000-8000-000000000004', 'unblock', '')$$,
  'staff can unblock an attendee'
);

select throws_ok(
  $$update public.organisers set sales_paused = true where id = 'a1610001-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'staff cannot update sales flags without a column grant'
);
reset role;
grant update (sales_paused, payouts_on_hold) on public.organisers to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1600001-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'a1600001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$update public.organisers set payouts_on_hold = true where id = 'a1610001-0000-4000-8000-000000000001'$$,
  '42501',
  'You cannot change payouts or sales on your own organiser',
  'a column grant still cannot hold the staff member own organiser'
);
select throws_ok(
  $$update public.organisers set sales_paused = true where id = 'a1610002-0000-4000-8000-000000000002'$$,
  '42501',
  'You cannot change payouts or sales on your own organiser',
  'a membership cannot pause sales by updating the table'
);
reset role;
delete from public.organiser_members
where organiser_id = 'a1610002-0000-4000-8000-000000000002'
  and user_id = 'a1600001-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1600001-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'a1600001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$update public.organisers set sales_paused = true where id = 'a1610005-0000-4000-8000-000000000005'$$,
  '42501',
  'Use the audited admin functions',
  'another organiser still cannot be changed outside the audited function'
);
select lives_ok(
  $$select public.admin_organiser_control('a1610005-0000-4000-8000-000000000005', 'payouts_on_hold', true)$$,
  'the audited function can still hold another organiser'
);
select ok(
  exists (
    select 1 from public.audit_log
    where action = 'payouts_on_hold'
      and entity_id = 'a1610005-0000-4000-8000-000000000005'
      and after->>'payouts_on_hold' = 'true'
  ),
  'hold through the function is audited'
);
select throws_ok(
  $$select public.admin_organiser_control('a1610001-0000-4000-8000-000000000001', 'sales_paused', true)$$,
  '42501',
  'You cannot change payouts or sales on your own organiser',
  'the audited function still refuses the staff member own organiser'
);

reset role;
select ok(
  not has_function_privilege('authenticated', 'public.finish_refund(uuid, text, text)', 'execute'),
  'finish_refund stays off the authenticated role'
);
select ok(
  not has_function_privilege('authenticated', 'public.apply_payout_settlement(text, uuid, text, text, bigint, timestamptz, jsonb)', 'execute'),
  'payout settlement stays off the authenticated role'
);
select ok(
  (select count(*) from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'admin_private' and p.proname = 'organiser_control') = 1
  and to_regprocedure('public.admin_organiser_control(uuid, text, boolean)') is not null,
  'organiser control has one implementation and one wrapper'
);

select * from finish();
rollback;
