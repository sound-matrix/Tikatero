# PR 09: Attendee discovery & event page

Public discovery reuses the event wizard’s events, guests, ticket types, themes and upload keys. `/` includes location search, trending events, category links and organiser fee copy from the pricing interface. `/events` filters and paginates on the server. Location preferences are validated and stored in a one-year SameSite=Lax cookie.

Event pages show IST dates, verified organisers, guests, tier availability, refund rules, maps and a mobile booking bar. Book/RSVP opens the “Booking opens soon” placeholder. Sharing uses Web Share with a clipboard fallback. Canonical metadata, Event JSON-LD and a generated 1200 × 630 PNG cover social sharing. Missing media uses a theme-coloured placeholder. The venue map loads on expansion, without blocking the event page.

## Public data and caching

One additive migration adds `discovery_events`, a security-invoker, read-only projection with explicit safe columns. It reuses the existing `organisers_public` safe projection. A boolean visibility helper in the non-exposed `private` schema excludes paused organisers in both the view and public event RLS; child ticket and guest RLS follows event visibility. No KYC, contacts, payout details or wizard internals are selected by public pages. Public code uses an anonymous, session-free Supabase client even for signed-in visitors.

Discovery results revalidate every 60 seconds (30-second client stale interval, 300-second expiry). Event details, booking and OG images read current visibility on each request. Metadata resolves before response headers so unpublished, draft and paused event URLs return real HTTP 404 responses to ordinary browsers as well as crawlers.

## Validation

CI includes 192 unit tests, 151 pgTAP assertions and 28 browser tests, plus lint, typecheck, build and `check:no-secrets`.

Unit tests cover IST boundaries, integer-paise display, filter validation/URLs, availability and safe JSON-LD encoding. Transactional pgTAP fixtures verify public visibility and safe columns. Playwright covers discovery, remembered location, free RSVP, empty states, draft/paused 404s, booking placeholders, sharing, OG images, mobile layout and axe. Lighthouse CI runs three mobile audits against a production build and requires a median score of at least 90 for performance and accessibility.

CI runs Playwright against the production build; local Playwright runs use the development server. The local test environment explicitly uses the existing `KYC_MODE=mock` setting.

The CI-only discovery fixture is created by `scripts/discovery-fixture.mjs`, which refuses any non-local Supabase URL. It is never imported or run by production code. Existing migration files are unchanged. No new environment variables.

## Screenshots

Screenshots use local test data and media placeholders. Desktop is 1440 px wide; mobile is 390 px wide.

| Page          | Desktop                               | Mobile                               |
| ------------- | ------------------------------------- | ------------------------------------ |
| Homepage      | [View](discovery-home-desktop.png)    | [View](discovery-home-mobile.png)    |
| Event listing | [View](discovery-listing-desktop.png) | [View](discovery-listing-mobile.png) |
| Event detail  | [View](discovery-desktop.png)         | [View](discovery-mobile.png)         |
