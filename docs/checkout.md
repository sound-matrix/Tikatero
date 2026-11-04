# Checkout and Cashfree PG

Guest checkout lives at `/e/[slug]/checkout`; old `/book` links redirect there.
No browser writes orders or payment state. The server validates quantities and
consent, rate-limits hashed IP/email keys in Postgres, validates Turnstile when
configured, reloads ticket prices and computes integer paise using PR 10's engine.
The hold RPC checks the pinned version, fee payer, free flag and tier prices again
under inventory locks. A concurrent price change asks the buyer to refresh.

## Environment switches

Names and placeholders are in `.env.example`. No payment keys enter client assets.

- `CASHFREE_ENV`: `mock`, `sandbox`, `production`. On preview and local development,
  empty with no keys uses mock. Incomplete sandbox/production credentials fail closed.
  Production (`VERCEL_ENV=production`, or `NODE_ENV=production` outside Vercel preview
  and `vercel dev`) selects mock only when `PAYMENTS_ALLOW_MOCK=true` and
  `CASHFREE_ENV=mock`. Otherwise missing Cashfree credentials throw
  `payments not configured`. Paid checkout then shows "Online payments are not
  available yet. Please check back soon." and creates no order or hold. Free events
  still book.
- `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`: server credentials for the selected account.
- `CASHFREE_WEBHOOK_SECRET`: optional distinct signing key; falls back to the PG secret.
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`: configure both together. Without the
  secret the server logs a configuration-only skip note. Hostname and action must match.
- `CRON_SECRET`: bearer authentication for `/api/cron/payments`. The same value must
  be stored as the GitHub Actions secret `CRON_SECRET`. Do not commit the value.
- `APP_URL`: optional GitHub Actions variable for the reconcile workflow. When unset,
  the workflow calls `https://tikatero.vercel.app`.
- `PAYMENTS_ALLOW_MOCK`: exactly `true`, together with `CASHFREE_ENV=mock`, enables the
  mock provider in production. Mock orders are always stored with `is_test=true`.
  Sandbox orders are also `is_test`. Default blocks mock in production.

The existing canonical site URL must match the deployed origin. Configure Cashfree
webhooks to POST `/api/cashfree/webhook` and enable Easy Split for the merchant and
approved organiser vendors. API version is `2026-01-01`. Cashfree order amounts and
fixed vendor splits are converted from paise only at the provider boundary. The
remaining amount stays with the platform; the pricing engine's gateway fee remains
part of the pinned ledger. Cashfree's actual gateway costs are reconciled separately.

## State and inventory

Holds expire after ten minutes; active holds plus sold seats may never exceed tier
inventory or event capacity. Transitions lock event, tiers in UUID order, then order.
`checkout_transition` is the only paid transition. Its transaction stores webhook
idempotency, consumes holds, increments sold counts, marks paid, and writes one
`order.paid` outbox row. Duplicate success and a concurrent Get Order result cannot
repeat these effects. Failed/dropped attempts release holds. A late failed attempt
never reverses a paid order.

Expired/released seats are rechecked for late success. If unavailable, the order
stays expired and `payment.review_required` is queued; an operator must resolve it.
No automatic fulfilment is emitted. Cashfree create timeouts retain the order for
reconciliation because the remote create could have succeeded.

Reconciliation runs in bounded batches. GitHub Actions workflow
`.github/workflows/payments-cron.yml` calls `GET /api/cron/payments` every five
minutes and can also be started with `workflow_dispatch`. The repository needs the
Actions secret `CRON_SECRET` (the same value as the Vercel env var) and the optional
Actions variable `APP_URL`. Vercel Cron is only a once-daily backstop (`0 3 * * *`)
because Hobby accounts reject schedules that run more than once per day. The route
requires `Authorization: Bearer $CRON_SECRET`, compared with a timing-safe equality
check, and returns 401 otherwise. No secret values belong in the repo or in logs.

The order status page and `/orders/[id]/status/poll` each reconcile that one
authorized order on demand, at most once every 10 seconds, using the service role.
A paid Cashfree order can therefore confirm between scheduled runs. Provider errors
leave the order for retry and stamp `reconciled_at` so one failure cannot be polled
continuously. An unpaid stale order is expired after a successful Get Order check.
Payment webhooks remain able to reconcile a late success. Orders are immutable price
snapshots; provider vendor IDs and amounts are copied at checkout.

The guest receives a random, HttpOnly, SameSite cookie scoped to that order. Only
its hash is stored. Alternatively a verified signed-in buyer can read their own
orders through RLS. Merely knowing an order UUID grants no access. Guest checkout
links/creates an unverified profile by email; it never authenticates the browser,
confirms the email, or overwrites an existing profile.

## PR 12 contract

Consume `order_outbox` rows with topic `order.paid`, fulfil idempotently per order,
and stamp `consumed_at`. Honour `payload.is_test`; test orders must remain clearly
marked and must not trigger real production fulfilment accidentally. Free RSVP
orders use provider `free` and the exact same paid transition/outbox. This PR does
not create tickets, QR codes, PDFs, confirmation emails or payouts.

## Validation

Unit tests cover raw-byte signatures, webhook tampering and stable dedupe identity,
provider totals/splits, production mock gating (no hold when unconfigured, `is_test`
when mock is explicitly enabled, mock allowed on preview/dev) and input tampering.
Transactional
pgTAP covers holds, inventory exhaustion, paid-once, failed/expired releases and RLS.
`scripts/checkout-concurrency.mjs` runs 50 simultaneous hold RPCs against ten seats,
then races duplicate webhooks and pollers across the ten successful orders.
Playwright uses unique local fixtures for success, failure, free RSVP and paused
organisers, plus buyer isolation and desktop/mobile screenshots. CI runs these
against an isolated Supabase stack. Never point fixture scripts at production.
