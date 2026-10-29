begin;
select plan(46);
insert into auth.users(id,email) values
 ('c7000001-0000-4000-8000-000000000001','admin-cms-staff@example.test'),
 ('c7000002-0000-4000-8000-000000000002','admin-cms-owner@example.test'),
 ('c7000003-0000-4000-8000-000000000003','admin-cms-other@example.test');
update public.profiles set role='staff' where id='c7000001-0000-4000-8000-000000000001';
insert into public.organisers(id,owner_id,display_name,slug,kyc_status) values
 ('c7100001-0000-4000-8000-000000000001','c7000002-0000-4000-8000-000000000002','CMS review','admin-cms-review','submitted'),
 ('c7100002-0000-4000-8000-000000000002','c7000001-0000-4000-8000-000000000001','Staff own','admin-cms-own','submitted');
insert into public.kyc_applications(id,organiser_id,region,status,revision,submitted_at) values
 ('c7200001-0000-4000-8000-000000000001','c7100001-0000-4000-8000-000000000001','IN','submitted',1,now()),
 ('c7200002-0000-4000-8000-000000000002','c7100002-0000-4000-8000-000000000002','IN','submitted',1,now());
insert into public.events(id,organiser_id,slug,title,starts_at) values ('c7300001-0000-4000-8000-000000000001','c7100001-0000-4000-8000-000000000001','admin-cms-event','CMS event',now()+interval '1 day');

set local role anon;
select throws_ok($$ select public.admin_review_kyc('c7200001-0000-4000-8000-000000000001',1,'approved','{}',null) $$,'42501',null,'anonymous cannot review');
select throws_ok($$ select public.admin_account_action('c7000002-0000-4000-8000-000000000002','block','reason') $$,'42501',null,'anonymous cannot block');
select throws_ok($$ select public.admin_organiser_control('c7100001-0000-4000-8000-000000000001','sales_paused',true) $$,'42501',null,'anonymous cannot toggle');
select throws_ok($$ select * from public.admin_search_accounts('') $$,'42501',null,'anonymous cannot search contacts');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c7000002-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$ select public.admin_review_kyc('c7200001-0000-4000-8000-000000000001',1,'approved','{}',null) $$,'42501','Staff access required','attendee cannot review');
select throws_ok($$ select public.admin_account_action('c7000003-0000-4000-8000-000000000003','block','reason') $$,'42501','Staff access required','attendee cannot block');
select throws_ok($$ select public.admin_organiser_control('c7100001-0000-4000-8000-000000000001','sales_paused',true) $$,'42501','Staff access required','attendee cannot toggle');
select throws_ok($$ select * from public.admin_search_accounts('') $$,'42501','Staff access required','attendee cannot search');
select is((select count(*)::integer from public.audit_log),0,'audit hidden from non-staff');
select throws_ok($$ update public.events set status='published' where id='c7300001-0000-4000-8000-000000000001' $$,'P0001',null,'publish locked before approval');

