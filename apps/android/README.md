# Tikatero Android app — foundation

Expo React Native shell for Tikatero's EXISTING web experience. This is a first foundation, not the final native ticketing application.

## Single payment backend
The site and this app use the same Supabase-backed orders and PayU server code. PayU gateway callbacks are verified only on the server; the Android app must never assert that a purchase succeeded from a WebView URL. Test real success, failure, 3DS / UPI returns, refund, and QR ticket issuance before release.

## Cloud APK build, no Android Studio
```bash
cd apps/android
npm install
npx expo install --fix
npx tsc --noEmit
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build -p android --profile preview
```
Set EXPO_PUBLIC_TIKATERO_URL to the verified Tikatero production HTTPS origin in your Expo/EAS build environment first. No PayU secrets in Expo public environment variables. Preview produces APK; production produces AAB.

## Pending
Verify actual production URL, app icons, Android payment return flows and auth cookies; test on physical devices. Build dedicated native UI for event discovery, QR wallet, organiser dashboards and check-in scanner before store release.
