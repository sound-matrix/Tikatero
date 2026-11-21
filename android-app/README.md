# Tikatero Android (GitHub-built APK)

This initial Android application opens the live Tikatero service at https://tikatero.com in a secure WebView. It shares the current website's backend. Android sources are isolated from the Next.js production site.

## Download a test APK from GitHub

Open the repository's **Actions** tab, select **Tikatero Android APK**, open a successful run, then download the **Tikatero-Android-debug-APK** artifact ZIP. Extract `app-debug.apk` and install on an Android device. A debug APK is for internal testing, not a Play Store release.

Push or pull request changes under `android-app/` to build automatically, or choose **Run workflow** after the workflow exists on the default branch.

## Validation before release

Test Supabase sign-in and return callback, event browsing, real payment-provider redirect and return, ticket download, QR scanning (camera permissions), organiser console, and accessibility on actual Android devices. Some hosted payment providers block embedded WebViews: if detected, build native browser/Custom Tabs checkout and verified app links before accepting real payments in-app.

For production distribution, add an Android app icon, app links, stable release signing key stored in GitHub Secrets, instrumented tests and a signed release APK/AAB. Do not publish a debug build as a production app.
