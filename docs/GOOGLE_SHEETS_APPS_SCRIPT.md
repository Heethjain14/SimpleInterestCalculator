> **Legacy:** the app now syncs to MongoDB Atlas via `server/` instead of
> Google Sheets — see the README's
> [MongoDB Atlas + API server setup](../README.md#mongodb-atlas--api-server-setup)
> and [docs/NOSQL_MIGRATION_PROPOSAL.md](./NOSQL_MIGRATION_PROPOSAL.md) for
> why. This document is kept for reference; `src/services/sheetsSync.ts` is
> no longer called from anywhere in the app.

Google Sheets Apps Script webapp for SimpleInterestCalculator

1) Create a new Google Sheet.
2) In Extensions → Apps Script, create a new project and replace Code.gs with the script below.
3) Deploy → New Deployment → Select "Web app" and set "Execute as" = Me, "Who has access" = Anyone (or Anyone with link).
4) Use the deployed web app URL as `sheetsWebappUrl` in `app.json` (`expo.extra.sheetsWebappUrl`).

## Important: the client uses GET, not POST

`src/services/sheetsSync.ts` (and `testing.js`) send every request as a **GET**,
with the entire JSON payload URL-encoded into a single `?payload=` query
parameter — never a POST body. This is deliberate, not a style choice:
Apps Script's `.../exec` URL always responds with a 302 redirect to a
`script.googleusercontent.com/macros/echo?...` URL that holds the real
response. Real HTTP clients (browsers, and React Native's fetch)
reliably follow that redirect with GET, which returns the actual script
output — and Google's front end adds `Access-Control-Allow-Origin: *`
to it automatically, so no manual CORS handling is needed on that path.
If the redirect is instead followed with POST, the echo endpoint does
**not** re-run your script — it returns a generic stub like
`{"status":"unknown"}`.

Practically, this means your Apps Script must implement **`doGet(e)`**
(reading `e.parameter.payload`), not `doPost(e)`. The sample script below
reflects that.

GET URLs cap out around ~2000 usable characters, so the client sends large
payment schedules in chunks (see `writePaymentSchedule` in
`src/services/sheetsSync.ts`) rather than as one big payload.

If you want a POST-based flow instead (for example, fronting Apps Script
with your own backend), see `proxy/sheets_proxy.py` — a small Flask relay
that accepts POST and forwards it to Apps Script as POST. It is not wired
into the Expo app today; you would need to point `sheetsWebappUrl` at your
proxy and adapt `sheetsSync.ts` to use POST if you go this route.

## Request types the client actually sends

Every request has the shape `{ type: '<name>', ...fields }`. These are the
`type` values used by `src/services/sheetsSync.ts` today — your `handleRequest`
dispatch should cover all of them:

| `type` | Fields | Purpose |
|---|---|---|
| `read_all_data` | — | Full dataset: every borrower with all loans and full payment schedules. Response must include a `borrowers` array. |
| `read_all_borrowers` | — | Lightweight version of the above: loan info without payment rows. Response must include a `borrowers` array. |
| `read_loan` | `loanId` | One loan, fully expanded with payments. Response should include a `loan` object. |
| `add_loan` | `loan: { loanId?, borrowerId?, borrowerName, phone?, notes?, createdAt?, principal, interestRate, startDate }` | Creates a new loan (and its borrower, if new) *without* payments. Generate `loanId`/`borrowerId` server-side if omitted, and return them as `loanId`/`borrowerId` in the response so the client can adopt server-generated ids. |
| `update_loan` | `loan: { loanId, principal?, interestRate?, startDate? }` | Updates loan-level fields only. |
| `update_borrower_info` | `borrower: { borrowerId, name?, phone?, notes? }` | Updates borrower-level fields across every loan sheet that borrower owns. |
| `write_payment_schedule` | `loanId, payments: Payment[], append` | Overwrites (or appends to, when `append: true`) the payment schedule for one loan. Sent in chunks for large schedules — the first chunk has `append: false` and clears the table, later chunks have `append: true`. |
| `update_payment` | `loanId, dueNumber, updates: { paidDate?, paidAmount?, delayDays?, delayInterest? }` | Updates a single installment (e.g. marking it paid) without touching the rest of the schedule. |
| `delete_loan` | `loanId` | Deletes one loan/sheet. |
| `delete_borrower` | `borrowerId` | Deletes every loan sheet belonging to a borrower. |

A few UI components (`BorrowerForm.tsx`, `BorrowerDetail.tsx`,
`DuePaymentsList.tsx`) also call the generic `sheetsSync.postToSheet()`
escape hatch directly with `{ type: 'add_borrower', payload: <Borrower> }`
or `{ type: 'update_borrower', payload: <Borrower> }` (a full borrower
object, loans and all) — in addition to, not instead of, the calls above.
If you implement a custom Apps Script, decide whether to support these two
ad hoc types as well or treat them as no-ops.

## Response shape the client expects

- Success: `{ ok: true, ...result }` — e.g. `{ ok: true, borrowers: [...] }`
  for `read_all_data`/`read_all_borrowers`, or `{ ok: true, loanId, borrowerId }`
  for `add_loan`.
- Failure: `{ ok: false, reason: 'api_error', message: '...' }`. The
  `RefreshResult` type in `src/context/StorageContext.tsx` also recognizes
  `reason: 'no_url' | 'network' | 'invalid_response'`, but those are
  produced client-side, not by the Apps Script.

## Sample Apps Script (doGet, GET-only)

```javascript
/**
 * Main entry point for the web app. The client only ever sends GET
 * (see the note above) — there is no doPost handler.
 */
function doGet(e) {
  try {
    const payload = JSON.parse(e.parameter.payload || '{}');
    const result = handleRequest(payload); // <-- your domain-specific logic

    const successBody = {
      ok: true,
      ...result   // e.g. { borrowers: [...] } or { loanId, borrowerId } etc.
    };
    return ContentService
      .createTextOutput(JSON.stringify(successBody))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    const errorBody = {
      ok: false,
      reason: 'api_error',
      message: err.toString(), // optional – strip in production if desired
    };
    return ContentService
      .createTextOutput(JSON.stringify(errorBody))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Replace this stub with logic for each `type` in the table above.
 * Return a plain JavaScript object that becomes part of the response
 * (merged into `{ ok: true, ... }`).
 */
function handleRequest(payload) {
  if (payload.type === 'read_all_borrowers' || payload.type === 'read_all_data') {
    // Example: one sheet tab per loan. Adjust to however you choose to
    // lay out tabs/columns — the client only cares about the response
    // shape (a `borrowers` array of { id, name, phone, ..., loans: [...] }).
    const borrowers = readBorrowersFromSheets(payload.type === 'read_all_data');
    return { borrowers };
  }

  // Add the remaining types from the table above (add_loan, update_loan,
  // update_borrower_info, write_payment_schedule, update_payment,
  // delete_loan, delete_borrower, read_loan) here …
  throw new Error(`Unsupported request type: ${payload.type}`);
}
```

## Deployment and configuration

1. In the Apps Script editor choose Deploy → New deployment → Select "Web app".
   - For "Description" enter something like `SimpleInterestCalculator sync`.
   - Set "Execute as" to `Me` and "Who has access" to `Anyone` or `Anyone with link` depending on your security needs.
2. Click "Deploy" and copy the Web app URL from the deployment dialog — it looks like `https://script.google.com/macros/s/PASTE_ID/exec`.
3. In your Expo project open `app.json` and set the `extra.sheetsWebappUrl` value to the copied URL, for example:

```json
{
  "expo": {
    "extra": {
      "sheetsWebappUrl": "https://script.google.com/macros/s/PASTE_ID/exec"
    }
  }
}
```

4. Restart the Expo dev server so the new config is picked up.

## Quick test using curl (GET, matching what the app actually sends)

```bash
curl -G "https://script.google.com/macros/s/PASTE_ID/exec" \
  --data-urlencode 'payload={"type":"read_all_data"}'
```

You should receive a JSON response like `{"ok":true,"borrowers":[...]}`.
(A `curl -X POST` here will not exercise the same code path the app uses —
see the note above.)

## Automated test script

`testing.js` at the repo root runs the same GET-based requests the app
makes, plus response-shape assertions, against a deployed webapp URL:

```bash
node testing.js <webapp-url>              # read-only checks
node testing.js <webapp-url> --mutate     # also add/update/delete a throwaway test loan
```

## Alternative for local testing on device/emulator

- If you prefer not to edit `app.json`, you can set the URL at runtime for debugging in the JS console (or DevTools) by assigning:

```js
(global as any).SHEETS_WEBAPP_URL = 'https://script.google.com/macros/s/PASTE_ID/exec'
```

This lets the app attempt to sync without changing `app.json`.
