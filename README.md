# Tikatero

Tikatero is Sound Matrix’s events and ticketing platform. This repository is a Next.js app with three surfaces:

- Public site at `/`
- Organiser console at `/console`
- Tikatero admin at `/admin`

The shared design system is at `/styleguide`. Product context lives in `docs/BUILD-PLAN.md`. The approved visual reference is `docs/tikatero-v3-prototype.html`.

## Prerequisites

- Node.js 22
- pnpm 10

## Local development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`.env.example` lists variable names only. Put real values in `.env.local` or the host’s secret store. Do not commit secrets.

## Database

Schema, row level security, and the local seed live in `supabase/`.

```bash
supabase start
supabase db reset
pnpm test:db
```

`pnpm test:db` runs the database checks: anonymous reads of published events, organiser order isolation, ticket writes, the append-only audit log, the publish rule, and single-use redemption.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright test
```

Prices are stored as integer paise and shown in Indian rupees, including GST. Times on screen use India Standard Time (`Asia/Kolkata`).

## Transactional email and Resend

The server-only `lib/email/send.ts` exports `send`. Later features can call it;
this PR does not wire notifications to payments, tickets, events or verification.
Staff can inspect all 14 sample templates at `/admin/emails/preview` without a
Resend key. The gallery never sends email.

Environment names only (put values in the host’s secret store):

- `RESEND_API_KEY` (existing name)
- `EMAIL_FROM` (new; a sender on your verified domain)
- `EMAIL_REPLY_TO` (new; optional reply address)

Use the existing `NEXT_PUBLIC_SITE_URL` as the production HTTPS site origin for
absolute logo and button URLs. It contains no secret. The shared email layout
uses `public/brand/tikatero-email-logo.png`, a faithful PNG export of the existing
brand SVG, with a solid coral
CTA fallback for email clients that do not support gradients. INR values reuse
the existing paise formatter and add `incl. GST`; all times use the existing IST
formatter.

Apply the new migration before using the sender. It adds one nullable
`email_log.idempotency_key` column, backfills one identity per legacy notification,
and adds a unique index plus a server-role-only atomic claim function. Existing
email log columns and staff-only read RLS are preserved. Only the server service
client writes logs. Email bodies, attachment bytes and raw provider errors are
never written to logs or printed.

Identity is `(template, trimmed entityRef, lowercased trimmed recipient)`. Use a
stable entity reference, such as an order UUID or an event-change revision ID.
A new reminder/change that intentionally needs a separate email must have its
own stable revision/reference; changing copy alone does not bypass deduplication.

A database claim is committed before the provider is called. The wrapper also
passes its opaque key to Resend. Configuration skips log `skipped_not_configured`
and can be claimed once later when configuration is added. A missing Resend key
never constructs the SDK or crashes a page. Missing/invalid sender or production
site configuration also skips. If the database is unavailable, `logging_failed`
is returned and no email is attempted.

The no-duplicates guarantee deliberately favors at-most-once delivery attempts:
`sending`, `sent`, `unknown`, `failed_provider` and `failed_render` claims are never
automatically reclaimed. Resend retains its own keys for only 24 hours. If a
process stops after claiming, delivery may be missed; if the provider times out,
it may already have accepted the email. Reconcile held records with the provider
before any intentional new notification. Do not delete claims or add blind
retries. `sent_unlogged` means the provider accepted the email but the final log
update failed; its existing claim still blocks a repeat. `sent` means accepted by
the provider, not guaranteed inbox delivery. Webhook delivery tracking is later work.

`order_confirmed` accepts an optional attachments array of `{ filename, content,
contentType? }`. Content must be a Buffer or base64 string; remote paths are not
accepted. Maximum 10 attachments and 10 MB combined decoded content. No attachment
or email content is stored in `email_log`. Template data and optional `actionPath`
are typed; action paths must stay on the configured site. Defaults point to
existing account/console/admin surfaces; later integrations supply their intended
deep links.

### Supabase Auth SMTP through Resend

1. Verify your sending domain in Resend and obtain its sending credentials.
2. In Supabase, open **Authentication → Email → SMTP Settings** and enable custom SMTP.
3. Set SMTP host to `smtp.resend.com`, port to `465`, and username to `resend`.
4. Set the SMTP password using the value of `RESEND_API_KEY` from your secret store.
   Set the sender address/name to the verified sender represented by `EMAIL_FROM`.
   These are settings in Supabase, not additional client environment variables.
5. Keep the existing auth callback allow-list. To offer both OTP and magic-link
   sign-in, the Supabase delivery template must include its `{{ .Token }}` and
   `{{ .ConfirmationURL }}` placeholders, as documented in `docs/AUTH.md`.

SMTP Auth mail is sent by Supabase and does not call this transactional wrapper,
so it is not logged in `email_log` and is not governed by this wrapper’s claims.
This README describes configuration only; no SMTP settings or auth routing are
changed by this PR. Do not paste credentials into the repository or build logs.

Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`,
`pnpm build && pnpm check:no-secrets`, and `pnpm exec playwright test`.
Sender tests mock Resend; each template has an HTML/plain-text snapshot. All CI
checks run without a real Resend key. Snapshots contain synthetic sample data only.

## Organiser verification (PR 06)

