import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Borrower, Loan } from '../types';
import firebaseSync from '../services/firebaseSync';

const STORAGE_KEY = 'borrowers_data';
/** uid of the user whose data is cached under STORAGE_KEY, so another account never sees it. */
const OWNER_KEY = 'borrowers_data_owner';

export type RefreshResult =
  | { ok: true; count: number }
  | { ok: false; reason: 'no_url' | 'network' | 'invalid_response' | 'api_error' | 'not_signed_in' };

interface StorageContextValue {
  borrowers: Borrower[];
  loading: boolean;
  /** Saves borrower-level fields (name/phone/notes) AND every loan on the object. */
  saveBorrower: (borrower: Borrower) => Promise<void>;
  /** Saves/creates a single loan under a borrower. */
  saveLoan: (borrowerId: string, loan: Loan) => Promise<void>;
  deleteLoan: (borrowerId: string, loanId: string) => Promise<void>;
  deleteBorrower: (borrowerId: string) => Promise<void>;
  getBorrower: (id: string) => Borrower | null;
  reload: () => Promise<void>;
  /** Pulls the full dataset from Firestore and overwrites local + AsyncStorage state. */
  refreshFromServer: () => Promise<RefreshResult>;
}

const StorageContext = createContext<StorageContextValue | null>(null);

/**
 * Defends against stale on-device AsyncStorage data written by an older
 * version of the app (e.g. before `loans`/`payments` were always present, or
 * before `partialPayments`/`disbursedAmount` existed) — every current write
 * path always sets them, so this only matters for data that predates the
 * current shape.
 */
function sanitizeBorrowers(borrowers: Borrower[]): Borrower[] {
  return (borrowers ?? []).map(b => ({
    ...b,
    name: b.name ?? '',
    phone: b.phone ?? '',
    createdAt: b.createdAt ?? new Date().toISOString(),
    loans: (b.loans ?? []).map(l => ({
      ...l,
      disbursedAmount: l.disbursedAmount ?? l.principal,
      payments: (l.payments ?? []).map(p => ({
        ...p,
        // Old single-payment shape: synthesize one history entry so the
        // existing paid/remaining amounts survive the upgrade.
        partialPayments: p.partialPayments ?? (
          p.paidAmount
            ? [{
                id: `${p.id}-legacy`,
                date: p.paidDate ?? p.dueDate,
                amount: p.paidAmount,
                mode: p.paymentMode ?? 'Cash',
                delayDays: p.delayDays ?? 0,
                delayInterest: p.delayInterest ?? 0,
              }]
            : []
        ),
      })),
    })),
  }));
}

