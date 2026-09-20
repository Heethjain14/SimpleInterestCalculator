# Portfolio Ledger

A mobile-first loan management app for individual and small-scale lenders,
built with React Native (Expo) and Firebase (Auth + Firestore). It replaces
paper ledgers and spreadsheets with a structured, at-a-glance record of who
owes what, what's overdue, and what's already been collected.

You sign in with email/password; data is stored on-device (AsyncStorage) first
and syncs in the background to your private area of Firestore. It also runs
as a web app / iPhone home-screen app (see [DEPLOY.md](DEPLOY.md)).

## Features

Five screens, reachable from the sidebar drawer (tap ☰):

| Screen | What it does |
|---|---|
| **Dashboard** | Portfolio overview — total exposure, weighted average interest rate, outstanding vs. collected amounts, collection rate, overdue amount/count, active loan/borrower counts, and a due-soon preview. |
| **Due Payments** | Every overdue, not-fully-settled installment across all borrowers, sorted most-overdue first, with one-tap payment recording and a jump to the borrower's profile. |
| **Simple Interest** | Calculates simple interest over a date range and renders a shareable result card you can export as a PNG. |
| **EMI Schedule** | Generates a monthly installment schedule in **Cutting** mode (interest deducted upfront, full principal repaid) or **Adding** mode (interest added on top of principal, split evenly). |
| **Clients** | Full borrower/loan management — create/edit borrowers, attach loans with an auto-generated payment schedule, record payments (with automatic delay-interest and partial-payment tracking), delete loans/borrowers, and export a loan's statement as CSV. |

Other notable behavior:

- **Offline-first**: every read and write goes through on-device storage
  first; server sync is best-effort and never blocks or rolls back a local
  change.
- **Overdue tracking**: installments are flagged overdue automatically based
  on due date, with per-client and per-loan status indicators throughout the
  UI.
- **Partial payments**: a payment can be recorded for less than the full
  amount due; the remaining balance and delay interest are tracked per
  installment.
- **CSV export & PNG sharing**: a borrower's full loan statement can be
  shared as CSV; a Simple Interest result can be shared as a PNG image.

## Tech stack

- **App**: Expo (SDK 57), React Native 0.86, React 19, TypeScript, styled
  with React Native `StyleSheet` (no CSS framework) — runs on iOS, Android,
  and web via `react-native-web`.
- **Storage**: `@react-native-async-storage/async-storage` as the local
  source of truth.
- **Backend**: Firebase Authentication (email/password) and Cloud Firestore,
  accessed directly from the client; `firestore.rules` restricts every user to
  their own `users/{uid}` subtree. There is no server of our own.
- **Hosting**: Firebase Hosting for the web build (see [DEPLOY.md](DEPLOY.md)).

## Project structure

```
App.tsx                       Root shell: sidebar navigation + screen switch
index.ts                      Expo entry point
app.json                      Expo config, incl. extra.firebaseConfig
firestore.rules               Firestore security rules (owner-only access)
firebase.json                 Firebase Hosting + rules config
public/                       Web-only files: PWA manifest, icons, index.html template
DEPLOY.md                     Rules migration + hosting steps
eas.json                      EAS Build profiles

src/
  types.ts                     Borrower / Loan / Payment data model
  theme/tokens.ts               Shared design tokens (colors, radii, spacing)

  screens/                     Full-page views wired into the sidebar switch
    Dashboard.tsx                Portfolio metrics screen
    DuePaymentsList.tsx          Overdue installments screen
    SimpleInterestCalculator.tsx Simple interest calculator + share card
    EmiCalculator.tsx            EMI schedule generator
    BorrowerList.tsx             Client list, search, add/select
    BorrowerDetail.tsx           Borrower profile: loans, payments, CSV export
    LoginScreen.tsx              Email/password sign-in and sign-up

  components/                  Reusable UI widgets shared across screens
    BorrowerForm.tsx             Create/edit borrower (+ optional new loan)
    PaymentRecorder.tsx          Modal to record an installment payment
    DatePicker.tsx               Cross-platform date input
    ShareResultCard.tsx          Shareable PNG card for Simple Interest results
    RefreshButton.tsx            Triggers a pull from Firestore
    Sidebar.tsx                  Slide-in navigation drawer

  context/AuthContext.tsx       Firebase email/password auth state
  context/StorageContext.tsx    Borrower/loan state, AsyncStorage + Firestore sync
  hooks/useStorage.ts           Alias for useStorageContext()
  hooks/useNotifications.ts     Stub for future payment-reminder notifications
  navigation/screens.ts         Screen list + sidebar labels/icons

  services/firebaseApp.ts       Firebase init (app, auth, Firestore, optional App Check)
  services/firebaseSync.ts      Firestore reads/writes under users/{uid}
  utils/duePayments.ts          Overdue-installment logic
  utils/portfolioMetrics.ts     Portfolio aggregate metrics
  utils/format.ts               Currency/date formatting helpers
```

