begin;
select plan(28);

insert into auth.users (id, email) values
  ('c1200001-0000-4000-8000-000000000001', 'ticket-buyer@example.test'),
  ('c1200001-0000-4000-8000-000000000002', 'ticket-stranger@example.test'),
  ('c1200001-0000-4000-8000-000000000003', 'ticket-owner@example.test');
insert into public.organisers (id, owner_id, display_name, slug, kyc_status, approved_at, cashfree_vendor_id)
values (
  'c1200002-0000-4000-8000-000000000001',
  'c1200001-0000-4000-8000-000000000003',
  'Ticket tests',
  'ticket-tests',
  'approved',
  now(),
  'test-vendor'
);
insert into public.events (
  id, organiser_id, slug, title, starts_at, gates_open_at, venue_name, address, city, status, capacity
) values (
  'c1200003-0000-4000-8000-000000000001',
  'c1200002-0000-4000-8000-000000000001',
  'ticket-tests',
  'Ticket test night',
  now() + interval '2 days',
  now() + interval '2 days' - interval '30 minutes',
  'NSCI Dome',
  'Worli',
  'Mumbai',
  'published',
  20
);
insert into public.ticket_types (id, event_id, name, price_paise, qty_total, is_vip, sort) values
  ('c1200004-0000-4000-8000-000000000001', 'c1200003-0000-4000-8000-000000000001', 'General', 100000, 20, false, 1),
  ('c1200004-0000-4000-8000-000000000002', 'c1200003-0000-4000-8000-000000000001', 'VIP', 200000, 20, true, 0);
insert into public.orders (
  id, event_id, buyer_id, buyer_name, buyer_email, subtotal_paise, total_paise, fee_payer, status, is_test, attendee_names
) values (
  'c1200005-0000-4000-8000-000000000001',
  'c1200003-0000-4000-8000-000000000001',
  'c1200001-0000-4000-8000-000000000001',
  'Buyer',
  'ticket-buyer@example.test',
  300000,
  300000,
  'organiser',
  'paid',
  true,
  '["Asha","Ben"]'::jsonb
);
insert into public.order_items (order_id, ticket_type_id, qty, unit_price_paise) values
  ('c1200005-0000-4000-8000-000000000001', 'c1200004-0000-4000-8000-000000000002', 1, 200000),
  ('c1200005-0000-4000-8000-000000000001', 'c1200004-0000-4000-8000-000000000001', 2, 100000);
insert into public.order_outbox (order_id, topic, payload)
values (
  'c1200005-0000-4000-8000-000000000001',
  'order.paid',
  '{"order_id":"c1200005-0000-4000-8000-000000000001","is_test":true,"payment_provider":"mock"}'::jsonb
);

select is(public.issue_tickets('c1200005-0000-4000-8000-000000000001'), 3, 'issues one ticket per seat');
select is(public.issue_tickets('c1200005-0000-4000-8000-000000000001'), 3, 'second call returns the same count');
select is(
  (select count(*)::integer from public.tickets where order_id = 'c1200005-0000-4000-8000-000000000001'),
  3,
  'second call does not add tickets'
);
select ok((
  select count(distinct split_part(code, '-', 2)) = 1
    and bool_and(code ~ '^TK-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{5}-[0-9]{2}$')
    and bool_and(qr_secret = 'v1')
    and bool_and(code = 'TK-' || split_part(code, '-', 2) || '-' || lpad(seq::text, 2, '0'))
  from public.tickets
  where order_id = 'c1200005-0000-4000-8000-000000000001'
), 'one Crockford prefix and key version v1');
select is(
  (select holder_name from public.tickets where order_id = 'c1200005-0000-4000-8000-000000000001' and seq = 1),
  'Asha',
  'first seat uses the first attendee name'
);
select is(
  (select ticket_type_id from public.tickets where order_id = 'c1200005-0000-4000-8000-000000000001' and seq = 1),
  'c1200004-0000-4000-8000-000000000002'::uuid,
  'lower sort tier is seated first'
);
select is(
  (select holder_name from public.tickets where order_id = 'c1200005-0000-4000-8000-000000000001' and seq = 3),
  'Buyer',
  'a missing attendee name falls back to the buyer'
);
select ok((
  select consumed_at is not null
  from public.order_outbox
  where order_id = 'c1200005-0000-4000-8000-000000000001' and topic = 'order.paid'
), 'order.paid is consumed');

insert into public.orders (
  id, event_id, buyer_id, buyer_name, buyer_email, subtotal_paise, total_paise, fee_payer, status
) values (
  'c1200005-0000-4000-8000-000000000002',
  'c1200003-0000-4000-8000-000000000001',
  'c1200001-0000-4000-8000-000000000001',
  'Buyer',
  'ticket-buyer@example.test',
  100000,
  100000,
  'organiser',
  'paid'
);
insert into public.order_items (order_id, ticket_type_id, qty, unit_price_paise)
values ('c1200005-0000-4000-8000-000000000002', 'c1200004-0000-4000-8000-000000000001', 1, 100000);
insert into public.order_outbox (order_id, topic, payload) values
  ('c1200005-0000-4000-8000-000000000002', 'order.paid', '{"order_id":"c1200005-0000-4000-8000-000000000002"}'::jsonb),
  ('c1200005-0000-4000-8000-000000000002', 'payment.review_required', '{"reason":"late"}'::jsonb);
