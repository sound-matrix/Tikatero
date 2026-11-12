begin;
select plan(24);
insert into auth.users (id,email) values
  ('a7240001-0000-4000-8000-000000000001','intl-organiser@example.test'),
  ('a7240002-0000-4000-8000-000000000002','india-organiser@example.test'),
  ('a7240003-0000-4000-8000-000000000003','intl-admin@example.test'),
  ('a7240004-0000-4000-8000-000000000004','intl-staff@example.test');
update public.profiles set role='admin' where id='a7240003-0000-4000-8000-000000000003';
update public.profiles set role='staff' where id='a7240004-0000-4000-8000-000000000004';
insert into public.organisers(id,owner_id,display_name,slug) values
  ('a7240001-0000-4000-8000-000000000001','a7240001-0000-4000-8000-000000000001','International Events','intl-events-test'),
  ('a7240002-0000-4000-8000-000000000002','a7240002-0000-4000-8000-000000000002','India Events','india-events-test');

set local role service_role;
select lives_ok($$ select * from public.save_kyc_progress(
  'a7240001-0000-4000-8000-000000000001','a7240001-0000-4000-8000-000000000001',0,
  '{"intlDetails":{"displayName":"International Events","legalName":"Alex Rivera","country":"GB","city":"London","phone":"+442079460123"}}',
  '{}','draft',false) $$,'international progress saves as a draft');
select is((select region::text from public.kyc_applications where organiser_id='a7240001-0000-4000-8000-000000000001'),'INTL','region comes from the selected country');
select throws_ok($$ select * from public.save_kyc_progress(
  'a7240001-0000-4000-8000-000000000001','a7240001-0000-4000-8000-000000000001',1,'{}','{}','draft',false) $$,
  'P0001','To change country, contact support','save refuses switching regions');
select throws_ok($$ select * from public.save_kyc_progress(
  'a7240001-0000-4000-8000-000000000001','a7240001-0000-4000-8000-000000000001',1,
  '{"intlDetails":{"country":"FR"}}','{}','draft',false) $$,
  'P0001','To change country, contact support','save refuses switching countries inside the international flow');
select throws_ok($$ update public.kyc_applications set region='IN' where organiser_id='a7240001-0000-4000-8000-000000000001' $$,
  'P0001','To change country, contact support','direct region changes are blocked too');
select throws_ok($$ update public.kyc_applications set id_doc_type='other' where organiser_id='a7240001-0000-4000-8000-000000000001' $$,
  '23514',null,'only supported document types are stored');
select throws_ok($$ update public.kyc_applications set id_doc_last4='12345' where organiser_id='a7240001-0000-4000-8000-000000000001' $$,
  '23514',null,'a five-character ID is rejected');
select throws_ok($$ update public.kyc_applications set id_doc_last4='' where organiser_id='a7240001-0000-4000-8000-000000000001' $$,
  '23514',null,'an empty ID suffix is rejected');
select throws_ok($$ insert into public.kyc_applications(organiser_id,region,id_country)
  values ('a7240001-0000-4000-8000-000000000001','INTL','IN') $$,
  '23514',null,'India is excluded from the international country column');
select throws_ok($$ insert into public.kyc_applications(organiser_id,region,id_country)
  values ('a7240001-0000-4000-8000-000000000001','INTL','gB') $$,
  '23514',null,'country codes are uppercase');
select throws_ok($$ insert into public.kyc_applications(organiser_id,region,id_doc_type)
  values ('a7240002-0000-4000-8000-000000000002','IN','passport') $$,
  '23514',null,'the new document fields are international-only');