/** Shared borrower storage backed by AsyncStorage with Firestore sync. */
export function StorageProvider({ children, uid }: { children: ReactNode; uid: string }) {
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<boolean> => {
    let hasCache = false;
    try {
      // The on-device cache belongs to one account. A cache with no recorded owner predates
      // sign-in, so the first account to sign in adopts it; a different account starts clean.
      const owner = await AsyncStorage.getItem(OWNER_KEY);
      if (owner && owner !== uid) {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
      await AsyncStorage.setItem(OWNER_KEY, uid);

      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = sanitizeBorrowers(JSON.parse(raw));
        setBorrowers(parsed);
        hasCache = parsed.length > 0;
      }
    } catch (e) {
      console.error('Failed to load borrowers', e);
    } finally {
      setLoading(false);
    }
    return hasCache;
  }, [uid]);

  const refreshFromServer = useCallback(async (): Promise<RefreshResult> => {
    try {
      setLoading(true);
      const response = await firebaseSync.fetchAllData();

      if (!response) {
        console.error('[Firebase] No response received from Firestore (fetch returned null)');
        return { ok: false, reason: 'network' };
      }
      if (response.ok === false) {
        console.error('[Firebase] Fetch returned error:', (response as any).message ?? response);
        return { ok: false, reason: (response as any).reason ?? 'api_error' };
      }

      const nextBorrowers = (response as any).borrowers;
      if (!Array.isArray(nextBorrowers)) {
        console.error('[Firebase] Expected borrower array but got:', typeof nextBorrowers, nextBorrowers);
        console.error('[Firebase] Full raw response:', response);
        return { ok: false, reason: 'invalid_response' };
      }

      setBorrowers(nextBorrowers);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextBorrowers));
      if (__DEV__) {
        console.log('[Firebase] Refresh successful, loaded', nextBorrowers.length, 'borrowers');
      }
      return { ok: true, count: nextBorrowers.length };
    } catch (e) {
      console.error('[Firebase] Unexpected error during fetch:', e);
      return { ok: false, reason: 'network' };
    } finally {
      setLoading(false);
    }
  }, []);

  // On sign-in: copy any pre-auth data into this account (one time), and pull from Firestore
  // when nothing is cached locally (new device / browser) or the migration just ran.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hadCache = await load();
      const migration = await firebaseSync.migrateLegacyData();
      if (cancelled) return;
      if (!hadCache || migration.status === 'done') await refreshFromServer();
    })();
    return () => { cancelled = true; };
  }, [load, refreshFromServer]);

  const persistLocal = async (updated: Borrower[]) => {
    setBorrowers(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  /** Saves/creates one loan under a borrower (identified by id), syncing just that loan's sheet. */
  const saveLoan = async (borrowerId: string, loan: Loan) => {
    const borrowerIdx = borrowers.findIndex(b => b.id === borrowerId);
    const existingLoan = borrowerIdx !== -1
      ? borrowers[borrowerIdx].loans.find(l => l.id === loan.id)
      : undefined;

    if (borrowerIdx === -1) {
      console.warn(`saveLoan: no local borrower with id "${borrowerId}" — call saveBorrower for a brand-new borrower instead.`);
      return;
    }

    const borrower = borrowers[borrowerIdx];
    const updated = borrowers.map((b, i) => {
      if (i !== borrowerIdx) return b;
      const loans = existingLoan
        ? b.loans.map(l => (l.id === loan.id ? loan : l))
        : [...b.loans, loan];
      return { ...b, loans };
    });
    await persistLocal(updated);

    try {
      if (existingLoan) {
        await firebaseSync.updateLoanInfo(borrower.id, {
          loanId: loan.id,
          principal: loan.principal,
          interestRate: loan.interestRate,
          startDate: loan.startDate,
          tenure: loan.tenure,
          nextDueDate: loan.nextDueDate,
          repaymentMode: loan.repaymentMode,
          loanNotes: loan.notes,
        });
        await firebaseSync.writePaymentSchedule(borrower.id, loan.id, loan.payments ?? []);
      } else {
        const result = await firebaseSync.addLoan({
          loanId: loan.id,
          borrowerId: borrower.id,
          borrowerName: borrower.name,
          phone: borrower.phone,
          borrowerNotes: borrower.notes,
          createdAt: borrower.createdAt,
          principal: loan.principal,
          interestRate: loan.interestRate,
          startDate: loan.startDate,
          tenure: loan.tenure,
          nextDueDate: loan.nextDueDate,
          repaymentMode: loan.repaymentMode,
          disbursedAmount: loan.disbursedAmount,
          loanNotes: loan.notes,
          payments: loan.payments ?? [],
        });
        // If the server generated ids (fields were blank locally), store them back.
        if (result?.ok) {
          const withIds = updated.map(b => {
            if (b.id !== borrowerId) return b;
            const newBorrowerId = result.borrowerId && result.borrowerId !== b.id ? result.borrowerId : b.id;
            return {
              ...b,
              id: newBorrowerId,
              loans: b.loans.map(l => (l === loan && result.loanId && result.loanId !== l.id ? { ...l, id: result.loanId } : l)),
            };
          });
          await persistLocal(withIds);
        }
      }
    } catch (e) {
      console.warn('API sync failed (will retry later)', e);
    }
  };

  /**
   * Saves a borrower: creates it locally + on the server if new (via the
   * first loan, which carries borrower fields), pushes borrower-level
   * field changes (name/phone/notes) for every existing loan they have, and
   * saves each loan.
   */
  const saveBorrower = async (borrower: Borrower) => {
    const existing = borrowers.find(b => b.id === borrower.id);

    if (!existing) {
      // Brand-new borrower: save locally, then create each loan on the server
      // (addLoan carries the borrower fields on the document it creates).
      await persistLocal([...borrowers, borrower]);
      for (const loan of borrower.loans) {
        await saveLoanForNewBorrower(borrower, loan);
      }
      return;
    }

    // Existing borrower: update local copy, push borrower-level field
    // changes to the server, then save each loan.
    const updated = borrowers.map(b => (b.id === borrower.id ? borrower : b));
    await persistLocal(updated);

    try {
      await firebaseSync.updateBorrowerInfo({
        borrowerId: borrower.id,
        name: borrower.name,
        phone: borrower.phone,
        notes: borrower.notes,
      });
    } catch (e) {
      console.warn('API sync failed (will retry later)', e);
    }

    for (const loan of borrower.loans) {
      await saveLoan(borrower.id, loan);
    }
  };

  /** Internal: create the server-side document for one loan belonging to a borrower that doesn't exist there yet. */
  const saveLoanForNewBorrower = async (borrower: Borrower, loan: Loan) => {
    try {
      const result = await firebaseSync.addLoan({
        loanId: loan.id,
        borrowerId: borrower.id,
        borrowerName: borrower.name,
        phone: borrower.phone,
        borrowerNotes: borrower.notes,
        createdAt: borrower.createdAt,
        principal: loan.principal,
        interestRate: loan.interestRate,
        startDate: loan.startDate,
        tenure: loan.tenure,
        nextDueDate: loan.nextDueDate,
        repaymentMode: loan.repaymentMode,
        disbursedAmount: loan.disbursedAmount,
        loanNotes: loan.notes,
        payments: loan.payments ?? [],
      });
      if (result?.ok && (result.loanId !== loan.id || result.borrowerId !== borrower.id)) {
        setBorrowers(prev => {
          const next = prev.map(b => {
            if (b.id !== borrower.id && b.id !== result.borrowerId) return b;
            return {
              ...b,
              id: result.borrowerId || b.id,
              loans: b.loans.map(l => (l.id === loan.id ? { ...l, id: result.loanId || l.id } : l)),
            };
          });
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        });
      }
    } catch (e) {
      console.warn('API sync failed (will retry later)', e);
    }
  };

  const deleteLoan = async (borrowerId: string, loanId: string) => {
    const updated = borrowers
      .map(b => (b.id === borrowerId ? { ...b, loans: b.loans.filter(l => l.id !== loanId) } : b))
      .filter(b => b.loans.length > 0); // drop the borrower entirely once they have no loans left
    await persistLocal(updated);

    try {
      await firebaseSync.deleteLoan(borrowerId, loanId);
    } catch (e) {
      console.warn('API delete failed (will retry later)', e);
    }
  };

  const deleteBorrower = async (borrowerId: string) => {
    const updated = borrowers.filter(b => b.id !== borrowerId);
    await persistLocal(updated);

    try {
      await firebaseSync.deleteBorrower(borrowerId);
    } catch (e) {
      console.warn('API delete failed (will retry later)', e);
    }
  };

  const getBorrower = (id: string) => borrowers.find(b => b.id === id) ?? null;

  return (
    <StorageContext.Provider
      value={{ borrowers, loading, saveBorrower, saveLoan, deleteLoan, deleteBorrower, getBorrower, reload: async () => { await load(); }, refreshFromServer }}
    >
      {children}
    </StorageContext.Provider>
  );
}

/** Access shared borrower storage. Must be used inside StorageProvider. */
export function useStorageContext(): StorageContextValue {
  const ctx = useContext(StorageContext);
  if (!ctx) throw new Error('useStorageContext must be used within StorageProvider');
  return ctx;
}