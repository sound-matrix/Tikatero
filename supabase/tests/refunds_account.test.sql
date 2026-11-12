begin;
select plan(40);

insert into auth.users (id, email) values
  ('e1500001-0000-4000-8000-000000000001', 'refund-buyer@example.test'),
  ('e1500001-0000-4000-8000-000000000002', 'refund-other@example.test'),
  ('e1500001-0000-4000-8000-000000000003', 'refund-owner@example.test'),
  ('e1500001-0000-4000-8000-000000000004', 'refund-door@example.test'),
  ('e1500001-0000-4000-8000-000000000005', 'refund-staff@example.test'),
  ('e1500001-0000-4000-8000-000000000006', 'refund-clean@example.test'),
  ('e1500001-0000-4000-8000-000000000007', 'refund-stranger@example.test');
update public.profiles set role = 'staff', full_name = 'Staff Owner' where id = 'e1500001-0000-4000-8000-000000000005';
update public.profiles set full_name = 'Buyer A' where id = 'e1500001-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Buyer B' where id = 'e1500001-0000-4000-8000-000000000002';
update public.profiles set full_name = 'Clean Person' where id = 'e1500001-0000-4000-8000-000000000006';

insert into public.organisers (id, owner_id, display_name, slug, kyc_status, approved_at, cashfree_vendor_id)
values
  ('e1510001-0000-4000-8000-000000000001', 'e1500001-0000-4000-8000-000000000003', 'Refund Live', 'refund-live', 'approved', now(), 'mock_vendor_e1510001000040008000000000000001'),
  ('e1510001-0000-4000-8000-000000000002', 'e1500001-0000-4000-8000-000000000007', 'Other Live', 'refund-other', 'approved', now(), null),
  ('e1510001-0000-4000-8000-000000000003', 'e1500001-0000-4000-8000-000000000005', 'Staff Own', 'refund-staff', 'approved', now(), null);

insert into public.events (id, organiser_id, slug, title, starts_at, status, refund_policy, is_free)
values
  ('e1520001-0000-4000-8000-000000000001', 'e1510001-0000-4000-8000-000000000001', 'refund-soon', 'Refund Soon', now() + interval '80 hours', 'published', '72h', false),
  ('e1520001-0000-4000-8000-000000000002', 'e1510001-0000-4000-8000-000000000001', 'refund-close', 'Refund Close', now() + interval '71 hours', 'published', '72h', false),
  ('e1520001-0000-4000-8000-000000000003', 'e1510001-0000-4000-8000-000000000001', 'refund-none', 'No Refunds', now() + interval '10 days', 'published', 'none', false),
  ('e1520001-0000-4000-8000-000000000004', 'e1510001-0000-4000-8000-000000000001', 'refund-custom', 'Custom Refunds', now() + interval '10 days', 'published', 'custom: Email the organiser', false),
  ('e1520001-0000-4000-8000-000000000005', 'e1510001-0000-4000-8000-000000000002', 'refund-hidden', 'Hidden Night', now() + interval '10 days', 'published', '72h', false),
  ('e1520001-0000-4000-8000-000000000006', 'e1510001-0000-4000-8000-000000000003', 'refund-staff-own', 'Staff Night', now() + interval '10 days', 'published', '72h', false);

insert into public.ticket_types (id, event_id, name, price_paise, qty_total)
values
  ('e1530001-0000-4000-8000-000000000001', 'e1520001-0000-4000-8000-000000000001', 'General', 100000, 20),
  ('e1530001-0000-4000-8000-000000000002', 'e1520001-0000-4000-8000-000000000002', 'General', 100000, 20),
  ('e1530001-0000-4000-8000-000000000003', 'e1520001-0000-4000-8000-000000000003', 'General', 100000, 20),
  ('e1530001-0000-4000-8000-000000000004', 'e1520001-0000-4000-8000-000000000004', 'General', 100000, 20),
  ('e1530001-0000-4000-8000-000000000005', 'e1520001-0000-4000-8000-000000000005', 'General', 100000, 20),
  ('e1530001-0000-4000-8000-000000000006', 'e1520001-0000-4000-8000-000000000006', 'General', 100000, 20);

insert into public.event_team (event_id, user_id, role)
values ('e1520001-0000-4000-8000-000000000001', 'e1500001-0000-4000-8000-000000000004', 'door');

