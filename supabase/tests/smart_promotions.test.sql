begin;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
('f5700000-0000-4000-8000-000000000001','smart-host@example.test',now()),
('f5700000-0000-4000-8000-000000000002','smart-buyer@example.test',now()),
('f5700000-0000-4000-8000-000000000003','smart-stranger@example.test',now()),
('f5700000-0000-4000-8000-000000000004','smart-admin@example.test',now());
update public.profiles set role='admin' where id='f5700000-0000-4000-8000-000000000004';
insert into public.organisers(id,owner_id,slug,display_name,kyc_status,approved_at) values
('f5710000-0000-4000-8000-000000000001',
'f5700000-0000-4000-8000-000000000001','smart-host','Smart Events','approved',now());
insert into public.events(id,organiser_id,slug,title,status,is_free,starts_at,ends_at)
values
('f5720000-0000-4000-8000-000000000001',
'f5710000-0000-4000-8000-000000000001','smart-next','Smart Future Event','published',false,
now()+interval '20 days',now()+interval '21 days'),
('f5720000-0000-4000-8000-000000000002',
'f5710000-0000-4000-8000-000000000001','smart-old','Smart Past Event','ended',false,
now()-interval '20 days',now()-interval '19 days');

select is((select status from public.promotion_campaigns
 where event_id='f5720000-0000-4000-8000-000000000001'),
 'pending_review','Public events auto-create a pending-review campaign, not a send');
select is((select count(*) from public.promotion_email_deliveries),
 0::bigint,'No deliveries happen at event publication');

set local role authenticated;
select set_config('request.jwt.claim.sub','f5700000-0000-4000-8000-000000000003',true);
select throws_ok(
 $$select public.promotion_audience_count('f5720000-0000-4000-8000-000000000001')$$,
 '42501','Audience not available.','Unrelated accounts cannot inspect host audiences');
select throws_ok(
 $$select public.host_request_promotion('f5720000-0000-4000-8000-000000000001')$$,
 '42501','This event cannot be promoted.','Unrelated accounts cannot request promotion');
select is((select count(*) from public.promotion_campaigns),
 0::bigint,'RLS blocks unrelated accounts from campaign rows');

select set_config('request.jwt.claim.sub','f5700000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.set_marketing_preference('email',true)$$,
 'Buyer can explicitly subscribe');
select is((select email_opt_in from public.marketing_preferences
 where user_id='f5700000-0000-4000-8000-000000000002'),true,
 'Marketing email choice is stored for the authenticated buyer');
select throws_ok(
 $$select public.set_marketing_preference('push',true)$$,'42501',
 'Preference could not be updated.','Unsupported channels rejected');
select lives_ok($$select public.set_marketing_preference('email',false)$$,
 'Buyer can unsubscribe immediately');
select is((select email_opt_in from public.marketing_preferences
 where user_id='f5700000-0000-4000-8000-000000000002'),false,
 'Unsubscribe takes effect');

select set_config('request.jwt.claim.sub','f5700000-0000-4000-8000-000000000001',true);
select is(public.promotion_audience_count('f5720000-0000-4000-8000-000000000001'),
 0,'Past buyers without explicit marketing consent are never included');

select set_config('request.jwt.claim.sub','f5700000-0000-4000-8000-000000000004',true);
select lives_ok(
 $$select public.admin_decide_promotion('f5720000-0000-4000-8000-000000000001',true)$$,
 'Admin may approve an eligible public campaign');
select is((select status from public.promotion_campaigns
 where event_id='f5720000-0000-4000-8000-000000000001'),
 'approved','Approval explicitly recorded');
select is((select count(*) from public.promotion_email_deliveries),
 0::bigint,'Admin approval does not message anyone without eligible consent');

reset role;
select * from finish();
rollback;
