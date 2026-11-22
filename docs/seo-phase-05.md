# SEO Phase 05 — Category discovery

Curated category pages: concerts, festivals & parties, conferences, comedy shows, workshops, and sports events.

- Routes: `/events/category/<category>` with descriptive titles, canonical URLs, real public upcoming event cards, category/city navigation, and organiser calls to action.
- These pages use the existing `discovery_events` view, which excludes hidden, paused, private and draft events.
- When a category has no upcoming public events, the page renders a truthful empty state, is `noindex,follow`, and stays out of the sitemap.
- `Wedding / Private` and `Other` do not get SEO landing pages; they keep their existing filtered discovery links.
- Real events can automatically activate a category sitemap URL once published. No fabricated listings or category-specific Event structured data is added.

## Verify
1. With all events hidden, check `/events/category/concerts`: accessible with an empty state and noindex.
2. Confirm the category is absent from `/sitemap.xml`.
3. With a genuine publicly published upcoming Concert event, confirm the listing and sitemap inclusion.
4. Confirm private events never appear, homepage category links work, and Google Search Console only indexes eligible pages.
5. Validate the mobile layout and full automated CI.
