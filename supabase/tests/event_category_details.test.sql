begin;
select plan(26);

insert into auth.users(id,email) values
  ('f2600000-0000-4000-8000-000000000001','category-host@example.test'),
  ('f2600000-0000-4000-8000-000000000002','category-admin@example.test');
update public.profiles set role = 'admin' where id = 'f2600000-0000-4000-8000-000000000002';
insert into public.organisers(id,owner_id,display_name,slug,kyc_status,approved_at)
values ('f2610000-0000-4000-8000-000000000001','f2600000-0000-4000-8000-000000000001',
  'Category host','category-host','approved',now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$
  select * from public.save_event_wizard('f2620000-0000-4000-8000-000000000001','f2610000-0000-4000-8000-000000000001',0,0,1,
    '{"title":"Category event","slug":"category-event","category":"Concert","is_free":true,
      "details":{"genre":"  Jazz  ","languages":[" Telugu "," "],"lineup":[{"name":" Mira ","role":" Singer ","time":"18:30","drop":"me"}],"other":"drop"},"_complete":true}')
$$,'draft saves with optional details');
select is((select details from public.events where slug='category-event'),
  '{"genre":"Jazz","languages":["Telugu"],"lineup":[{"name":"Mira","role":"Singer","time":"18:30"}]}'::jsonb,
  'trims answers and drops unknown fields including nested keys');
select throws_ok($$
  select * from public.save_event_wizard('f2620000-0000-4000-8000-000000000001','f2610000-0000-4000-8000-000000000001',1,0,0,
    '{"title":"Category event","category":"Concert","is_free":true,"details":[]}')
$$,'P0001','Check the extra event details.','details must be an object');
select throws_ok($$
  select * from public.save_event_wizard('f2620000-0000-4000-8000-000000000001','f2610000-0000-4000-8000-000000000001',1,0,0,
    '{"title":"Category event","category":"Concert","is_free":true,"is_unlisted":true}')
$$,'22023','Only Wedding / Private and Other events can be unlisted.','concerts cannot be unlisted');
select throws_ok($$
  update public.events set details = jsonb_build_object('languages', to_jsonb(array_fill('English'::text, array[21])))
  where slug='category-event'
$$,'P0001','There are too many answers in one list.','database validates the list length on direct writes');
select throws_ok($$
  update public.events set details = jsonb_build_object('genre', repeat('x',121)) where slug='category-event'
$$,'P0001','Enter up to 120 characters for this event detail.','database validates short text length');
select lives_ok($$
  select * from public.save_event_wizard('f2620000-0000-4000-8000-000000000001','f2610000-0000-4000-8000-000000000001',1,0,1,
    '{"title":"Category event","category":"Comedy","is_free":true,"_complete":true}')
$$,'can save a comedy draft with required fields still missing');
select is((select details from public.events where slug='category-event'), '{"languages":["Telugu"]}'::jsonb,
  'category change drops stale keys and keeps shared answers');

update public.events set starts_at=now()+interval '1 day', wizard_completed_steps=array[0,1,2,3,4,5,6]::smallint[]
where slug='category-event';
select throws_ok($$
  select * from public.save_event_wizard('f2620000-0000-4000-8000-000000000001','f2610000-0000-4000-8000-000000000001',2,7,7,'{}',true)
$$,'P0001','Add at least one comedian before publishing.','publish fails with a plain message');
select throws_ok($$
  update public.events set status='published' where slug='category-event'
$$,'P0001','Add at least one comedian before publishing.','direct publish also checks required details');
select lives_ok($$
  select * from public.save_event_wizard('f2620000-0000-4000-8000-000000000001','f2610000-0000-4000-8000-000000000001',2,0,7,
    '{"title":"Category event","category":"Comedy","is_free":true,
      "details":{"comedians":[{"name":"  Jay  "}],"age_limit":"18+"},"_complete":true}')
$$,'required answers save');
select lives_ok($$
  select * from public.save_event_wizard('f2620000-0000-4000-8000-000000000001','f2610000-0000-4000-8000-000000000001',3,7,7,'{}',true)
$$,'publish succeeds once required answers are filled');
select lives_ok($$
  select * from public.save_event_wizard('f2620000-0000-4000-8000-000000000002','f2610000-0000-4000-8000-000000000001',0,0,1,
    '{"title":"Link only celebration","slug":"link-only-celebration","category":"Wedding / Private","is_free":true,"details":{"hosts":" Maya "},"_complete":true}')
$$,'wedding wizard defaults to unlisted');
select is((select is_unlisted from public.events where slug='link-only-celebration'), true, 'wedding draft is unlisted');
update public.events set starts_at=now()+interval '1 day', wizard_completed_steps=array[0,1,2,3,4,5,6]::smallint[]
where slug='link-only-celebration';
select lives_ok($$
  select * from public.save_event_wizard('f2620000-0000-4000-8000-000000000002','f2610000-0000-4000-8000-000000000001',1,7,7,'{}',true)
$$,'the wedding publishes without extra answers');
select throws_ok($$
  select public.admin_set_event_unlisted('f2620000-0000-4000-8000-000000000002', false, 'Host tried admin action', 2)
$$,'42501','Staff access required','host cannot use the admin action');

set local role anon;
select is_empty($$ select slug from public.discovery_events where slug='link-only-celebration' $$,
  'anon cannot discover an unlisted event');
select is((select details from public.discovery_events where slug='category-event'),
  '{"comedians":[{"name":"Jay"}],"age_limit":"18+"}'::jsonb, 'discovery includes details for listed events');
select results_eq(
  $$ select details, is_unlisted from public.events where slug='link-only-celebration' $$,
  $$ values ('{"hosts":"Maya"}'::jsonb, true) $$, 'anon can select both new columns by slug');
select results_eq(
  $$ select slug, is_unlisted from public.public_event_by_slug('link-only-celebration') $$,
  $$ values ('link-only-celebration'::text, true) $$, 'anon can resolve an unlisted link');
select throws_ok($$ select refunds_paused_reason from public.events $$,'42501',null,'anon cannot read refund pause reasons');
select throws_ok($$ select refunds_paused_by from public.events $$,'42501',null,'anon cannot read refund pause actors');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2600000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$
  select public.admin_set_event_unlisted('f2620000-0000-4000-8000-000000000002', false, ' ', 2)
$$,'22023','Enter a reason of up to 300 characters.','admin must give a reason');
select lives_ok($$
  select public.admin_set_event_unlisted('f2620000-0000-4000-8000-000000000002', false, 'Host asked to list it', 2)
$$,'admin can list the event');
select is((select reason from public.audit_log
  where entity_id='f2620000-0000-4000-8000-000000000002' and action='event_unlisted_changed'),
  'Host asked to list it','the visibility change is audited');
select throws_ok($$
  select public.admin_set_event_unlisted('f2620000-0000-4000-8000-000000000002', true, 'Old admin tab', 2)
$$,'40001','This event changed. Reload the page and try again.','stale updates cannot overwrite visibility');

select * from finish();
rollback;
