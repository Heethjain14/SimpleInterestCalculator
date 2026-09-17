/**
 * Firestore client for the app's data (see the Firebase migration plan).
 * Layout: borrowers/{id}, borrowers/{id}/loans/{id}, borrowers/{id}/loans/{id}/payments/{id}.
 * Config comes from app.json's expo.extra.firebaseConfig; auth is anonymous,
 * required by the Firestore security rules for any read/write.
 */
import Constants from 'expo-constants';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, signInAnonymously } from 'firebase/auth';
import {
  Firestore,
  QueryDocumentSnapshot,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { Borrower, Loan, Payment } from '../types';

function getFirebaseConfig(): any {
  const extra = (Constants as any).expoConfig?.extra ?? (Constants as any).manifest?.extra ?? {};
  return extra.firebaseConfig;
}

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let authReady: Promise<void> | null = null;

function init(): { db: Firestore; auth: Auth } | null {
  const config = getFirebaseConfig();
  if (!config || !config.apiKey) return null;
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(config);
    db = getFirestore(app);
    auth = getAuth(app);
  }
  return { db: db!, auth: auth! };
}

/** Ensures anonymous sign-in has completed (Firestore rules require request.auth != null). */
function ensureAuth(a: Auth): Promise<void> {
  if (!authReady) {
    authReady = signInAnonymously(a).then(() => undefined);
  }
  return authReady;
}

type Ready = { ok: true; db: Firestore } | { ok: false; reason: 'no_url' | 'network' };

/** Every exported function starts here: no config configured yet, or sign-in failed. */
async function ready(): Promise<Ready> {
  const ctx = init();
  if (!ctx) return { ok: false, reason: 'no_url' };
  try {
    await ensureAuth(ctx.auth);
  } catch (e) {
    console.warn('[Firebase] Anonymous sign-in failed', e);
    return { ok: false, reason: 'network' };
  }
  return { ok: true, db: ctx.db };
}

function borrowerData(b: any) {
  return {
    name: b.name,
    phone: b.phone ?? null,
    notes: b.notes ?? null,
    createdAt: b.createdAt,
  };
}

function loanData(loan: any) {
  return {
    principal: loan.principal,
    interestRate: loan.interestRate,
    startDate: loan.startDate,
    tenure: loan.tenure ?? null,
    nextDueDate: loan.nextDueDate ?? null,
    repaymentMode: loan.repaymentMode ?? null,
    notes: loan.loanNotes ?? null,
  };
}

function paymentData(p: any) {
  return {
    dueDate: p.dueDate,
    dueNumber: p.dueNumber,
    principal: p.principal,
    interest: p.interest,
    totalAmount: p.totalAmount,
    paidDate: p.paidDate ?? null,
    paidAmount: p.paidAmount ?? null,
    remainingAmount: p.remainingAmount ?? null,
    delayDays: p.delayDays,
    delayInterest: p.delayInterest,
    paymentMode: p.paymentMode ?? null,
    notes: p.notes ?? null,
  };
}

function toBorrower(d: QueryDocumentSnapshot): Omit<Borrower, 'loans'> {
  const data: any = d.data();
  return { id: d.id, name: data.name, phone: data.phone, notes: data.notes, createdAt: data.createdAt };
}

/** `_borrowerId` is read off the doc's own path, not stored as a field. */
function toLoan(d: QueryDocumentSnapshot): Omit<Loan, 'payments'> & { _borrowerId: string } {
  const data: any = d.data();
  return {
    id: d.id,
    principal: data.principal,
    interestRate: data.interestRate,
    startDate: data.startDate,
    tenure: data.tenure,
    nextDueDate: data.nextDueDate,
    repaymentMode: data.repaymentMode,
    notes: data.notes,
    _borrowerId: d.ref.parent.parent!.id,
  };
}

/** `_loanId` is read off the doc's own path, not stored as a field. */
function toPayment(d: QueryDocumentSnapshot): Payment & { _loanId: string } {
  const data: any = d.data();
  return {
    id: d.id,
    dueDate: data.dueDate,
    dueNumber: data.dueNumber,
    principal: data.principal,
    interest: data.interest,
    totalAmount: data.totalAmount,
    paidDate: data.paidDate ?? undefined,
    paidAmount: data.paidAmount ?? undefined,
    remainingAmount: data.remainingAmount ?? undefined,
    delayDays: data.delayDays,
    delayInterest: data.delayInterest,
    paymentMode: data.paymentMode ?? undefined,
    notes: data.notes ?? undefined,
    _loanId: d.ref.parent.parent!.id,
  };
}

