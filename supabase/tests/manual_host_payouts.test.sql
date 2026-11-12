begin;
select no_plan();

insert into auth.users(id,email) values
  ('f2500000-0000-4000-8000-000000000001','manual-staff@example.test'),
  ('f2500000-0000-4000-8000-000000000002','manual-host@example.test'),
  ('f2500000-0000-4000-8000-000000000003','manual-buyer@example.test'),
  ('f2500000-0000-4000-8000-000000000004','manual-door@example.test'),
  ('f2500000-0000-4000-8000-000000000005','manual-other@example.test'),
  ('f2500000-0000-4000-8000-000000000006','manual-manager@example.test');
update public.profiles set role = 'staff' where id = 'f2500000-0000-4000-8000-000000000001';

insert into public.organisers(id,owner_id,slug,display_name,kyc_status,approved_at) values
  ('f2510000-0000-4000-8000-000000000001','f2500000-0000-4000-8000-000000000002','manual-host','Manual Host','approved',now()),
  ('f2510000-0000-4000-8000-000000000002','f2500000-0000-4000-8000-000000000005','manual-other','Other Host','approved',now());
insert into public.kyc_applications(organiser_id,region,status,bank_acct_last4,bank_ifsc,bank_holder_name,step_progress) values
  ('f2510000-0000-4000-8000-000000000001','IN','approved','1234','SBIN0001234','Manual Host','{"bank":{"passed":true,"mode":"cashfree","ref":"synthetic-check"}}'),
  ('f2510000-0000-4000-8000-000000000002','IN','approved','5678','SBIN0005678','Other Host','{"bank":{"passed":false}}');
insert into public.events(id,organiser_id,slug,title,starts_at,ends_at,status,is_free) values
  ('f2520000-0000-4000-8000-000000000001','f2510000-0000-4000-8000-000000000001','manual-night','Manual Night',now()+interval '1 day',now()+interval '2 days','published',false),
  ('f2520000-0000-4000-8000-000000000002','f2510000-0000-4000-8000-000000000001','manual-matinee','Manual Matinee',now()-interval '9 days',now()-interval '8 days','ended',false),
  ('f2520000-0000-4000-8000-000000000003','f2510000-0000-4000-8000-000000000002','manual-another','Another Event',now()-interval '9 days',now()-interval '8 days','ended',false);
insert into public.event_team(event_id,user_id,role) values
  ('f2520000-0000-4000-8000-000000000001','f2500000-0000-4000-8000-000000000004','door'),
  ('f2520000-0000-4000-8000-000000000001','f2500000-0000-4000-8000-000000000006','manager');
insert into public.ticket_types(id,event_id,name,price_paise,qty_total) values
  ('f2530000-0000-4000-8000-000000000001','f2520000-0000-4000-8000-000000000001','General',10000,10);

create function pg_temp.manual_hold(p_id uuid) returns jsonb language sql as $$
  select public.checkout_hold(p_id,'f2500000-0000-4000-8000-000000000003','manual-night','Buyer',
    'manual-buyer@example.test','9876543210',
    '[{"id":"f2530000-0000-4000-8000-000000000001","qty":1,"price_paise":10000}]',
    (select id from public.active_pricing_version()),'organiser',false,
    '{"subtotal":10000,"platform_fee":500,"platform_fee_gst":90,"gateway_fee":410,"buyer_total":10000,"organiser_share":9000,"platform_share":590}',
    'cashfree','synthetic-hash','[]',false);
$$;

select is(pg_temp.manual_hold('f2540000-0000-4000-8000-000000000001')->>'payout_mode','manual','Manual checkout needs no recipient');
select ok((select vendor_id is null from public.orders where id = 'f2540000-0000-4000-8000-000000000001'),'Manual checkout stores no vendor');
update public.organisers set payout_mode_override = 'gateway_split' where id = 'f2510000-0000-4000-8000-000000000001';
select throws_ok($$select pg_temp.manual_hold('f2540000-0000-4000-8000-000000000009')$$,
  'P0001','This organiser is not ready to accept payments.','Split checkout still requires a recipient');
select is(public.checkout_transition('f2540000-0000-4000-8000-000000000001','paid',10000,'INR',
  'manual-pay','cashfree','manual-webhook','{}'),'paid','A saved manual order pays in its original mode');
select is(public.checkout_transition('f2540000-0000-4000-8000-000000000001','paid',10000,'INR',
  'manual-pay','cashfree','manual-webhook','{}'),'paid','Duplicate payment webhook is accepted');
