# Tikatero SEO Phase 04 — City-based discovery

This phase adds curated city landing pages at `/events/in/<city>` for Hyderabad, Bengaluru, Mumbai, Delhi, Pune, Chennai, Kolkata and Ahmedabad.

## Indexing safeguards
- Each page queries only the public `discovery_events` view for upcoming events in India. Hidden/unlisted events are not revealed.
- Approved city routes always work for visitors and have descriptive metadata and canonical URLs.
- A city without a public upcoming event emits `noindex,follow` and is omitted from `/sitemap.xml`.
- As real organisers publish eligible upcoming events, the page becomes indexable and enters the sitemap automatically.
- No fake city events, fabricated event counts, generic Event JSON-LD on listing pages, or bulk keyword doorway pages are created.

## Verification
1. Inspect `/events/in/hyderabad` and `/events/in/mumbai` with no published events: the empty state must show, meta robots must be noindex, and neither city URL should appear in the sitemap.
2. Publish an actual non-test, publicly listed future event in a chosen city. Confirm it appears on that city's page, with canonical URL and indexable meta robots.
3. Check that the city enters the sitemap and the event page remains accessible and valid in Google's Rich Results Test.
4. Check that a private/unlisted event never appears.
5. Validate mobile layout and internal navigation from home to city and category filters.

Google guidance: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
