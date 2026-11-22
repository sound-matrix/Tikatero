# Tikatero SEO Phase 08 — Technical indexing hygiene

## Changes

- The canonical event discovery URL `/events` remains `index,follow`.
- Nonempty query parameters (search, city, category, price, dates, tracking, or pagination) yield `noindex,follow` and point to the canonical `/events` page. Public browsing, search and filter functionality remain unchanged.
- The Instagram-oriented `/events/upcoming` social feed is accessible to visitors but marked `noindex,follow`; it is removed from the sitemap as a noncanonical derivative of the main public listing.
- Curated city and category landing pages still become indexable only when public upcoming events exist, and remain excluded from the sitemap when empty.
- Hidden and unlisted events remain excluded by the existing public discovery view, and direct event detail pages preserve existing visibility controls.
- Automated unit and browser tests verify canonical and robots tags.

## Search Console operational checklist

1. Confirm `https://tikatero.com/sitemap.xml` remains submitted and is processed successfully in Search Console.
2. Use URL Inspection for `/events`, a filtered `/events?q=...`, `/organisers`, and a real publicly published event.
3. Under Page indexing, distinguish intentional `noindex`, duplicate canonical pages, and private/404 URLs from unexpected indexing errors.
4. Monitor Performance → Search results for organic clicks, impressions and query trends. Compare against a baseline; do not assume submitted URLs are indexed.
5. For genuine backlinks, encourage real organisers to link from their own websites, social profiles, and partner pages to public Tikatero event pages. Never buy link networks or create fabricated listings.
6. Recheck Core Web Vitals and sitemap coverage periodically, especially after content and event visibility changes.

Google guidance:
- https://developers.google.com/crawling/docs/faceted-navigation
- https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap

No changes to ticket pricing, payment logic, organiser access, or database schema.
