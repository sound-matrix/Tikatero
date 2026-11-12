begin;
select no_plan();
alter table public.orders alter column payout_mode set default 'gateway_split';

insert into auth.users(id, email) values
  ('f2400000-0000-4000-8000-000000000001', 'pr24-admin@example.test'),
  ('f2400000-0000-4000-8000-000000000002', 'pr24-host@example.test'),
  ('f2400000-0000-4000-8000-000000000003', 'pr24-buyer@example.test'),
  ('f2400000-0000-4000-8000-000000000004', 'pr24-door@example.test'),
  ('f2400000-0000-4000-8000-000000000005', 'pr24-other@example.test');
update public.profiles set role = 'admin' where id = 'f2400000-0000-4000-8000-000000000001';
insert into public.organisers(id, owner_id, display_name, slug, kyc_status, approved_at)
values
  ('f2410000-0000-4000-8000-000000000001','f2400000-0000-4000-8000-000000000002','PR24 Host','pr24-host','approved',now()),
  ('f2410000-0000-4000-8000-000000000002','f2400000-0000-4000-8000-000000000005','PR24 Other','pr24-other','approved',now());
insert into public.events(id, organiser_id, slug, title, starts_at, status, refund_policy, capacity)
values
  ('f2420000-0000-4000-8000-000000000001','f2410000-0000-4000-8000-000000000001','pr24-event','PR24 Event', now() + interval '5 days','published','72h',15),
  ('f2420000-0000-4000-8000-000000000002','f2410000-0000-4000-8000-000000000001','pr24-cancel','PR24 Cancelled', now() + interval '2 days','published','72h',null);
insert into public.event_team(event_id, user_id, role)
values ('f2420000-0000-4000-8000-000000000001','f2400000-0000-4000-8000-000000000004','door');
insert into public.ticket_types(id,event_id,name,price_paise,qty_total,qty_sold)
values ('f2430000-0000-4000-8000-000000000001','f2420000-0000-4000-8000-000000000001','General',150001,20,3);

select is(refund_private.percent_at('[{"min_hours_before":168,"refund_percent":100},{"min_hours_before":72,"refund_percent":50},{"min_hours_before":0,"refund_percent":0}]', 168), 100, 'Exactly seven days receives 100%');
select is(refund_private.percent_at('[{"min_hours_before":168,"refund_percent":100},{"min_hours_before":72,"refund_percent":50},{"min_hours_before":0,"refund_percent":0}]', 167), 50, 'Just under seven days receives 50%');
select is(refund_private.percent_at('[{"min_hours_before":72,"refund_percent":50},{"min_hours_before":0,"refund_percent":0}]', 71), 0, 'Just under three days receives 0%');

select set_config('request.jwt.claim.sub','f2400000-0000-4000-8000-000000000002',true);
set local role authenticated;
select lives_ok($$
  select public.save_event_wizard('f2420000-0000-4000-8000-000000000001','f2410000-0000-4000-8000-000000000001',
    0, 6, 6, '{"fee_payer":"organiser","refund_policy":"schedule","refund_rules":[{"min_hours_before":168,"refund_percent":100},{"min_hours_before":72,"refund_percent":50},{"min_hours_before":0,"refund_percent":0}]}')
$$, 'Owner saves schedule in the wizard');
select throws_ok($$
  select public.admin_pause_refunds('f2420000-0000-4000-8000-000000000001',true,'Host cannot pause.')
$$, '42501', null, 'Host cannot pause');
select throws_ok($$
  update public.events set refund_policy = 'none' where id = 'f2420000-0000-4000-8000-000000000001'
$$, '42501', null, 'Direct event update cannot bypass the rules RPC');
reset role;

insert into public.orders(id,event_id,buyer_id,buyer_name,buyer_email,subtotal_paise,total_paise,
    platform_fee_paise,organiser_share_paise,platform_share_paise,fee_payer,status,paid_at,is_test,hold_expires_at)
