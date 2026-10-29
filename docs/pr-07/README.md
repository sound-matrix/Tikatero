# PR 07 — Admin CMS

Staff can review the oldest waiting KYC applications, inspect masked checks and private document previews, approve/reject/request specific corrections, search accounts, restrict access, and toggle organiser holds. The dashboard counts real rows; dates use IST.

All four public RPCs are invoker wrappers around staff-checked security-definer functions in a private schema. Mutations lock the target and insert a minimal audit snapshot in the same transaction. Application revisions prevent stale decisions. Own organisers cannot be reviewed. Direct organiser control updates and direct audit inserts are revoked; existing immutable row triggers are retained and TRUNCATE is also blocked. Notes redact common identity numbers and credentials. Existing migrations, onboarding, uploads, email internals, routing and legal text are unchanged.

Notifications reuse the existing email sender and templates with an audit-ID idempotency key. Failed or unconfigured delivery is shown explicitly and can be retried without repeating the mutation. `onOrganiserApproved(organiserId)` is the intentional PR 14 stub. Publishing already checks approved status in the PR 2 database trigger. Suspend uses the existing blocked-account restriction until unblocked, with the supplied reason on `/blocked`.

## Validation

- Lint, typecheck, 161 unit tests, production build, client secret scan.
- All five pgTAP files pass on a fresh PostgreSQL 16 database with Supabase roles/Auth schema: 40 new Admin CMS assertions, including a deliberately failed audit insert rolling back both application and organiser changes.
- Playwright coverage: approve/unlock organiser console, block/reason/unblock, hold/sales toggles, request-docs/reject email templates, non-staff denial on every new route. CI runs these against the local Supabase stack.
- Queue, detail and accounts screenshots are captured by `e2e/admin-cms.spec.ts` and uploaded as `admin-cms-screenshots` in CI.

## Environment

No environment variable names added. Existing Supabase, email and R2 configuration is reused. No live database migration is applied by this PR.
