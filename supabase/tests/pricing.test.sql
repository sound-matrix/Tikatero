begin;
select plan(28);
insert into auth.users(id,email) values
 ('ca100001-0000-4000-8000-000000000001','pricing-staff@example.test'),
 ('ca100002-0000-4000-8000-000000000002','pricing-attendee@example.test');
update public.profiles set role='staff' where id='ca100001-0000-4000-8000-000000000001';
insert into public.organisers(id,owner_id,display_name,slug) values
 ('ca200001-0000-4000-8000-000000000001','ca100002-0000-4000-8000-000000000002','Pricing fixture','pricing-fixture');
insert into public.events(id,organiser_id,slug,title,starts_at) values
 ('ca300001-0000-4000-8000-000000000001','ca200001-0000-4000-8000-000000000001','pricing-fixture','Pricing fixture',now()+interval '1 day');
insert into public.orders(id,event_id,buyer_name,buyer_email,subtotal_paise,total_paise,fee_payer)
values('ca400001-0000-4000-8000-000000000001','ca300001-0000-4000-8000-000000000001','Pricing Buyer','pricing-buyer@example.test',100000,100000,'organiser');
create temporary table pricing_test_old as select * from public.pricing_versions where id=(select pricing_version_id from public.orders where id='ca400001-0000-4000-8000-000000000001');
grant select on pricing_test_old to authenticated;
select ok(exists(select 1 from pricing_test_old),'new order automatically pins the active version');
select is((select platform_pct from public.pricing_versions where id='00000000-0000-4000-8000-000000000010'),150,'launch default configuration is seeded by migration');

set local role anon;
select is((select count(*)::integer from public.active_pricing_version()),1,'public can read the active configuration');
select throws_ok($$ select created_by from public.pricing_versions $$,'42501',null,'public cannot read private pricing metadata/history');
select throws_ok($$ select public.admin_save_pricing_version(200,500,'absorb',195,2) $$,'42501',null,'anonymous cannot save');
select throws_ok($$ insert into public.pricing_versions(platform_pct,fixed_fee_paise,gst_bps,gateway_mode,gateway_bps,payout_days) values(200,500,1800,'absorb',195,2) $$,'42501',null,'anonymous cannot insert');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ca100002-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$ select public.admin_save_pricing_version(200,500,'absorb',195,2) $$,'42501','Staff access required','non-staff cannot save');
select throws_ok($$ insert into public.pricing_versions(platform_pct,fixed_fee_paise,gst_bps,gateway_mode,gateway_bps,payout_days) values(200,500,1800,'absorb',195,2) $$,'42501',null,'non-staff cannot insert');
select set_config('request.jwt.claims','{"sub":"ca100001-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$ insert into public.pricing_versions(platform_pct,fixed_fee_paise,gst_bps,gateway_mode,gateway_bps,payout_days) values(200,500,1800,'absorb',195,2) $$,'42501',null,'staff cannot bypass audited RPC');
select throws_ok($$ update public.pricing_versions set platform_pct=300 $$,'42501',null,'staff cannot update versions');
select throws_ok($$ delete from public.pricing_versions $$,'42501',null,'staff cannot delete versions');
select throws_ok($$ truncate public.pricing_versions cascade $$,'42501',null,'staff cannot truncate versions');
select lives_ok($$ select public.admin_save_pricing_version(200,1000,'absorb',100,3) $$,'staff inserts new version');
select is((select platform_pct from public.active_pricing_version()),200,'new calculations read the new active version');
select is((select pricing_version_id from public.orders where id='ca400001-0000-4000-8000-000000000001'),(select id from pricing_test_old),'old order retains its original version');
select ok(exists(select 1 from public.pricing_versions p join pricing_test_old o using(id) where to_jsonb(p)=to_jsonb(o)),'old version is unchanged');
select ok(exists(select 1 from public.audit_log a where action='pricing_version_created' and entity='pricing_versions' and actor_id=auth.uid() and entity_id=(select id from public.active_pricing_version()) and before->>'id'=(select id::text from pricing_test_old) and after->>'platform_pct'='200'),'save writes before/after audit in same transaction');
select throws_ok($$ select public.admin_save_pricing_version(-1,1000,'absorb',100,3) $$,'23514',null,'database rejects invalid rates');

reset role;
create function pg_temp.fail_pricing_audit() returns trigger language plpgsql as $$ begin if new.action='pricing_version_created' then raise exception 'forced pricing audit failure'; end if; return new; end; $$;
create trigger test_fail_pricing_audit before insert on public.audit_log for each row execute function pg_temp.fail_pricing_audit();
set local role authenticated;
select throws_ok($$ select public.admin_save_pricing_version(333,1000,'absorb',100,3) $$,'P0001','forced pricing audit failure','audit failure rejects save');
select is((select count(*)::integer from public.pricing_versions where platform_pct=333),0,'version insert rolls back when audit fails');
reset role;
drop trigger test_fail_pricing_audit on public.audit_log;
select throws_ok($$ update public.pricing_versions set platform_pct=300 $$,'P0001','pricing_versions are immutable; insert a new version','even owner cannot update');
select throws_ok($$ delete from public.pricing_versions $$,'P0001','pricing_versions are immutable; insert a new version','even owner cannot delete');
select throws_ok($$ truncate public.pricing_versions cascade $$,'P0001','pricing_versions are immutable; insert a new version','even owner cannot truncate');
select throws_ok($$ update public.orders set pricing_version_id=(select id from public.active_pricing_version()) where id='ca400001-0000-4000-8000-000000000001' $$,'P0001','Order pricing version is immutable','order cannot be repriced');
insert into public.orders(id,event_id,buyer_name,buyer_email,subtotal_paise,total_paise,fee_payer)
values('ca400002-0000-4000-8000-000000000002','ca300001-0000-4000-8000-000000000001','New Buyer','pricing-new@example.test',100000,100000,'organiser');
select is((select pricing_version_id from public.orders where id='ca400002-0000-4000-8000-000000000002'),(select id from public.active_pricing_version()),'next order pins the new version');
set local role service_role;
select throws_ok($$ insert into public.pricing_versions(platform_pct,fixed_fee_paise,gst_bps,gateway_mode,gateway_bps,payout_days) values(200,500,1800,'absorb',195,2) $$,'42501',null,'service role cannot bypass audited staff insert');
reset role;
update public.profiles set blocked_at=now(),block_reason='Review' where id='ca100001-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$ select public.admin_save_pricing_version(200,500,'absorb',195,2) $$,'42501','Staff access required','blocked staff cannot save');
reset role;
select ok(not exists(select 1 from public.audit_log where action='pricing_version_created' and after->>'platform_pct'='333'),'failed save leaves no audit row');
select * from finish();
rollback;
