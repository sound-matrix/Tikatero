# Auth, profiles and role routing

Tikatero uses one email sign-in at `/login`. The browser uses `@supabase/ssr`
PKCE cookies; the server verifies sessions with `auth.getUser()` and reads roles
and memberships through RLS. User metadata never grants access.

| Account                                     | After sign-in      | Direct access                               |
| ------------------------------------------- | ------------------ | ------------------------------------------- |
| Attendee, no memberships                    | `/me`              | No console or admin                         |
| Organiser member, KYC not approved          | `/console/pending` | No other console pages or admin             |
| Organiser member, any approved organisation | `/console`         | Console; no admin                           |
| Staff or admin                              | `/admin`           | Admin; console also requires a membership   |
| Blocked profile, any role                   | `/blocked`         | Protected pages redirect to the reason page |

All active users can edit their own name and optional phone at `/me/settings`.
An organiser profile role without a membership grants no console access. If a
user belongs to multiple organisations, any approved membership opens the console;
future organisation-specific features must still scope every query by membership.

## Environment and delivery setup

- Added: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (preferred public key).
- Existing `NEXT_PUBLIC_SUPABASE_ANON_KEY` remains a fallback.
- Existing `NEXT_PUBLIC_SUPABASE_URL` is required.
- Existing `SUPABASE_SERVICE_ROLE_KEY` is available only through the module guarded
  by `server-only`. The normal app auth/signup/profile flows never use it.
- `.env.example` contains names only for Supabase keys. Never commit `.env.local`.

Set Supabase Auth's Site URL to the site's origin and allow the exact
`https://<your-host>/auth/callback` redirect URL. The local config includes
`http://127.0.0.1:3000/auth/callback` and `http://localhost:3000/auth/callback`.
Configure previews with their exact callback URL as needed.

Email OTP and magic links use the same Supabase `signInWithOtp` request. Set the
provider's email OTP length to 6. The email delivery configuration must expose
`{{ .Token }}` for code entry and `{{ .ConfirmationURL }}` for the standard PKCE
magic link. Default emails that show only a link still support the link flow;
code entry needs the provider to include the code. This PR does not author or
change email templates or SMTP credentials. Token-hash email links using
`/auth/callback?token_hash={{ .TokenHash }}&type=email` are also supported.

No user-supplied `next` destination is accepted. Expired/used links return a
plain-English error on `/login`. The callback removes token parameters from the
redirect and sets `no-referrer` and `no-store` headers.

## Database

PR 02's `on_auth_user_created` and `organisers_add_owner` triggers are reused.
The new restrictive INSERT policy requires self-service organiser accounts to
start as draft with no approval/vendor/payout controls set. It also rejects
blocked-user signup. Existing migrations are untouched.

The Become an organiser action inserts using a stable ID/slug derived from the
verified user's ID. Membership creation is atomic through the existing trigger.
Repeated use returns to the existing membership; it never inserts a second owner.
The profile's global role stays unchanged: membership is the source of console
access. No KYC application or uploads are created in this PR.

## Verify locally

Requires Node 22, pnpm 10, Supabase CLI 2.122.0 and Docker/Podman.

```bash
pnpm install --frozen-lockfile
supabase start
supabase db reset
node scripts/local-auth-env.mjs
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm test:auth
pnpm build && pnpm check:no-secrets
```

`local-auth-env.mjs` captures locally generated CLI credentials in `.env.local`
without printing them. Never run it for a hosted project. Playwright refuses
non-local Supabase URLs and creates/deletes its own users and organisations.
The CI DB job runs the actual Supabase auth browser suite (no app auth bypass).
OTP fixtures are generated with the local Auth Admin API, then verified through
the login UI; this avoids coupling tests to email templates.

For a manual mailbox check, run `pnpm dev`, request sign-in at `/login`, and open
`http://127.0.0.1:54324` (local mail viewer, previously called Inbucket). Use the
code if the delivery email includes it, or click the link in the same browser
that requested sign-in. Repeat with attendee, organiser pending/approved and
staff profiles, then block a profile and check its reason page. Do not change
roles in user metadata; use local Studio to set the database profile role and
organiser KYC state. Keep organisation approval timestamps consistent with the
PR 02 constraints.

CI checks lint, types, unit tests, production build and `.next/static` secret
scanning, plus SQL and Playwright tests against a fresh local Supabase stack.
The scanner fails if assets are missing or contain privileged env names, exact
configured server key values, `sb_secret_` keys or JWTs with role `service_role`.
It only prints filenames for findings, never the matching value.
