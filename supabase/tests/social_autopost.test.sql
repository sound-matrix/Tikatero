begin;
select plan(55);

insert into auth.users(id, email) values
  ('f4010000-0000-4000-8000-000000000001', 'social-host@example.test'),
  ('f4010000-0000-4000-8000-000000000002', 'social-staff@example.test'),
  ('f4010000-0000-4000-8000-000000000003', 'social-admin@example.test'),
  ('f4010000-0000-4000-8000-000000000004', 'social-door@example.test');
update public.profiles set role = 'staff' where id = 'f4010000-0000-4000-8000-000000000002';
update public.profiles set role = 'admin' where id = 'f4010000-0000-4000-8000-000000000003';
insert into public.organisers(id, owner_id, slug, display_name, kyc_status, approved_at) values
  ('f4020000-0000-4000-8000-000000000001', 'f4010000-0000-4000-8000-000000000001', 'social-host', 'Social Host', 'approved', now());

update public.platform_social_settings
set autopost_paused = false, autopost_since = now()
where id;

insert into public.events(id, organiser_id, slug, title, category, status, starts_at, city, venue_name, is_free) values
  ('f4030000-0000-4000-8000-000000000001', 'f4020000-0000-4000-8000-000000000001', 'city-lights', 'City Lights', 'Comedy', 'published', now() + interval '5 days', 'Hyderabad', 'Sound Hall', false),
  ('f4030000-0000-4000-8000-000000000002', 'f4020000-0000-4000-8000-000000000001', 'social-draft', 'Draft Night', 'Comedy', 'draft', now() + interval '5 days', 'Hyderabad', 'Sound Hall', false),
  ('f4030000-0000-4000-8000-000000000003', 'f4020000-0000-4000-8000-000000000001', 'social-hidden', 'Hidden Night', 'Comedy', 'published', now() + interval '5 days', 'Hyderabad', 'Sound Hall', false),
  ('f4030000-0000-4000-8000-000000000004', 'f4020000-0000-4000-8000-000000000001', 'social-cancelled', 'Cancelled Night', 'Comedy', 'cancelled', now() + interval '5 days', 'Hyderabad', 'Sound Hall', false),
  ('f4030000-0000-4000-8000-000000000005', 'f4020000-0000-4000-8000-000000000001', 'social-unlisted', 'Private Night', 'Comedy', 'published', now() + interval '5 days', 'Hyderabad', 'Sound Hall', false),
  ('f4030000-0000-4000-8000-000000000006', 'f4020000-0000-4000-8000-000000000001', 'social-test-title', 'TEST EVENT', 'Comedy', 'published', now() + interval '5 days', 'Hyderabad', 'Sound Hall', false),
  ('f4030000-0000-4000-8000-000000000007', 'f4020000-0000-4000-8000-000000000001', 'social-off', 'Quiet Night', 'Comedy', 'published', now() + interval '5 days', 'Hyderabad', 'Sound Hall', false),
  ('f4030000-0000-4000-8000-000000000008', 'f4020000-0000-4000-8000-000000000001', 'social-soon', 'Soon Night', 'Comedy', 'published', now() + interval '2 hours', 'Hyderabad', 'Sound Hall', false),
  ('f4030000-0000-4000-8000-000000000009', 'f4020000-0000-4000-8000-000000000001', 'social-old', 'Old Night', 'Comedy', 'published', now() + interval '5 days', 'Hyderabad', 'Sound Hall', false),
  ('f4030000-0000-4000-8000-000000000010', 'f4020000-0000-4000-8000-000000000001', 'social-unpublished', 'Unpublished Night', 'Comedy', 'unpublished', now() + interval '5 days', 'Hyderabad', 'Sound Hall', false),
  ('f4030000-0000-4000-8000-000000000012', 'f4020000-0000-4000-8000-000000000001', 'india-australia', 'India vs Australia Test match', 'Sports', 'published', now() + interval '8 days', 'Hyderabad', 'Stadium', false);
update public.events set hidden_at = now() where id = 'f4030000-0000-4000-8000-000000000003';
update public.events set is_unlisted = true where id = 'f4030000-0000-4000-8000-000000000005';
update public.events set published_at = now() - interval '30 days' where id = 'f4030000-0000-4000-8000-000000000009';
insert into public.event_social_settings(event_id, autopost) values
  ('f4030000-0000-4000-8000-000000000007', false);
insert into public.ticket_types(id, event_id, name, price_paise, qty_total, qty_sold) values
  ('f4040000-0000-4000-8000-000000000001', 'f4030000-0000-4000-8000-000000000001', 'General', 49900, 100, 0);
insert into public.event_team(event_id, user_id, role) values
  ('f4030000-0000-4000-8000-000000000001', 'f4010000-0000-4000-8000-000000000004', 'door');