select is((select count(*) from public.organiser_earnings_entries where order_id = 'f2540000-0000-4000-8000-000000000001'),1::bigint,'A paid order creates exactly one sale');
select is((select amount_paise from public.organiser_earnings_entries where order_id = 'f2540000-0000-4000-8000-000000000001'),9000::bigint,'The sale records the host share');
select is((select count(*) from public.payouts where order_id = 'f2540000-0000-4000-8000-000000000001'),0::bigint,'Manual checkout has no automatic payout record');
select is(public.apply_payout_settlement('manual-ignored','f2540000-0000-4000-8000-000000000001','settled','manual-ignored',9000,now(),'{}')->>'outcome','manual','Gateway settlements are ignored for a manual order');

insert into public.refunds(id,order_id,amount_paise,organiser_reversal_paise,status)
values ('f2550000-0000-4000-8000-000000000001','f2540000-0000-4000-8000-000000000001',3333,3000,'approved');
select public.finish_refund('f2550000-0000-4000-8000-000000000001','manual-partial','processed');
select public.finish_refund('f2550000-0000-4000-8000-000000000001','manual-partial','processed');
select is((select amount_paise from public.organiser_earnings_entries where refund_id = 'f2550000-0000-4000-8000-000000000001'),-3000::bigint,'Partial refund records its exact host deduction once');
insert into public.refunds(id,order_id,amount_paise,organiser_reversal_paise,status)
values ('f2550000-0000-4000-8000-000000000002','f2540000-0000-4000-8000-000000000001',6667,6000,'approved');
select public.finish_refund('f2550000-0000-4000-8000-000000000002','manual-remainder','processed');
select is((select sum(amount_paise)::bigint from public.organiser_earnings_entries where order_id = 'f2540000-0000-4000-8000-000000000001'),0::bigint,'The final refund removes the rest of the original share');

set local role service_role;
select throws_ok($$update public.organiser_earnings_entries set amount_paise = 42$$,
  '55000','Earnings entries are append-only.','Service role cannot update earnings');
select throws_ok($$delete from public.organiser_earnings_entries$$,
  '55000','Earnings entries are append-only.','Service role cannot delete earnings');
reset role;

insert into public.orders(id,event_id,buyer_name,buyer_email,status,paid_at,subtotal_paise,total_paise,organiser_share_paise,platform_share_paise,fee_payer)
values ('f2540000-0000-4000-8000-000000000002','f2520000-0000-4000-8000-000000000002','Buyer','manual-buyer@example.test','paid',now()-interval '10 days',8000,8000,8000,0,'organiser'),
       ('f2540000-0000-4000-8000-000000000003','f2520000-0000-4000-8000-000000000003','Buyer','manual-buyer@example.test','paid',now()-interval '10 days',8000,8000,8000,0,'organiser');

create function pg_temp.pay(p_amount bigint,p_utr text default 'MANUAL1234',p_on date default current_date - 1,
  p_org uuid default 'f2510000-0000-4000-8000-000000000001',p_reason text default null)
returns uuid language sql as $$
  select public.admin_record_manual_payout(p_org,null,p_amount,'neft',p_utr,p_on,null,null,false,p_reason);
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','f2500000-0000-4000-8000-000000000001',true);
select throws_ok($$select pg_temp.pay(8001)$$,'P0001','Amount exceeds what can be paid now.','Staff cannot overpay without a reason');
select throws_ok($$select pg_temp.pay(10,'MANUAL1234',current_date + 2)$$,'P0001','Enter a payment date on or before today in India.','Paid on cannot be in the future');
select throws_ok($$select pg_temp.pay(10,'MANUAL1234',current_date - 1,'f2510000-0000-4000-8000-000000000002')$$,
  'P0001','The host needs an approved ID and bank check.','A failed bank check prevents recording');
reset role;
update public.organisers set payouts_on_hold = true where id = 'f2510000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select pg_temp.pay(10)$$,'P0001','Payments to this host are on hold.','A hold prevents recording');
reset role;
update public.organisers set payouts_on_hold = false where id = 'f2510000-0000-4000-8000-000000000001';

set local role authenticated;
select ok(pg_temp.pay(2500) is not null,'Staff can record a manual bank transfer');
select is(pg_temp.pay(2500,'manual1234'),pg_temp.pay(2500),'An identical retry is idempotent');
select throws_ok($$select pg_temp.pay(2600)$$,'23505','This bank reference was already recorded for the host.','The same reference cannot record a different transfer');
select is(public.organiser_event_earnings('f2520000-0000-4000-8000-000000000002')->>'paid_paise','2500','Host totals count an unscoped transfer allocated to this event');
select is(public.admin_earnings_reconciliation()->>'difference_paise','0','The ledger reconciles with orders, refunds and transfers');
select throws_ok($$select public.admin_void_manual_payout(pg_temp.pay(2500),'WRONGREF','Duplicate entry')$$,
  'P0001','Type the bank reference to confirm.','Voiding requires the actual reference');
