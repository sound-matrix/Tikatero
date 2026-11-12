begin;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
  ('c2300000-0000-4000-8000-000000000001','profile-a@example.test',now()),
  ('c2300000-0000-4000-8000-000000000002','profile-b@example.test',now()),
  ('c2300000-0000-4000-8000-000000000003','profile-staff@example.test',now());
update public.profiles set role = 'staff' where id = 'c2300000-0000-4000-8000-000000000003';
insert into public.organisers(id,owner_id,display_name,slug,kyc_status,approved_at) values
  ('c2300000-0000-4000-8000-000000000011','c2300000-0000-4000-8000-000000000001','Profile host','profile-host','approved',now());
insert into public.events(id,organiser_id,slug,title,status,starts_at,is_free) values
  ('c2300000-0000-4000-8000-000000000012','c2300000-0000-4000-8000-000000000011','profile-event','Profile event','published',now()+interval '1 day',true);

select is((select count(*)::integer from auth.users u join public.profiles p on p.id=u.id
  where nullif(u.email,'') is not null and u.deleted_at is null and p.block_reason is distinct from 'Account deleted'
  and not exists(select 1 from public.user_emails e where e.user_id=u.id and e.is_login and lower(e.email::text)=lower(u.email))),
  0,'existing and new Auth users have the matching login row');
select ok((select verified_at is not null from public.user_emails where user_id='c2300000-0000-4000-8000-000000000002' and is_login),'confirmed login email is verified');

insert into public.user_phones(user_id,phone_e164,is_primary) values
  ('c2300000-0000-4000-8000-000000000002','+919876543211',true);
insert into public.user_social_links(user_id,platform,url) values
  ('c2300000-0000-4000-8000-000000000002','x','https://x.com/profileb');
insert into public.user_checkout_preferences(user_id,ticket_name,upi_id) values
  ('c2300000-0000-4000-8000-000000000002','Profile B','b-example@bank');
insert into public.user_consents(user_id,kind,granted,source) values
  ('c2300000-0000-4000-8000-000000000002','email_marketing',true,'profile');
insert into public.event_shares(event_id,user_id,channel) values
  ('c2300000-0000-4000-8000-000000000012','c2300000-0000-4000-8000-000000000002','whatsapp');
insert into public.event_ref_visits(event_id,channel,visitor_hash) values
  ('c2300000-0000-4000-8000-000000000012','whatsapp',repeat('a',64));

select throws_ok($$insert into public.user_phones(user_id,phone_e164,is_primary)
  values ('c2300000-0000-4000-8000-000000000002','+919876543212',true)$$,'23505',null,'only one primary phone');
select throws_ok($$insert into public.user_emails(user_id,email,is_primary)
  values ('c2300000-0000-4000-8000-000000000002','another@example.test',true)$$,'23505',null,'only one primary email');
select is((select phone from public.profiles where id='c2300000-0000-4000-8000-000000000002'),'+919876543211','primary phone syncs the legacy field');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c2300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::integer from public.user_phones where user_id='c2300000-0000-4000-8000-000000000002'),0,'other phones are private');
select is((select count(id)::integer from public.user_emails where user_id='c2300000-0000-4000-8000-000000000002'),0,'other emails are private');
select is((select count(*)::integer from public.user_social_links where user_id='c2300000-0000-4000-8000-000000000002'),0,'other links are private');
select is((select count(*)::integer from public.user_checkout_preferences where user_id='c2300000-0000-4000-8000-000000000002'),0,'other checkout details are private');
select is((select count(*)::integer from public.user_consents where user_id='c2300000-0000-4000-8000-000000000002'),0,'other consent history is private');
select is((select count(*)::integer from public.event_shares),0,'individual share events are private');
select is((select count(*)::integer from public.event_ref_visits),0,'individual visits are private');
select is((select count(*)::integer from public.admin_user_overview),0,'attendee cannot read admin user view');
select throws_ok($$update public.user_phones set verified_at=now()$$,'42501',null,'users cannot verify their own phones by writing');
select throws_ok($$update public.user_emails set is_login=true,verified_at=now(),verify_token_hash='fake'$$,'42501',null,'email verification columns are protected');
select throws_ok($$select verify_token_hash from public.user_emails$$,'42501',null,'verification hashes are private');
select throws_ok($$insert into public.user_consents(user_id,kind,granted,source)
  values('c2300000-0000-4000-8000-000000000002','email_marketing',false,'profile')$$,'42501',null,'users cannot write another user’s consent');
select throws_ok($$insert into public.user_social_links(user_id,platform,url)
  values('c2300000-0000-4000-8000-000000000002','instagram','https://instagram.com/someone')$$,'42501',null,'users cannot write another user’s link');
select throws_ok($$insert into public.user_checkout_preferences(user_id)
  values('c2300000-0000-4000-8000-000000000002')$$,'42501',null,'users cannot write another user’s checkout preferences');
select throws_ok($$insert into public.event_shares(event_id,channel)
  values('c2300000-0000-4000-8000-000000000012','copy')$$,'42501',null,'event share writes require service role');
select throws_ok($$insert into public.event_ref_visits(event_id,channel,visitor_hash)
  values('c2300000-0000-4000-8000-000000000012','copy',repeat('b',64))$$,'42501',null,'event visit writes require service role');
