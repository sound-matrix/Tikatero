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