insert into public.orders (
  id, event_id, buyer_id, buyer_name, buyer_email, subtotal_paise, platform_fee_paise,
  platform_fee_gst_paise, gateway_fee_paise, total_paise, fee_payer, status, paid_at,
  organiser_share_paise, platform_share_paise, is_test
) values
  ('e1540001-0000-4000-8000-000000000001', 'e1520001-0000-4000-8000-000000000001', 'e1500001-0000-4000-8000-000000000001', 'Buyer A', 'refund-buyer@example.test', 100000, 8000, 0, 2000, 100000, 'organiser', 'paid', now(), 90000, 8000, true),
  ('e1540001-0000-4000-8000-000000000002', 'e1520001-0000-4000-8000-000000000002', 'e1500001-0000-4000-8000-000000000001', 'Buyer A', 'refund-buyer@example.test', 100000, 8000, 0, 2000, 100000, 'organiser', 'paid', now(), 90000, 8000, true),
  ('e1540001-0000-4000-8000-000000000003', 'e1520001-0000-4000-8000-000000000003', 'e1500001-0000-4000-8000-000000000001', 'Buyer A', 'refund-buyer@example.test', 100000, 8000, 0, 2000, 100000, 'organiser', 'paid', now(), 90000, 8000, true),
  ('e1540001-0000-4000-8000-000000000004', 'e1520001-0000-4000-8000-000000000004', 'e1500001-0000-4000-8000-000000000001', 'Buyer A', 'refund-buyer@example.test', 100000, 8000, 0, 2000, 100000, 'organiser', 'paid', now(), 90000, 8000, true),
  ('e1540001-0000-4000-8000-000000000005', 'e1520001-0000-4000-8000-000000000001', 'e1500001-0000-4000-8000-000000000001', 'Buyer A', 'refund-buyer@example.test', 100000, 8000, 0, 2000, 100000, 'organiser', 'paid', now(), 90000, 8000, false),
  ('e1540001-0000-4000-8000-000000000006', 'e1520001-0000-4000-8000-000000000005', 'e1500001-0000-4000-8000-000000000002', 'Buyer B', 'refund-other@example.test', 5000, 0, 0, 0, 5000, 'organiser', 'paid', now(), 5000, 0, false),
  ('e1540001-0000-4000-8000-000000000007', 'e1520001-0000-4000-8000-000000000006', 'e1500001-0000-4000-8000-000000000001', 'Buyer A', 'refund-buyer@example.test', 100000, 8000, 0, 2000, 100000, 'organiser', 'paid', now(), 90000, 8000, true),
  ('e1540001-0000-4000-8000-000000000008', 'e1520001-0000-4000-8000-000000000001', 'e1500001-0000-4000-8000-000000000001', 'Buyer A', 'refund-buyer@example.test', 100000, 8000, 0, 2000, 100000, 'organiser', 'paid', now(), 90000, 8000, true);

insert into public.tickets (id, order_id, event_id, ticket_type_id, code, holder_name, qr_secret, status)
values
  ('e1550001-0000-4000-8000-000000000001', 'e1540001-0000-4000-8000-000000000001', 'e1520001-0000-4000-8000-000000000001', 'e1530001-0000-4000-8000-000000000001', 'TK-RF001-01', 'Buyer A', 'v1', 'valid'),
  ('e1550001-0000-4000-8000-000000000002', 'e1540001-0000-4000-8000-000000000005', 'e1520001-0000-4000-8000-000000000001', 'e1530001-0000-4000-8000-000000000001', 'TK-RF002-01', 'Buyer A', 'v1', 'valid'),
  ('e1550001-0000-4000-8000-000000000003', 'e1540001-0000-4000-8000-000000000005', 'e1520001-0000-4000-8000-000000000001', 'e1530001-0000-4000-8000-000000000001', 'TK-RF002-02', 'Buyer A', 'v1', 'valid'),
  ('e1550001-0000-4000-8000-000000000004', 'e1540001-0000-4000-8000-000000000004', 'e1520001-0000-4000-8000-000000000004', 'e1530001-0000-4000-8000-000000000004', 'TK-RF003-01', 'Buyer A', 'v1', 'valid'),
  ('e1550001-0000-4000-8000-000000000005', 'e1540001-0000-4000-8000-000000000008', 'e1520001-0000-4000-8000-000000000001', 'e1530001-0000-4000-8000-000000000001', 'TK-RF004-01', 'Buyer A', 'v1', 'valid'),
  ('e1550001-0000-4000-8000-000000000006', 'e1540001-0000-4000-8000-000000000006', 'e1520001-0000-4000-8000-000000000005', 'e1530001-0000-4000-8000-000000000005', 'TK-RF005-01', 'Buyer B', 'secret-qr', 'valid');