/** Full sync: every borrower with all their loans + payment schedules, as 3 flat queries. */
export async function fetchAllData() {
  const r = await ready();
  if (!r.ok) return { ok: false, reason: r.reason };

  try {
    const [borrowersSnap, loansSnap, paymentsSnap] = await Promise.all([
      getDocs(collection(r.db, 'borrowers')),
      getDocs(collectionGroup(r.db, 'loans')),
      getDocs(collectionGroup(r.db, 'payments')),
    ]);

    const paymentsByLoan = new Map<string, Payment[]>();
    for (const d of paymentsSnap.docs) {
      const { _loanId, ...payment } = toPayment(d);
      if (!paymentsByLoan.has(_loanId)) paymentsByLoan.set(_loanId, []);
      paymentsByLoan.get(_loanId)!.push(payment);
    }
    for (const list of paymentsByLoan.values()) list.sort((a, b) => a.dueNumber - b.dueNumber);

    const loansByBorrower = new Map<string, Loan[]>();
    for (const d of loansSnap.docs) {
      const { _borrowerId, ...loan } = toLoan(d);
      if (!loansByBorrower.has(_borrowerId)) loansByBorrower.set(_borrowerId, []);
      loansByBorrower.get(_borrowerId)!.push({ ...loan, payments: paymentsByLoan.get(loan.id) ?? [] });
    }

    const borrowers: Borrower[] = borrowersSnap.docs.map((d) => ({
      ...toBorrower(d),
      loans: loansByBorrower.get(d.id) ?? [],
    }));

    return { ok: true, borrowers };
  } catch (e) {
    console.warn('[Firebase] fetchAllData failed', e);
    return { ok: false, reason: 'network' };
  }
}

/**
 * Creates a new loan, including its payment schedule, and the borrower
 * document too if borrowerId is new. loan: { loanId, borrowerId,
 * borrowerName, phone?, borrowerNotes?, createdAt?, principal, interestRate,
 * startDate, tenure?, nextDueDate?, repaymentMode?, loanNotes?, payments? }
 */
export async function addLoan(loan: any) {
  const r = await ready();
  if (!r.ok) return { ok: false, reason: r.reason };

  try {
    const borrowerId = loan.borrowerId;
    const loanId = loan.loanId;

    const borrowerRef = doc(r.db, 'borrowers', borrowerId);
    const existing = await getDoc(borrowerRef);
    if (!existing.exists()) {
      await setDoc(borrowerRef, borrowerData({ ...loan, name: loan.borrowerName, notes: loan.borrowerNotes, createdAt: loan.createdAt || new Date().toISOString() }));
    }

    await setDoc(doc(r.db, 'borrowers', borrowerId, 'loans', loanId), loanData(loan));

    const payments = loan.payments ?? [];
    if (payments.length) {
      const batch = writeBatch(r.db);
      const paymentsCol = collection(r.db, 'borrowers', borrowerId, 'loans', loanId, 'payments');
      for (const p of payments) batch.set(doc(paymentsCol, p.id), paymentData(p));
      await batch.commit();
    }

    return { ok: true, loanId, borrowerId };
  } catch (e) {
    console.warn('[Firebase] addLoan failed', e);
    return { ok: false, reason: 'api_error', message: String(e) };
  }
}

/** Updates loan-level fields (principal/rate/dates/mode) for one loan. */
export async function updateLoanInfo(borrowerId: string, loan: any) {
  const r = await ready();
  if (!r.ok) return { ok: false, reason: r.reason };

  try {
    const set: any = {};
    if (loan.principal !== undefined) set.principal = loan.principal;
    if (loan.interestRate !== undefined) set.interestRate = loan.interestRate;
    if (loan.startDate !== undefined) set.startDate = loan.startDate;
    if (loan.tenure !== undefined) set.tenure = loan.tenure;
    if (loan.nextDueDate !== undefined) set.nextDueDate = loan.nextDueDate;
    if (loan.repaymentMode !== undefined) set.repaymentMode = loan.repaymentMode;
    if (loan.loanNotes !== undefined) set.notes = loan.loanNotes;

    await updateDoc(doc(r.db, 'borrowers', borrowerId, 'loans', loan.loanId), set);
    return { ok: true };
  } catch (e) {
    console.warn('[Firebase] updateLoanInfo failed', e);
    return { ok: false, reason: 'api_error', message: String(e) };
  }
}

