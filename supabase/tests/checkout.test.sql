begin;
select plan(35);
insert into auth.users(id,email) values
 ('cb110001-0000-4000-8000-000000000001','checkout-owner@example.test'),
 ('cb110002-0000-4000-8000-000000000002','checkout-buyer@example.test'),
 ('cb110003-0000-4000-8000-000000000003','checkout-stranger@example.test');
insert into public.organisers(id,owner_id,display_name,slug,kyc_status,approved_at,cashfree_vendor_id)
 values('cb112001-0000-4000-8000-000000000001','cb110001-0000-4000-8000-000000000001','Checkout tests','checkout-tests','approved',now(),'test-vendor');
insert into public.events(id,organiser_id,slug,title,starts_at,status,capacity)
 values('cb113001-0000-4000-8000-000000000001','cb112001-0000-4000-8000-000000000001','checkout-tests','Checkout test',now()+interval '1 day','published',10);
insert into public.ticket_types(id,event_id,name,price_paise,qty_total,per_order_max)
 values('cb114001-0000-4000-8000-000000000001','cb113001-0000-4000-8000-000000000001','General',100000,10,10);
create function pg_temp.hold_checkout(order_id uuid,qty integer default 1) returns jsonb language sql as $$
 select public.checkout_hold(order_id,'cb110002-0000-4000-8000-000000000002','checkout-tests','Checkout Buyer','checkout-buyer@example.test','9876543210',jsonb_build_array(jsonb_build_object('id','cb114001-0000-4000-8000-000000000001','qty',qty,'price_paise',100000)),(select id from public.active_pricing_version()),'organiser',false,jsonb_build_object('subtotal',qty*100000,'platform_fee',qty*2000,'platform_fee_gst',qty*360,'gateway_fee',qty*2301,'buyer_total',qty*100000,'organiser_share',qty*95339,'platform_share',qty*2360),'cashfree','synthetic-hash','[]',true);