select throws_ok(
  $$insert into public.refunds (order_id, amount_paise) values ('e1540001-0000-4000-8000-000000000001', 0)$$,
  '23514',
  null,
  'refund insert rejects a zero amount'
);
select throws_ok(
  $$insert into public.refunds (order_id, amount_paise) values ('e1540001-0000-4000-8000-000000000001', -1)$$,
  '23514',
  null,
  'refund insert rejects a negative amount'
);

select is(refund_private.scaled_paise(50000, 95339, 100000, 0, 0), 47669::bigint, 'partial reversal uses integer paise');
select is(refund_private.scaled_paise(50000, 95339, 100000, 47669, 50000), 47670::bigint, 'the completing refund takes the leftover paise');

select ok(
  not has_function_privilege('authenticated', 'public.finish_refund(uuid, text, text)', 'execute'),
  'buyers cannot finish a refund directly'
);
select ok(
  not has_function_privilege('anon', 'public.refund_action(text, uuid, uuid, bigint, uuid[], text, text, boolean)', 'execute'),
  'anon cannot request a refund'
);

select set_config('request.jwt.claims', '{"sub":"e1500001-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.refund_action('issue', 'e1540001-0000-4000-8000-000000000001', null, 100000, null, 'door', 'organiser', false)$$,
  '42501',
  null,
  'door staff cannot issue a refund'
);
select throws_ok(
  $$select organiser_share_paise from public.orders$$,
  '42501',
  null,
  'door staff cannot read fee columns'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"e1500001-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.refund_action('request', 'e1540001-0000-4000-8000-000000000002', null, null, null, 'too soon', 'organiser', false)$$,
  'P0001',
  'There is no refund for a cancellation at this time.',
  'a request 71 hours before the start is refused'
);
select throws_ok(
  $$select public.refund_action('request', 'e1540001-0000-4000-8000-000000000003', null, null, null, 'none', 'organiser', false)$$,
  'P0001',
  'This event does not offer refunds.',
  'a none policy has no buyer refund'
);
select ok(
  (public.refund_action('request', 'e1540001-0000-4000-8000-000000000004', null, null, null, 'please', 'organiser', false)->>'needs_provider')::boolean = false,
  'a custom policy waits for approval'
);
select is(
  (select status from public.tickets where id = 'e1550001-0000-4000-8000-000000000004'),
  'valid'::public.ticket_status,
  'a custom request leaves the ticket valid'
);
select is(
  (public.refund_action('request', 'e1540001-0000-4000-8000-000000000001', null, null, null, 'window', 'organiser', false)->>'needs_provider')::boolean,
  false,
  'a 72 hour request waits for approval'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"e1500001-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select public.refund_action('approve', null,
  (select id from public.refunds where order_id = 'e1540001-0000-4000-8000-000000000001'),
  null, null, null, 'organiser', false);
reset role;

select is(
  (public.finish_refund(
    (select id from public.refunds where order_id = 'e1540001-0000-4000-8000-000000000001' and status = 'approved'),
    'test_e1540001000040008000000000000001',
    'processed'
  )->>'outcome'),
  'processed',
  'test refund is processed'
);
select is(
  (select status from public.orders where id = 'e1540001-0000-4000-8000-000000000001'),
  'refunded'::public.order_status,
  'the order is refunded'
);
select is(
  (select status from public.tickets where id = 'e1550001-0000-4000-8000-000000000001'),
  'refunded'::public.ticket_status,
  'the ticket cannot be used'
);
select is(
  (select status from public.payouts where order_id = 'e1540001-0000-4000-8000-000000000001'),
  'cancelled'::public.payout_status,
  'a scheduled payout is not paid after a full refund'
);
select is(
  (select is_test from public.payouts where order_id = 'e1540001-0000-4000-8000-000000000001'),
  true,
  'the cancelled payout stays labelled as a test'
);
select is(
  (public.finish_refund(
    (select id from public.refunds where order_id = 'e1540001-0000-4000-8000-000000000001'),
    'test_e1540001000040008000000000000001',
    'processed'
  )->>'outcome'),
  'duplicate',
  'repeating the same refund id is a no-op'
);
select is(
  (select count(*) from public.payouts where order_id = 'e1540001-0000-4000-8000-000000000001'),
  1::bigint,
  'a refund does not create a second payout'
);