/** Updates borrower-level fields (name/phone/notes). borrower: { borrowerId, name?, phone?, notes? } */
export async function updateBorrowerInfo(borrower: any) {
  const r = await ready();
  if (!r.ok) return { ok: false, reason: r.reason };

  try {
    const set: any = {};
    if (borrower.name !== undefined) set.name = borrower.name;
    if (borrower.phone !== undefined) set.phone = borrower.phone;
    if (borrower.notes !== undefined) set.notes = borrower.notes;

    await updateDoc(doc(r.db, 'borrowers', borrower.borrowerId), set);
    return { ok: true };
  } catch (e) {
    console.warn('[Firebase] updateBorrowerInfo failed', e);
    return { ok: false, reason: 'api_error', message: String(e) };
  }
}

/** Overwrites the full payment schedule for a loan (delete-all-then-recreate in one batch). */
export async function writePaymentSchedule(borrowerId: string, loanId: string, payments: any[]) {
  const r = await ready();
  if (!r.ok) return { ok: false, reason: r.reason };

  try {
    const paymentsCol = collection(r.db, 'borrowers', borrowerId, 'loans', loanId, 'payments');
    const existing = await getDocs(paymentsCol);

    const batch = writeBatch(r.db);
    for (const d of existing.docs) batch.delete(d.ref);
    for (const p of payments) batch.set(doc(paymentsCol, p.id), paymentData(p));
    await batch.commit();

    return { ok: true };
  } catch (e) {
    console.warn('[Firebase] writePaymentSchedule failed', e);
    return { ok: false, reason: 'api_error', message: String(e) };
  }
}

/** Updates a single installment (e.g. marking it paid) without touching the rest. */
export async function updatePayment(
  borrowerId: string,
  loanId: string,
  paymentId: string,
  updates: { paidDate?: string; paidAmount?: number; delayDays?: number; delayInterest?: number },
) {
  const r = await ready();
  if (!r.ok) return { ok: false, reason: r.reason };

  try {
    const set: any = {};
    for (const key of ['paidDate', 'paidAmount', 'delayDays', 'delayInterest'] as const) {
      if (updates[key] !== undefined) set[key] = updates[key];
    }
    await updateDoc(doc(r.db, 'borrowers', borrowerId, 'loans', loanId, 'payments', paymentId), set);
    return { ok: true };
  } catch (e) {
    console.warn('[Firebase] updatePayment failed', e);
    return { ok: false, reason: 'api_error', message: String(e) };
  }
}

/** Removes one loan and its payments; also drops the borrower once they have no loans left. */
export async function deleteLoan(borrowerId: string, loanId: string) {
  const r = await ready();
  if (!r.ok) return { ok: false, reason: r.reason };

  try {
    const loanRef = doc(r.db, 'borrowers', borrowerId, 'loans', loanId);
    const paymentsSnap = await getDocs(collection(loanRef, 'payments'));

    const batch = writeBatch(r.db);
    for (const p of paymentsSnap.docs) batch.delete(p.ref);
    batch.delete(loanRef);
    await batch.commit();

    const remainingLoans = await getDocs(collection(r.db, 'borrowers', borrowerId, 'loans'));
    if (remainingLoans.empty) await deleteDoc(doc(r.db, 'borrowers', borrowerId));

    return { ok: true };
  } catch (e) {
    console.warn('[Firebase] deleteLoan failed', e);
    return { ok: false, reason: 'api_error', message: String(e) };
  }
}

/** Removes a borrower and every loan + payment they have. */
export async function deleteBorrower(borrowerId: string) {
  const r = await ready();
  if (!r.ok) return { ok: false, reason: r.reason };

  try {
    const loansSnap = await getDocs(collection(r.db, 'borrowers', borrowerId, 'loans'));
    for (const loanDoc of loansSnap.docs) {
      const paymentsSnap = await getDocs(collection(loanDoc.ref, 'payments'));
      const batch = writeBatch(r.db);
      for (const p of paymentsSnap.docs) batch.delete(p.ref);
      batch.delete(loanDoc.ref);
      await batch.commit();
    }

    await deleteDoc(doc(r.db, 'borrowers', borrowerId));
    return { ok: true };
  } catch (e) {
    console.warn('[Firebase] deleteBorrower failed', e);
    return { ok: false, reason: 'api_error', message: String(e) };
  }
}

export default {
  fetchAllData,
  addLoan,
  updateLoanInfo,
  updateBorrowerInfo,
  writePaymentSchedule,
  updatePayment,
  deleteLoan,
  deleteBorrower,
};
