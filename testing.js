#!/usr/bin/env node
/**
 * Standalone test script for the Google Apps Script webapp — runs
 * completely independently of the Expo app, no app logs involved.
 *
 * Usage:
 *   node testSheetsWebapp.js <webapp-url>              # read-only checks
 *   node testSheetsWebapp.js <webapp-url> --mutate      # also runs write/delete tests
 *
 * Requires Node 18+ (built-in fetch). Check with: node --version
 */

const URL = process.argv[2];
const MUTATE = process.argv.includes('--mutate');

if (!URL) {
  console.error('Usage: node testSheetsWebapp.js <webapp-url> [--mutate]');
  process.exit(1);
}

let passed = 0;
let failed = 0;

function ok(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? `  — ${detail}` : ''}`);
  }
}

async function post(payload) {
  // Deliberately GET, not POST — see the long comment in sheetSync.ts.
  // POST to Apps Script's /exec URL 302-redirects to a script.googleusercontent.com
  // echo URL; if that redirect is followed with POST (as some environments do),
  // Apps Script returns a generic stub instead of your real response. GET's
  // redirect-follow is the reliable path and matches what the client now does.
  const query = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
  const res = await fetch(`${URL}?${query}`, { method: 'GET' });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { parseError: true, raw: text, httpStatus: res.status };
  }
  return { ...json, httpStatus: res.status };
}

function isNum(v) {
  return typeof v === 'number' && !Number.isNaN(v);
}

function validatePayment(p, path) {
  ok(`${path}.dueDate is a string`, typeof p.dueDate === 'string', JSON.stringify(p.dueDate));
  ok(`${path}.dueNumber is a number`, isNum(p.dueNumber), JSON.stringify(p.dueNumber));
  ok(`${path}.principal is a number`, isNum(p.principal), JSON.stringify(p.principal));
  ok(`${path}.interest is a number`, isNum(p.interest), JSON.stringify(p.interest));
  ok(`${path}.totalAmount is a number`, isNum(p.totalAmount), JSON.stringify(p.totalAmount));
  ok(`${path}.delayDays is a number`, isNum(p.delayDays), JSON.stringify(p.delayDays));
  ok(`${path}.delayInterest is a number`, isNum(p.delayInterest), JSON.stringify(p.delayInterest));
}

function validateLoan(loan, path, expectPayments) {
  ok(`${path}.id is a string`, typeof loan.id === 'string' && loan.id.length > 0, JSON.stringify(loan.id));
  ok(`${path}.principal is a number`, isNum(loan.principal), JSON.stringify(loan.principal));
  ok(`${path}.interestRate is a number`, isNum(loan.interestRate), JSON.stringify(loan.interestRate));
  ok(`${path}.startDate is a string`, typeof loan.startDate === 'string', JSON.stringify(loan.startDate));

  if (expectPayments) {
    ok(`${path}.payments is an array`, Array.isArray(loan.payments), JSON.stringify(loan.payments));
    if (Array.isArray(loan.payments)) {
      loan.payments.forEach((p, i) => validatePayment(p, `${path}.payments[${i}]`));
    }
  }
}

function validateBorrower(b, path, expectPayments) {
  ok(`${path}.id is a string`, typeof b.id === 'string' && b.id.length > 0, JSON.stringify(b.id));
  ok(`${path}.name is a string`, typeof b.name === 'string', JSON.stringify(b.name));
  ok(`${path}.loans is an array`, Array.isArray(b.loans), JSON.stringify(b.loans));
  if (Array.isArray(b.loans)) {
    b.loans.forEach((loan, i) => validateLoan(loan, `${path}.loans[${i}]`, expectPayments));
  }
}

async function testReadAllData() {
  console.log('\n-- read_all_data --');
  const res = await post({ type: 'read_all_data' });
  ok('response is valid JSON', !res.parseError, res.raw?.slice(0, 200));
  if (res.parseError) return;
  ok('ok === true', res.ok === true, JSON.stringify(res));
  ok('borrowers is an array', Array.isArray(res.borrowers), JSON.stringify(res.borrowers));
  if (Array.isArray(res.borrowers)) {
    console.log(`  (${res.borrowers.length} borrower(s) found)`);
    res.borrowers.forEach((b, i) => validateBorrower(b, `borrowers[${i}]`, true));
  }
}

async function testReadAllBorrowers() {
  console.log('\n-- read_all_borrowers (lightweight) --');
  const res = await post({ type: 'read_all_borrowers' });
  ok('response is valid JSON', !res.parseError, res.raw?.slice(0, 200));
  if (res.parseError) return;
  ok('ok === true', res.ok === true, JSON.stringify(res));
  ok('borrowers is an array', Array.isArray(res.borrowers), JSON.stringify(res.borrowers));
  if (Array.isArray(res.borrowers)) {
    res.borrowers.forEach((b, i) => validateBorrower(b, `borrowers[${i}]`, false));
  }
}

async function testUnsupportedType() {
  console.log('\n-- unsupported type handling --');
  const res = await post({ type: 'not_a_real_type' });
  ok('response is valid JSON', !res.parseError, res.raw?.slice(0, 200));
  if (res.parseError) return;
  ok('ok === false', res.ok === false, JSON.stringify(res));
  ok('reason === "api_error"', res.reason === 'api_error', JSON.stringify(res));
}

async function testMutations() {
  console.log('\n-- mutation round-trip (--mutate) --');
  const testBorrowerId = `TESTSCRIPT_${Date.now()}`;
  const testLoanId = `TESTLOAN_${Date.now()}`;

  const addRes = await post({
    type: 'add_loan',
    loan: {
      loanId: testLoanId,
      borrowerId: testBorrowerId,
      borrowerName: 'Test Script Borrower — safe to delete',
      phone: '0000000000',
      notes: 'created by testSheetsWebapp.js',
      createdAt: new Date().toISOString(),
      principal: 10000,
      interestRate: 2,
      startDate: new Date().toISOString(),
      payments: [
        { dueDate: new Date().toISOString(), dueNumber: 1, principal: 5000, interest: 200, totalAmount: 5200, delayDays: 0, delayInterest: 0 },
        { dueDate: new Date().toISOString(), dueNumber: 2, principal: 5000, interest: 200, totalAmount: 5200, delayDays: 0, delayInterest: 0 },
      ],
    },
  });
  ok('add_loan ok === true', addRes.ok === true, JSON.stringify(addRes));

  const readRes = await post({ type: 'read_loan', loanId: testLoanId });
  ok('read_loan finds the new sheet', readRes.ok === true && readRes.loan?.id === testLoanId, JSON.stringify(readRes));
  ok('read_loan payments length is 2', readRes.loan?.payments?.length === 2, JSON.stringify(readRes.loan?.payments));

  const updatePaymentRes = await post({
    type: 'update_payment',
    loanId: testLoanId,
    dueNumber: 1,
    updates: { paidDate: new Date().toISOString(), paidAmount: 5200, delayDays: 0, delayInterest: 0 },
  });
  ok('update_payment ok === true', updatePaymentRes.ok === true, JSON.stringify(updatePaymentRes));

  const updateBorrowerRes = await post({
    type: 'update_borrower_info',
    borrower: { borrowerId: testBorrowerId, phone: '1111111111' },
  });
  ok('update_borrower_info ok === true', updateBorrowerRes.ok === true, JSON.stringify(updateBorrowerRes));

  const deleteLoanRes = await post({ type: 'delete_loan', loanId: testLoanId });
  ok('delete_loan ok === true (cleanup)', deleteLoanRes.ok === true, JSON.stringify(deleteLoanRes));
}

async function main() {
  console.log(`Testing webapp at: ${URL}`);
  await testReadAllData();
  await testReadAllBorrowers();
  await testUnsupportedType();
  if (MUTATE) {
    await testMutations();
  } else {
    console.log('\n(skipping mutation tests — pass --mutate to run add/update/delete round-trip)');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Script crashed:', e);
  process.exit(1);
});