Open `/console/onboarding` from the pending console. Choose India, then save each of the seven
steps. Outside India shows a support link. Saving a step persists masked results, so organisers
can leave and resume. A `needs_docs` application reopens only its flagged steps; changing a
flagged legal name resets dependent checks. Submitted applications are locked for review.
`auto_passed` is a queue result, **not approval**: the existing database publishing guard still
requires `approved`. The existing event screen remains a placeholder; this PR does not add the
event wizard. The pending page explains drafting and shows publishing as locked.

Apply the new migration before using the flow. It extends PR 2's `kyc_applications` with
`step_progress`, an optimistic `revision`, `flagged_steps` and `submission_count`. A partial
unique index allows one current onboarding row per organiser while retaining historical rows.
The existing masked columns, review fields, statuses and membership helpers are reused.

Organiser members read their own application through existing RLS; staff can read all. Writes
run through authenticated server actions and a service-only, security-invoker save RPC. Both
check active membership; the RPC repeats the check and locks the organiser/application, checks
the revision, and updates queue status in the same transaction. Browser writes to provider
results are revoked so callers cannot forge a successful check or approve themselves. PR 7
should use staff-authorized server operations to update reviewer fields and `flagged_steps`.
The only auth-route change is allowing the exact onboarding path for pending members.

### Provider settings

New env names (empty in `.env.example`):

- `KYC_MODE`
- `KYC_NAME_MATCH_THRESHOLD`
- `CASHFREE_SECURE_ID_CLIENT_ID`
- `CASHFREE_SECURE_ID_CLIENT_SECRET`
- `CASHFREE_SECURE_ID_ENV`

Set `KYC_MODE` to `mock`, **or leave either Secure ID key unset**, to use the mock provider.
This works without Cashfree or R2 credentials: the mock DigiLocker and selfie steps do not
upload files. Mock mode is clearly labelled and uses synthetic checks, including Aadhaar ending 1234. It never checks government records or moves money. Never use simulation as evidence for
staff approval. Production submissions always flag non-skipped mock checks as `needs_docs`
when `VERCEL_ENV=production`, even with explicit mock mode. A production Node build also holds
simulated evidence unless `KYC_MODE=mock` is explicitly set for local/preview testing. The banner
clearly labels all simulated checks. When switching to Cashfree, old mock checks are flagged for replacement.
`KYC_NAME_MATCH_THRESHOLD` defaults to 85; invalid/out-of-range settings fail closed.

With both Secure ID keys set and mock mode off, `CASHFREE_SECURE_ID_ENV` accepts `sandbox`
(default) or `production`. The adapter uses fixed Cashfree hosts and no automatic retries for
verification deposits. Configure a public HTTPS `NEXT_PUBLIC_SITE_URL` for DigiLocker's return
address. The organiser gives consent on Cashfree/DigiLocker, returns to the Aadhaar step, and
chooses “I finished DigiLocker — check result”. Reference IDs come from the saved application,
not callback query parameters. No live provider calls were made for this PR; provider account
permissions, consent URLs and production responses must be checked in Cashfree sandbox before
turning it on. Official API references used:

- [PAN](https://www.cashfree.com/docs/api-reference/vrs/v2/pan/verify-pan-sync)
- [Bank verification](https://www.cashfree.com/docs/api-reference/vrs/v2/bav-v2/bank-account-verification-sync-v2)
- [GSTIN](https://www.cashfree.com/docs/api-reference/vrs/v2/gstin/verify-gstin)
- [DigiLocker](https://www.cashfree.com/docs/secure-id/digilocker/digilocker)

### Privacy and manual checks

PAN and bank account numbers are transient verification inputs only. Only their last four,
provider reference IDs and scores are saved. GSTIN contains a PAN, so only its last four are
saved too. Names, organiser type, contact phone and city are saved as organiser details. Provider
responses are reduced to an allowlist; document bodies, addresses and raw provider errors are
not persisted or logged. Raw input controls are cleared after a successful save. No KYC inputs
are placed in local storage or URLs.

Offline Aadhaar XML is read transiently (under 1 MB, no XML entity expansion); only the last four
from the UIDAI reference are kept, and the file is discarded. This is **not signature
verification**, so it always needs manual review. QR document and selfie fallbacks reuse the
existing `ImageUpload` with `kyc_doc`: JPG/PNG/WebP (also PDF for Aadhaar) in the private R2 bucket. Upload masked
Aadhaar documents only. Object keys are checked against the current organiser and remain
private; the existing staff-only read route is unchanged. A still-image upload never claims to
prove liveness. Live biometric capture is left behind the provider interface; the configured
Cashfree flow currently uses the manual selfie fallback. Mock mode simulates both liveness and
face matching.

All completed checks and name matches at/above the threshold produce `auto_passed`; failed,
manual or low-match checks produce `needs_docs`. Both are retained in the staff queue. On submit,
the existing email wrapper sends `kyc_submitted` to the owner and `staff_alert` to active staff
and admins. Identity is `kyc/<application-id>/submission/<count>`, so retrying a notification is
idempotent and a later corrected submission has a distinct identity. Missing email configuration
is logged by PR 5's wrapper; email failure does not undo saved verification progress.

### Verification

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm check:no-secrets`.
With local Supabase running, reset migrations and run `supabase test db`, then
`node scripts/local-auth-env.mjs` and `pnpm exec playwright test`. The KYC browser test covers
resume, all mock steps, masked database results, pending status, locked publishing, flagged-step
resubmission and missing-key email logs. Unit tests cover matching, masking, provider selection,
Cashfree response minimisation, server-action ownership and state transitions. Screenshots are in
[`docs/pr-06`](docs/pr-06/README.md).
