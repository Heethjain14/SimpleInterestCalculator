/** Supported payment channels when recording an installment. */
export type PaymentMode = 'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque' | 'RTGS';

/** Cutting = interest deducted upfront; Adding = interest added to each installment. */
export type RepaymentMode = 'cutting' | 'adding';

/** One actual payment against an installment (an installment may be paid in several chunks). */
export interface PartialPayment {
  id: string;
  date: string; // ISO string — when this chunk was paid
  amount: number;
  mode: PaymentMode;
  delayDays: number;     // days late this chunk was, vs the installment's dueDate
  delayInterest: number; // this chunk's amount x daily rate x delayDays
  notes?: string;
}

/**
 * A single scheduled or recorded installment for a loan. `paidDate`/`paidAmount`/
 * `remainingAmount`/`delayDays`/`delayInterest`/`paymentMode` are roll-ups derived
 * from `partialPayments` (sum of amounts, latest date, summed delay interest, etc.) —
 * kept so screens that only need the summary don't need to walk the chunk list.
 */
export interface Payment {
  id: string;
  dueDate: string; // ISO string
  dueNumber: number;
  principal: number;
  interest: number;
  totalAmount: number;
  partialPayments: PartialPayment[];
  paidDate?: string; // ISO string
  paidAmount?: number;
  remainingAmount?: number;
  delayDays: number;
  delayInterest: number;
  /** 'Mixed' when partialPayments were recorded across more than one payment mode. */
  paymentMode?: PaymentMode | 'Mixed';
  notes?: string;
}

/** A loan attached to a borrower, including its full payment schedule. */
export interface Loan {
  id: string;
  principal: number;
  interestRate: number;
  startDate: string; // ISO string
  tenure: number;    // months
  nextDueDate: string; // ISO string
  repaymentMode?: RepaymentMode;
  /** Amount actually handed to the borrower — principal minus interest collected upfront in 'cutting' mode; equal to principal in 'adding' mode. */
  disbursedAmount: number;
  notes?: string;
  payments: Payment[];
}

/** Top-level client profile stored locally and optionally synced to Google Sheets. */
export interface Borrower {
  id: string;
  name: string;
  phone: string;
  notes?: string;
  createdAt: string; // ISO string
  loans: Loan[];
}
