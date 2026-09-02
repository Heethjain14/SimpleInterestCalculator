/**
 * All requests use GET with the payload URL-encoded as a query param,
 * NOT POST. This is deliberate, not a style choice:
 *
 * Apps Script's .../exec endpoint always responds with a 302 redirect to
 * a script.googleusercontent.com/macros/echo?... URL that holds the real
 * response. Browsers reliably follow that redirect with GET, which
 * returns the actual script output (and Google's front end even adds
 * Access-Control-Allow-Origin: * automatically on it — no CORS setup
 * needed). If the redirect is followed with POST instead, the echo
 * endpoint does NOT re-run your script — it returns a generic stub like
 * {"status":"unknown"}. That mismatch only shows up in real browsers
 * (Node's fetch and curl behave differently), which is why this can pass
 * a Node test script and still silently fail on web.
 *
 * The tradeoff: GET URLs cap out around ~2000 usable characters, so large
 * payment schedules are sent in chunks (see writePaymentSchedule below)
 * rather than as one big payload.
 */

const MAX_PAYMENTS_PER_CHUNK = 6; // conservative, keeps each GET well under the URL length cap

async function request(url: string, payload: any) {
  const query = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
  const fullUrl = `${url}?${query}`;

  const res = await fetch(fullUrl, { method: 'GET' });
  if (!res.ok) {
    console.warn('Sheets request HTTP error', res.status);
    return { ok: false, reason: 'http_error', message: `HTTP ${res.status}` };
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Generic escape hatch for pages that build their own { type, ... } payload. */
export async function postToSheet(url: string, payload: any) {
  try {
    return await request(url, payload);
  } catch (e) {
    console.warn('Failed to sync to Google Sheets', e);
    return null;
  }
}

/** Full sync: every borrower (grouped by Borrower Id) with all their loans + payment schedules. */
export async function fetchAllData(url: string) {
  try {
    return await request(url, { type: 'read_all_data' });
  } catch (e) {
    console.warn('Failed to load data from Google Sheets', e);
    return null;
  }
}

/** Lightweight: loan info only (no payment rows), for list screens. */
export async function fetchAllBorrowers(url: string) {
  try {
    return await request(url, { type: 'read_all_borrowers' });
  } catch (e) {
    console.warn('Failed to load borrowers from Google Sheets', e);
    return null;
  }
}

/** One loan, fully expanded with payments. */
export async function fetchLoan(url: string, loanId: string) {
  try {
    return await request(url, { type: 'read_loan', loanId });
  } catch (e) {
    console.warn('Failed to load loan from Google Sheets', e);
    return null;
  }
}

/**
 * Creates a new loan sheet WITHOUT its payments (payments are written
 * separately via writePaymentSchedule, chunked, right after). loan:
 * { loanId?, borrowerId?, borrowerName, phone?, notes?, createdAt?,
 *   principal, interestRate, startDate, payments? }
 * loanId/borrowerId are generated server-side if omitted.
 */
export async function addLoan(url: string, loan: any) {
  try {
    const { payments, ...loanWithoutPayments } = loan;
    const result = await request(url, { type: 'add_loan', loan: loanWithoutPayments });
    if (result?.ok && payments && payments.length > 0) {
      const loanId = result.loanId || loan.loanId;
      await writePaymentSchedule(url, loanId, payments);
    }
    return result;
  } catch (e) {
    console.warn('Failed to add loan to Google Sheets', e);
    return null;
  }
}

/** Updates only loan-level fields (principal/rate/start date) for one loan sheet. */
export async function updateLoanInfo(url: string, loan: any) {
  try {
    return await request(url, { type: 'update_loan', loan });
  } catch (e) {
    console.warn('Failed to update loan in Google Sheets', e);
    return null;
  }
}

/**
 * Updates borrower-level fields (name/phone/notes) across EVERY loan
 * sheet that borrower owns. borrower: { borrowerId, name?, phone?, notes? }
 */
export async function updateBorrowerInfo(url: string, borrower: any) {
  try {
    return await request(url, { type: 'update_borrower_info', borrower });
  } catch (e) {
    console.warn('Failed to update borrower in Google Sheets', e);
    return null;
  }
}

/**
 * Overwrites the full payment schedule for a loan, sent in chunks of
 * MAX_PAYMENTS_PER_CHUNK to stay under the GET URL length cap. First
 * chunk clears the table; the rest append.
 */
export async function writePaymentSchedule(url: string, loanId: string, payments: any[]) {
  try {
    const chunks = chunk(payments, MAX_PAYMENTS_PER_CHUNK);
    if (chunks.length === 0) {
      return await request(url, { type: 'write_payment_schedule', loanId, payments: [], append: false });
    }
    let lastResult;
    for (let i = 0; i < chunks.length; i++) {
      lastResult = await request(url, {
        type: 'write_payment_schedule',
        loanId,
        payments: chunks[i],
        append: i > 0,
      });
      if (!lastResult?.ok) return lastResult; // stop early on failure, surface the error
    }
    return lastResult;
  } catch (e) {
    console.warn('Failed to write payment schedule to Google Sheets', e);
    return null;
  }
}

/** Updates a single installment (e.g. marking it paid) without touching the rest. */
export async function updatePayment(
  url: string,
  loanId: string,
  dueNumber: number,
  updates: { paidDate?: string; paidAmount?: number; delayDays?: number; delayInterest?: number },
) {
  try {
    return await request(url, { type: 'update_payment', loanId, dueNumber, updates });
  } catch (e) {
    console.warn('Failed to update payment in Google Sheets', e);
    return null;
  }
}

/** Deletes one loan (one sheet). */
export async function deleteLoan(url: string, loanId: string) {
  try {
    return await request(url, { type: 'delete_loan', loanId });
  } catch (e) {
    console.warn('Failed to delete loan from Google Sheets', e);
    return null;
  }
}

/** Deletes every loan sheet belonging to a borrower (removes the borrower entirely). */
export async function deleteBorrower(url: string, borrowerId: string) {
  try {
    return await request(url, { type: 'delete_borrower', borrowerId });
  } catch (e) {
    console.warn('Failed to delete borrower from Google Sheets', e);
    return null;
  }
}

export default {
  postToSheet,
  fetchAllData,
  fetchAllBorrowers,
  fetchLoan,
  addLoan,
  updateLoanInfo,
  updateBorrowerInfo,
  writePaymentSchedule,
  updatePayment,
  deleteLoan,
  deleteBorrower,
};