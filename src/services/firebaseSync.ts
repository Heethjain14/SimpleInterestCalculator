/**
 * Firestore client for the app's data.
 * Layout (per signed-in user): users/{uid}/borrowers/{id}, .../loans/{id}, .../payments/{id}.
 * Access is enforced by firestore.rules: a user can only touch their own users/{uid} subtree.
 * Config and auth setup live in firebaseApp.ts; the user must be signed in (see AuthContext).
 */
import {
  Firestore,
  QueryDocumentSnapshot,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { Borrower, Loan, Payment } from '../types';
import { getFirebase } from './firebaseApp';

type Ready =
  | { ok: true; db: Firestore; uid: string }
  | { ok: false; reason: 'no_url' | 'network' | 'not_signed_in' };

/** Every exported function starts here: Firebase must be configured and a real user signed in. */
async function ready(): Promise<Ready> {
  const fb = getFirebase();
  if (!fb) return { ok: false, reason: 'no_url' };
  await fb.auth.authStateReady();
  const user = fb.auth.currentUser;
  if (!user || user.isAnonymous) return { ok: false, reason: 'not_signed_in' };
  return { ok: true, db: fb.db, uid: user.uid };
}

type Ctx = Extract<Ready, { ok: true }>;

const borrowersCol = (r: Ctx) => collection(r.db, 'users', r.uid, 'borrowers');
const borrowerRef = (r: Ctx, borrowerId: string) => doc(borrowersCol(r), borrowerId);
const loansCol = (r: Ctx, borrowerId: string) => collection(borrowerRef(r, borrowerId), 'loans');
const loanRef = (r: Ctx, borrowerId: string, loanId: string) => doc(loansCol(r, borrowerId), loanId);
const paymentsCol = (r: Ctx, borrowerId: string, loanId: string) => collection(loanRef(r, borrowerId, loanId), 'payments');

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
    disbursedAmount: loan.disbursedAmount ?? loan.principal,
    notes: loan.loanNotes ?? null,
  };
}

function partialPaymentData(pp: any) {
  return {
    id: pp.id,
    date: pp.date,
    amount: pp.amount,
    mode: pp.mode,
    delayDays: pp.delayDays,
    delayInterest: pp.delayInterest,
    notes: pp.notes ?? null,
  };
}

