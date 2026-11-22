# Tikatero SEO Phase 07 — Mobile speed and Core Web Vitals

## Changes

- The homepage hero is a single responsive `<picture>`: mobile screens and reduced-motion users receive the optimized static poster, while motion-enabled desktop users retain the existing GIF animation.
- The chosen hero loads eagerly at high priority; the browser does not request both GIF and PNG as separate `<img>` elements.
- Event listing posters use Next.js responsive image optimisation, quality 70, and lazy loading unless explicitly prioritised.
- Preserves the homepage artwork, event layout and existing image sources; no new media downloads or paid services required.

## Verification

1. Run the full existing CI (lint, TypeScript, tests, production build, Supabase, Playwright, Lighthouse).
2. Confirm 390px mobile: hero image visible, no network request for the GIF, page does not overflow.
3. Confirm 1280px desktop: animation source selected and poster still available as fallback.
4. Check mobile and desktop Google PageSpeed Insights (https://pagespeed.web.dev/) for the homepage, `/events`, and a publicly listed event.
5. Monitor LCP, CLS and INP in Google Search Console Core Web Vitals. Compare real-user trends over time; Lighthouse lab scores alone do not prove field improvements.

No Lighthouse thresholds are lowered. This change does not assert a new performance score before measurement.
