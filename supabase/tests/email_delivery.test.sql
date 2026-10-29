begin;
select plan(18);

select is((select count(*) from public.claim_email_send('order_confirmed', 'order/email-test', ' Alex@Example.Test ', true)), 1::bigint, 'first notification is claimed');
select is((select count(*) from public.claim_email_send('order_confirmed', 'order/email-test', 'alex@example.test', true)), 0::bigint, 'duplicate notification is not claimed');
select is((select count(*) from public.claim_email_send('order_confirmed', ' order/email-test ', 'ALEX@EXAMPLE.TEST', true)), 0::bigint, 'identity normalization prevents duplicate sends');
select is((select to_email from public.email_log where entity_ref = 'order/email-test'), 'alex@example.test', 'recipient is stored normalized');
update public.email_log set status = 'sent', resend_id = 'test-provider-id', created_at = now() - interval '3 days' where entity_ref = 'order/email-test';
select is((select count(*) from public.claim_email_send('order_confirmed', 'order/email-test', 'alex@example.test', true)), 0::bigint, 'sent identity remains permanently reserved');
select is((select count(*) from public.claim_email_send('payment_failed', 'order/email-test', 'alex@example.test', true)), 1::bigint, 'different templates are separate notifications');
select is((select count(*) from public.claim_email_send('order_confirmed', 'order/email-test-2', 'alex@example.test', true)), 1::bigint, 'different entities are separate notifications');
select is((select count(*) from public.claim_email_send('order_confirmed', 'order/email-test', 'sam@example.test', true)), 1::bigint, 'different recipients are separate notifications');
select is((select status from public.claim_email_send('kyc_approved', 'organiser/email-test', 'alex@example.test', false)), 'skipped_not_configured', 'missing configuration is logged as a skip');
select is((select count(*) from public.claim_email_send('kyc_approved', 'organiser/email-test', 'alex@example.test', false)), 0::bigint, 'repeated skips do not create duplicate rows');
select is((select count(*) from public.claim_email_send('kyc_approved', 'organiser/email-test', 'alex@example.test', true)), 1::bigint, 'configuration skip can be claimed later');
update public.email_log set status = 'unknown' where entity_ref = 'organiser/email-test';
select is((select count(*) from public.claim_email_send('kyc_approved', 'organiser/email-test', 'alex@example.test', true)), 0::bigint, 'uncertain deliveries cannot be reclaimed');

insert into auth.users (id, email) values
 ('f5555555-5555-4555-8555-555555555555', 'email-attendee@example.test'),
 ('f6666666-6666-4666-8666-666666666666', 'email-staff@example.test');
update public.profiles set role = 'staff' where id = 'f6666666-6666-4666-8666-666666666666';
set local role anon;
select throws_ok($$ select * from public.claim_email_send('staff_alert', 'test', 'test@example.test', true) $$, '42501', null, 'anonymous callers cannot claim notifications');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f5555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
select is((select count(*) from public.email_log), 0::bigint, 'attendees cannot read email logs');
select throws_ok($$ insert into public.email_log (template, to_email, status) values ('staff_alert', 'test@example.test', 'sent') $$, '42501', null, 'authenticated callers cannot write email logs');
select set_config('request.jwt.claims', '{"sub":"f6666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
select ok((select count(*) > 0 from public.email_log), 'staff can read email logs');
select throws_ok($$ select * from public.claim_email_send('staff_alert', 'test', 'test@example.test', true) $$, '42501', null, 'staff browser clients cannot claim notifications');
set local role service_role;
select lives_ok($$ select * from public.claim_email_send('staff_alert', 'test-server', 'test@example.test', true) $$, 'server role can claim notifications');
select * from finish();
rollback;
