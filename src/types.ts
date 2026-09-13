/** Supported payment channels when recording an installment. */
export type PaymentMode = 'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque' | 'RTGS';

/** Cutting = interest deducted upfront; Adding = interest added to each installment. */
export type RepaymentMode = 'cutting' | 'adding';

/** A single scheduled or recorded installment for a loan. */
export interface Payment {
  id: string;
  dueDate: string; // ISO string
  dueNumber: number;
  principal: number;
  interest: number;
  totalAmount: number;
  paidDate?: string; // ISO string
  paidAmount?: number;
  remainingAmount?: number;
  delayDays: number;
  delayInterest: number;
  paymentMode?: PaymentMode;
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
