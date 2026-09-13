import { Borrower, Loan, Payment } from '../types';

export interface DuePaymentItem {
  borrowerId: string;
  borrowerName: string;
  borrowerPhone: string;
  loan: Loan;
  payment: Payment;
  daysOverdue: number;
  amountDue: number;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Remaining amount still owed on a payment installment. */
export function getAmountDue(payment: Payment): number {
  if (payment.remainingAmount != null && payment.remainingAmount > 0) {
    return payment.remainingAmount;
  }
  if (payment.paidDate && (payment.remainingAmount ?? 0) <= 0) {
    return 0;
  }
  if (payment.paidAmount != null && payment.paidAmount > 0) {
    return Math.max(0, payment.totalAmount - payment.paidAmount);
  }
  return payment.totalAmount;
}

/** True when the installment is past due and not fully settled. */
export function isPaymentOverdue(payment: Payment, today = startOfDay(new Date())): boolean {
  const due = startOfDay(new Date(payment.dueDate));
  return due < today && getAmountDue(payment) > 0;
}

/** All overdue installments across borrowers, sorted by most late first. */
export function getDuePayments(borrowers: Borrower[]): DuePaymentItem[] {
  const today = startOfDay(new Date());
  const items: DuePaymentItem[] = [];

  for (const borrower of borrowers) {
    for (const loan of borrower.loans) {
      for (const payment of loan.payments ?? []) {
        if (!isPaymentOverdue(payment, today)) continue;

        const due = startOfDay(new Date(payment.dueDate));
        const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86_400_000);

        items.push({
          borrowerId: borrower.id,
          borrowerName: borrower.name,
          borrowerPhone: borrower.phone,
          loan,
          payment,
          daysOverdue,
          amountDue: getAmountDue(payment),
        });
      }
    }
  }

  return items.sort((a, b) => b.daysOverdue - a.daysOverdue);
}
