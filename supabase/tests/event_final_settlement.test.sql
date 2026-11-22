begin;
select no_plan();

insert into auth.users(id,email) values
('a5500000-0000-4000-8000-000000000001','settlement-staff@example.test'),
('a5500000-0000-4000-8000-000000000002','settlement-host@example.test'),
('a5500000-0000-4000-8000-000000000003','settlement-outsider@example.test');
update public.profiles set role='staff'
  where id='a5500000-0000-4000-8000-000000000001';

insert into public.organisers(id,owner_id,slug,display_name,kyc_status,approved_at)
values('a5510000-0000-4000-8000-000000000001',
'a5500000-0000-4000-8000-000000000002','settlement-host','Settlement Host','approved',now());

insert into public.kyc_applications(organiser_id,region,status,bank_acct_last4,bank_ifsc,bank_holder_name,step_progress)
values('a5510000-0000-4000-8000-000000000001','IN','approved','9876','SBIN0001234',
 'Settlement Host','{"bank":{"passed":true,"mode":"cashfree","ref":"synthetic-settlement"}}');

insert into public.events(id,organiser_id,slug,title,starts_at,ends_at,status,is_free,booking_close_at)
values('a5520000-0000-4000-8000-000000000001',
'a5510000-0000-4000-8000-000000000001','settlement-show','Settlement Show',
now()-interval '12 days',now()-interval '11 days','ended',false,now()-interval '12 days');

insert into public.orders(id,event_id,buyer_name,buyer_email,status,paid_at,subtotal_paise,
 total_paise,organiser_share_paise,platform_share_paise,fee_payer,payout_mode,is_test)
values('a5530000-0000-4000-8000-000000000001',
'a5520000-0000-4000-8000-000000000001','Test Buyer','buyer@example.test','paid',
now()-interval '12 days',12000,12000,12000,0,'organiser','manual',false);

insert into public.organiser_earnings_entries(organiser_id,event_id,order_id,payout_mode,kind,
 amount_paise,available_at,is_test)
values('a5510000-0000-4000-8000-000000000001',
'a5520000-0000-4000-8000-000000000001','a5530000-0000-4000-8000-000000000001','manual','ticket_sale',12000,
now()-interval '12 days',false);

set local role authenticated;
select set_config('request.jwt.claim.sub','a5500000-0000-4000-8000-000000000003',true);
select throws_ok(
 $$select public.event_settlement_statement('a5520000-0000-4000-8000-000000000001')$$,
 '42501','Statement unavailable.','An unrelated buyer cannot read financial statements');

select set_config('request.jwt.claim.sub','a5500000-0000-4000-8000-000000000002',true);
select is(public.event_settlement_statement('a5520000-0000-4000-8000-000000000001')->>'remaining_host_paise',
 '12000','Host sees exact outstanding net amount');
select is(public.event_settlement_statement('a5520000-0000-4000-8000-000000000001')->>'status',
 'ready_for_manual_transfer','Event with cleared funds is ready to settle');

select set_config('request.jwt.claim.sub','a5500000-0000-4000-8000-000000000001',true);
select lives_ok(
 $$select public.admin_record_final_event_payout('a5520000-0000-4000-8000-000000000001',
 'neft','SETTLE1234',current_date - 1,null)$$,
 'Staff can record exact full event payout after an external transfer');
select is(public.event_settlement_statement('a5520000-0000-4000-8000-000000000001')->>'status',
 'paid','Host statement reflects the recorded payment');
select is((select amount_paise from public.payouts where bank_reference='SETTLE1234'),
 12000::bigint,'Final payout is exactly the outstanding amount');
select is((select count(*) from public.payouts where bank_reference='SETTLE1234'),
 1::bigint,'Only one real payout record created');
select lives_ok(
 $$select public.admin_record_final_event_payout('a5520000-0000-4000-8000-000000000001',
 'neft','SETTLE1234',current_date - 1,null)$$,
 'Retrying the same UTR is idempotent');
select is((select count(*) from public.payouts where bank_reference='SETTLE1234'),
 1::bigint,'Retry does not duplicate host payout');
select throws_ok(
 $$select public.admin_record_final_event_payout('a5520000-0000-4000-8000-000000000001',
 'neft','SETTLE9999',current_date - 1,null)$$,
 'P0001','This event is not ready for final settlement. Reconcile bookings, refunds and payout holds first.',
 'No second final transfer allowed after full settlement');

reset role;
select * from finish();
rollback;
