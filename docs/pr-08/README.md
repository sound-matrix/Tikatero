# PR 08 — Organiser event creation wizard

The organiser console now has an eight-step event wizard, saved drafts, a resumable event list and publish controls. It reuses `events`, `event_guests`, `ticket_types` (the existing tier table), organiser memberships, the P4 logo and R2 image uploads.

Draft saves keep unfinished required fields; continuing validates the step. Every request is validated with Zod. A security-invoker RPC saves the event and child changes in one transaction, with membership checks, target locks, revision checks and slug collision suffixes. Guest and tier IDs stay stable. Sold tiers cannot be removed or repriced. Free events save zero-paise RSVP tiers.

Only draft events may have no start date. Dates are stored as timestamps and edited/displayed in IST. Leaflet uses OpenStreetMap tiles and attribution. Google Maps links containing coordinates place the pin automatically; short links are retained as directions and can be paired with a manually selected pin. No Maps API key is required.

The fee preview uses the new `lib/pricing` stub interface: an explicitly illustrative ₹1,000 example with a 2% fee and 18% GST on that fee. PR 10 will replace the implementation. Publishing validates the saved event and locks/rechecks organiser approval and sales pause status. The existing database publish trigger still rejects unapproved/paused organisers through the direct Data API.

Pending organisers can open event list/draft routes through the narrowly authorised guard exception. Their other console restrictions remain. The organiser console footer contains only `© Sound Matrix`; public/admin footer links are retained. Public event pages, pricing/payment logic, admin tools and KYC flows are untouched.

## Validation

- Lint, typecheck, 184 unit tests, production build and `check:no-secrets` pass locally.
- All six pgTAP files pass: 135 assertions, including 29 wizard checks for ownership, pending/paused publish locks, resumable drafts, revision conflicts, transactional child saves, zero-paise RSVP tiers and slug uniqueness.
- Playwright covers the complete approved organiser journey, reload/list resume, all eight screenshots, a pending organiser's partial free draft, and UI/direct-API publish denial.
- CI uploads all eight screenshots in the `event-wizard-screenshots` artifact.

## Environment

No new environment variables. Existing Supabase and R2 configuration is reused. Without R2 configuration, poster/guest photo steps explain that uploads are unavailable and drafts can continue. No live database migration is applied by the PR.

## Screenshots

Captured from the passing browser suite using test fixtures and upload safe mode.

1. [Basics](wizard-step-01.png)
2. [Date & time](wizard-step-02.png)
3. [Venue & map](wizard-step-03.png)
4. [Poster](wizard-step-04.png)
5. [VIP & guests](wizard-step-05.png)
6. [Ticket tiers](wizard-step-06.png)
7. [Fees & refunds](wizard-step-07.png)
8. [Review & publish](wizard-step-08.png)
