import { Borrower } from '../types';
import { getDuePayments } from './duePayments';

export interface PortfolioMetrics {
  totalExposure: number;
  weightedAvgRate: number;
  totalOutstanding: number;
  totalCollected: number;
  activeBorrowers: number;
  activeLoans: number;
  overdueCount: number;
  overdueAmount: number;
  collectionRate: number;
}

function paymentOutstanding(p: { totalAmount: number; paidAmount?: number; remainingAmount?: number; paidDate?: string }): number {
  if (p.remainingAmount != null && p.remainingAmount > 0) return p.remainingAmount;
  if (p.paidDate && (p.remainingAmount ?? 0) <= 0) return 0;
  return p.totalAmount - (p.paidAmount ?? 0);
}

/** Aggregate portfolio metrics from all borrower loan data. */
export function computePortfolioMetrics(borrowers: Borrower[]): PortfolioMetrics {
  let totalExposure = 0;
  let rateWeightedSum = 0;
  let totalOutstanding = 0;
  let totalCollected = 0;
  let activeLoans = 0;

  for (const borrower of borrowers) {
    for (const loan of borrower.loans) {
      activeLoans += 1;
      totalExposure += loan.principal;
      rateWeightedSum += loan.principal * loan.interestRate;

      for (const payment of loan.payments ?? []) {
        totalCollected += payment.paidAmount ?? 0;
        totalOutstanding += paymentOutstanding(payment);
      }
    }
  }

  const dueItems = getDuePayments(borrowers);
  const overdueAmount = dueItems.reduce((sum, item) => sum + item.amountDue, 0);
  const totalDueEver = totalOutstanding + totalCollected;
  const collectionRate = totalDueEver > 0 ? (totalCollected / totalDueEver) * 100 : 0;

  return {
    totalExposure,
    weightedAvgRate: totalExposure > 0 ? rateWeightedSum / totalExposure : 0,
    totalOutstanding,
    totalCollected,
    activeBorrowers: borrowers.length,
    activeLoans,
    overdueCount: dueItems.length,
    overdueAmount,
    collectionRate,
  };
}
