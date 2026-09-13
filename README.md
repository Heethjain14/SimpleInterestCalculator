# Simple Interest Calculator

A React Native (Expo) app for managing a small lending/loan portfolio: track
borrowers and their loans, generate simple-interest and EMI payment
schedules, record installment payments (including partial and late
payments), see overdue installments across the whole portfolio, and view
aggregate portfolio metrics. Data is stored on-device (AsyncStorage) and can
optionally be synced to a Google Sheet through a Google Apps Script web app.

## Features

The app is organized as five screens, navigable from the sidebar (tap the
☰ button):

| Screen | What it does |
|---|---|
| **Dashboard** | Portfolio overview: total exposure, weighted average interest rate, outstanding vs. collected amounts, collection rate, overdue amount/count, and active loan/borrower counts (`src/utils/portfolioMetrics.ts`). |
| **Due Payments** | Every overdue, not-fully-settled installment across all borrowers, sorted most-overdue first, with one-tap payment recording and a jump to the borrower's profile (`src/utils/duePayments.ts`). |
| **Simple Interest** | Calculates `interest = (principal × rate% × days) / 3000` (30-day month convention) over a date range and renders a shareable result card you can export as a PNG. |
| **EMI Schedule** | Generates a monthly installment schedule in **Cutting** mode (interest deducted upfront, full principal repaid) or **Adding** mode (interest added on top of principal, split evenly). |
| **Clients** | Full borrower/loan management: create/edit borrowers, attach loans with an auto-generated payment schedule, record payments (with automatic delay-interest and partial-payment tracking), delete loans/borrowers, and export a loan's statement as CSV. |

Google Sheets sync (optional, off by default until configured) lets you pull
the full dataset from a spreadsheet (overwriting local data) or push
individual borrower/loan/payment changes as they happen — see
[Data flow](#data-flow) and [Google Sheets sync setup](#google-sheets-sync-setup) below.

## Project structure

```
App.tsx                       Root shell: sidebar navigation + screen switch
index.ts                      Expo entry point
app.json                      Expo config, incl. extra.sheetsWebappUrl
eas.json                      EAS Build profiles

src/
  types.ts                     Borrower / Loan / Payment data model

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
    RefreshButton.tsx            Triggers a pull from Google Sheets
    Sidebar.tsx                  Slide-in navigation drawer

  context/StorageContext.tsx    Borrower/loan state, AsyncStorage + Sheets sync
  hooks/useStorage.ts           Deprecated alias for useStorageContext()
  hooks/useNotifications.ts     Stub for future payment-reminder notifications
  navigation/screens.ts         Screen list + sidebar labels/icons

  services/sheetsSync.ts        HTTP client for the Apps Script web app
  utils/duePayments.ts          Overdue-installment logic
  utils/portfolioMetrics.ts     Portfolio aggregate metrics
  utils/format.ts               Currency/date formatting helpers

proxy/sheets_proxy.py         Optional Flask CORS relay (see note below)
proxy/requirements.txt        Python deps for the proxy (flask, requests)
testing.js                    Standalone Node script to test the Apps Script webapp directly
docs/GOOGLE_SHEETS_APPS_SCRIPT.md   Apps Script deployment + request/response contract
docs/ARCHITECTURE.md          Module boundaries and data-flow diagram
```

## Data flow

```
UI components  →  StorageContext (AsyncStorage)  →  sheetsSync.ts  →  Google Apps Script  →  Google Sheet
```

- **UI components** call `useStorageContext()` (or the deprecated
  `useStorage()` alias) to read `borrowers` and to call `saveBorrower`,
  `saveLoan`, `deleteLoan`, `deleteBorrower`, or `refreshFromSheet`.
- **`src/context/StorageContext.tsx`** is the single source of truth. Every
  mutation is written to `AsyncStorage` (key `borrowers_data`) first; syncing
  to Google Sheets is attempted afterward on a best-effort basis and never
  blocks or rolls back the local write. `refreshFromSheet` is the only pull
  path — it fetches the full dataset and overwrites local state.
- **`src/services/sheetsSync.ts`** is a thin HTTP client for one Google Apps
  Script web app. Every request is a **GET** with the JSON payload
  URL-encoded into a `?payload=` query parameter (not a POST body — this is
  deliberate; see the comment at the top of `sheetsSync.ts`). Large payment
  schedules are sent in chunks to stay under the URL length limit.
- **Google Apps Script** (deployed separately, outside this repo) is
  expected to route on `payload.type` (`read_all_data`, `add_loan`,
  `update_payment`, `delete_borrower`, etc.) and read/write a Google Sheet.
  See [docs/GOOGLE_SHEETS_APPS_SCRIPT.md](./docs/GOOGLE_SHEETS_APPS_SCRIPT.md)
  for the full contract and a sample script.

**About `proxy/sheets_proxy.py`:** this repo also includes a small Flask app
that forwards POST requests to the Apps Script URL and relays the response
with permissive CORS headers. As of now, nothing in the Expo app's code
calls it — `sheetsSync.ts` talks to the Apps Script URL directly via GET.
It's provided as an optional relay you can run in front of Apps Script (e.g.
to add your own auth, hide the Apps Script URL, or support POST-based
clients) — see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for details.
It is not required to run the app.

