begin;
-- Emulate the Storage API's session setting for metadata-only RLS fixtures.
-- All rows are rolled back; application deletion still uses storage.remove().
set local storage.allow_delete_query = 'true';
select plan(16);
select is((select public from storage.buckets where id = 'event-media'), true, 'event media is public');
select is((select public from storage.buckets where id = 'private-files'), false, 'private files are private');
select is((select file_size_limit from storage.buckets where id = 'event-media'), 5242880::bigint, 'image cap is 5 MB');
select is((select file_size_limit from storage.buckets where id = 'private-files'), 10485760::bigint, 'private cap is 10 MB');
select is((select allowed_mime_types from storage.buckets where id = 'event-media'), array['image/jpeg','image/png','image/webp'], 'only safe image MIME types');
select ok((select relrowsecurity from pg_class where oid = 'storage.objects'::regclass), 'storage objects have RLS');
insert into storage.objects (bucket_id, name) values ('event-media', 'policy-test.png'), ('private-files', 'policy-test.pdf');
-- A broad future policy must not accidentally open our private data or uploads.
create policy storage_test_broad on storage.objects for all to anon, authenticated using (true) with check (true);
set local role anon;
select is((select count(*) from storage.objects where bucket_id = 'event-media' and name = 'policy-test.png'), 1::bigint, 'anon reads public media');
select is((select count(*) from storage.objects where bucket_id = 'private-files'), 0::bigint, 'anon cannot read private files');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('event-media','anon.png')$$, '42501', null, 'anon cannot upload public media');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('private-files','anon.pdf')$$, '42501', null, 'anon cannot upload private files');
update storage.objects set name='changed.png' where bucket_id='event-media';
select is((select name from storage.objects where bucket_id='event-media' and name='policy-test.png'), 'policy-test.png', 'anon cannot update media');
reset role;
set local role authenticated;
select is((select count(*) from storage.objects where bucket_id = 'private-files'), 0::bigint, 'authenticated cannot read private files');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('event-media','user.png')$$, '42501', null, 'authenticated cannot upload public media');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('private-files','user.pdf')$$, '42501', null, 'authenticated cannot upload private files');
update storage.objects set name='changed.pdf' where bucket_id='private-files';
delete from storage.objects where bucket_id in ('event-media','private-files');
reset role;
select is((select name from storage.objects where bucket_id='private-files' and name='policy-test.pdf'), 'policy-test.pdf', 'authenticated cannot update private files');
select is((select count(*) from storage.objects where name in ('policy-test.png','policy-test.pdf')), 2::bigint, 'authenticated cannot delete files');
select * from finish();
rollback;