values
  ('f2440000-0000-4000-8000-000000000001','f2420000-0000-4000-8000-000000000001','f2400000-0000-4000-8000-000000000003','Buyer','pr24-buyer@example.test',150001,150001,15001,135000,15001,'organiser','paid',now(),false,null),
  ('f2440000-0000-4000-8000-000000000002','f2420000-0000-4000-8000-000000000001','f2400000-0000-4000-8000-000000000003','Buyer','pr24-buyer@example.test',150001,150001,15001,135000,15001,'organiser','paid',now(),false,null),
  ('f2440000-0000-4000-8000-000000000003','f2420000-0000-4000-8000-000000000001','f2400000-0000-4000-8000-000000000003','Test','pr24-buyer@example.test',150001,150001,15001,135000,15001,'organiser','paid',now(),true,null),
  ('f2440000-0000-4000-8000-000000000004','f2420000-0000-4000-8000-000000000001','f2400000-0000-4000-8000-000000000003','Hold','pr24-buyer@example.test',150001,150001,15001,135000,15001,'organiser','pending',null,false,now() + interval '10 minutes'),
  ('f2440000-0000-4000-8000-000000000005','f2420000-0000-4000-8000-000000000002','f2400000-0000-4000-8000-000000000003','Buyer','pr24-buyer@example.test',150001,150001,15001,135000,15001,'organiser','paid',now(),false,null);

insert into public.order_items(order_id,ticket_type_id,qty,unit_price_paise)
select id, 'f2430000-0000-4000-8000-000000000001', 1, 150001 from public.orders
where event_id = 'f2420000-0000-4000-8000-000000000001';
insert into public.tickets(order_id,event_id,ticket_type_id,code,qr_secret)
values
  ('f2440000-0000-4000-8000-000000000001','f2420000-0000-4000-8000-000000000001','f2430000-0000-4000-8000-000000000001','TK-RF240-01','pr24'),
  ('f2440000-0000-4000-8000-000000000002','f2420000-0000-4000-8000-000000000001','f2430000-0000-4000-8000-000000000001','TK-RF240-02','pr24');

select set_config('request.jwt.claim.sub','f2400000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((public.buyer_refund_quote('f2440000-0000-4000-8000-000000000001')->>'amount')::bigint,
  75000::bigint, 'Fifty percent of 150001 paise rounds down');
select is(public.refund_action('request','f2440000-0000-4000-8000-000000000001',null,null,null,null,'organiser',false)->>'needs_provider',
  'false', 'Buyer cancellation waits for a decision');
select is((select status::text from public.refunds where order_id = 'f2440000-0000-4000-8000-000000000001'),
  'requested','Buyer cancellation is stored as requested');
select throws_ok($$
  select public.buyer_refund_quote('f2440000-0000-4000-8000-000000000005')
$$,'P0001','There is no refund for a cancellation at this time.','Zero percent blocks a request');
reset role;

select set_config('request.jwt.claim.sub','f2400000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok($$
  select public.admin_save_refund_rules('f2420000-0000-4000-8000-000000000001','none','[]',false,'Too strict.')
$$, 'P0001', 'People have already booked under these rules, so you can only make them more generous.', 'Even admin cannot tighten sold rules');
select lives_ok($$
  select public.admin_save_refund_rules('f2420000-0000-4000-8000-000000000001','schedule',
    '[{"min_hours_before":120,"refund_percent":100},{"min_hours_before":72,"refund_percent":60},{"min_hours_before":0,"refund_percent":0}]',
    true,'Offer more money back.')
$$,'Admin can extend the window and increase the amount');
select public.admin_pause_refunds('f2420000-0000-4000-8000-000000000001',true,'Review refunds.');
reset role;

select set_config('request.jwt.claim.sub','f2400000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is(public.refund_action('request','f2440000-0000-4000-8000-000000000002',null,null,null,null,'organiser',false)->>'needs_provider',
  'false', 'Paused refunds accept requests but ignore automatic approval');
reset role;
select is((select offered_paise from public.refunds where order_id = 'f2440000-0000-4000-8000-000000000001'),
  75000::bigint,'A rule change preserves a saved offer');

select set_config('request.jwt.claim.sub','f2400000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$
  select public.refund_action('approve',null,(select id from public.refunds where order_id = 'f2440000-0000-4000-8000-000000000001'),null,null,null,'organiser',false)
$$,'P0001','Refunds are on hold for this event.','Event pause blocks approval');
reset role;

