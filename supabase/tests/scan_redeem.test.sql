-- PR 13. scan_redeem checks a ticket in once, keeps the earliest offline scan,
-- and browser roles cannot call redeem_ticket or read team secrets.

begin;
select plan(53);

insert into auth.users (id, email) values
  ('a1300001-0000-4000-8000-000000000001', 'scan-owner@example.test'),
  ('a1300001-0000-4000-8000-000000000002', 'scan-door@example.test'),
  ('a1300001-0000-4000-8000-000000000003', 'scan-stranger@example.test'),
  ('a1300001-0000-4000-8000-000000000004', 'scan-invitee@example.test');

insert into public.organisers (id, owner_id, display_name, slug, kyc_status, approved_at)
values (
  'b1300002-0000-4000-8000-000000000001',
  'a1300001-0000-4000-8000-000000000001',
  'Scan tests',
  'scan-tests',
  'approved',
  now()
);

insert into public.events (id, organiser_id, slug, title, starts_at, city, status)
values
  (
    'c1300003-0000-4000-8000-000000000001',
    'b1300002-0000-4000-8000-000000000001',
    'scan-night',
    'Scan night',
    now() + interval '1 day',
    'Mumbai',
    'published'
  ),
  (
    'c1300003-0000-4000-8000-000000000002',
    'b1300002-0000-4000-8000-000000000001',
    'other-night',
    'Other night',
    now() + interval '2 days',
    'Pune',
    'published'
  );

insert into public.ticket_types (id, event_id, name, price_paise, qty_total)
values
  ('d1300004-0000-4000-8000-000000000001', 'c1300003-0000-4000-8000-000000000001', 'General Admission', 100000, 20),
  ('d1300004-0000-4000-8000-000000000002', 'c1300003-0000-4000-8000-000000000002', 'General Admission', 100000, 20);

insert into public.orders (
  id, event_id, buyer_name, buyer_email, subtotal_paise, total_paise, fee_payer, status, is_test
) values
  ('e1300005-0000-4000-8000-000000000001', 'c1300003-0000-4000-8000-000000000001', 'Asha', 'asha@example.test', 100000, 100000, 'organiser', 'paid', false),
  ('e1300005-0000-4000-8000-000000000002', 'c1300003-0000-4000-8000-000000000001', 'Test Buyer', 'test@example.test', 100000, 100000, 'organiser', 'paid', true),
  ('e1300005-0000-4000-8000-000000000003', 'c1300003-0000-4000-8000-000000000002', 'Other', 'other@example.test', 100000, 100000, 'organiser', 'paid', false),
  ('e1300005-0000-4000-8000-000000000004', 'c1300003-0000-4000-8000-000000000001', 'Void', 'void@example.test', 100000, 100000, 'organiser', 'paid', false);

insert into public.tickets (order_id, event_id, ticket_type_id, code, holder_name, qr_secret, status)
values
  ('e1300005-0000-4000-8000-000000000001', 'c1300003-0000-4000-8000-000000000001', 'd1300004-0000-4000-8000-000000000001', 'TK-SC001-01', 'Asha', 'v1', 'valid'),
  ('e1300005-0000-4000-8000-000000000001', 'c1300003-0000-4000-8000-000000000001', 'd1300004-0000-4000-8000-000000000001', 'TK-SC001-02', 'Ben', 'v1', 'valid'),
  ('e1300005-0000-4000-8000-000000000002', 'c1300003-0000-4000-8000-000000000001', 'd1300004-0000-4000-8000-000000000001', 'TK-SC001-03', 'Test Buyer', 'v1', 'valid'),
  ('e1300005-0000-4000-8000-000000000003', 'c1300003-0000-4000-8000-000000000002', 'd1300004-0000-4000-8000-000000000002', 'TK-SC002-01', 'Other', 'v1', 'valid'),
  ('e1300005-0000-4000-8000-000000000004', 'c1300003-0000-4000-8000-000000000001', 'd1300004-0000-4000-8000-000000000001', 'TK-SC001-04', 'Void', 'v1', 'void'),
  ('e1300005-0000-4000-8000-000000000001', 'c1300003-0000-4000-8000-000000000001', 'd1300004-0000-4000-8000-000000000001', 'TK-SC001-05', 'Service', 'v1', 'valid');

insert into public.event_team (event_id, user_id, role, invited_by)
values (
  'c1300003-0000-4000-8000-000000000001',
  'a1300001-0000-4000-8000-000000000002',
  'door',
  'a1300001-0000-4000-8000-000000000001'
);

