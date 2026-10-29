begin;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data)
values ('f3333333-3333-4333-8333-333333333333', 'auth-signup@tikatero.test', '{"full_name":"Signup attendee","role":"admin"}'::jsonb);
select is((select role::text from public.profiles where id = 'f3333333-3333-4333-8333-333333333333'), 'attendee', 'signup ignores user-controlled role metadata');
select is((select full_name from public.profiles where id = 'f3333333-3333-4333-8333-333333333333'), 'Signup attendee', 'existing profile trigger creates name');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select lives_ok($$ insert into public.organisers (id, owner_id, display_name, slug) values ('f4444444-4444-4444-8444-444444444444', 'f3333333-3333-4333-8333-333333333333', 'New organiser', 'signup-test') $$, 'self-service signup creates draft');
select is((select role::text from public.organiser_members where organiser_id = 'f4444444-4444-4444-8444-444444444444' and user_id = 'f3333333-3333-4333-8333-333333333333'), 'owner', 'existing owner trigger creates membership');
select is((select kyc_status::text from public.organisers where id = 'f4444444-4444-4444-8444-444444444444'), 'draft', 'organiser starts in draft KYC');
select throws_ok($$ insert into public.organisers (owner_id, display_name, slug, kyc_status, approved_at) values ('f3333333-3333-4333-8333-333333333333', 'Bypass', 'bypass-test', 'approved', now()) $$, '42501', null, 'self-service signup cannot start approved');
select throws_ok($$ update public.profiles set role = 'admin' where id = 'f3333333-3333-4333-8333-333333333333' $$, '42501', null, 'profile editing cannot escalate role');
reset role;
update public.profiles set blocked_at = now(), block_reason = 'Account needs review' where id = 'f3333333-3333-4333-8333-333333333333';
set local role authenticated;
select throws_ok($$ insert into public.organisers (owner_id, display_name, slug) values ('f3333333-3333-4333-8333-333333333333', 'Blocked signup', 'blocked-signup-test') $$, '42501', null, 'blocked account cannot create an organiser');
select * from finish();
rollback;