## Data flow

```
UI components  ->  StorageContext (AsyncStorage)  ->  firebaseSync.ts  ->  Firestore (users/{uid}/...)
```

- **UI components** call `useStorageContext()` to read `borrowers` and to
  call `saveBorrower`, `saveLoan`, `deleteLoan`, `deleteBorrower`, or
  `refreshFromServer`.
- **`src/context/StorageContext.tsx`** is the single source of truth. Every
  mutation is written to `AsyncStorage` (key `borrowers_data`) first; syncing
  to Firestore is attempted afterward on a best-effort basis and never blocks
  or rolls back the local write. `refreshFromServer` is the pull path — it
  fetches the full dataset and overwrites local state; it also runs
  automatically on sign-in when nothing is cached on the device.
- **`src/services/firebaseSync.ts`** stores each borrower at
  `users/{uid}/borrowers/{id}`, loans in a `loans` subcollection and
  installments in a `payments` subcollection.
- **Auth**: `AuthContext` + `LoginScreen` gate the app; the security rules
  (`firestore.rules`) only let the signed-in owner read or write their subtree.

## Setup

### Prerequisites

- Node.js 18+ and npm
- [Expo Go](https://expo.dev/go) on your phone, or an Android/iOS
  emulator/simulator

### Install & run the app

```bash
npm install
npm start
```

Then press `a` for Android, `i` for iOS, `w` for web, or scan the QR code
with Expo Go. (`npm run android` / `npm run ios` / `npm run web` do the same
directly.)

Sign in on the first screen (create an account the first time). Data is cached
on-device in `AsyncStorage`, so screens stay usable when offline.

### Firebase setup

The Firebase web config lives in `app.json` under `expo.extra.firebaseConfig`
(these are public client identifiers, not secrets). In the Firebase console
enable **Authentication -> Email/Password** and create the Firestore database,
then deploy `firestore.rules`. Step-by-step instructions, including moving
older data into a per-user account, are in [DEPLOY.md](DEPLOY.md).

### Build for production (EAS)

```bash
npx eas build --platform android   # or ios
```

The EAS project ID lives in `app.json` (`expo.extra.eas.projectId`) and
`eas.json` holds the build profiles.

## Testing

There's no automated test suite for the React Native app itself. The security
rules can be exercised with the Firebase Emulator Suite
(`firebase emulators:start --only firestore`) plus `@firebase/rules-unit-testing`.

## Interest formulas

**Simple interest** (Simple Interest screen):

```
interest = (principal × ratePercent × days) / 3000
```

Uses a 30-day month convention (3000 = 100 × 30); `days` is the inclusive
day count between start and end date.

**EMI — Cutting mode:** interest for the full tenure is deducted upfront;
the borrower repays the full principal in equal monthly installments.

**EMI — Adding mode:** interest is added on top of principal; each
installment is `(principal / tenure) + (totalInterest / tenure)`.

**Delay interest** (recorded when a payment is late):

```
dailyRate = (interestRate / 100) / 30
delayInterest = amountDue × dailyRate × delayDays
```

## Data model (`src/types.ts`)

```
Borrower { id, name, phone, notes?, createdAt, loans: Loan[] }
Loan     { id, principal, interestRate, startDate, tenure, nextDueDate,
           repaymentMode?: 'cutting' | 'adding', notes?, payments: Payment[] }
Payment  { id, dueDate, dueNumber, principal, interest, totalAmount,
           paidDate?, paidAmount?, remainingAmount?,
           delayDays, delayInterest, paymentMode?, notes? }
```

## Troubleshooting

| Issue | Fix |
|---|---|
| Sign-in says the operation is disabled | Enable Email/Password under Authentication -> Sign-in method in the Firebase console. |
| Refresh fails with a permission error | The deployed Firestore rules must be the ones in `firestore.rules`, and you must be signed in (see DEPLOY.md). |
| Refresh returns 0 borrowers but you expect data | Older data lives in the top-level `borrowers` collection and is copied into your account on first sign-in while the transitional rules are deployed (DEPLOY.md). |
| Share/export fails on an emulator | Some emulators lack share targets; test on a physical device. |
| Date picker behaves differently across platforms | Expected — Android shows a native inline dialog, iOS opens a bottom-sheet modal with Done/Cancel, and web renders a native `<input type="date">` (`src/components/DatePicker.tsx`). |

## License

Private project — see repository owner for terms.
