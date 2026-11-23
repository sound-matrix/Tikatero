# Tikatero — native Android implementation

This branch is the beginning of a **fully native Android app**. It replaces the WebView activity with Android-native Home, Discover, Tickets and Account screens and native bottom navigation. No page is embedded from the website.

## Current implementation

- Native Java Activity and Android View navigation.
- No WebView and no website rendering.
- Native dark UI with responsive Android density sizes.
- Explicit unavailable states; the app does not invent live events or show a misleading checkout.

## Not yet implemented (do not distribute as a full-featured Tikatero app)

- Auth with Supabase and secure sessions / deep links.
- Live event search, filters, details and booking API.
- PayU native-safe checkout and verified return flows.
- My Tickets with downloadable QR codes, scanner and camera permission.
- Host onboarding, KYC, event publishing, sales, settlements and organiser console.
- Push notifications, analytics, accessibility testing, automated instrumentation and release signing.

Use the live website for business-critical flows until native integrations are verified. Keep server access governed by existing authentication and RLS; never embed service-role credentials or payment secrets in the APK.

## GitHub APK

The workflow `.github/workflows/android-apk.yml` builds a **debug APK** for pull requests that touch `android-app/`. Open its Actions run, download `Tikatero-Android-debug-APK`, and extract `app-debug.apk`.

A debug APK is an internal test artifact, not a signed production release. This branch must remain unmerged until functional parity is achieved and tested.

No Vercel deployment is required for the Android build.