select lives_ok($$
  select saved.id from public.kyc_applications a
  cross join lateral public.save_kyc_progress(
    'a7240001-0000-4000-8000-000000000001',a.organiser_id,a.revision,
    a.step_progress || jsonb_build_object(
      'idDocument',jsonb_build_object('type','national_id','last4','12CD','expiry',current_date+30),
      'idFront','kyc/'||a.organiser_id||'/'||a.id||'/a7240005-0000-4000-8000-000000000005.jpg',
      'idBack','kyc/'||a.organiser_id||'/'||a.id||'/a7240006-0000-4000-8000-000000000006.pdf',
      'selfie',jsonb_build_object('docKey','kyc/'||a.organiser_id||'/'||a.id||'/a7240007-0000-4000-8000-000000000007.png')
    ),'{}','submitted',true
  ) saved where a.organiser_id='a7240001-0000-4000-8000-000000000001'
  $$,'a complete international application submits for manual review');
select is((select doc_keys from public.kyc_applications where organiser_id='a7240001-0000-4000-8000-000000000001'),
  (select array[step_progress->>'idFront',step_progress->>'idBack',step_progress#>>'{selfie,docKey}']
    from public.kyc_applications where organiser_id='a7240001-0000-4000-8000-000000000001'),
  'front, back and selfie are mapped to doc_keys');
select is((select country || ':' || legal_name || ':' || kyc_status from public.organisers
  where id='a7240001-0000-4000-8000-000000000001'),'GB:Alex Rivera:submitted',
  'submission updates the organiser record and review status');

select lives_ok($$ select * from public.save_kyc_progress(
  'a7240002-0000-4000-8000-000000000002','a7240002-0000-4000-8000-000000000002',0,
  '{"details":{"displayName":"India Events","legalName":"Demo India"},"pan":{"last4":"234A"},"aadhaar":{"docKey":"legacy-aadhaar"},"selfie":{"docKey":"legacy-selfie"}}',
  '{}','auto_passed',true) $$,'India keeps its existing auto-pass path');
select is((select region::text || ':' || pan_last4 || ':' || array_to_string(doc_keys,',') from public.kyc_applications
  where organiser_id='a7240002-0000-4000-8000-000000000002'),'IN:234A:legacy-aadhaar,legacy-selfie',
  'India retains its masked fields and document mapping');

select ok(not exists(select 1 from unnest(array['id_country','id_doc_type','id_doc_last4','id_doc_expiry']) c
  where has_column_privilege('anon','public.kyc_applications',c,'select')),'anonymous users cannot read any new column');
select ok(not exists(select 1 from unnest(array['id_country','id_doc_type','id_doc_last4','id_doc_expiry']) c
  where has_column_privilege('authenticated','public.kyc_applications',c,'select')),'authenticated users cannot read any new column');
select ok(not has_function_privilege('anon','public.save_kyc_progress(uuid,uuid,integer,jsonb,text[],public.kyc_status,boolean)','execute'),'anonymous users cannot save progress');
select ok(not has_function_privilege('authenticated','public.save_kyc_progress(uuid,uuid,integer,jsonb,text[],public.kyc_status,boolean)','execute'),'authenticated users cannot save progress');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a7240004-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$ select public.open_intl_kyc_document(
  (select id from public.kyc_applications where organiser_id='a7240001-0000-4000-8000-000000000001'),'front') $$,
  '42501','Admin access required','staff cannot open international identity documents');
select set_config('request.jwt.claims','{"sub":"a7240003-0000-4000-8000-000000000003","role":"authenticated"}',true);
select matches(public.open_intl_kyc_document(
  (select id from public.kyc_applications where organiser_id='a7240001-0000-4000-8000-000000000001'),'front'),
  '^kyc/.*/a7240005-0000-4000-8000-000000000005[.]jpg$','admin can open the referenced front image');
select is((select "after" from public.audit_log where action='kyc_document_view'
  and actor_id='a7240003-0000-4000-8000-000000000003'), '{"document":"front"}'::jsonb,
  'document audit contains only the slot, with no personal data or key');
select lives_ok($$ select public.admin_review_kyc(
  (select id from public.kyc_applications where organiser_id='a7240001-0000-4000-8000-000000000001'),
  2,'needs_docs',array['id'],'Please re-upload your ID.') $$,'admin can request an international step');

select * from finish();
rollback;
