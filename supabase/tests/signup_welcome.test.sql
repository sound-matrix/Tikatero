begin;
select plan(12);

insert into auth.users (id, email, raw_user_meta_data) values
 ('f1900001-0000-4000-8000-000000000001', 'host-welcome@example.test', '{"signup_intent":"organiser","role":"admin"}'::jsonb),
 ('f1900002-0000-4000-8000-000000000002', 'buyer-welcome@example.test', '{"signup_intent":"attendee"}'::jsonb),
 ('f1900003-0000-4000-8000-000000000003', 'invalid-welcome@example.test', '{"signup_intent":"admin"}'::jsonb);
select is((select signup_intent from public.profiles where id = 'f1900001-0000-4000-8000-000000000001'), 'organiser', 'host intent captured at signup');
select is((select signup_intent from public.profiles where id = 'f1900002-0000-4000-8000-000000000002'), 'attendee', 'buyer intent captured at signup');
select is((select signup_intent from public.profiles where id = 'f1900003-0000-4000-8000-000000000003'), 'attendee', 'invalid intent defaults to attendee');
select is((select role::text from public.profiles where id = 'f1900001-0000-4000-8000-000000000001'), 'attendee', 'intent never grants a role');
select is((select welcome_email_sent_at from public.profiles where id = 'f1900001-0000-4000-8000-000000000001'), null::timestamptz, 'new profile is eligible for welcome');
select throws_ok($$ update public.profiles set signup_intent = 'admin' where id = 'f1900001-0000-4000-8000-000000000001' $$, '23514', null, 'intent constraint rejects other values');
select is((select count(*) from public.claim_email_send('welcome_organiser', 'welcome:f1900001-0000-4000-8000-000000000001', 'host-welcome@example.test', false)), 1::bigint, 'host welcome can be claimed');
select is((select count(*) from public.claim_email_send('welcome_attendee', 'welcome:f1900002-0000-4000-8000-000000000002', 'buyer-welcome@example.test', false)), 1::bigint, 'buyer welcome can be claimed');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1900001-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ update public.profiles set signup_intent = 'attendee' where id = 'f1900001-0000-4000-8000-000000000001' $$, '42501', null, 'user cannot change signup intent');
select throws_ok($$ update public.profiles set welcome_email_sent_at = now() where id = 'f1900001-0000-4000-8000-000000000001' $$, '42501', null, 'user cannot claim welcome');
select lives_ok($$ update public.profiles set full_name = 'Host Name' where id = 'f1900001-0000-4000-8000-000000000001' $$, 'profile name remains editable');
select throws_ok($$ select * from public.claim_email_send('welcome_organiser', 'welcome:other', 'host-welcome@example.test', true) $$, '42501', null, 'browser client cannot claim a welcome');
select * from finish();
rollback;