insert into public.payouts (organiser_id, event_id, amount_paise, status)
values ('b1300002-0000-4000-8000-000000000001', 'c1300003-0000-4000-8000-000000000001', 5000000, 'scheduled');

insert into public.refunds (order_id, amount_paise, status)
values ('e1300005-0000-4000-8000-000000000001', 100000, 'requested');

select set_config('test.scan_early', (clock_timestamp() - interval '20 minutes')::text, true);
select set_config('test.scan_mid', (clock_timestamp() - interval '10 minutes')::text, true);
select set_config('test.scan_late', (clock_timestamp() - interval '5 minutes')::text, true);

select is(
  scan_private.format_ist('2026-11-07 12:30:00+00'::timestamptz),
  '7 Nov 2026, 6:00 PM IST',
  'check-in times use India Standard Time'
);

select ok(
  not has_function_privilege('authenticated', 'public.redeem_ticket(text, text, text)', 'execute'),
  'authenticated cannot execute redeem_ticket'
);
select ok(
  not has_function_privilege('anon', 'public.redeem_ticket(text, text, text)', 'execute'),
  'anon cannot execute redeem_ticket'
);
select ok(
  not has_function_privilege('authenticated', 'public.scan_redeem(text, uuid, text, timestamp with time zone, uuid)', 'execute'),
  'authenticated cannot execute scan_redeem'
);
select ok(
  not has_function_privilege('anon', 'public.scan_redeem(text, uuid, text, timestamp with time zone, uuid)', 'execute'),
  'anon cannot execute scan_redeem'
);
select ok(
  has_function_privilege('service_role', 'public.scan_redeem(text, uuid, text, timestamp with time zone, uuid)', 'execute'),
  'service role can execute scan_redeem'
);

set local role anon;
select throws_ok(
  $$select public.redeem_ticket('TK-SC001-01', 'forged', 'Gate')$$,
  '42501',
  'permission denied for function redeem_ticket',
  'anon call to redeem_ticket is revoked'
);
select throws_ok(
  $$select public.scan_redeem('TK-SC001-01', 'c1300003-0000-4000-8000-000000000001', 'phone-anon-0000000001', now(), 'a1300001-0000-4000-8000-000000000002')$$,
  '42501',
  'permission denied for function scan_redeem',
  'anon cannot redeem'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"a1300001-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.redeem_ticket('TK-SC001-01', 'forged', 'Gate')$$,
  '42501',
  'permission denied for function redeem_ticket',
  'authenticated call to redeem_ticket is revoked'
);
select throws_ok(
  $$select public.scan_redeem('TK-SC001-01', 'c1300003-0000-4000-8000-000000000001', 'phone-door-0000000001', now(), 'a1300001-0000-4000-8000-000000000002')$$,
  '42501',
  'permission denied for function scan_redeem',
  'authenticated cannot redeem directly'
);
select throws_ok(
  $$insert into public.scans (result) values ('ok')$$,
  '42501',
  'permission denied for table scans',
  'door cannot write the scan log'
);
select throws_ok(
  $$select token_hash from public.team_invites$$,
  '42501',
  'permission denied for table team_invites',
  'door cannot read invitation hashes'
);
select throws_ok(
  $$select device_id from public.scan_devices$$,
  '42501',
  'permission denied for table scan_devices',
  'door cannot read registered devices'
);
select is_empty($$select id from public.orders$$, 'door cannot read orders');
select is_empty($$select id from public.payouts$$, 'door cannot read payouts');
select is_empty($$select id from public.refunds$$, 'door cannot read refunds');
reset role;

select ok((select count(*) from public.orders) >= 1, 'order fixture exists for the financial check');
select ok((select count(*) from public.payouts) >= 1, 'payout fixture exists for the financial check');

select is(
  public.scan_redeem(
    'TK-SC001-01',
    'c1300003-0000-4000-8000-000000000001',
    'phone-door-0000000001',
    current_setting('test.scan_mid')::timestamptz,
    'a1300001-0000-4000-8000-000000000002'
  ),
  'Valid',
  'first scan checks the ticket in once'
);
select is(
  public.scan_redeem(
    'tk-sc001-01',
    'c1300003-0000-4000-8000-000000000001',
    'phone-door-0000000001',
    current_setting('test.scan_late')::timestamptz,
    'a1300001-0000-4000-8000-000000000002'
  ),
  'Already checked in at ' || scan_private.format_ist(current_setting('test.scan_mid')::timestamptz),
  'a later scan reports the earlier check-in time'
);
select is(
  (select status from public.tickets where code = 'TK-SC001-01'),
  'used'::public.ticket_status,
  'checked-in ticket is used'
);
select is(
  (select used_at from public.tickets where code = 'TK-SC001-01'),
  current_setting('test.scan_mid')::timestamptz,
  'the first scan time is kept'
);
select is(
  (select count(*)::integer from public.scans where ticket_id = (select id from public.tickets where code = 'TK-SC001-01') and result = 'ok'),
  1,
  'only the winning scan is ok'
);

