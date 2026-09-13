/** Format a number as INR currency string. */
export function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format a Date object for display. */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Format an ISO date string for display. */
export function formatDateIso(iso: string): string {
  return formatDate(new Date(iso));
}
