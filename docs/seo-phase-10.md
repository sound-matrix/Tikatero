# Tikatero SEO Phase 10 — GA4 conversion funnel

## Implementation
The public layout already loads GA4 after interaction when the environment variable `NEXT_PUBLIC_GA_MEASUREMENT_ID` is a valid `G-...` identifier.

This phase adds the following anonymous funnel events through the existing GA4 installation:

| Event | Trigger | Important boundary |
|---|---|---|
| `organiser_signup_intent` | Organiser sign-up email code successfully requested | Lead action, not confirmed account |
| `organiser_email_verified` | Organiser email code successfully verified | Email verified, not necessarily approved organiser |
| `begin_checkout` | Checkout form submitted in non-test mode | Booking attempt, not sale |
| `ticket_reservation_created` | Backend accepted booking and provided next URL, non-test mode | Reservation initiated, not paid ticket |

Only `role` and `admission` (free/paid) are sent. No emails, phones, names, user IDs, event/order IDs, payment details or monetary amounts are transmitted in these events.

**Not yet instrumented**: verified paid purchase, organiser approval and event publication. They require hooking into the authoritative completion paths (including asynchronous PayU/Cashfree webhooks) to avoid counting abandoned, retried, fake or test transactions. Do not mark a purchase conversion or claim ticket revenue from `ticket_reservation_created`.

## Activation
1. In Google Analytics, create/select the Tikatero GA4 Web data stream and copy its Measurement ID, such as `G-XXXXXXXXXX`.
2. Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` in Vercel project environment variables for Production (and Preview if desired); redeploy so Next.js includes the public variable.
3. Verify that GA4's Realtime/DebugView receives anonymous funnel events, while testing without personal customer information.
4. In GA4 Admin → Events / Key events, mark verified organiser lead and reservation events as key events **only if** they correspond to your business definitions. Never mark `begin_checkout` as completed sales.
5. Connect the GA4 property and Search Console property through GA4 Admin → Product links → Search Console links. Search Console organic traffic and GA4 conversion reporting can then be compared; GA4 does not expose individual GSC queries for each transaction.
6. Compare 28-day organic clicks and impressions (GSC) against organic landing pages, signup-intent events and reservations (GA4). Watch for low data volume when all events are hidden.

## QA
- Existing GA4 installation remains optional and no new SDK is loaded.
- Unit tests verify event names, allowed dimensions, no arbitrary PII and safe no-op when GA4 is absent.
- No database or payment webhook modifications.
- Run lint, TypeScript, unit, build, Supabase, Playwright and Lighthouse before merge.
