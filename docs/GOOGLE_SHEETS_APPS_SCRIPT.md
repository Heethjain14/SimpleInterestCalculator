Google Sheets Apps Script webapp for SimpleInterestCalculator

1) Create a new Google Sheet.
2) In Extensions → Apps Script, create a new project and replace Code.gs with the script below.
3) Deploy → New Deployment → Select "Web app" and set "Execute as" = Me, "Who has access" = Anyone (or Anyone with link).
4) Use the deployed web app URL as `SHEETS_WEBAPP_URL` in the app runtime (set on device/emulator global).

Sample Apps Script (CORS-enabled with proper preflight handling):

/**
 * Configuration – adjust if you want to restrict origins.
 * For development you can keep '*', for production lock it down to your exact domain.
 */
const ALLOWED_ORIGIN = '*'; // e.g. 'http://localhost:8082' or your Expo URL
const ALLOWED_METHODS = 'POST, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type';

/**
 * Main entry point for the web app.
 * Handles both the actual POST request and the CORS pre‑flight OPTIONS request.
 */
function doPost(e) {
  // -------------------------------------------------
  // 1. Handle CORS pre‑flight (OPTIONS) request
  // -------------------------------------------------
  if (e.parameters && e.parameters.method === 'options') {
    return createCorsResponse(null); // empty body, 200 OK with CORS headers
  }

  // -------------------------------------------------
  // 2. Process the actual request
  // -------------------------------------------------
  try {
    const payload = JSON.parse(e.postData.contents);
    const result = handleRequest(payload); // <-- your domain‑specific logic

    // Success: wrap result in a shape the client expects
    const successBody = {
      ok: true,
      ...result   // e.g. { data: [...] } or { borrowers: [...] } etc.
    };
    return createCorsResponse(JSON.stringify(successBody));
  } catch (err) {
    // Error: return a shape that matches the client's RefreshResult error type
    const errorBody = {
      ok: false,
      reason: 'api_error',
      message: err.toString() // optional – strip in production if desired
    };
    return createCorsResponse(JSON.stringify(errorBody));
  }
}

/**
 * Helper that builds a CORS‑enabled JSON text output.
 * @param {string| null} jsonString – already‑stringified JSON payload (null for empty body)
 * @return {ContentService.TextOutput}
 */
function createCorsResponse(jsonString) {
  const output = ContentService
    .createTextOutput(jsonString !== null ? jsonString : '')
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
    .setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS)
    .setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);

  // For pre‑flight we explicitly set status 200 (ContentService defaults to 200)
  return output;
}

/**
 * Replace this stub with the actual logic you already have in your Apps Script.
 * It should return a plain JavaScript object that matches the shape your app expects
 * (e.g. { data: [...] } or { borrowers: [...] } or just [...] ).
 */
function handleRequest(payload) {
  // Example: read_all_borrowers -> return a list of borrower objects
  if (payload.type === 'read_all_borrowers') {
    const sheet = SpreadsheetApp.getActiveSpreadsheet()
                              .getSheetByName('Borrowers'); // adjust name as needed
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0];
    const borrowers = rows.slice(1).map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });
    // The app looks for data under .data, .borrowers, .payload or the raw array
    return { data: borrowers }; // any of those works
  }

  // Add other types (add_borrower, update_borrower, sync_all_borrowers) here …
  throw new Error(`Unsupported request type: ${payload.type}`);
}

Deployment and configuration
1. In the Apps Script editor choose Deploy → New deployment → Select "Web app".
   - For "Description" enter something like `SimpleInterestCalculator sync`.
   - Set "Execute as" to `Me` and "Who has access" to `Anyone` or `Anyone with link` depending on your security needs.
2. Click "Deploy" and copy the Web app URL from the deployment dialog — it looks like `https://script.google.com/macros/s/PASTE_ID/exec`.
3. In your Expo project open `app.json` and set the `extra.sheetsWebappUrl` value to the copied URL, for example:

{
  "expo": {
    "extra": {
      "sheetsWebappUrl": "https://script.google.com/macros/s/PASTE_ID/exec"
    }
  }
}

4. Restart the Expo dev server so the new config is picked up.

Quick test using curl (from any machine):

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"type":"read_all_borrowers"}' https://script.google.com/macros/s/PASTE_ID/exec
```

You should receive a JSON response from the Apps Script with a `data` array containing the borrower records.

Alternative for local testing on device/emulator
- If you prefer not to edit `app.json`, you can set the URL at runtime for debugging in the JS console (or DevTools) by assigning:

```js
(global as any).SHEETS_WEBAPP_URL = 'https://script.google.com/macros/s/PASTE_ID/exec'
```

This lets the app attempt to sync without changing `app.json`.