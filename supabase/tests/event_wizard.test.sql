begin;
select plan(29);
insert into auth.users(id,email) values
 ('c8000001-0000-4000-8000-000000000001','wizard-approved@example.test'),
 ('c8000002-0000-4000-8000-000000000002','wizard-pending@example.test'),
 ('c8000003-0000-4000-8000-000000000003','wizard-paused@example.test');
insert into public.organisers(id,owner_id,display_name,slug,kyc_status,approved_at,sales_paused) values
 ('c8100001-0000-4000-8000-000000000001','c8000001-0000-4000-8000-000000000001','Wizard approved','wizard-approved','approved',now(),false),
 ('c8100002-0000-4000-8000-000000000002','c8000002-0000-4000-8000-000000000002','Wizard pending','wizard-pending','submitted',null,false),
 ('c8100003-0000-4000-8000-000000000003','c8000003-0000-4000-8000-000000000003','Wizard paused','wizard-paused','approved',now(),true);
set local role anon;
select throws_ok($$ select * from public.save_event_wizard('c8200001-0000-4000-8000-000000000001','c8100001-0000-4000-8000-000000000001',0,0,1,'{}',false) $$,'42501',null,'anonymous cannot save a draft');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c8000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$ select * from public.save_event_wizard('c8200001-0000-4000-8000-000000000001','c8100001-0000-4000-8000-000000000001',0,0,1,'{"title":"Sample Music Night","slug":"sample-music-night","category":"Concert","description":"An evening of music","theme":"none","is_free":false,"_complete":true}',false) $$,'approved member saves basics');
select is((select starts_at from public.events where id='c8200001-0000-4000-8000-000000000001'),null::timestamptz,'draft has no invented date');
select is((select wizard_step::integer from public.events where id='c8200001-0000-4000-8000-000000000001'),1,'draft resumes at saved next step');
select is((select title from public.events where id='c8200001-0000-4000-8000-000000000001'),'Sample Music Night','draft title persists');
select throws_ok($$ select * from public.save_event_wizard('c8200001-0000-4000-8000-000000000001','c8100001-0000-4000-8000-000000000001',0,0,1,'{}',false) $$,'40001',null,'stale saves are rejected');
select lives_ok($$ select * from public.save_event_wizard('c8200002-0000-4000-8000-000000000002','c8100001-0000-4000-8000-000000000001',0,0,1,'{"title":"Sample Music Night","slug":"sample-music-night","category":"Concert","description":"Another evening","theme":"none","is_free":false,"_complete":true}',false) $$,'same-name event gets unique link');
select is((select slug from public.events where id='c8200002-0000-4000-8000-000000000002'),'sample-music-night-2','slug collision gets readable suffix');
select throws_ok($$ insert into public.events(organiser_id,title,slug) values('c8100001-0000-4000-8000-000000000001','Clash','sample-music-night') $$,'23505',null,'database enforces slug uniqueness');
select lives_ok($$ select * from public.save_event_wizard('c8200001-0000-4000-8000-000000000001','c8100001-0000-4000-8000-000000000001',1,1,2,'{"starts_at":"2026-12-31T13:30:00Z","ends_at":"2026-12-31T17:30:00Z","gates_open_at":"2026-12-31T13:00:00Z","_complete":true}',false) $$,'date step saves canonical timestamps');
select is((select timezone from public.events where id='c8200001-0000-4000-8000-000000000001'),'Asia/Kolkata','event timezone remains IST');
select throws_ok($$ select * from public.save_event_wizard('c8200001-0000-4000-8000-000000000001','c8100001-0000-4000-8000-000000000001',2,4,5,'{"guests":[{"id":"c8300001-0000-4000-8000-000000000001","name":"Guest","title":"Singer","is_vip":true,"sort":0},{"id":"c8300002-0000-4000-8000-000000000002","is_vip":true,"sort":1}],"_complete":true}',false) $$,'23502',null,'invalid guest causes entire step to fail');
select is((select count(*)::integer from public.event_guests where event_id='c8200001-0000-4000-8000-000000000001'),0,'child inserts roll back together');
select is((select wizard_revision from public.events where id='c8200001-0000-4000-8000-000000000001'),2,'failed child step does not advance revision');
select set_config('request.jwt.claims','{"sub":"c8000002-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is_empty($$ update public.events set title='Stolen' where id='c8200001-0000-4000-8000-000000000001' returning id $$,'other organiser cannot edit event');
select throws_ok($$ select * from public.save_event_wizard('c8200001-0000-4000-8000-000000000001','c8100001-0000-4000-8000-000000000001',2,0,1,'{}',false) $$,'42501','Event access denied','RPC rechecks membership');
select throws_ok($$ insert into public.ticket_types(event_id,name,price_paise,qty_total) values('c8200001-0000-4000-8000-000000000001','Foreign',10000,10) $$,'42501',null,'other organiser cannot add ticket tiers');
select lives_ok($$ select * from public.save_event_wizard('c8200003-0000-4000-8000-000000000003','c8100002-0000-4000-8000-000000000002',0,0,1,'{"title":"Pending event","slug":"pending-event","category":"Concert","description":"Pending organiser draft","is_free":true,"_complete":true}',false) $$,'pending member can save drafts');
update public.events set starts_at=now()+interval '1 day' where id='c8200003-0000-4000-8000-000000000003';
select throws_ok($$ update public.events set status='published' where id='c8200003-0000-4000-8000-000000000003' $$,'P0001','publish blocked: organiser must be approved and sales must not be paused','pending cannot publish via direct API');
select throws_ok($$ select * from public.save_event_wizard('c8200003-0000-4000-8000-000000000003','c8100002-0000-4000-8000-000000000002',1,7,7,'{}',true) $$,'P0001','publish blocked: organiser must be approved and sales must not be paused','pending cannot publish through RPC');
select lives_ok($$ select * from public.save_event_wizard('c8200003-0000-4000-8000-000000000003','c8100002-0000-4000-8000-000000000002',1,5,6,'{"tiers":[{"id":"c8400001-0000-4000-8000-000000000001","name":"RSVP","price_paise":100000,"qty_total":10,"per_order_max":2,"is_vip":false,"sort":0}],"_complete":true}',false) $$,'free event saves RSVP tier');
select is((select price_paise from public.ticket_types where id='c8400001-0000-4000-8000-000000000001'),0::bigint,'free tier forces zero integer paise');
select set_config('request.jwt.claims','{"sub":"c8000003-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into public.events(id,organiser_id,title,slug,starts_at) values('c8200004-0000-4000-8000-000000000004','c8100003-0000-4000-8000-000000000003','Paused event','paused-event',now()+interval '1 day');
select throws_ok($$ update public.events set status='published' where id='c8200004-0000-4000-8000-000000000004' $$,'P0001','publish blocked: organiser must be approved and sales must not be paused','paused cannot publish via direct API');
select throws_ok($$ select * from public.save_event_wizard('c8200004-0000-4000-8000-000000000004','c8100003-0000-4000-8000-000000000003',0,7,7,'{}',true) $$,'P0001','publish blocked: organiser must be approved and sales must not be paused','paused cannot publish through RPC');
select set_config('request.jwt.claims','{"sub":"c8000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$ select * from public.save_event_wizard('c8200001-0000-4000-8000-000000000001','c8100001-0000-4000-8000-000000000001',2,7,7,'{}',true) $$,'P0001','Complete each step before publishing','wizard publish requires saved steps');
update public.events set wizard_completed_steps=array[0,1,2,3,4,5,6]::smallint[] where id='c8200001-0000-4000-8000-000000000001';
select lives_ok($$ select * from public.save_event_wizard('c8200001-0000-4000-8000-000000000001','c8100001-0000-4000-8000-000000000001',2,7,7,'{"_complete":true}',true) $$,'approved owner can publish through wizard');
select is((select status::text from public.events where id='c8200001-0000-4000-8000-000000000001'),'published','publish changes status');
select throws_ok($$ insert into public.event_guests(event_id,name) values('c8200004-0000-4000-8000-000000000004','Foreign guest') $$,'42501',null,'other organiser cannot add guests');
reset role;
update public.profiles set blocked_at=now(),block_reason='Review required' where id='c8000001-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$ select * from public.save_event_wizard('c8200002-0000-4000-8000-000000000002','c8100001-0000-4000-8000-000000000001',1,7,7,'{}',false) $$,'42501','Event access denied','blocked organiser cannot save');
select * from finish();
rollback;
