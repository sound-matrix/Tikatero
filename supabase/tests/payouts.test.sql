begin;
select plan(47);

select is(
  payout_private.expected_payout_at('2026-11-06 12:30:00+00', 2, null),
  '2026-11-11 12:30:00+00'::timestamptz,
  'expected date skips the weekend after a Friday payment'
);
select is(
  payout_private.expected_payout_at('2026-11-06 12:30:00+00', 2, '2026-11-09 12:30:00+00'),
  '2026-11-11 12:30:00+00'::timestamptz,
  'known settlement uses payout days after that time'
);

insert into auth.users(id, email) values
  ('d1400001-0000-4000-8000-000000000001', 'payout-staff@example.test'),
  ('d1400002-0000-4000-8000-000000000002', 'payout-owner@example.test'),
  ('d1400003-0000-4000-8000-000000000003', 'payout-other@example.test'),
  ('d1400004-0000-4000-8000-000000000004', 'payout-door@example.test'),
  ('d1400005-0000-4000-8000-000000000005', 'payout-manager@example.test'),
  ('d1400006-0000-4000-8000-000000000006', 'payout-buyer@example.test');
update public.profiles set role = 'staff' where id = 'd1400001-0000-4000-8000-000000000001';

insert into public.organisers(id, owner_id, display_name, slug, kyc_status, approved_at, cashfree_vendor_id)
values
  ('d1410001-0000-4000-8000-000000000001', 'd1400002-0000-4000-8000-000000000002', 'Riverfront Live', 'payout-river', 'approved', now(), 'mock_vendor_d1410001000040008000000000000001'),
  ('d1410002-0000-4000-8000-000000000002', 'd1400003-0000-4000-8000-000000000003', 'Other Live', 'payout-other', 'approved', now(), null),
  ('d1410003-0000-4000-8000-000000000003', 'd1400001-0000-4000-8000-000000000001', 'Staff Own Live', 'payout-staff-own', 'approved', now(), null);

insert into public.events(id, organiser_id, slug, title, starts_at, status, is_free)
values
  ('d1420001-0000-4000-8000-000000000001', 'd1410001-0000-4000-8000-000000000001', 'payout-river-night', 'River night', now() + interval '2 days', 'published', false),
  ('d1420002-0000-4000-8000-000000000002', 'd1410002-0000-4000-8000-000000000002', 'payout-other-night', 'Other night', now() + interval '3 days', 'published', false);

insert into public.ticket_types(id, event_id, name, price_paise, qty_total, qty_sold, is_vip)
values
  ('d1430001-0000-4000-8000-000000000001', 'd1420001-0000-4000-8000-000000000001', 'General', 100000, 10, 2, false),
  ('d1430002-0000-4000-8000-000000000002', 'd1420001-0000-4000-8000-000000000001', 'VIP', 200000, 5, 0, true);

insert into public.event_team(event_id, user_id, role) values
  ('d1420001-0000-4000-8000-000000000001', 'd1400004-0000-4000-8000-000000000004', 'door'),
  ('d1420001-0000-4000-8000-000000000001', 'd1400005-0000-4000-8000-000000000005', 'manager');

insert into public.pricing_versions(id, platform_pct, fixed_fee_paise, gst_bps, gateway_mode, gateway_bps, payout_days, effective_from)
values (
  'd1440001-0000-4000-8000-000000000001', 150, 500, 1800, 'absorb', 195, 2, now() - interval '10 days'
);

insert into public.orders(
  id, event_id, buyer_id, buyer_name, buyer_email, subtotal_paise, platform_fee_paise,
  platform_fee_gst_paise, gateway_fee_paise, total_paise, fee_payer, status,
  organiser_share_paise, platform_share_paise, is_test, pricing_version_id
) values
  (
    'd1450001-0000-4000-8000-000000000001', 'd1420001-0000-4000-8000-000000000001',
    'd1400006-0000-4000-8000-000000000006', 'Buyer', 'payout-buyer@example.test',
    100000, 2000, 360, 2301, 100000, 'organiser', 'pending',
    95339, 2360, false, '00000000-0000-4000-8000-000000000010'
  ),
  (
    'd1450002-0000-4000-8000-000000000002', 'd1420001-0000-4000-8000-000000000001',
    'd1400006-0000-4000-8000-000000000006', 'Buyer', 'payout-buyer@example.test',
    10000, 0, 0, 0, 10000, 'organiser', 'pending',
    10000, 0, true, '00000000-0000-4000-8000-000000000010'
  ),
  (
    'd1450003-0000-4000-8000-000000000003', 'd1420001-0000-4000-8000-000000000001',
    'd1400006-0000-4000-8000-000000000006', 'Buyer', 'payout-buyer@example.test',
    0, 0, 0, 0, 0, 'organiser', 'pending',
    0, 0, false, '00000000-0000-4000-8000-000000000010'
  ),
  (
    'd1450004-0000-4000-8000-000000000004', 'd1420001-0000-4000-8000-000000000001',
    'd1400006-0000-4000-8000-000000000006', 'Buyer', 'payout-buyer@example.test',
    100, 200, 0, 0, 100, 'organiser', 'pending',
    -100, 200, false, '00000000-0000-4000-8000-000000000010'
  ),
  (
    'd1450005-0000-4000-8000-000000000005', 'd1420001-0000-4000-8000-000000000001',
    'd1400006-0000-4000-8000-000000000006', 'Buyer', 'payout-buyer@example.test',
    100000, 2000, 360, 0, 100000, 'organiser', 'pending',
    97640, 2360, false, 'd1440001-0000-4000-8000-000000000001'
  ),
  (
    'd1450006-0000-4000-8000-000000000006', 'd1420002-0000-4000-8000-000000000002',
    'd1400006-0000-4000-8000-000000000006', 'Buyer', 'payout-buyer@example.test',
    5000, 0, 0, 0, 5000, 'organiser', 'pending',
    5000, 0, false, '00000000-0000-4000-8000-000000000010'
  );

