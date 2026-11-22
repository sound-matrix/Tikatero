# Tikatero SEO Phase 02 — Google Setup

Production site: https://tikatero.com

## Google Search Console
1. Sign in to https://search.google.com/search-console using Tikatero's Google account.
2. Add the URL-prefix property `https://tikatero.com/`. A Domain property is preferred if DNS access is available.
3. For URL-prefix HTML-tag verification, copy only the `content` token from the verification meta tag into Vercel Production environment variable `GOOGLE_SITE_VERIFICATION`. Redeploy, then click Verify. Domain-property DNS verification must be completed at the DNS provider instead.
4. Submit `https://tikatero.com/sitemap.xml` under Sitemaps.
5. Inspect the homepage, `/events`, and a real public event page using URL Inspection. Request indexing only for representative eligible pages.
6. Monitor Pages indexing, search queries, Core Web Vitals and rich results.

## Google Analytics 4
1. Create/select a GA4 property and web stream for `https://tikatero.com`.
2. Copy the Measurement ID (format `G-XXXXXXXXXX`) to Vercel Production `NEXT_PUBLIC_GA_MEASUREMENT_ID`. Redeploy.
3. Check GA4 Realtime/DebugView from the public site, and confirm page-view behavior during client-side navigation.
4. Do not set the variable on Preview unless intentional. Analytics is loaded on public pages only; dashboard/admin views are excluded.
5. Review privacy notices, consent configuration and data retention before enabling analytics in markets where consent is required.

## Important
- Code support does **not** create a Search Console or GA4 property; Google-side steps require a verified owner.
- Do not publish a Search Console verification token in GitHub or commit real environment variables.
- Sitemap inclusion does not guarantee Google indexing.
- Test, private and old events should be reviewed for index eligibility in later SEO work.
