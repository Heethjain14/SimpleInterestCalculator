export type Screen = 'dashboard' | 'due' | 'simple' | 'emi' | 'clients';

export interface NavItem {
  key: Screen;
  label: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'due', label: 'Due Payments', icon: '⏰' },
  { key: 'simple', label: 'Simple Interest', icon: '₹' },
  { key: 'emi', label: 'EMI Schedule', icon: '📅' },
  { key: 'clients', label: 'Clients', icon: '👥' },
];

export const SCREEN_SUBTITLES: Record<Screen, string> = {
  dashboard: 'Portfolio overview & metrics',
  due: 'Overdue installments by priority',
  simple: 'Simple interest by date range',
  emi: 'Monthly EMI schedule',
  clients: 'Borrower profiles',
};
