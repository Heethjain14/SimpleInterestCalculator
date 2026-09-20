# Deploying the web app (Firebase Hosting + Firestore rules)

The app is an Expo web export served as a static site, backed directly by Firestore.
Each signed-in user can only read/write `users/{their uid}/**` (see `firestore.rules`).

## One-time setup

1. Firebase console -> Authentication -> Sign-in method -> enable **Email/Password**.
2. Authentication -> Settings -> User actions: once your own account exists, untick
   **Enable create (sign-up)** so strangers can't register (turn it back on for multi-user).
3. Authentication -> Settings -> Authorized domains: `<project>.web.app` and
   `<project>.firebaseapp.com` are there by default; add a custom domain here if you use one.
4. `npm i -g firebase-tools` then `firebase login`.

## Migrating the existing (pre-auth) data

Existing data lives in the top-level `borrowers/**` tree; the app copies it into
`users/{uid}` the first time you sign in.

1. Deploy the transitional rules (legacy tree readable by signed-in, non-anonymous users only):
   `firebase deploy --only firestore:rules --config firebase.transitional.json`
2. Open the app, sign in (create your account on first run). The migration runs automatically
   and writes `users/{uid}/meta/legacyMigration`. Check the data in the app.
3. Deploy the final `firestore.rules`: `npm run deploy:rules`.
4. In the Firestore console delete the old top-level `borrowers` collection (recursive delete).

## Deploy the site

```
npm run deploy:web      # expo export -p web, then firebase deploy --only hosting
```

Open the `*.web.app` URL in iPhone Safari -> Share -> **Add to Home Screen**.

## Hardening (recommended)

- **API key restriction**: Google Cloud Console -> APIs & Services -> Credentials -> the Web
  API key -> restrict to HTTP referrers (`<project>.web.app/*`, `<project>.firebaseapp.com/*`,
  `localhost` while developing) and to the Identity Toolkit + Firestore APIs. Note the Android
  app doesn't send a referrer, so if you keep using the APK, use a separate key for it.
- **App Check (web)**: create a reCAPTCHA v3 site key, register it in Firebase console ->
  App Check, then put the *site key* in `app.json` -> `expo.extra.appCheckSiteKey`. The code
  in `src/services/firebaseApp.ts` turns it on automatically. Enforce it for Firestore only
  after checking the App Check metrics look healthy (enforcing it breaks the Android APK,
  which has no App Check provider yet).
- **Budget alert** in Google Cloud Billing.

## PAN vault (web)

On web, PANs are encrypted in the browser with a separate vault passphrase (scrypt ->
XChaCha20-Poly1305, see `src/services/pan/`) and only ciphertext is stored, at
`users/{uid}/panVault/{recordId}` plus key metadata at `users/{uid}/meta/panVault`. The passphrase
and key never leave the browser. Forgetting the passphrase means saved PANs are unrecoverable
(the vault can be reset, which deletes them). On native, PANs stay in the device secure store.