select is(
  public.scan_redeem(
    'TK-SC001-02',
    'c1300003-0000-4000-8000-000000000001',
    'phone-door-0000000002',
    current_setting('test.scan_late')::timestamptz,
    'a1300001-0000-4000-8000-000000000002'
  ),
  'Valid',
  'a later offline scan can arrive first'
);
select is(
  public.scan_redeem(
    'TK-SC001-02',
    'c1300003-0000-4000-8000-000000000001',
    'phone-door-0000000001',
    current_setting('test.scan_early')::timestamptz,
    'a1300001-0000-4000-8000-000000000002'
  ),
  'Valid',
  'the earliest scanned_at wins'
);
select is(
  (select used_at from public.tickets where code = 'TK-SC001-02'),
  current_setting('test.scan_early')::timestamptz,
  'stored check-in is the earlier time'
);
select is(
  (select count(*)::integer from public.scans where ticket_id = (select id from public.tickets where code = 'TK-SC001-02') and result = 'ok'),
  1,
  'the later ok scan is no longer the winner'
);

select is(
  public.scan_redeem(
    'TK-SC002-01',
    'c1300003-0000-4000-8000-000000000001',
    'phone-door-0000000001',
    current_setting('test.scan_mid')::timestamptz,
    'a1300001-0000-4000-8000-000000000002'
  ),
  'Wrong event',
  'a ticket for another event is refused'
);
select is(
  (select status from public.tickets where code = 'TK-SC002-01'),
  'valid'::public.ticket_status,
  'wrong event does not check the ticket in'
);

select is(
  public.scan_redeem(
    'TK-SC001-03',
    'c1300003-0000-4000-8000-000000000001',
    'phone-door-0000000001',
    current_setting('test.scan_mid')::timestamptz,
    'a1300001-0000-4000-8000-000000000002'
  ),
  'Test ticket',
  'a test booking is not a real admission'
);
select is(
  (select status from public.tickets where code = 'TK-SC001-03'),
  'valid'::public.ticket_status,
  'a test ticket is not marked used'
);
select is(
  public.scan_redeem(
    'TK-SC001-03',
    'c1300003-0000-4000-8000-000000000001',
    'phone-door-0000000001',
    current_setting('test.scan_late')::timestamptz,
    'a1300001-0000-4000-8000-000000000002'
  ),
  'Test ticket',
  'a second test scan stays a test ticket'
);

select is(
  public.scan_redeem(
    'TK-SC009-99',
    'c1300003-0000-4000-8000-000000000001',
    'phone-door-0000000001',
    current_setting('test.scan_mid')::timestamptz,
    'a1300001-0000-4000-8000-000000000002'
  ),
  'Invalid',
  'an unknown code is invalid'
);
select is(
  (select count(*)::integer from public.scans where ticket_id is null and result = 'invalid'),
  1,
  'an unknown code is written to the scan log'
);
select is(
  public.scan_redeem(
    'TK-SC001-04',
    'c1300003-0000-4000-8000-000000000001',
    'phone-door-0000000001',
    current_setting('test.scan_mid')::timestamptz,
    'a1300001-0000-4000-8000-000000000002'
  ),
  'Invalid',
  'a void ticket is invalid'
);
select is(
  (select status from public.tickets where code = 'TK-SC001-04'),
  'void'::public.ticket_status,
  'an invalid scan does not change a void ticket'
);

select throws_ok(
  $$select public.scan_redeem(
    'TK-SC001-05',
    'c1300003-0000-4000-8000-000000000001',
    'phone-stranger-000001',
    now() - interval '1 minute',
    'a1300001-0000-4000-8000-000000000003'
  )$$,
  '42501',
  'not authorised to scan',
  'someone who is not on the team cannot scan'
);

