begin;
select plan(16);

select ok(
  (
    select c.relrowsecurity
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'contact_messages'
  ),
  'contact_messages has RLS on'
);
select ok(
  not has_table_privilege('anon', 'public.contact_messages', 'SELECT'),
  'anon cannot select contact messages'
);
select ok(
  not has_table_privilege('anon', 'public.contact_messages', 'INSERT'),
  'anon cannot insert contact messages'
);
select ok(
  not has_table_privilege('authenticated', 'public.contact_messages', 'SELECT'),
  'authenticated cannot select contact messages'
);
select ok(
  not has_table_privilege('authenticated', 'public.contact_messages', 'INSERT'),
  'authenticated cannot insert contact messages'
);

insert into auth.users (id, email) values
  ('c1700002-0000-4000-8000-000000000002', 'contact-staff@example.test'),
  ('c1700003-0000-4000-8000-000000000003', 'contact-buyer@example.test');
update public.profiles set role = 'staff' where id = 'c1700002-0000-4000-8000-000000000002';

set local role service_role;
select lives_ok(
  $$insert into public.contact_messages (id, name, email, topic, message, ip_hash)
    values (
      'c1700001-0000-4000-8000-000000000001',
      'Priya Shah',
      'priya@example.test',
      'refund',
      'Please help with my refund request.',
      repeat('cd', 32)
    )$$,
  'server can save a contact message'
);
select lives_ok(
  $$update public.contact_messages
    set emailed_at = now()
    where id = 'c1700001-0000-4000-8000-000000000001'$$,
  'server can record that the notification was sent'
);
select throws_ok(
  $$update public.contact_messages
    set status = 'replied'
    where id = 'c1700001-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'server cannot change contact status directly'
);

set local role anon;
select throws_ok(
  $$select * from public.contact_messages$$,
  '42501',
  null,
  'anon select is denied'
);
select throws_ok(
  $$insert into public.contact_messages (name, email, topic, message, ip_hash)
    values ('Ann', 'ann@example.test', 'other', 'Hello from a visitor.', repeat('ab', 32))$$,
  '42501',
  null,
  'anon insert is denied'
);

set local role authenticated;
select throws_ok(
  $$select * from public.contact_messages$$,
  '42501',
  null,
  'authenticated select is denied'
);
select throws_ok(
  $$insert into public.contact_messages (name, email, topic, message, ip_hash)
    values ('Ann', 'ann@example.test', 'other', 'Hello from a visitor.', repeat('ab', 32))$$,
  '42501',
  null,
  'authenticated insert is denied'
);

select set_config('request.jwt.claims', '{"sub":"c1700003-0000-4000-8000-000000000003","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'c1700003-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.admin_mark_contact_replied('c1700001-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'a buyer cannot mark a message replied'
);

select set_config('request.jwt.claims', '{"sub":"c1700002-0000-4000-8000-000000000002","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'c1700002-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.admin_mark_contact_replied('c1700001-0000-4000-8000-000000000001')$$,
  'staff can mark a message replied'
);

reset role;
select is(
  (select status from public.contact_messages where id = 'c1700001-0000-4000-8000-000000000001'),
  'replied',
  'status is replied'
);
select ok(
  exists (
    select 1
    from public.audit_log
    where action = 'contact_replied'
      and entity = 'contact_messages'
      and entity_id = 'c1700001-0000-4000-8000-000000000001'
      and actor_id = 'c1700002-0000-4000-8000-000000000002'
      and before->>'status' = 'new'
      and after->>'status' = 'replied'
  ),
  'status change is audited'
);

select * from finish();
rollback;