For the full module-by-module breakdown and a diagram, see
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

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
is persisted to on-device `AsyncStorage` and the Clients/Dashboard/Due
Payments screens work against local data. Google Sheets sync is optional.

### Google Sheets sync setup (optional)

1. Deploy a Google Apps Script web app that implements the request contract
   in [docs/GOOGLE_SHEETS_APPS_SCRIPT.md](./docs/GOOGLE_SHEETS_APPS_SCRIPT.md)
   (create the sheet, add the script, deploy as a web app).
2. Set the deployed URL in `app.json` under `expo.extra.sheetsWebappUrl`:

   ```json
   {
     "expo": {
       "extra": {
         "sheetsWebappUrl": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
       }
     }
   }
   ```

3. Restart the Expo dev server. `App.tsx` reads this value via
   `expo-constants` at startup and assigns it to
   `globalThis.SHEETS_WEBAPP_URL`, which `StorageContext` and a few
   components read before every sync call.
4. Use the **Refresh Sheets** button (Dashboard, Due Payments, or Clients
   screen) to pull the full dataset, or just start creating borrowers/loans —
   changes push automatically in the background.

### Running the optional Python proxy

Only needed if you choose to route Sheets requests through your own relay
instead of hitting the Apps Script URL directly from the app:

```bash
cd proxy
pip install -r requirements.txt
python sheets_proxy.py            # serves on http://127.0.0.1:5000
```

Configure it via environment variables: `APPS_SCRIPT_URL` (defaults to the
URL hard-coded in `sheets_proxy.py`), `PORT` (default `5000`),
`CORS_ALLOW_ORIGIN`/`CORS_ALLOW_METHODS`/`CORS_ALLOW_HEADERS`, and
`FLASK_DEBUG`.

### Build for production (EAS)

```bash
npx eas build --platform android   # or ios
```

The EAS project ID lives in `app.json` (`expo.extra.eas.projectId`) and
`eas.json` holds the build profiles.

## Testing

There's no automated test suite for the React Native app itself. To verify
a deployed Google Apps Script webapp independently of the app (useful when
setting up or debugging Sheets sync):

```bash
node testing.js <webapp-url>              # read-only checks (read_all_data, read_all_borrowers, error handling)
node testing.js <webapp-url> --mutate     # also runs an add/update/delete round-trip against a throwaway test loan
```

Requires Node 18+ for the built-in `fetch`. The script deliberately uses GET
(not POST) for the same reason `sheetsSync.ts` does — see the comment at the
top of `testing.js`.

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
| Sheets sync not working | Verify `sheetsWebappUrl` in `app.json` is set and redeployed, then restart Expo. Run `node testing.js <url>` to check the webapp responds correctly outside the app. |
| Refresh returns 0 borrowers but you expect data | Confirm your Apps Script's `read_all_data` handler is returning a `borrowers` array — see `docs/GOOGLE_SHEETS_APPS_SCRIPT.md`. |
| Refresh fails / "Sheets returned an unexpected response format" | The Apps Script response didn't include a `borrowers` array, or wasn't valid JSON — check the Apps Script logs. |
| Share/export fails on an emulator | Some emulators lack share targets; test on a physical device. |
| Date picker behaves differently on iOS vs Android | Expected — Android shows a native inline dialog, iOS opens a bottom-sheet modal with Done/Cancel (`src/components/DatePicker.tsx`). |

## License

Private project — see repository owner for terms.