function paymentData(p: any) {
  return {
    dueDate: p.dueDate,
    dueNumber: p.dueNumber,
    principal: p.principal,
    interest: p.interest,
    totalAmount: p.totalAmount,
    partialPayments: (p.partialPayments ?? []).map(partialPaymentData),
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

function toLoan(d: QueryDocumentSnapshot): Omit<Loan, 'payments'> {
  const data: any = d.data();
  return {
    id: d.id,
    principal: data.principal,
    interestRate: data.interestRate,
    startDate: data.startDate,
    tenure: data.tenure,
    nextDueDate: data.nextDueDate,
    repaymentMode: data.repaymentMode,
    disbursedAmount: data.disbursedAmount ?? data.principal,
    notes: data.notes,
  };
}

function toPayment(d: QueryDocumentSnapshot): Payment {
  const data: any = d.data();
  return {
    id: d.id,
    dueDate: data.dueDate,
    dueNumber: data.dueNumber,
    principal: data.principal,
    interest: data.interest,
    totalAmount: data.totalAmount,
    partialPayments: data.partialPayments ?? [],
    paidDate: data.paidDate ?? undefined,
    paidAmount: data.paidAmount ?? undefined,
    remainingAmount: data.remainingAmount ?? undefined,
    delayDays: data.delayDays,
    delayInterest: data.delayInterest,
    paymentMode: data.paymentMode ?? undefined,
    notes: data.notes ?? undefined,
  };
}

/**
 * Full sync: every borrower with all their loans + payment schedules. Security rules only
 * allow reads under the user's own subtree, so this walks it (borrowers -> loans -> payments)
 * with parallel reads rather than collection-group queries.
 */
export async function fetchAllData() {
  const r = await ready();
  if (!r.ok) return { ok: false, reason: r.reason };

  try {
    const borrowersSnap = await getDocs(borrowersCol(r));
    const borrowers: Borrower[] = await Promise.all(
      borrowersSnap.docs.map(async (bDoc) => {
        const loansSnap = await getDocs(loansCol(r, bDoc.id));
        const loans: Loan[] = await Promise.all(
          loansSnap.docs.map(async (lDoc) => {
            const paymentsSnap = await getDocs(paymentsCol(r, bDoc.id, lDoc.id));
            const payments = paymentsSnap.docs.map(toPayment).sort((x, y) => x.dueNumber - y.dueNumber);
            return { ...toLoan(lDoc), payments };
          }),
        );
        return { ...toBorrower(bDoc), loans };
      }),
    );

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

    const bRef = borrowerRef(r, borrowerId);
    const existing = await getDoc(bRef);
    if (!existing.exists()) {
      await setDoc(bRef, borrowerData({ ...loan, name: loan.borrowerName, notes: loan.borrowerNotes, createdAt: loan.createdAt || new Date().toISOString() }));
    }

    await setDoc(loanRef(r, borrowerId, loanId), loanData(loan));

    const payments = loan.payments ?? [];
    if (payments.length) {
      const batch = writeBatch(r.db);
      const pCol = paymentsCol(r, borrowerId, loanId);
      for (const p of payments) batch.set(doc(pCol, p.id), paymentData(p));
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

    await updateDoc(loanRef(r, borrowerId, loan.loanId), set);
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

    await updateDoc(borrowerRef(r, borrower.borrowerId), set);
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
    const pCol = paymentsCol(r, borrowerId, loanId);
    const existing = await getDocs(pCol);

    const batch = writeBatch(r.db);
    for (const d of existing.docs) batch.delete(d.ref);
    for (const p of payments) batch.set(doc(pCol, p.id), paymentData(p));
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
    await updateDoc(doc(paymentsCol(r, borrowerId, loanId), paymentId), set);
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
    const lRef = loanRef(r, borrowerId, loanId);
    const paymentsSnap = await getDocs(collection(lRef, 'payments'));

    const batch = writeBatch(r.db);
    for (const p of paymentsSnap.docs) batch.delete(p.ref);
    batch.delete(lRef);
    await batch.commit();

    const remainingLoans = await getDocs(loansCol(r, borrowerId));
    if (remainingLoans.empty) await deleteDoc(borrowerRef(r, borrowerId));

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
    const loansSnap = await getDocs(loansCol(r, borrowerId));
    for (const loanDoc of loansSnap.docs) {
      const paymentsSnap = await getDocs(collection(loanDoc.ref, 'payments'));
      const batch = writeBatch(r.db);
      for (const p of paymentsSnap.docs) batch.delete(p.ref);
      batch.delete(loanDoc.ref);
      await batch.commit();
    }

    await deleteDoc(borrowerRef(r, borrowerId));
    return { ok: true };
  } catch (e) {
    console.warn('[Firebase] deleteBorrower failed', e);
    return { ok: false, reason: 'api_error', message: String(e) };
  }
}

export type MigrationResult =
  | { status: 'done'; copied: number }
  | { status: 'already_done' | 'nothing_to_migrate' | 'skipped' };

/**
 * One-time copy of the pre-auth data (top-level borrowers/**, readable only under the
 * transitional rules) into the signed-in user's users/{uid} subtree. Ids are preserved, so a
 * re-run after a partial failure is harmless; the marker doc is written last. If the legacy tree
 * is unreadable (final rules already deployed) it records 'skipped' so we stop asking.
 */
export async function migrateLegacyData(): Promise<MigrationResult> {
  const r = await ready();
  if (!r.ok) return { status: 'skipped' };

  const markerRef = doc(r.db, 'users', r.uid, 'meta', 'legacyMigration');
  try {
    if ((await getDoc(markerRef)).exists()) return { status: 'already_done' };
  } catch (e) {
    console.warn('[Firebase] migration marker read failed', e);
    return { status: 'skipped' };
  }

  let legacyBorrowers;
  try {
    legacyBorrowers = await getDocs(collection(r.db, 'borrowers'));
  } catch (e: any) {
    if (e?.code === 'permission-denied') {
      await setDoc(markerRef, { status: 'skipped', at: new Date().toISOString() }).catch(() => {});
    } else {
      console.warn('[Firebase] legacy read failed (will retry next launch)', e);
    }
    return { status: 'skipped' };
  }

  try {
    let copied = 0;
    for (const bDoc of legacyBorrowers.docs) {
      await setDoc(borrowerRef(r, bDoc.id), bDoc.data());
      const loansSnap = await getDocs(collection(bDoc.ref, 'loans'));
      for (const lDoc of loansSnap.docs) {
        await setDoc(loanRef(r, bDoc.id, lDoc.id), lDoc.data());
        const paymentsSnap = await getDocs(collection(lDoc.ref, 'payments'));
        const pCol = paymentsCol(r, bDoc.id, lDoc.id);
        for (let i = 0; i < paymentsSnap.docs.length; i += 400) {
          const batch = writeBatch(r.db);
          for (const pDoc of paymentsSnap.docs.slice(i, i + 400)) batch.set(doc(pCol, pDoc.id), pDoc.data());
          await batch.commit();
        }
      }
      copied++;
    }
    await setDoc(markerRef, {
      status: copied ? 'done' : 'nothing_to_migrate',
      borrowers: copied,
      at: new Date().toISOString(),
    });
    return copied ? { status: 'done', copied } : { status: 'nothing_to_migrate' };
  } catch (e) {
    console.warn('[Firebase] legacy migration failed (will retry next launch)', e);
    return { status: 'skipped' };
  }
}

export default {
  migrateLegacyData,
  fetchAllData,
  addLoan,
  updateLoanInfo,
  updateBorrowerInfo,
  writePaymentSchedule,
  updatePayment,
  deleteLoan,
  deleteBorrower,
};