insert into public.order_items(order_id, ticket_type_id, qty, unit_price_paise)
values ('d1450005-0000-4000-8000-000000000005', 'd1430001-0000-4000-8000-000000000001', 1, 100000);
update public.orders
set status = 'paid', paid_at = '2026-11-06 12:30:00+00'
where id in (
  'd1450001-0000-4000-8000-000000000001',
  'd1450002-0000-4000-8000-000000000002',
  'd1450003-0000-4000-8000-000000000003',
  'd1450004-0000-4000-8000-000000000004',
  'd1450005-0000-4000-8000-000000000005',
  'd1450006-0000-4000-8000-000000000006'
);

insert into public.tickets(order_id, event_id, ticket_type_id, code, qr_secret, status, used_at)
values
  ('d1450001-0000-4000-8000-000000000001', 'd1420001-0000-4000-8000-000000000001', 'd1430001-0000-4000-8000-000000000001', 'TK-PAY01-01', 'v1', 'valid', null),
  ('d1450001-0000-4000-8000-000000000001', 'd1420001-0000-4000-8000-000000000001', 'd1430001-0000-4000-8000-000000000001', 'TK-PAY01-02', 'v1', 'used', now());

select is((select count(*)::integer from public.payouts where order_id = 'd1450001-0000-4000-8000-000000000001'), 1, 'one payout for a positive share');
select is((select amount_paise from public.payouts where order_id = 'd1450001-0000-4000-8000-000000000001'), 95339::bigint, 'payout uses the stored organiser share');
select is((select is_test from public.payouts where order_id = 'd1450002-0000-4000-8000-000000000002'), true, 'test orders are labelled as test payouts');
select is((select expected_at from public.payouts where order_id = 'd1450001-0000-4000-8000-000000000001'), '2026-11-11 12:30:00+00'::timestamptz, 'payout expected date matches the working-day window');
select lives_ok($$select payout_private.schedule_order_payout('d1450001-0000-4000-8000-000000000001')$$, 'scheduling again is safe');
select is((select count(*)::integer from public.payouts where order_id = 'd1450001-0000-4000-8000-000000000001'), 1, 'one order cannot create a second payout');
select is((select count(*)::integer from public.payouts where order_id = 'd1450003-0000-4000-8000-000000000003'), 0, 'zero share is not a payout');
select is((select count(*)::integer from public.payouts where order_id = 'd1450004-0000-4000-8000-000000000004'), 0, 'negative share is not a payout');
select ok(exists(select 1 from public.payout_exceptions where order_id = 'd1450004-0000-4000-8000-000000000004'), 'negative share is flagged for staff');
select is((select amount_paise from public.payouts where order_id = 'd1450005-0000-4000-8000-000000000005'), 97640::bigint, 'absorb mode does not reduce the organiser payout');
select is((select absorbed_gateway_paise from public.orders where id = 'd1450005-0000-4000-8000-000000000005'), 2301::bigint, 'absorb mode records the gateway cost separately');
select throws_ok($$insert into public.payouts(organiser_id, amount_paise) values ('d1410001-0000-4000-8000-000000000001', 0)$$, '23514', null, 'payout insert rejects a zero amount');
select throws_ok($$insert into public.payouts(organiser_id, amount_paise) values ('d1410001-0000-4000-8000-000000000001', -1)$$, '23514', null, 'payout insert rejects a negative amount');

set local role anon;
select throws_ok($$select id from public.payouts$$, '42501', null, 'anonymous cannot read payouts');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1400006-0000-4000-8000-000000000006","role":"authenticated"}', true);
select throws_ok($$select organiser_share_paise from public.orders$$, '42501', null, 'attendees cannot read organiser share');
select throws_ok($$select platform_fee_paise from public.orders$$, '42501', null, 'attendees cannot read the platform fee');
select is((select count(*)::integer from public.payouts), 0, 'attendees cannot read payouts');
select is((select count(*)::integer from public.orders), 6, 'attendees can still read their own order rows');
select throws_ok($$select public.organiser_event_sales('d1420001-0000-4000-8000-000000000001')$$, '42501', 'You cannot view sales for this event.', 'attendees cannot open the event dashboard');
select throws_ok($$select * from public.admin_gateway_reconciliation()$$, '42501', 'Staff access required', 'attendees cannot read gateway costs');