select is(public.issue_tickets('c1200005-0000-4000-8000-000000000002'), 0, 'review required produces no tickets');
select is(
  (select count(*)::integer from public.tickets where order_id = 'c1200005-0000-4000-8000-000000000002'),
  0,
  'review required leaves the ticket table empty'
);
select is(
  (select consumed_at is null from public.order_outbox where order_id = 'c1200005-0000-4000-8000-000000000002' and topic = 'order.paid'),
  true,
  'review required does not consume order.paid'
);

insert into public.orders (
  id, event_id, buyer_id, buyer_name, buyer_email, subtotal_paise, total_paise, fee_payer, status
) values (
  'c1200005-0000-4000-8000-000000000003',
  'c1200003-0000-4000-8000-000000000001',
  'c1200001-0000-4000-8000-000000000001',
  'Buyer',
  'ticket-buyer@example.test',
  100000,
  100000,
  'organiser',
  'pending'
);
insert into public.order_outbox (order_id, topic, payload)
values ('c1200005-0000-4000-8000-000000000003', 'order.paid', '{}'::jsonb);
select is(public.issue_tickets('c1200005-0000-4000-8000-000000000003'), 0, 'a pending order is not issued');

select ok(public.ticket_code_prefix() ~ '^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$', 'prefix generator stays in Crockford');

select public.checkout_hold(
  'c1200005-0000-4000-8000-000000000004',
  'c1200001-0000-4000-8000-000000000001',
  'ticket-tests',
  'Buyer',
  'ticket-buyer@example.test',
  '9876543210',
  jsonb_build_array(jsonb_build_object('id', 'c1200004-0000-4000-8000-000000000001', 'qty', 1, 'price_paise', 100000)),
  (select id from public.active_pricing_version()),
  'organiser',
  false,
  jsonb_build_object(
    'subtotal', 100000,
    'platform_fee', 2000,
    'platform_fee_gst', 360,
    'gateway_fee', 2301,
    'buyer_total', 100000,
    'organiser_share', 95339,
    'platform_share', 2360
  ),
  'cashfree',
  'synthetic-hash',
  '[]'::jsonb,
  true
);
select is(
  public.checkout_transition('c1200005-0000-4000-8000-000000000004', 'paid', 100000, 'INR'),
  'paid',
  'checkout paid transition is ready to issue'
);
select is(public.issue_tickets('c1200005-0000-4000-8000-000000000004'), 1, 'paid checkout issues one ticket');
select is(public.issue_tickets('c1200005-0000-4000-8000-000000000004'), 1, 'replaying checkout issue does not add a ticket');

set local role service_role;
select is(public.issue_tickets('c1200005-0000-4000-8000-000000000001'), 3, 'service role can issue');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1200001-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.tickets where event_id = 'c1200003-0000-4000-8000-000000000001'),
  4,
  'buyer reads own tickets'
);
select lives_ok($$select seq from public.tickets$$, 'buyer can read the seat number');
select throws_ok($$select qr_secret from public.tickets$$, '42501', null, 'buyer cannot read the key version');
select throws_ok($$select pdf_key from public.tickets$$, '42501', null, 'buyer cannot read the PDF key');
select throws_ok(
  $$insert into public.tickets (order_id, event_id, ticket_type_id, code, qr_secret)
    values ('c1200005-0000-4000-8000-000000000001','c1200003-0000-4000-8000-000000000001','c1200004-0000-4000-8000-000000000001','TK-ZZZZZ-01','v1')$$,
  '42501',
  null,
  'buyer cannot insert tickets'
);
select throws_ok($$update public.tickets set holder_name = 'Nope'$$, '42501', null, 'buyer cannot update tickets');
select throws_ok(
  $$select public.issue_tickets('c1200005-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'buyer cannot issue tickets'
);
select throws_ok(
  $$select public.release_failed_order_email('order/c1200005-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'buyer cannot release email claims'
);
select set_config('request.jwt.claims', '{"sub":"c1200001-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.tickets where event_id = 'c1200003-0000-4000-8000-000000000001'),
  0,
  'stranger cannot read tickets'
);
select set_config('request.jwt.claims', '{"sub":"c1200001-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.tickets where event_id = 'c1200003-0000-4000-8000-000000000001'),
  4,
  'organiser can read event tickets'
);
set local role anon;
select throws_ok($$select code from public.tickets$$, '42501', null, 'public cannot read tickets');

select * from finish();
rollback;
