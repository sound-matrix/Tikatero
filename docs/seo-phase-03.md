# Tikatero SEO Phase 03 — Google Event results

Event pages expose schema.org/Event JSON-LD to Google. This phase synchronizes the structured offer state with the visible event booking state:
- In-stock tickets: `InStock`; sold-out ticket or full-event capacity: `SoldOut`.
- Tickets not yet on sale: `validFrom` without misleading preorder status.
- Closed ticket sales and ended events: do not claim ticket availability.
- Prices use INR and zero for truly free event tickets.
- Ticket offer URLs point to the **public, crawlable event page**, where the booking links appear. Do not point an offer to an auth-gated checkout.
- Physical venue and organizer data are taken from the actual event record.

After deploying, test at https://search.google.com/test/rich-results using a **published, listed, non-test event URL**. Google documentation: https://developers.google.com/search/docs/appearance/structured-data/event

In Search Console, inspect the event URL, check for indexing errors, and monitor Event rich-result enhancements if Google reports them. Eligibility doesn't guarantee rich-result appearance. Keep test and unlisted events out of search engines; future work should review expired events in discovery/sitemap and comprehensive event-status handling.
