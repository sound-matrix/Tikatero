-- Local fixtures only. The password is for the local Supabase stack, not a production credential.

-- auth.users gains columns as GoTrue migrates. Insert the columns that exist now.
do $seed_users$
declare
  person record;
  has_email_confirmed boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'email_confirmed_at'
  ) into has_email_confirmed;

  for person in
    select *
    from (
      values
        (
          'a1111111-1111-4111-8111-111111111111'::uuid,
          'staff@tikatero.test',
          'Tikatero Staff'
        ),
        (
          'a2222222-2222-4222-8222-222222222222'::uuid,
          'diya@tikatero.test',
          'Diya Shah'
        ),
        (
          'a3333333-3333-4333-8333-333333333333'::uuid,
          'arun@tikatero.test',
          'Arun Mehta'
        )
    ) as seed_user (id, email, full_name)
  loop
    if has_email_confirmed then
      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
      )
      values (
        '00000000-0000-0000-0000-000000000000',
        person.id,
        'authenticated',
        'authenticated',
        person.email,
        extensions.crypt('local-dev-password', extensions.gen_salt('bf')),
        now(),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', person.full_name),
        now(),
        now(),
        '',
        '',
        '',
        ''
      );
    else
      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        confirmed_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
      )
      values (
        '00000000-0000-0000-0000-000000000000',
        person.id,
        'authenticated',
        'authenticated',
        person.email,
        extensions.crypt('local-dev-password', extensions.gen_salt('bf')),
        now(),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', person.full_name),
        false,
        now(),
        now(),
        '',
        '',
        '',
        ''
      );
    end if;
  end loop;
end;
$seed_users$;

update public.profiles
set
  role = 'staff',
  full_name = 'Tikatero Staff',
  country = 'IN'
where id = 'a1111111-1111-4111-8111-111111111111';

update public.profiles
set
  role = 'organiser',
  full_name = 'Diya Shah',
  country = 'IN'
where id = 'a2222222-2222-4222-8222-222222222222';

update public.profiles
set
  role = 'organiser',
  full_name = 'Arun Mehta',
  country = 'IN'
where id = 'a3333333-3333-4333-8333-333333333333';

insert into public.organisers (
  id,
  owner_id,
  display_name,
  slug,
  legal_name,
  country,
  kyc_status,
  approved_at,
  approved_by,
  payouts_on_hold,
  sales_paused
)
values
  (
    'b1111111-1111-4111-8111-111111111111',
    'a2222222-2222-4222-8222-222222222222',
    'Diya Events',
    'diya-events',
    'Diya Events',
    'IN',
    'approved',
    '2026-10-20 10:00:00+05:30',
    'a1111111-1111-4111-8111-111111111111',
    false,
    false
  ),
  (
    'b2222222-2222-4222-8222-222222222222',
    'a3333333-3333-4333-8333-333333333333',
    'Harbour House',
    'harbour-house',
    'Harbour House',
    'IN',
    'submitted',
    null,
    null,
    false,
    false
  );

insert into public.kyc_applications (
  id,
  organiser_id,
  region,
  pan_last4,
  pan_name,
  pan_name_match,
  status,
  reviewer_id,
  reviewer_note,
  submitted_at,
  decided_at
)
values
  (
    'f1111111-1111-4111-8111-111111111111',
    'b1111111-1111-4111-8111-111111111111',
    'IN',
    '1234',
    'Diya Shah',
    true,
    'approved',
    'a1111111-1111-4111-8111-111111111111',
    'Checked against the organiser name.',
    '2026-10-18 11:00:00+05:30',
    '2026-10-20 10:00:00+05:30'
  ),
  (
    'f2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222222',
    'IN',
    '9876',
    'Arun Mehta',
    true,
    'submitted',
    null,
    null,
    '2026-10-27 16:00:00+05:30',
    null
  );

insert into public.pricing_versions (
  id,
  platform_pct,
  fixed_fee_paise,
  gst_bps,
  gateway_mode,
  gateway_bps,
  payout_days,
  effective_from,
  created_by
)
values (
  'e1111111-1111-4111-8111-111111111111',
  150,
  500,
  1800,
  'pass_at_cost',
  195,
  2,
  '2026-10-28 00:00:00+05:30',
  'a1111111-1111-4111-8111-111111111111'
);

insert into public.events (
  id,
  organiser_id,
  slug,
  title,
  description,
  category,
  starts_at,
  ends_at,
  gates_open_at,
  timezone,
  venue_name,
  address,
  city,
  country,
  lat,
  lng,
  maps_url,
  theme,
  status,
  is_free,
  fee_payer,
  refund_policy,
  capacity,
  published_at
)
values (
  'c1111111-1111-4111-8111-111111111111',
  'b1111111-1111-4111-8111-111111111111',
  'diwali-night',
  'Diwali Night',
  'An evening of music and lights. Doors open at 6:00 pm IST. Prices include GST.',
  'festive',
  '2026-11-08 19:00:00+05:30',
  '2026-11-08 23:30:00+05:30',
  '2026-11-08 18:00:00+05:30',
  'Asia/Kolkata',
  'Sound Matrix Hall',
  'Bandra, Mumbai',
  'Mumbai',
  'IN',
  19.054400,
  72.840600,
  'https://maps.google.com/?q=19.0544,72.8406',
  'diwali',
  'published',
  false,
  'organiser',
  '72h',
  440,
  '2026-10-21 09:00:00+05:30'
);

insert into public.event_guests (event_id, name, title, sort, is_vip)
values (
  'c1111111-1111-4111-8111-111111111111',
  'Asha Rao',
  'Host',
  0,
  true
);

insert into public.ticket_types (
  id,
  event_id,
  name,
  price_paise,
  qty_total,
  qty_sold,
  per_order_max,
  is_vip,
  sort
)
values
  (
    'd1111111-1111-4111-8111-111111111111',
    'c1111111-1111-4111-8111-111111111111',
    'General admission',
    99900,
    400,
    0,
    10,
    false,
    0
  ),
  (
    'd2222222-2222-4222-8222-222222222222',
    'c1111111-1111-4111-8111-111111111111',
    'VIP',
    499900,
    40,
    0,
    4,
    true,
    1
  );

insert into public.event_team (event_id, user_id, role, invited_by)
values (
  'c1111111-1111-4111-8111-111111111111',
  'a2222222-2222-4222-8222-222222222222',
  'manager',
  'a2222222-2222-4222-8222-222222222222'
);