select set_config('request.jwt.claim.sub','f2400000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.admin_pause_refunds('f2420000-0000-4000-8000-000000000001',false,'Review finished.');
reset role;
select set_config('request.jwt.claim.sub','f2400000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$
  select public.refund_action('approve',null,(select id from public.refunds where order_id = 'f2440000-0000-4000-8000-000000000001'),50000,null,null,'organiser',false)
$$,'22023','Enter a reason of up to 300 characters.','Reducing an offer requires a reason');
select public.refund_action('approve',null,(select id from public.refunds where order_id = 'f2440000-0000-4000-8000-000000000001'),
  50000,null,'Agreed with the buyer.','organiser',false);
select public.refund_action('approve',null,(select id from public.refunds where order_id = 'f2440000-0000-4000-8000-000000000002'),
  150001,null,null,'organiser',false);
reset role;

select set_config('request.jwt.claim.sub','f2400000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.admin_pause_refunds(null,true,'Site stop.');
select is(public.admin_emergency_cancel_event('f2420000-0000-4000-8000-000000000002','Venue unavailable.','PR24 Cancelled',false)
  #>> '{refunds,0,needs_provider}', 'false', 'Cancellation queues the full refund during the site stop');
reset role;
select is((select count(*) from public.queued_event_refunds(100)),0::bigint,'Paused site has no dispatchable refunds');
select is(public.claim_refund_dispatch((select id from public.refunds where order_id = 'f2440000-0000-4000-8000-000000000005'),
  'f2440000-0000-4000-8000-000000000005'),'paused','Dispatch itself checks the site stop');

set local role authenticated;
select public.admin_pause_refunds(null,false,'Site reopened.');
reset role;
select is((select count(*) from public.queued_event_refunds(100) where event_id in ('f2420000-0000-4000-8000-000000000001','f2420000-0000-4000-8000-000000000002')),3::bigint,'Resume releases the approved queue');
select is(public.claim_refund_dispatch((select id from public.refunds where order_id = 'f2440000-0000-4000-8000-000000000005'),
  'f2440000-0000-4000-8000-000000000005'),'claimed','Cancellation refund can be claimed after resume');
select is(public.claim_refund_dispatch((select id from public.refunds where order_id = 'f2440000-0000-4000-8000-000000000005'),
  'f2440000-0000-4000-8000-000000000005'),'skip','A concurrent worker cannot claim the same refund');

select public.finish_refund((select id from public.refunds where order_id = 'f2440000-0000-4000-8000-000000000002'), 'pr24-full', 'processed');
-- The partial refund is approved. Its earnings entry is posted on completion.
update public.payouts set status = 'settled', settled_at = now() where order_id = 'f2440000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','f2400000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(public.organiser_event_sales('f2420000-0000-4000-8000-000000000001')#>>'{live,tickets_sold}', '1','One real ticket remains after a full refund');
select is(public.organiser_event_sales('f2420000-0000-4000-8000-000000000001')#>>'{live,tickets_left}', '18','Test ticket is excluded from inventory reporting');
select is(public.organiser_event_sales('f2420000-0000-4000-8000-000000000001')#>>'{live,qty_held}', '1','The active hold is counted separately');
select is(public.organiser_event_sales('f2420000-0000-4000-8000-000000000001')#>>'{live,share_paise}', '135000','Earnings reflect refunds that have completed');
select is(public.organiser_event_sales('f2420000-0000-4000-8000-000000000001')#>>'{live,paid_out_paise}', '135000','Paid amounts are recorded in earnings');
select is(jsonb_array_length(public.event_excel_rows('f2420000-0000-4000-8000-000000000001',false)->'orders'),2,'Excel only includes real paid orders');
select ok(public.event_excel_rows('f2420000-0000-4000-8000-000000000001',false)::text not like '%@example.test%', 'Excel rows do not include email addresses');
reset role;

select public.finish_refund((select id from public.refunds where order_id = 'f2440000-0000-4000-8000-000000000001'), 'pr24-partial', 'processed');
select set_config('request.jwt.claim.sub','f2400000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok($$
  select public.buyer_refund_quote('f2440000-0000-4000-8000-000000000001')
$$, 'P0001', 'You have already cancelled this booking.', 'A partial cancellation cannot repeatedly claim the balance');
reset role;

select set_config('request.jwt.claim.sub','f2400000-0000-4000-8000-000000000004',true);
set local role authenticated;
select throws_ok($$select public.organiser_event_sales('f2420000-0000-4000-8000-000000000001')$$,'42501',null,'Door staff cannot view sales');
reset role;
select set_config('request.jwt.claim.sub','f2400000-0000-4000-8000-000000000005',true);
set local role authenticated;
select throws_ok($$select public.organiser_event_sales('f2420000-0000-4000-8000-000000000001')$$,'42501',null,'Another organiser cannot view sales');
select throws_ok($$
  select public.save_event_wizard('f2420000-0000-4000-8000-000000000001','f2410000-0000-4000-8000-000000000002',
    2,6,6,'{"fee_payer":"organiser","refund_policy":"none"}')
$$,'42501',null,'Another organiser cannot change these rules');
reset role;

select * from finish();
rollback;