select throws_ok($$select public.change_profile_phone('remove',(select id::text from public.user_phones where user_id='c2300000-0000-4000-8000-000000000002'))$$,'P0001',null,'users cannot remove someone else’s phone');
select lives_ok($$select public.change_profile_phone('add','+919876543210')$$,'user can add an own phone');
select lives_ok($$select public.change_profile_phone('add','+14155550132')$$,'user can add a second phone');
select lives_ok($$select public.change_profile_phone('primary',(select id::text from public.user_phones where phone_e164='+14155550132'))$$,'user can change primary phone');
select is((select phone from public.profiles where id='c2300000-0000-4000-8000-000000000001'),'+14155550132','switching the primary phone syncs the profile');
select lives_ok($$select public.save_profile_consents(true,false)$$,'grant email marketing');
select lives_ok($$select public.save_profile_consents(false,false)$$,'withdraw email marketing');
select is((select count(*)::integer from public.user_consents where kind='email_marketing'),2,'both consent changes are kept');
select lives_ok($$insert into storage.objects(bucket_id,name) values('avatars','c2300000-0000-4000-8000-000000000001/profile.webp')$$,'avatar owner can write');
select throws_ok($$insert into storage.objects(bucket_id,name) values('avatars','c2300000-0000-4000-8000-000000000002/profile.webp')$$,'42501',null,'cannot upload to another avatar folder');
select is((select visits::integer from public.event_share_stats('c2300000-0000-4000-8000-000000000012') where channel='whatsapp'),1,'host can read aggregate visits');
select is((select shares::integer from public.event_share_stats('c2300000-0000-4000-8000-000000000012') where channel='whatsapp'),1,'host can read aggregate shares');
select is((public.export_my_account()->'phones'->0->>'phone_e164'),'+919876543210','export includes saved phones');

select set_config('request.jwt.claims','{"sub":"c2300000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.event_share_stats('c2300000-0000-4000-8000-000000000012')$$,'42501',null,'non-member cannot read aggregate counts');
select is((select count(*)::integer from storage.objects where bucket_id='avatars' and name='c2300000-0000-4000-8000-000000000001/profile.webp'),0,'cannot list another avatar folder');
select is((public.export_my_account()->'checkout_preferences'->>'upi_id'),'b-•••@bank','export masks the UPI ID');

select set_config('request.jwt.claims','{"sub":"c2300000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select primary_email from public.admin_user_overview where id='c2300000-0000-4000-8000-000000000002'),'profile-b@example.test','staff can read user overview');
select throws_ok($$select public.event_share_stats('c2300000-0000-4000-8000-000000000012')$$,'42501',null,'staff without membership cannot read organiser counts');
reset role;
select set_config('request.jwt.claims','{}',true);
select ok(public.claim_backup_email('c2300000-0000-4000-8000-000000000002','backup@example.test',repeat('c',64)),'backup email claim succeeds');
select ok(public.verify_backup_email(repeat('c',64)),'valid backup link verifies the address');
select ok(not public.verify_backup_email(repeat('c',64)),'backup link is single-use');
select is((select count(*)::integer from information_schema.columns where table_schema='public'
  and column_name ~ 'card_number|cvv|expiry' and column_name <> 'id_doc_expiry'),0,'no card number, CVV or card expiry columns');

insert into public.ticket_types(id,event_id,name,price_paise,qty_total)
values('c2300000-0000-4000-8000-000000000013','c2300000-0000-4000-8000-000000000012','Free pass',0,10);
select lives_ok($$select public.checkout_hold_with_profile(
  'c2300000-0000-4000-8000-000000000014','c2300000-0000-4000-8000-000000000001','profile-event',
  'Profile A','delivery@example.test','9876543210','[{"id":"c2300000-0000-4000-8000-000000000013","qty":1,"price_paise":0}]',
  (select id from public.active_pricing_version()),'organiser',true,
  '{"subtotal":0,"platform_fee":0,"platform_fee_gst":0,"gateway_fee":0,"buyer_total":0,"organiser_share":0,"platform_share":0}',
  'free','synthetic-hash','[]',false,'profile-a@example.test','whatsapp')$$,'signed-in hold allows a different delivery email');
select is((select buyer_email from public.orders where id='c2300000-0000-4000-8000-000000000014'),'delivery@example.test','order stores the ticket delivery email');
select is((select ref_channel from public.orders where id='c2300000-0000-4000-8000-000000000014'),'whatsapp','order stores referral with the hold');
select is(public.checkout_transition('c2300000-0000-4000-8000-000000000014','paid',0,'INR'),'paid','free pass keeps the existing paid transition');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c2300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select bookings::integer from public.event_share_stats('c2300000-0000-4000-8000-000000000012') where channel='whatsapp'),1,'confirmed bookings count by referral');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c2300000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.delete_my_account()$$,'account deletion completes');
reset role;
select is((select count(*)::integer from public.user_emails where user_id='c2300000-0000-4000-8000-000000000002'),0,'deletion removes login and backup emails');
select is((select user_id from public.event_shares where event_id='c2300000-0000-4000-8000-000000000012' limit 1),null::uuid,'deletion anonymises shares');
select ok(exists(select 1 from public.avatar_cleanup where user_id='c2300000-0000-4000-8000-000000000002' and path=''),'deletion queues physical avatar cleanup');

select * from finish();
rollback;