$$;
select lives_ok($$select pg_temp.hold_checkout('cb115001-0000-4000-8000-000000000001',10)$$,'atomic hold accepts remaining ten seats');
select throws_ok($$update public.events set capacity=9 where id='cb113001-0000-4000-8000-000000000001'$$,'P0001',null,'capacity cannot shrink below held seats');
select throws_ok($$select pg_temp.hold_checkout('cb115009-0000-4000-8000-000000000009',11)$$,'P0001',null,'per-order maximum enforced');
select is((select qty_sold from public.ticket_types where id='cb114001-0000-4000-8000-000000000001'),0,'hold is not a sale');
select throws_ok($$select pg_temp.hold_checkout('cb115002-0000-4000-8000-000000000002')$$,'P0001',null,'another checkout cannot oversell held seats');
select throws_ok($$update public.ticket_types set qty_total=9 where id='cb114001-0000-4000-8000-000000000001'$$,'P0001',null,'organiser cannot shrink held inventory');
select throws_ok($$select public.checkout_transition('cb115001-0000-4000-8000-000000000001','paid',1,'INR')$$,'P0001',null,'incorrect payment amount rejected');
select is((select status::text from public.orders where id='cb115001-0000-4000-8000-000000000001'),'pending','incorrect amount leaves state unchanged');
create function pg_temp.fail_paid_outbox() returns trigger language plpgsql as $$ begin if new.topic='order.paid' then raise exception 'forced outbox failure'; end if;return new;end; $$;
create trigger checkout_test_outbox_failure before insert on public.order_outbox for each row execute function pg_temp.fail_paid_outbox();
select throws_ok($$select public.checkout_transition('cb115001-0000-4000-8000-000000000001','paid',1000000,'INR')$$,'P0001','forced outbox failure','outbox failure rolls back the paid transition');
select is((select qty_sold from public.ticket_types where id='cb114001-0000-4000-8000-000000000001'),0,'outbox failure rolls back the inventory decrement');
drop trigger checkout_test_outbox_failure on public.order_outbox;
select is(public.checkout_transition('cb115001-0000-4000-8000-000000000001','paid',1000000,'INR','test-payment','cashfree','test-success','{}'),'paid','signed success marks paid');
select is(public.checkout_transition('cb115001-0000-4000-8000-000000000001','paid',1000000,'INR','test-payment','cashfree','test-success','{}'),'paid','duplicate webhook succeeds idempotently');
select is(public.checkout_transition('cb115001-0000-4000-8000-000000000001','paid',1000000,'INR'),'paid','poller racing webhook is idempotent');
select is((select qty_sold from public.ticket_types where id='cb114001-0000-4000-8000-000000000001'),10,'paid inventory decremented exactly once');
select is((select count(*)::integer from public.order_outbox where order_id='cb115001-0000-4000-8000-000000000001' and topic='order.paid'),1,'one order.paid outbox row');
select is((select count(*)::integer from public.webhook_events where source='cashfree' and event_id='test-success'),1,'one processed webhook row');
select is(public.checkout_transition('cb115001-0000-4000-8000-000000000001','failed',1000000,'INR'),'paid','late failed attempt cannot undo paid');
select throws_ok($$select pg_temp.hold_checkout('cb115002-0000-4000-8000-000000000002')$$,'P0001',null,'sold seats cannot be held');
-- Isolate failure/expiry cases by increasing capacity through the service-owner path.
update public.events set capacity=20 where id='cb113001-0000-4000-8000-000000000001';
update public.ticket_types set qty_total=20 where id='cb114001-0000-4000-8000-000000000001';
select lives_ok($$select pg_temp.hold_checkout('cb115002-0000-4000-8000-000000000002')$$,'holds another seat');
select is(public.checkout_transition('cb115002-0000-4000-8000-000000000002','failed',100000,'INR'),'failed','failure releases hold');
select ok((select released_at is not null from public.checkout_holds where order_id='cb115002-0000-4000-8000-000000000002'),'failed hold is released');
select lives_ok($$select pg_temp.hold_checkout('cb115003-0000-4000-8000-000000000003')$$,'released seat can be held again');
select is(public.checkout_transition('cb115003-0000-4000-8000-000000000003','expired',100000,'INR'),'expired','stale hold expires');
select ok((select released_at is not null from public.checkout_holds where order_id='cb115003-0000-4000-8000-000000000003'),'expired hold is released');
select pg_temp.hold_checkout('cb115004-0000-4000-8000-000000000004',10);
select public.checkout_transition('cb115004-0000-4000-8000-000000000004','paid',1000000,'INR');
select is(public.checkout_transition('cb115002-0000-4000-8000-000000000002','paid',100000,'INR'),'expired','late success cannot oversell reallocated seats');
select is((select qty_sold from public.ticket_types where id='cb114001-0000-4000-8000-000000000001'),20,'late success leaves sold count within capacity');
select is((select count(*)::integer from public.order_outbox where order_id='cb115002-0000-4000-8000-000000000002' and topic='order.paid'),0,'late success does not emit fulfilment');
select is((select count(*)::integer from public.order_outbox where order_id='cb115002-0000-4000-8000-000000000002' and topic='payment.review_required'),1,'late success is queued for review');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cb110002-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::integer from public.orders where event_id='cb113001-0000-4000-8000-000000000001'),4,'buyer reads own orders');
select throws_ok($$update public.orders set status='paid' where id='cb115002-0000-4000-8000-000000000002'$$,'42501',null,'buyer cannot write orders');
select throws_ok($$select public.checkout_transition('cb115002-0000-4000-8000-000000000002','paid',100000,'INR')$$,'42501',null,'buyer cannot call paid function');
select throws_ok($$select * from public.checkout_holds$$,'42501',null,'buyer cannot read private hold ledger');
select set_config('request.jwt.claims','{"sub":"cb110003-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::integer from public.orders where event_id='cb113001-0000-4000-8000-000000000001'),0,'stranger cannot read orders');
set local role anon;
select throws_ok($$select public.checkout_rate_limit('fake')$$,'42501',null,'public cannot consume rate-limit RPC');
select throws_ok($$select public.checkout_user_by_email('checkout-buyer@example.test')$$,'42501',null,'public cannot look up email identities');
select * from finish();
rollback;
