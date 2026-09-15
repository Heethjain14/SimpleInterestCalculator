# Portfolio Ledger

A mobile-first loan management app for individual and small-scale lenders,
built with React Native (Expo) and a self-hosted MongoDB API. It replaces
paper ledgers and spreadsheets with a structured, at-a-glance record of who
owes what, what's overdue, and what's already been collected.

Data is stored on-device (AsyncStorage) first and syncs in the background to
a small self-hosted API backed by MongoDB Atlas — the app is fully usable
offline, and the backend is optional.

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
- **API server**: Node.js + Express + the official `mongodb` driver, talking
  to a MongoDB Atlas cluster.

## Project structure

```
App.tsx                       Root shell: sidebar navigation + screen switch
index.ts                      Expo entry point
app.json                      Expo config, incl. extra.mongoApiUrl
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

  components/                  Reusable UI widgets shared across screens
    BorrowerForm.tsx             Create/edit borrower (+ optional new loan)
    PaymentRecorder.tsx          Modal to record an installment payment
    DatePicker.tsx               Cross-platform date input
    ShareResultCard.tsx          Shareable PNG card for Simple Interest results
    RefreshButton.tsx            Triggers a pull from the API server
    Sidebar.tsx                  Slide-in navigation drawer

  context/StorageContext.tsx    Borrower/loan state, AsyncStorage + Mongo API sync
  hooks/useStorage.ts           Alias for useStorageContext()
  hooks/useNotifications.ts     Stub for future payment-reminder notifications
  navigation/screens.ts         Screen list + sidebar labels/icons

  services/mongoSync.ts         HTTP client for the server/ Express API
  utils/duePayments.ts          Overdue-installment logic
  utils/portfolioMetrics.ts     Portfolio aggregate metrics
  utils/format.ts               Currency/date formatting helpers

server/                       Express + MongoDB REST API
  src/index.js                  App entry point, starts the HTTP server
  src/db.js                     MongoDB connection (reads MONGODB_URI from .env)
  src/routes.js                 REST routes mirroring mongoSync.ts's function set
  .env.example                  Template for server/.env (gitignored)
```

## Data flow

```
UI components  →  StorageContext (AsyncStorage)  →  mongoSync.ts  →  server/ (Express)  →  MongoDB Atlas
```

- **UI components** call `useStorageContext()` to read `borrowers` and to
  call `saveBorrower`, `saveLoan`, `deleteLoan`, `deleteBorrower`, or
  `refreshFromServer`.
- **`src/context/StorageContext.tsx`** is the single source of truth. Every
  mutation is written to `AsyncStorage` (key `borrowers_data`) first; syncing
  to the API server is attempted afterward on a best-effort basis and never
  blocks or rolls back the local write. `refreshFromServer` is the only pull
  path — it fetches the full dataset and overwrites local state.
- **`src/services/mongoSync.ts`** is a thin HTTP client (plain REST/JSON,
  one function per operation) for the `server/` Express API.
- **`server/`** is a small Express app that reads/writes a `borrowers`
  collection in your MongoDB Atlas cluster via the official `mongodb`
  driver. Each borrower document embeds its loans, and each loan embeds its
  payments — the same shape as the app's own `Borrower`/`Loan`/`Payment`
  types, so no schema translation is needed.

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

Without any further configuration, the app works fully offline: everything
is persisted to on-device `AsyncStorage` and the Dashboard, Due Payments, and
Clients screens work against local data. MongoDB sync is optional.

### MongoDB Atlas + API server setup (optional)

1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
   and get its connection string (Atlas dashboard → Database → Connect →
   Drivers → copy the `mongodb+srv://...` URI, then substitute in your
   database user's username/password).
2. Set it up:

   ```bash
   cd server
   npm install
   cp .env.example .env
   # edit .env: paste your MONGODB_URI, set MONGODB_DB / PORT if you want non-defaults
   npm start                         # serves on http://localhost:4000
   ```

   The database and `borrowers` collection are created automatically on the
   first write — nothing to pre-create in Atlas.
3. Point the app at the server: set `expo.extra.mongoApiUrl` in `app.json`.
   The default (`http://localhost:4000`) works when running `expo start --web`
   on the same machine as the server. **On a physical device via Expo Go,
   `localhost` means the phone itself** — use your computer's LAN IP instead
   (e.g. `http://192.168.1.5:4000`), and make sure the phone and computer are
   on the same network.
4. Restart the Expo dev server. `App.tsx` reads this value via
   `expo-constants` at startup and assigns it to `globalThis.MONGO_API_URL`,
   which `StorageContext` reads before every sync call.
5. Use the **Refresh** button (Dashboard, Due Payments, or Clients screen)
   to pull the full dataset, or just start creating borrowers/loans —
   changes push automatically in the background.

The server has no auth in front of it yet — fine for local development or a
private network, but add an API key or similar before deploying it
somewhere publicly reachable.

### Build for production (EAS)

```bash
npx eas build --platform android   # or ios
```

The EAS project ID lives in `app.json` (`expo.extra.eas.projectId`) and
`eas.json` holds the build profiles.

## Testing

There's no automated test suite for the React Native app itself. To sanity
check the API server directly (useful when setting up or debugging Mongo
sync), hit its routes with `curl` once it's running, e.g.
`curl http://localhost:4000/health` and `curl http://localhost:4000/api/data`.

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
| Refresh fails with a network error | Confirm the API server (`server/`) is running and `expo.extra.mongoApiUrl` in `app.json` points at a reachable address — `localhost` only works when the app and server run on the same machine. |
| Refresh returns 0 borrowers but you expect data | Confirm you're pointed at the right MongoDB database/cluster, and that data was actually written there. |
| Share/export fails on an emulator | Some emulators lack share targets; test on a physical device. |
| Date picker behaves differently across platforms | Expected — Android shows a native inline dialog, iOS opens a bottom-sheet modal with Done/Cancel, and web renders a native `<input type="date">` (`src/components/DatePicker.tsx`). |

## License

Private project — see repository owner for terms.
