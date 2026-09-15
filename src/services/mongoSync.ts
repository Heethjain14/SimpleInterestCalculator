/**
 * HTTP client for the self-hosted Express + MongoDB API (see server/).
 * Plain REST over JSON, one function per operation.
 */

async function request(base: string, path: string, method: string, body?: any) {
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: any;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    if (!res.ok && parsed.ok === undefined) {
      return { ok: false, reason: 'api_error', message: `HTTP ${res.status}` };
    }
    return parsed;
  } catch (e) {
    console.warn('Mongo API request failed', e);
    return null;
  }
}

/** Full sync: every borrower with all their loans + payment schedules. */
export async function fetchAllData(url: string) {
  return request(url, '/api/data', 'GET');
}

/** Lightweight: loan info only (no payment rows), for list screens. */
export async function fetchAllBorrowers(url: string) {
  return request(url, '/api/borrowers', 'GET');
}

/** One loan, fully expanded with payments. */
export async function fetchLoan(url: string, loanId: string) {
  return request(url, `/api/loans/${encodeURIComponent(loanId)}`, 'GET');
}

/**
 * Creates a new loan (and its borrower, if borrowerId is new/absent),
 * including its payment schedule, in a single request. loan: { loanId?,
 * borrowerId?, borrowerName, phone?, borrowerNotes?, createdAt?, principal,
 * interestRate, startDate, tenure?, nextDueDate?, repaymentMode?,
 * loanNotes?, payments? }
 */
export async function addLoan(url: string, loan: any) {
  return request(url, '/api/loans', 'POST', { loan });
}

/** Updates loan-level fields (principal/rate/dates/mode) for one loan. */
export async function updateLoanInfo(url: string, loan: any) {
  return request(url, `/api/loans/${encodeURIComponent(loan.loanId)}`, 'PUT', { loan });
}

/**
 * Updates borrower-level fields (name/phone/notes).
 * borrower: { borrowerId, name?, phone?, notes? }
 */
export async function updateBorrowerInfo(url: string, borrower: any) {
  return request(url, `/api/borrowers/${encodeURIComponent(borrower.borrowerId)}`, 'PUT', { borrower });
}

/** Overwrites the full payment schedule for a loan in one request. */
export async function writePaymentSchedule(url: string, loanId: string, payments: any[]) {
  return request(url, `/api/loans/${encodeURIComponent(loanId)}/payments`, 'PUT', { payments });
}

/** Updates a single installment (e.g. marking it paid) without touching the rest. */
export async function updatePayment(
  url: string,
  loanId: string,
  dueNumber: number,
  updates: { paidDate?: string; paidAmount?: number; delayDays?: number; delayInterest?: number },
) {
  return request(url, `/api/loans/${encodeURIComponent(loanId)}/payments/${dueNumber}`, 'PUT', { updates });
}

/** Deletes one loan; the server also drops the borrower if that was their last loan. */
export async function deleteLoan(url: string, loanId: string) {
  return request(url, `/api/loans/${encodeURIComponent(loanId)}`, 'DELETE');
}

/** Deletes a borrower and every loan they have. */
export async function deleteBorrower(url: string, borrowerId: string) {
  return request(url, `/api/borrowers/${encodeURIComponent(borrowerId)}`, 'DELETE');
}

export default {
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
