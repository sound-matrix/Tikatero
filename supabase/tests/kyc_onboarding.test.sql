begin;
select plan(18);
insert into auth.users (id,email) values
('c6000001-0600-4600-8600-000000000001','kyc-onboarding-06-owner@example.test'),
('c6000002-0600-4600-8600-000000000002','kyc-onboarding-06-other@example.test'),
('c6000003-0600-4600-8600-000000000003','kyc-onboarding-06-staff@example.test');
update public.profiles set role='staff' where id='c6000003-0600-4600-8600-000000000003';
insert into public.organisers (id,owner_id,display_name,slug) values
('c6000001-0600-4600-8600-000000000001','c6000001-0600-4600-8600-000000000001','KYC One','kyc-onboarding-06-owner'),
('c6000002-0600-4600-8600-000000000002','c6000002-0600-4600-8600-000000000002','KYC Two','kyc-onboarding-06-other');
set local role service_role;
select is((select count(*) from public.save_kyc_progress('c6000001-0600-4600-8600-000000000001','c6000001-0600-4600-8600-000000000001',0,'{"pan":{"last4":"234F","ref":"mock-pan","score":100,"passed":true},"bank":{"last4":"0123","ref":"mock-bank","score":100,"passed":true}}','{}','draft',false)),1::bigint,'server saves masked progress for a member');
select is((select revision from public.kyc_applications where organiser_id='c6000001-0600-4600-8600-000000000001'),1,'save increments revision');
select is((select bank_acct_last4 from public.kyc_applications where organiser_id='c6000001-0600-4600-8600-000000000001'),'0123','bank suffix reuses the existing masked column');
select is((select pan_last4 from public.kyc_applications where organiser_id='c6000001-0600-4600-8600-000000000001'),'234F','PAN suffix reuses the existing masked column');
select throws_ok($$ select * from public.save_kyc_progress('c6000002-0600-4600-8600-000000000002','c6000001-0600-4600-8600-000000000001',1,'{}','{}','draft',false) $$,'42501',null,'even server writes recheck ownership');
select throws_ok($$ select * from public.save_kyc_progress('c6000001-0600-4600-8600-000000000001','c6000001-0600-4600-8600-000000000001',0,'{}','{}','draft',false) $$,'40001',null,'stale revisions cannot overwrite progress');
select lives_ok($$ select * from public.save_kyc_progress('c6000001-0600-4600-8600-000000000001','c6000001-0600-4600-8600-000000000001',1,'{"pan":{"last4":"234F","ref":"mock-pan","passed":false}}','{pan}','needs_docs',true) $$,'failed checks can be submitted for human review');
select is((select kyc_status::text from public.organisers where id='c6000001-0600-4600-8600-000000000001'),'needs_docs','organiser and queue status change atomically');
select lives_ok($$ select * from public.save_kyc_progress('c6000001-0600-4600-8600-000000000001','c6000001-0600-4600-8600-000000000001',2,'{"pan":{"last4":"234F","ref":"mock-pan-2","passed":true,"score":100}}','{}','auto_passed',true) $$,'needs_docs can be resubmitted');
select is((select submission_count from public.kyc_applications where organiser_id='c6000001-0600-4600-8600-000000000001'),2,'submission identity increases for each review');
select is((select kyc_status::text from public.organisers where id='c6000001-0600-4600-8600-000000000001'),'auto_passed','auto-pass is not approval');
select throws_ok($$ select * from public.save_kyc_progress('c6000001-0600-4600-8600-000000000001','c6000001-0600-4600-8600-000000000001',3,'{}','{}','draft',false) $$,'42501',null,'submitted checks are locked');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c6000001-0600-4600-8600-000000000001","role":"authenticated"}',true);
select is((select count(id) from public.kyc_applications),1::bigint,'member can read their application');
select throws_ok($$ update public.kyc_applications set status='approved' where organiser_id='c6000001-0600-4600-8600-000000000001' $$,'42501',null,'browser cannot forge provider results or approval');
select throws_ok($$ select * from public.save_kyc_progress('c6000001-0600-4600-8600-000000000001','c6000001-0600-4600-8600-000000000001',3,'{}','{}','draft',false) $$,'42501',null,'browser cannot call the privileged save RPC');
select set_config('request.jwt.claims','{"sub":"c6000002-0600-4600-8600-000000000002","role":"authenticated"}',true);
select is((select count(id) from public.kyc_applications),0::bigint,'another organiser cannot read the application');
select throws_ok($$ update public.kyc_applications set pan_last4='9999' where organiser_id='c6000001-0600-4600-8600-000000000001' $$,'42501',null,'another organiser cannot write the application');
select set_config('request.jwt.claims','{"sub":"c6000003-0600-4600-8600-000000000003","role":"authenticated"}',true);
select is((select count(id) from public.kyc_applications where organiser_id='c6000001-0600-4600-8600-000000000001'),1::bigint,'staff can read the review queue');
select * from finish();
rollback;
