begin;
select plan(18);
insert into auth.users (id,email) values
('a1111111-1111-4111-8111-111111111111','kyc-owner@example.test'),
('a2222222-2222-4222-8222-222222222222','kyc-other@example.test'),
('a3333333-3333-4333-8333-333333333333','kyc-staff@example.test');
update public.profiles set role='staff' where id='a3333333-3333-4333-8333-333333333333';
insert into public.organisers (id,owner_id,display_name,slug) values
('a1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','KYC One','kyc-one'),
('a2222222-2222-4222-8222-222222222222','a2222222-2222-4222-8222-222222222222','KYC Two','kyc-two');
set local role service_role;
select is((select count(*) from public.save_kyc_progress('a1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111',0,'{"pan":{"last4":"234F","ref":"mock-pan","score":100,"passed":true},"bank":{"last4":"0123","ref":"mock-bank","score":100,"passed":true}}','{}','draft',false)),1::bigint,'server saves masked progress for a member');
select is((select revision from public.kyc_applications where organiser_id='a1111111-1111-4111-8111-111111111111'),1,'save increments revision');
select is((select bank_acct_last4 from public.kyc_applications where organiser_id='a1111111-1111-4111-8111-111111111111'),'0123','bank suffix reuses the existing masked column');
select is((select pan_last4 from public.kyc_applications where organiser_id='a1111111-1111-4111-8111-111111111111'),'234F','PAN suffix reuses the existing masked column');
select throws_ok($$ select * from public.save_kyc_progress('a2222222-2222-4222-8222-222222222222','a1111111-1111-4111-8111-111111111111',1,'{}','{}','draft',false) $$,'42501',null,'even server writes recheck ownership');
select throws_ok($$ select * from public.save_kyc_progress('a1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111',0,'{}','{}','draft',false) $$,'40001',null,'stale revisions cannot overwrite progress');
select lives_ok($$ select * from public.save_kyc_progress('a1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111',1,'{"pan":{"last4":"234F","ref":"mock-pan","passed":false}}','{pan}','needs_docs',true) $$,'failed checks can be submitted for human review');
select is((select kyc_status::text from public.organisers where id='a1111111-1111-4111-8111-111111111111'),'needs_docs','organiser and queue status change atomically');
select lives_ok($$ select * from public.save_kyc_progress('a1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111',2,'{"pan":{"last4":"234F","ref":"mock-pan-2","passed":true,"score":100}}','{}','auto_passed',true) $$,'needs_docs can be resubmitted');
select is((select submission_count from public.kyc_applications where organiser_id='a1111111-1111-4111-8111-111111111111'),2,'submission identity increases for each review');
select is((select kyc_status::text from public.organisers where id='a1111111-1111-4111-8111-111111111111'),'auto_passed','auto-pass is not approval');
select throws_ok($$ select * from public.save_kyc_progress('a1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111',3,'{}','{}','draft',false) $$,'42501',null,'submitted checks are locked');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select is((select count(id) from public.kyc_applications),1::bigint,'member can read their application');
select throws_ok($$ update public.kyc_applications set status='approved' where organiser_id='a1111111-1111-4111-8111-111111111111' $$,'42501',null,'browser cannot forge provider results or approval');
select throws_ok($$ select * from public.save_kyc_progress('a1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111',3,'{}','{}','draft',false) $$,'42501',null,'browser cannot call the privileged save RPC');
select set_config('request.jwt.claims','{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select is((select count(id) from public.kyc_applications),0::bigint,'another organiser cannot read the application');
select throws_ok($$ update public.kyc_applications set pan_last4='9999' where organiser_id='a1111111-1111-4111-8111-111111111111' $$,'42501',null,'another organiser cannot write the application');
select set_config('request.jwt.claims','{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select is((select count(id) from public.kyc_applications),1::bigint,'staff can read the review queue');
select * from finish();
rollback;
