begin;
select plan(40);

insert into auth.users(id,email) values
 ('e2210000-0000-4000-8000-000000000001','moderation-host@example.test'),
 ('e2210000-0000-4000-8000-000000000002','moderation-staff@example.test'),
 ('e2210000-0000-4000-8000-000000000003','moderation-admin@example.test'),
 ('e2210000-0000-4000-8000-000000000004','moderation-buyer@example.test');
update public.profiles set role='staff' where id='e2210000-0000-4000-8000-000000000002';
update public.profiles set role='admin' where id='e2210000-0000-4000-8000-000000000003';
insert into public.organisers(id,owner_id,slug,display_name,kyc_status,approved_at) values
 ('e2220000-0000-4000-8000-000000000001','e2210000-0000-4000-8000-000000000001','moderation-host','Concert Hosts','approved',now());
insert into public.events(id,organiser_id,slug,title,status,starts_at) values
 ('e2230000-0000-4000-8000-000000000001','e2220000-0000-4000-8000-000000000001','moderation-show','Music Night','published',now()+interval '10 days'),
 ('e2230000-0000-4000-8000-000000000002','e2220000-0000-4000-8000-000000000001','moderation-draft','Test draft','draft',null),
 ('e2230000-0000-4000-8000-000000000003','e2220000-0000-4000-8000-000000000001','moderation-emergency','Emergency Show','published',now()+interval '10 days');
insert into public.ticket_types(id,event_id,name,price_paise,qty_total,qty_sold) values
 ('e2240000-0000-4000-8000-000000000001','e2230000-0000-4000-8000-000000000001','General',10000,20,1),
 ('e2240000-0000-4000-8000-000000000002','e2230000-0000-4000-8000-000000000002','General',10000,20,0);
insert into public.orders(id,event_id,buyer_id,buyer_name,buyer_email,subtotal_paise,total_paise,organiser_share_paise,fee_payer,status,paid_at,payment_provider,is_test)
values
 ('e2250000-0000-4000-8000-000000000001','e2230000-0000-4000-8000-000000000001','e2210000-0000-4000-8000-000000000004','Buyer','moderation-buyer@example.test',10000,10000,10000,'organiser','paid',now(),'mock',true),
 ('e2250000-0000-4000-8000-000000000002','e2230000-0000-4000-8000-000000000001','e2210000-0000-4000-8000-000000000004','Buyer','moderation-buyer@example.test',10000,10000,10000,'organiser','pending',null,'mock',true);
insert into public.checkout_holds(order_id,ticket_type_id,qty,expires_at)
values ('e2250000-0000-4000-8000-000000000002','e2240000-0000-4000-8000-000000000001',1,now()+interval '5 minutes');
insert into public.tickets(order_id,event_id,ticket_type_id,code,holder_name,qr_secret)
values ('e2250000-0000-4000-8000-000000000001','e2230000-0000-4000-8000-000000000001','e2240000-0000-4000-8000-000000000001','TK-EV001-01','Buyer','test-sig');