select is(social_private.is_test_event('f4030000-0000-4000-8000-000000000006'), true, 'TEST EVENT is a test');
select is(social_private.is_test_event('f4030000-0000-4000-8000-000000000012'), true, 'a title with the word Test is a test until an admin says otherwise');
select is(social_private.is_test_event('f4030000-0000-4000-8000-000000000001'), false, 'a normal title is not a test');

select is(social_private.enqueue_due(20), 4, 'one live event queues a post and a story for each platform');
select is(
  (select count(*) from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000001'),
  4::bigint,
  'feed and story exist for Instagram and Facebook'
);
select is(social_private.enqueue_due(20), 0, 'queueing again does not add a second copy');
select is(
  (select count(*) from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000001'),
  4::bigint,
  'the unique key keeps one row per event, platform and kind'
);
select is((select count(*) from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000002'), 0::bigint, 'draft is skipped');
select is((select count(*) from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000010'), 0::bigint, 'unpublished is skipped');
select is((select count(*) from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000003'), 0::bigint, 'hidden is skipped');
select is((select count(*) from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000004'), 0::bigint, 'cancelled is skipped');
select is((select count(*) from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000005'), 0::bigint, 'unlisted is skipped');
select is((select count(*) from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000006'), 0::bigint, 'a test title is skipped');
select is((select count(*) from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000007'), 0::bigint, 'autopost off is skipped');
select is((select count(*) from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000008'), 0::bigint, 'an event starting within 3 hours is skipped');
select is((select count(*) from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000009'), 0::bigint, 'an event published before the cutoff is skipped');
insert into public.event_social_settings(event_id, autopost, is_test) values
  ('f4030000-0000-4000-8000-000000000012', false, false);
select is(social_private.is_test_event('f4030000-0000-4000-8000-000000000012'), false, 'an admin can mark a Test match as a real event');

update public.platform_social_settings set autopost_paused = true where id;
insert into public.events(id, organiser_id, slug, title, status, starts_at) values
  ('f4030000-0000-4000-8000-000000000013', 'f4020000-0000-4000-8000-000000000001', 'social-while-paused', 'Paused Night', 'published', now() + interval '6 days');
select is(social_private.enqueue_due(20), 0, 'paused settings insert nothing');
select is((select count(*) from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000013'), 0::bigint, 'the event published while paused stays unqueued');
update public.platform_social_settings set autopost_paused = false where id;

insert into public.events(id, organiser_id, slug, title, status, starts_at, city) values
  ('f4030000-0000-4000-8000-000000000011', 'f4020000-0000-4000-8000-000000000001', 'social-few', 'Few Seats Night', 'published', now() + interval '5 days', 'Hyderabad');
insert into public.ticket_types(id, event_id, name, price_paise, qty_total, qty_sold) values
  ('f4040000-0000-4000-8000-000000000002', 'f4030000-0000-4000-8000-000000000011', 'General', 49900, 100, 91);
insert into public.social_posts(event_id, platform, kind, status, posted_at) values
  ('f4030000-0000-4000-8000-000000000011', 'instagram', 'feed', 'posted', now()),
  ('f4030000-0000-4000-8000-000000000011', 'instagram', 'story', 'posted', now()),
  ('f4030000-0000-4000-8000-000000000011', 'facebook', 'feed', 'posted', now()),
  ('f4030000-0000-4000-8000-000000000011', 'facebook', 'story', 'posted', now());
select is(social_private.enqueue_due(20), 2, 'last seats is queued once for both platforms below 10 percent');
select is(social_private.enqueue_due(20), 0, 'last seats is not queued twice');
select is(
  (select count(*) from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000011' and kind = 'last_seats'),
  2::bigint,
  'one last-seats row for each platform'
);

update public.social_posts
set next_attempt_at = now() - interval '1 minute', status = 'queued', attempts = 0, locked_until = null
where event_id = 'f4030000-0000-4000-8000-000000000001';
select is(
  (select count(*) from social_private.claim_due(10) where event_id = 'f4030000-0000-4000-8000-000000000001'),
  4::bigint,
  'claim takes the waiting rows'
);
select is(
  (select count(*) from social_private.claim_due(10) where event_id = 'f4030000-0000-4000-8000-000000000001'),
  0::bigint,
  'a second claim does not take the same rows'
);
update public.social_posts
set status = 'processing', locked_until = now() - interval '1 minute', next_attempt_at = now() - interval '1 minute'
where id = (select id from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000001' and platform = 'instagram' and kind = 'feed');
select is(
  (select count(*) from social_private.claim_due(10) where event_id = 'f4030000-0000-4000-8000-000000000001'),
  1::bigint,
  'a stale processing row is claimed again'
);

update public.social_posts
set status = 'queued', locked_until = null, attempts = 0
where event_id = 'f4030000-0000-4000-8000-000000000001';

select set_config('request.jwt.claims', '{"sub":"f4010000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.admin_set_event_social('f4030000-0000-4000-8000-000000000001', false, null, null, 'Host asked to stop')$$,
  'admin can turn posting off'
);
select is(
  (select count(*) from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000001' and status = 'queued'),
  0::bigint,
  'turning posting off skips the waiting rows'
);
select is(
  (select count(*) from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000001' and status = 'skipped' and skipped_reason = 'Turned off by admin'),
  4::bigint,
  'the skip reason is plain'
);
select lives_ok(
  $$select public.admin_social_retry((select id from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000001' and platform = 'instagram' and kind = 'feed'))$$,
  'admin can retry a skipped post'
);
select lives_ok(
  $$select public.admin_social_skip((select id from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000001' and platform = 'instagram' and kind = 'feed'), 'Not this one')$$,
  'admin can skip a post'
);
select lives_ok(
  $$select public.admin_social_retry((select id from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000001' and platform = 'instagram' and kind = 'story'))$$,
  'admin can retry the story before editing its caption'
);
select lives_ok(
  $$select public.admin_social_update_caption((select id from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000001' and platform = 'instagram' and kind = 'story'), E'Hello\x00 there')$$,
  'admin can edit a waiting caption'
);
select is(
  (select caption from public.social_posts where event_id = 'f4030000-0000-4000-8000-000000000001' and platform = 'instagram' and kind = 'story'),
  'Hello there',
  'control characters are removed from the caption'
);
select lives_ok(
  $$select public.admin_social_queue_event('f4030000-0000-4000-8000-000000000009')$$,
  'admin can queue an older live event by hand'
);
select lives_ok(
  $$select public.admin_update_social_settings(true, '09:00', '21:30', 20, 'Pause after review')$$,
  'admin can change the site social settings'
);
select is(
  (select count(*) from public.audit_log where action in (
    'Social posting changed', 'social_post_retried', 'social_post_skipped',
    'social_caption_changed', 'social_event_queued', 'social_settings_changed'
  ) and actor_id = 'f4010000-0000-4000-8000-000000000003'),
  7::bigint,
  'every admin social action writes an audit row'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"f4010000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.admin_update_social_settings(false, '09:00', '21:30', 25, 'Staff attempt')$$,
  '42501', null, 'only an admin can change site social settings'
);
select lives_ok($$select * from public.platform_social_settings$$, 'staff can read social settings');
select lives_ok($$select * from public.event_social_settings$$, 'staff can read event social settings');
select lives_ok($$select * from public.social_posts$$, 'staff can read social posts');
reset role;

select set_config('request.jwt.claims', '{"sub":"f4010000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.social_posts), 0::bigint, 'a host cannot read social posts');
select is((select count(*) from public.event_social_settings), 0::bigint, 'a host cannot read event social settings');
select is((select count(*) from public.platform_social_settings), 0::bigint, 'a host cannot read site social settings');
select throws_ok(
  $$insert into public.social_posts(event_id, platform, kind) values ('f4030000-0000-4000-8000-000000000001', 'instagram', 'feed')$$,
  '42501', null, 'a host cannot insert a social post'
);
select throws_ok(
  $$update public.social_posts set status = 'posted'$$,
  '42501', null, 'a host cannot update a social post'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"f4010000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.social_posts), 0::bigint, 'a team member cannot read social posts');
select throws_ok(
  $$delete from public.event_social_settings$$,
  '42501', null, 'a team member cannot delete event social settings'
);
reset role;

set local role anon;
select throws_ok($$select * from public.social_posts$$, '42501', null, 'anon cannot read social posts');
select throws_ok($$select * from public.event_social_settings$$, '42501', null, 'anon cannot read event social settings');
select throws_ok($$select * from public.platform_social_settings$$, '42501', null, 'anon cannot read site social settings');
select lives_ok(
  $$select id, slug, title, status, published_at, hidden_at, is_unlisted, capacity from public.events where false$$,
  'anon can still read the public event columns'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"f4010000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select id, slug, title, status, published_at, hidden_at, is_unlisted, capacity, details from public.events limit 1$$,
  'an authenticated member can still read the public event columns'
);
reset role;
select is(
  (select count(*) from pg_attribute
    where attrelid = 'public.events'::regclass and attnum > 0 and not attisdropped
      and attname in ('autopost', 'ig_collaborator', 'is_test')),
  0::bigint,
  'events has no new social columns'
);

set local role service_role;
select throws_ok(
  $$insert into public.social_posts(event_id, platform, kind) values ('f4030000-0000-4000-8000-000000000001', 'instagram', 'feed')$$,
  '42501', null, 'the worker cannot write posts except through its functions'
);
select lives_ok($$select social_private.ig_posted_last_24h()$$, 'the worker can count recent Instagram posts');
reset role;

select * from finish();
rollback;
