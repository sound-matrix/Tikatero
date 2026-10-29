begin;
select plan(16);
insert into auth.users(id,email) values
 ('d9090000-0000-4000-8000-000000000001','discovery-db-one@example.test'),
 ('d9090000-0000-4000-8000-000000000002','discovery-db-two@example.test');
insert into public.organisers(id,owner_id,display_name,slug,kyc_status,approved_at) values
 ('d9090000-0000-4000-8000-000000000001','d9090000-0000-4000-8000-000000000001','Public Host','discovery-db-host','approved',now()),
 ('d9090000-0000-4000-8000-000000000002','d9090000-0000-4000-8000-000000000002','Paused Host','discovery-db-paused','approved',now());
insert into public.events(id,organiser_id,slug,title,starts_at,status) values
 ('d9090000-0000-4000-8000-000000000010','d9090000-0000-4000-8000-000000000001','discovery-db-live','Live',now()+interval '1 day','published'),
 ('d9090000-0000-4000-8000-000000000011','d9090000-0000-4000-8000-000000000001','discovery-db-draft','Draft',null,'draft'),
 ('d9090000-0000-4000-8000-000000000012','d9090000-0000-4000-8000-000000000002','discovery-db-paused','Paused',now()+interval '1 day','published');
update public.organisers set sales_paused=true where id='d9090000-0000-4000-8000-000000000002';
insert into public.ticket_types(id,event_id,name,price_paise,qty_total,qty_sold) values
 ('d9090000-0000-4000-8000-000000000020','d9090000-0000-4000-8000-000000000010','General',100099,10,3),
 ('d9090000-0000-4000-8000-000000000021','d9090000-0000-4000-8000-000000000012','Paused tier',100000,10,0);
insert into public.event_guests(event_id,name) values ('d9090000-0000-4000-8000-000000000012','Private paused guest');
set local role anon;
select is((select count(*) from public.discovery_events where id::text like 'd909%'),1::bigint,'anon sees only live non-paused fixture');
select is((select count(*) from public.discovery_events where slug='discovery-db-draft'),0::bigint,'draft absent');
select is((select count(*) from public.discovery_events where slug='discovery-db-paused'),0::bigint,'paused absent');
select is((select count(*) from public.events where id='d9090000-0000-4000-8000-000000000012'),0::bigint,'direct event API also hides paused event');
select is((select count(*) from public.ticket_types where id='d9090000-0000-4000-8000-000000000021'),0::bigint,'paused tiers are hidden by RLS');
select is((select count(*) from public.event_guests where event_id='d9090000-0000-4000-8000-000000000012'),0::bigint,'paused guests hidden');
select is((select organiser_name from public.discovery_events where slug='discovery-db-live'),'Public Host','safe public organiser name');
select ok((select verified from public.discovery_events where slug='discovery-db-live'),'approval produces verified flag');
select is((select tickets_sold from public.discovery_events where slug='discovery-db-live'),3::bigint,'trending counts sold tickets');
select is((select min_price_paise from public.discovery_events where slug='discovery-db-live'),100099::bigint,'price retains integer paise');
select throws_ok('select email from public.discovery_events','42703',null,'no email column');
select throws_ok('select phone from public.discovery_events','42703',null,'no phone column');
select throws_ok('select kyc_status from public.discovery_events','42703',null,'no KYC column');
select throws_ok('select wizard_revision from public.discovery_events','42703',null,'no private draft metadata');
select throws_ok($$insert into public.discovery_events(id) values ('d9090000-0000-4000-8000-000000000099')$$,'55000',null,'public projection is not writable');
reset role;
select ok((select 'security_invoker=true'=any(reloptions) from pg_class where oid='public.discovery_events'::regclass),'view respects querying role RLS');
select * from finish();
rollback;