select set_config('request.jwt.claims', '{"sub":"d1400004-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::integer from public.payouts), 0, 'door staff cannot read payouts');
select throws_ok($$select gateway_fee_paise from public.orders$$, '42501', null, 'door staff cannot read gateway fees');
select throws_ok($$select public.organiser_event_sales('d1420001-0000-4000-8000-000000000001')$$, '42501', 'You cannot view sales for this event.', 'door staff cannot open sales');

select set_config('request.jwt.claims', '{"sub":"d1400002-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.payouts), 3, 'organiser sees only their payouts');
select is_empty($$select id from public.payouts where organiser_id = 'd1410002-0000-4000-8000-000000000002'$$, 'organiser cannot read another organiser payout');
select is(
  (public.organiser_event_sales('d1420001-0000-4000-8000-000000000001')->>'organiser_share_paise')::bigint,
  (97640 + 95339 - 100)::bigint,
  'event sales add the stored shares and leave out the test booking'
);
select is(
  (public.organiser_event_sales('d1420001-0000-4000-8000-000000000001')->>'to_be_paid_paise')::bigint,
  (95339 + 97640)::bigint,
  'money still to be paid leaves out test payouts'
);
select is(
  (public.organiser_event_sales('d1420001-0000-4000-8000-000000000001')->>'checked_in')::integer,
  1,
  'check-ins count used tickets only'
);
select throws_ok($$select public.organiser_event_sales('d1420002-0000-4000-8000-000000000002')$$, '42501', null, 'organiser cannot open another organiser event');

select set_config('request.jwt.claims', '{"sub":"d1400005-0000-4000-8000-000000000005","role":"authenticated"}', true);
select lives_ok($$select public.organiser_event_sales('d1420001-0000-4000-8000-000000000001')$$, 'event manager can open sales');
select is((select count(*)::integer from public.payouts), 0, 'event manager is not given the payout ledger');

select set_config('request.jwt.claims', '{"sub":"d1400001-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.admin_organiser_control('d1410003-0000-4000-8000-000000000003', 'payouts_on_hold', true)$$,
  '42501',
  'You cannot change payouts or sales on your own organiser',
  'staff cannot hold their own organiser'
);
select throws_ok(
  $$select public.admin_organiser_control('d1410003-0000-4000-8000-000000000003', 'sales_paused', true)$$,
  '42501',
  'You cannot change payouts or sales on your own organiser',
  'staff cannot pause sales on their own organiser'
);
select lives_ok(
  $$select public.admin_organiser_control('d1410001-0000-4000-8000-000000000001', 'payouts_on_hold', true)$$,
  'staff can hold another organiser'
);
select is((select count(*)::integer from public.payouts where organiser_id = 'd1410001-0000-4000-8000-000000000001' and status = 'on_hold'), 3, 'open payouts are held');
select ok(exists(select 1 from public.audit_log where action = 'payouts_on_hold' and entity_id = 'd1410001-0000-4000-8000-000000000001' and after->>'payouts_on_hold' = 'true'), 'hold is audited');
reset role;
update public.payouts set status = 'settled', settled_at = now() where order_id = 'd1450002-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1400001-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.admin_organiser_control('d1410001-0000-4000-8000-000000000001', 'payouts_on_hold', false)$$,
  'staff can release another organiser'
);
select is((select status::text from public.payouts where order_id = 'd1450001-0000-4000-8000-000000000001'), 'scheduled', 'released payouts return to scheduled');
select is((select status::text from public.payouts where order_id = 'd1450002-0000-4000-8000-000000000002'), 'settled', 'settled payouts stay settled');
select is((select platform_net_paise from public.admin_gateway_reconciliation() where order_id = 'd1450005-0000-4000-8000-000000000005'), 59::bigint, 'platform net subtracts only the absorbed gateway cost');

reset role;
select is((public.apply_payout_settlement('split-event-1', 'd1450001-0000-4000-8000-000000000001', 'settled', 'split-ref-1', 95339, '2026-11-11 12:30:00+00', '{"type":"settled"}'::jsonb)->>'outcome'), 'settled', 'settlement marks the payout paid');
select is((public.apply_payout_settlement('split-event-1', 'd1450001-0000-4000-8000-000000000001', 'settled', 'split-ref-1', 95339, '2026-11-11 12:30:00+00', '{"type":"settled"}'::jsonb)->>'outcome'), 'duplicate', 'the same settlement is ignored');
select is((public.apply_payout_settlement('split-event-2', 'd1450001-0000-4000-8000-000000000001', 'failed', 'split-ref-2', 1, null, '{}'::jsonb)->>'outcome'), 'mismatch', 'a different amount does not change the payout');
select is((select amount_paise from public.payouts where order_id = 'd1450001-0000-4000-8000-000000000001'), 95339::bigint, 'organiser share stays the stored amount');
select is((select status::text from public.payouts where order_id = 'd1450001-0000-4000-8000-000000000001'), 'settled', 'a mismatched settlement cannot undo paid');

select * from finish();
rollback;