select set_config('request.jwt.claims','{"sub":"e2210000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.cancel_event_refunds('e2230000-0000-4000-8000-000000000001','cancel','organiser',false)$$,'42501','Ask Tikatero to cancel this event.','host cannot cancel directly');
select throws_ok($$select public.admin_delete_event('e2230000-0000-4000-8000-000000000002','delete')$$,'42501',null,'host cannot call admin delete');
select throws_ok($$delete from public.events where slug='moderation-draft'$$,'42501',null,'host cannot delete the draft directly');
select is((select capacity from public.save_event_wizard(
 'e2230000-0000-4000-8000-000000000001','e2220000-0000-4000-8000-000000000001',0,5,5,
 '{"capacity":2,"tiers":[{"id":"e2240000-0000-4000-8000-000000000001","name":"General","price_paise":10000,"qty_total":20,"is_vip":false,"sort":0}]}',false)),2,'wizard saves the total across ticket types');
select throws_ok($$select * from public.save_event_wizard(
 'e2230000-0000-4000-8000-000000000001','e2220000-0000-4000-8000-000000000001',1,5,5,'{"capacity":1,"tiers":[]}',false)$$,
 'P0001','You''ve already sold or reserved 2 seats, so total seats can''t be less than 2.','holds and sold seats stop the limit being lowered');
select lives_ok($$select public.hide_event('e2230000-0000-4000-8000-000000000001','Not ready yet')$$,'host hides the event');
select is((select count(*) from public.discovery_events where slug='moderation-show'),0::bigint,'even the host cannot see it in public discovery');
select throws_ok($$update public.events set status='published' where slug='moderation-show'$$,'42501',null,'host cannot bypass hide through a direct update');
reset role;
select is((select status::text from public.tickets where code='TK-EV001-01'),'valid','hiding keeps the buyer ticket valid');
select is((select count(*) from public.refunds where order_id='e2250000-0000-4000-8000-000000000001'),0::bigint,'hiding does not open refunds');
set local role authenticated;
select lives_ok($$select public.unhide_event('e2230000-0000-4000-8000-000000000001')$$,'host unhides their event');
select is((select count(*) from public.discovery_events where slug='moderation-show'),1::bigint,'unhiding restores discovery');
select lives_ok($$select public.request_event_removal('e2230000-0000-4000-8000-000000000001','Venue closed')$$,'host requests removal');
select is((select count(*) from public.event_removal_requests where status='pending'),1::bigint,'host can read its own pending request');
select throws_ok($$select public.request_event_removal('e2230000-0000-4000-8000-000000000001','Again')$$,'23505',null,'only one request may be pending');
select throws_ok($$update public.event_removal_requests set status='approved'$$,'42501',null,'host cannot decide a request directly');
select throws_ok($$select public.admin_decide_event_removal((select id from public.event_removal_requests where status='pending'),'approved','')$$,'42501',null,'host cannot call staff review');
select lives_ok($$select public.withdraw_event_removal((select id from public.event_removal_requests where status='pending'))$$,'host withdraws a pending request');
select is((select status from public.event_removal_requests),'withdrawn','request history keeps withdrawal');
select lives_ok($$select public.request_event_removal('e2230000-0000-4000-8000-000000000001','Venue closed')$$,'host can submit a new request after withdrawal');
reset role;

select set_config('request.jwt.claims','{"sub":"e2210000-0000-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.event_removal_requests),0::bigint,'another account cannot read the request');
reset role;
select set_config('request.jwt.claims','{"sub":"e2210000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.admin_event_review_list('Concert Hosts','','removal',0)),1::bigint,'staff can filter pending requests by organiser');
select lives_ok($$select public.admin_decide_event_removal((select id from public.event_removal_requests where status='pending'),'rejected','Please confirm the new venue.')$$,'staff rejects with a note');
select lives_ok($$select public.hide_event('e2230000-0000-4000-8000-000000000003','Safety',true,false)$$,'staff can hide an event for safety');
select throws_ok($$select public.admin_emergency_cancel_event('e2230000-0000-4000-8000-000000000003','Safety','Emergency Show')$$,'42501',null,'ordinary staff cannot emergency cancel');
reset role;
select is((select status::text from public.events where slug='moderation-show'),'unpublished','rejected event stays hidden');
select set_config('request.jwt.claims','{"sub":"e2210000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.unhide_event('e2230000-0000-4000-8000-000000000003')$$,'42501',null,'host cannot undo a staff hide');
select public.request_event_removal('e2230000-0000-4000-8000-000000000001','Venue closed');
reset role;
select set_config('request.jwt.claims','{"sub":"e2210000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((public.admin_decide_event_removal((select id from public.event_removal_requests where status='pending'),'approved','')->>'status'),'approved','staff approves and cancels atomically');
select lives_ok($$select public.admin_decide_event_removal((select id from public.event_removal_requests where status='approved'),'approved','')$$,'approval retries are idempotent');
reset role;
select is((select count(*) from public.refunds where order_id='e2250000-0000-4000-8000-000000000001' and status='approved' and amount_paise=10000),1::bigint,'one full refund remains queued');
select is((select status::text from public.payouts where order_id='e2250000-0000-4000-8000-000000000001'),'cancelled','cancelled event is removed from payouts before refund processing');
select is((public.apply_payout_settlement('settlement:moderation','e2250000-0000-4000-8000-000000000001','settled','split',10000,now(),'{}')->>'outcome'),'unchanged','payout updates cannot reopen a cancelled payout');
select is(public.checkout_transition('e2250000-0000-4000-8000-000000000002','paid',10000,'INR'),'paid','a late captured payment is recorded');
select is((select count(*) from public.refunds where order_id='e2250000-0000-4000-8000-000000000002' and status='approved'),1::bigint,'late payment has one queued refund');

select set_config('request.jwt.claims','{"sub":"e2210000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.admin_delete_event('e2230000-0000-4000-8000-000000000001','delete')$$,'22023',null,'events with orders cannot be deleted even after cancellation');
select throws_ok($$select public.cancel_event_refunds('e2230000-0000-4000-8000-000000000003','Safety','staff',false)$$,'42501',null,'even an admin must use emergency confirmation without an approved request');
select throws_ok($$select public.admin_emergency_cancel_event('e2230000-0000-4000-8000-000000000003','Safety','Wrong title')$$,'22023',null,'emergency cancellation requires the exact title');
select is((public.admin_emergency_cancel_event('e2230000-0000-4000-8000-000000000003','Safety','Emergency Show')->>'outcome'),'cancelled','admin can emergency cancel with the correct title');
select lives_ok($$select public.admin_delete_event('e2230000-0000-4000-8000-000000000002','Test draft')$$,'admin deletes a draft with no orders');
reset role;
select is((select count(*) from public.audit_log where entity='events' and entity_id='e2230000-0000-4000-8000-000000000002' and action='event_deleted' and before->>'title'='Test draft'),1::bigint,'deletion leaves an audit snapshot');

select * from finish();
rollback;