select set_config('request.jwt.claims','{"sub":"c7000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::integer from public.admin_search_accounts('admin-cms-owner@example.test')),1,'staff searches account email');
select is((select count(*)::integer from public.admin_search_accounts('CMS review')),1,'staff searches organiser name');
reset role;
update public.kyc_applications set step_progress='{"details":{"phone":"9876543210"}}' where id='c7200001-0000-4000-8000-000000000001';
update public.organisers set legal_name='CMS Legal Firm' where id='c7100001-0000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*)::integer from public.admin_search_accounts('9876543210')),1,'staff searches saved organiser contact phone');
select is((select count(*)::integer from public.admin_search_accounts('CMS Legal Firm')),1,'staff searches organiser legal name');
select throws_ok($$ select public.admin_review_kyc('c7200002-0000-4000-8000-000000000002',1,'approved','{}',null) $$,'42501','You cannot review your own organiser','staff cannot approve own organiser');
select throws_ok($$ update public.organisers set kyc_status='approved',approved_at=now() where id='c7100001-0000-4000-8000-000000000001' $$,'42501',null,'staff cannot bypass audited controls');
select throws_ok($$ insert into public.audit_log(action,entity) values('forged','profiles') $$,'42501',null,'staff cannot forge an audit row');
select throws_ok($$ select public.admin_review_kyc('c7200001-0000-4000-8000-000000000001',1,'needs_docs','{}','fix') $$,'P0001','Choose the steps to correct','needs-docs requires flagged steps');
select lives_ok($$ select public.admin_review_kyc('c7200001-0000-4000-8000-000000000001',1,'needs_docs',array['bank'],'Please upload a clear bank proof') $$,'staff requests docs');
select is((select flagged_steps from public.kyc_applications where id='c7200001-0000-4000-8000-000000000001'),array['bank'],'flagged steps saved');
select ok(exists(select 1 from public.audit_log where action='kyc_needs_docs' and before->>'status'='submitted' and after->>'status'='needs_docs' and actor_id=auth.uid()),'review and before/after audit committed');
select throws_ok($$ select public.admin_review_kyc('c7200001-0000-4000-8000-000000000001',1,'approved','{}',null) $$,'40001',null,'stale review fails');

-- Deliberately fail INSERT into audit_log: the enclosing function must roll back
-- both the organiser and application updates, not just fail to log them.
reset role;
create function pg_temp.fail_admin_audit() returns trigger language plpgsql as $$ begin raise exception 'forced audit failure'; end; $$;
create trigger test_fail_admin_audit before insert on public.audit_log for each row execute function pg_temp.fail_admin_audit();
set local role authenticated;
select throws_ok($$ select public.admin_review_kyc('c7200001-0000-4000-8000-000000000001',2,'approved','{}',null) $$,'P0001','forced audit failure','audit failure aborts decision');
select is((select kyc_status::text from public.organisers where id='c7100001-0000-4000-8000-000000000001'),'needs_docs','organiser change rolled back with audit');
select is((select revision from public.kyc_applications where id='c7200001-0000-4000-8000-000000000001'),2,'application change rolled back with audit');
reset role;
drop trigger test_fail_admin_audit on public.audit_log;
set local role authenticated;
select lives_ok($$ select public.admin_review_kyc('c7200001-0000-4000-8000-000000000001',2,'approved','{}',null) $$,'staff approves');
select is((select kyc_status::text from public.organisers where id='c7100001-0000-4000-8000-000000000001'),'approved','organiser is approved');
select lives_ok($$ update public.events set status='published' where id='c7300001-0000-4000-8000-000000000001' $$,'publish unlocks on approval');
select throws_ok($$ select public.admin_account_action('c7000003-0000-4000-8000-000000000003','block',' ') $$,'P0001','A reason is required','block requires a reason');
select lives_ok($$ select public.admin_account_action('c7000003-0000-4000-8000-000000000003','suspend','Review required') $$,'staff suspends account');
select is((select block_reason from public.profiles where id='c7000003-0000-4000-8000-000000000003'),'Review required','account sees restriction reason');
select ok(exists(select 1 from public.audit_log where action='account_suspend' and before->>'blocked_at' is null and after->>'blocked_at' is not null),'suspension has before/after audit');
select lives_ok($$ select public.admin_account_action('c7000003-0000-4000-8000-000000000003','unblock','') $$,'staff unblocks account');
select lives_ok($$ select public.admin_organiser_control('c7100001-0000-4000-8000-000000000001','payouts_on_hold',true) $$,'staff holds payouts');
select lives_ok($$ select public.admin_organiser_control('c7100001-0000-4000-8000-000000000001','sales_paused',true) $$,'staff pauses sales');
select ok(exists(select 1 from public.audit_log where action='sales_paused' and after->>'sales_paused'='true' and before->>'sales_paused'='false'),'control change audited');
select throws_ok($$ update public.audit_log set reason='changed' $$,'42501',null,'staff cannot update audit');
select throws_ok($$ delete from public.audit_log $$,'42501',null,'staff cannot delete audit');
select throws_ok($$ truncate public.audit_log $$,'42501',null,'staff cannot truncate audit');
reset role;
select throws_ok($$ update public.audit_log set reason='changed' $$,'P0001','audit_log is insert-only','even table owner cannot update audit');
select throws_ok($$ delete from public.audit_log $$,'P0001','audit_log is insert-only','even table owner cannot delete audit');
select throws_ok($$ truncate public.audit_log $$,'P0001','audit_log is insert-only','even table owner cannot truncate audit');
-- Historical applications must not take the unique revision slot used by PR 6.
insert into public.kyc_applications(id,organiser_id,region,status,submitted_at)
values('c7200003-0000-4000-8000-000000000003','c7100001-0000-4000-8000-000000000001','IN','submitted',now());
set local role authenticated;
select lives_ok($$ select public.admin_review_kyc('c7200003-0000-4000-8000-000000000003',null,'needs_docs',array['pan'],'Please provide current proof') $$,'staff can review a historical application alongside PR 6 progress');
select is((select revision from public.kyc_applications where id='c7200003-0000-4000-8000-000000000003'),null::integer,'historical revision slot remains separate');
reset role;
update public.profiles set blocked_at=now(),block_reason='Review' where id='c7000001-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$ select * from public.admin_search_accounts('') $$,'42501','Staff access required','blocked staff cannot use admin functions');
reset role;
select is(admin_private.safe_note('ID '||'ABCDE'||'1234F'||' account '||'123456789012'||' token sb_secret_example'),'ID [redacted] account [redacted] token [redacted]','notes redact IDs and tokens');
select * from finish();
rollback;