select lives_ok($$select public.admin_void_manual_payout(pg_temp.pay(2500),'MANUAL1234','Duplicate entry')$$,'Staff can void with a reason and matching reference');
select is(public.organiser_event_earnings('f2520000-0000-4000-8000-000000000002')->>'remaining_paise','8000','Voiding restores the remaining balance');
select is(public.admin_earnings_reconciliation()->>'difference_paise','0','Reversal reconciles without changing the original entry');
select lives_ok($$select public.admin_add_earnings_adjustment('f2510000-0000-4000-8000-000000000001',
  'f2520000-0000-4000-8000-000000000002',-105,'Approved correction',false)$$,'Signed adjustment is recorded');
select is(public.admin_earnings_reconciliation()->>'adjustments_paise','-105','Approved adjustments are explained separately in reconciliation');

select set_config('request.jwt.claim.sub','f2500000-0000-4000-8000-000000000002',true);
select is(public.organiser_event_earnings('f2520000-0000-4000-8000-000000000002')->>'remaining_paise','7895','Host can read their own earnings');
select throws_ok($$select public.organiser_event_earnings('f2520000-0000-4000-8000-000000000003')$$,'42501',null,'Host cannot see another host’s event earnings');
select throws_ok($$select * from public.organiser_earnings_entries$$,'42501',null,'Host cannot bypass the earnings RPC');
select throws_ok($$select pg_temp.pay(10,'MANUAL7890')$$,'42501',null,'A non-staff caller cannot record a transfer');
select throws_ok($$select public.admin_update_payment_settings('manual','cashfree',1,'Attempt')$$,'42501',null,'Only staff can change payment settings');
select throws_ok($$select public.admin_payout_bank_details('f2510000-0000-4000-8000-000000000001',null,false,false)$$,'42501',null,'A host cannot reveal bank details from the staff endpoint');

select set_config('request.jwt.claim.sub','f2500000-0000-4000-8000-000000000004',true);
select throws_ok($$select public.organiser_event_earnings('f2520000-0000-4000-8000-000000000001')$$,'42501',null,'Door staff cannot see earnings');
select is(jsonb_array_length(public.organiser_earnings_summary()->'events'),0,'Door staff sees no money in the summary');
select set_config('request.jwt.claim.sub','f2500000-0000-4000-8000-000000000006',true);
select is(jsonb_array_length(public.organiser_earnings_summary()->'events'),1,'Event managers see the assigned event only');
reset role;

select is((select count(*) from public.organiser_earnings_entries where kind = 'payout_reversal'),1::bigint,'Void appended one reversal');
select is((select count(*) from public.audit_log where action in ('manual_payout_paid','manual_payout_voided','earnings_adjusted')),3::bigint,'Transfer, void and adjustment each have an audit record');

-- Replay the migration's sale backfill against a historical per-order payout.
alter table public.orders disable trigger orders_schedule_payout_insert;
insert into public.orders(id,event_id,buyer_name,buyer_email,status,paid_at,subtotal_paise,total_paise,
  organiser_share_paise,platform_share_paise,fee_payer,payout_mode,is_test)
values ('f2540000-0000-4000-8000-000000000004','f2520000-0000-4000-8000-000000000002',
  'Legacy Buyer','legacy-buyer@example.test','paid',now()-interval '10 days',6500,6500,6500,0,
  'organiser','gateway_split',true);
alter table public.orders enable trigger orders_schedule_payout_insert;
insert into public.payouts(organiser_id,event_id,order_id,amount_paise,status,is_test)
values ('f2510000-0000-4000-8000-000000000001','f2520000-0000-4000-8000-000000000002',
  'f2540000-0000-4000-8000-000000000004',6500,'scheduled',true);
select payout_private.add_ticket_sale('f2540000-0000-4000-8000-000000000004');
select payout_private.add_ticket_sale('f2540000-0000-4000-8000-000000000004');
select is((select sum(amount_paise)::bigint from public.organiser_earnings_entries
  where order_id = 'f2540000-0000-4000-8000-000000000004' and is_test),
  (select amount_paise from public.payouts where order_id = 'f2540000-0000-4000-8000-000000000004'),
  'Historical sale backfill ties to the legacy per-order payout and preserves test status');

select * from finish();
rollback;