update public.payouts set status = 'settled', settled_at = now()
where order_id = 'e1540001-0000-4000-8000-000000000008';
select set_config('request.jwt.claims', '{"sub":"e1500001-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select public.refund_action(
  'issue', 'e1540001-0000-4000-8000-000000000008', null, 100000, null, 'goodwill', 'organiser', false
);
reset role;
select public.finish_refund(
  (select id from public.refunds where order_id = 'e1540001-0000-4000-8000-000000000008' and status = 'approved'),
  'test_e1540001000040008000000000000008',
  'processed'
);
select is(
  (select status from public.payouts where order_id = 'e1540001-0000-4000-8000-000000000008'),
  'settled'::public.payout_status,
  'an already paid payout is not rewritten'
);
select is(
  (select count(*) from public.payout_refund_exceptions where order_id = 'e1540001-0000-4000-8000-000000000008'),
  1::bigint,
  'a paid refund is recorded as an exception'
);

select set_config('request.jwt.claims', '{"sub":"e1500001-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select public.refund_action(
  'issue',
  'e1540001-0000-4000-8000-000000000005',
  null,
  40000,
  array['e1550001-0000-4000-8000-000000000002']::uuid[],
  'partial',
  'organiser',
  false
);
reset role;
select public.finish_refund(
  (select id from public.refunds where order_id = 'e1540001-0000-4000-8000-000000000005' and status = 'approved'),
  'test_e1540001000040008000000000000005',
  'processed'
);
select is(
  (select status from public.orders where id = 'e1540001-0000-4000-8000-000000000005'),
  'partially_refunded'::public.order_status,
  'a smaller refund is partial'
);
select is(
  (select amount_paise from public.payouts where order_id = 'e1540001-0000-4000-8000-000000000005'),
  54000::bigint,
  'the unpaid organiser share is reduced and not paid twice'
);
select is(
  (select status from public.tickets where id = 'e1550001-0000-4000-8000-000000000002'),
  'refunded'::public.ticket_status,
  'the unused ticket in the partial refund is refunded'
);
select is(
  (select status from public.tickets where id = 'e1550001-0000-4000-8000-000000000003'),
  'valid'::public.ticket_status,
  'a ticket left out of the partial refund stays valid'
);

select set_config('request.jwt.claims', '{"sub":"e1500001-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is_empty(
  $$select id from public.refunds$$,
  'another buyer cannot see these refunds'
);
select is_empty(
  $$select id from public.orders where id = 'e1540001-0000-4000-8000-000000000001'$$,
  'another buyer cannot see the order'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"e1500001-0000-4000-8000-000000000007","role":"authenticated"}', true);
set local role authenticated;
select is_empty(
  $$select id from public.orders where event_id = 'e1520001-0000-4000-8000-000000000001'$$,
  'another organiser cannot see these orders'
);
reset role;

set local role anon;
select throws_ok(
  $$select * from public.refund_tickets$$,
  '42501',
  null,
  'anon cannot read refund tickets'
);
select throws_ok(
  $$select * from public.payout_refund_exceptions$$,
  '42501',
  null,
  'anon cannot read payout refund exceptions'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"e1500001-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select ok(
  (public.export_my_account()::text) like '%Buyer A%',
  'the buyer can export their own name'
);
select ok(
  position('refund-other@example.test' in public.export_my_account()::text) = 0,
  'the export has no other buyer'
);
select ok(
  position('secret-qr' in public.export_my_account()::text) = 0
    and position('vendor' in public.export_my_account()::text) = 0,
  'the export has no secrets or vendor ids'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"e1500001-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.delete_my_account()$$,
  'P0001',
  'You still have upcoming tickets. Those bookings must be refunded or used before you can delete your account.',
  'deletion waits until upcoming tickets are refunded or used'
);
reset role;
select is(
  (select full_name from public.profiles where id = 'e1500001-0000-4000-8000-000000000002'),
  'Buyer B',
  'deleting one account does not touch someone else'
);

select set_config('request.jwt.claims', '{"sub":"e1500001-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.refund_action('issue', 'e1540001-0000-4000-8000-000000000007', null, 100000, null, 'own', 'staff', false)$$,
  '42501',
  'You belong to this organiser. Confirm you are refunding your own organiser.',
  'staff must confirm a refund on their own organiser'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"e1500001-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select is((public.delete_my_account()->>'outcome'), 'deleted', 'a clear account can be deleted');
reset role;
select is(
  (select full_name from public.profiles where id = 'e1500001-0000-4000-8000-000000000006'),
  'Deleted account',
  'deletion anonymizes that profile'
);
select is(
  (select full_name from public.profiles where id = 'e1500001-0000-4000-8000-000000000002'),
  'Buyer B',
  'the other profile is still intact'
);

select * from finish();
rollback;