select public.revoke_scan_device(
  (select id from public.scan_devices where device_id = 'phone-door-0000000001'),
  'a1300001-0000-4000-8000-000000000001'
);
select throws_ok(
  $$select public.scan_redeem(
    'TK-SC001-05',
    'c1300003-0000-4000-8000-000000000001',
    'phone-door-0000000001',
    now() - interval '1 minute',
    'a1300001-0000-4000-8000-000000000002'
  )$$,
  '42501',
  'This device is not authorised for this event.',
  'a revoked device cannot scan'
);
select ok(
  exists (
    select 1 from public.audit_log
    where action = 'scan_device_revoked' and actor_id = 'a1300001-0000-4000-8000-000000000001'
  ),
  'revoking a device is audited'
);

set local role service_role;
select is(
  public.scan_redeem(
    'TK-SC001-05',
    'c1300003-0000-4000-8000-000000000001',
    'phone-owner-000000001',
    now() - interval '1 minute',
    'a1300001-0000-4000-8000-000000000001'
  ),
  'Valid',
  'service role redeems through scan_redeem'
);
reset role;

select results_eq(
  $$select checked_in, total from public.scan_progress(
    'c1300003-0000-4000-8000-000000000001',
    'a1300001-0000-4000-8000-000000000002'
  )$$,
  $$select 3::integer, 3::integer$$,
  'the counter ignores test tickets and void tickets'
);

select set_config(
  'test.invite_hash',
  encode(extensions.digest(convert_to('invite-token-test-value-0123456789abcd', 'UTF8'), 'sha256'), 'hex'),
  true
);

select ok(
  public.create_team_invite(
    'c1300003-0000-4000-8000-000000000001',
    'scan-invitee@example.test',
    'door',
    'a1300001-0000-4000-8000-000000000001',
    current_setting('test.invite_hash')
  ) is not null,
  'organiser can invite a door scanner'
);
select ok(
  (select expires_at between now() + interval '71 hours' and now() + interval '73 hours'
   from public.team_invites where token_hash = current_setting('test.invite_hash')),
  'invitation expires in 72 hours'
);
select has_column('public', 'team_invites', 'token_hash', 'invitation stores a hash');
select hasnt_column('public', 'team_invites', 'token', 'invitation does not store the token');
select ok(
  exists (
    select 1 from public.audit_log
    where action = 'team_member_invited'
      and actor_id = 'a1300001-0000-4000-8000-000000000001'
      and after->>'email' = 'scan-invitee@example.test'
      and after->>'role' = 'door'
  ),
  'invite writes an audit row'
);

select is(
  public.accept_team_invite(current_setting('test.invite_hash'), 'a1300001-0000-4000-8000-000000000002'),
  'email',
  'the invitation only works for the invited email'
);
select is(
  public.accept_team_invite(current_setting('test.invite_hash'), 'a1300001-0000-4000-8000-000000000004'),
  'accepted|c1300003-0000-4000-8000-000000000001|door',
  'the invited person joins the team'
);
select is(
  public.accept_team_invite(current_setting('test.invite_hash'), 'a1300001-0000-4000-8000-000000000004'),
  'used',
  'the invitation cannot be used twice'
);
select ok(
  exists (
    select 1 from public.audit_log
    where action = 'team_member_accepted' and actor_id = 'a1300001-0000-4000-8000-000000000004'
  ),
  'accepting an invitation writes an audit row'
);

insert into public.team_invites (event_id, email, role, token_hash, invited_by, created_at, expires_at)
values (
  'c1300003-0000-4000-8000-000000000001',
  'scan-invitee@example.test',
  'door',
  encode(extensions.digest(convert_to('expired-invite-token-0123456789abcdef', 'UTF8'), 'sha256'), 'hex'),
  'a1300001-0000-4000-8000-000000000001',
  now() - interval '4 days',
  now() - interval '1 hour'
);
select is(
  public.accept_team_invite(
    encode(extensions.digest(convert_to('expired-invite-token-0123456789abcdef', 'UTF8'), 'sha256'), 'hex'),
    'a1300001-0000-4000-8000-000000000004'
  ),
  'expired',
  'an invitation older than 72 hours is refused'
);

select public.remove_event_team_member(
  (select id from public.event_team where user_id = 'a1300001-0000-4000-8000-000000000004'),
  'a1300001-0000-4000-8000-000000000001'
);
select is_empty(
  $$select id from public.event_team where user_id = 'a1300001-0000-4000-8000-000000000004'$$,
  'removed member is gone'
);
select ok(
  exists (
    select 1 from public.audit_log
    where action = 'team_member_removed' and actor_id = 'a1300001-0000-4000-8000-000000000001'
  ),
  'removing a member writes an audit row'
);

select * from finish();
rollback;
