/** Shared design tokens for the "modern fintech" visual pass (see docs/DESIGN_REDESIGN comp). */
export const colors = {
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  surface2: '#F0F2F5',
  ink: '#0E1116',
  ink2: '#5B6472',
  ink3: '#94A0B4',
  border: '#E4E7EC',

  accent: '#4F46E5',
  accentInk: '#FFFFFF',
  accentSoft: '#EEF0FE',
  accentSoftBorder: '#DEE0FB',

  success: '#0E9F6E',
  successSoft: '#E5F6F0',
  warning: '#D97706',
  warningSoft: '#FDF1E0',
  danger: '#DC2626',
  dangerSoft: '#FCE9E9',

  sidebar: '#12172B',
  sidebarInk: '#CBD2E1',
  sidebarInkDim: '#7E8AA3',
  sidebarActive: '#4F46E5',
  sidebarBorder: '#242A42',
};

export const radii = {
  sm: 8,
  md: 11,
  lg: 14,
  xl: 16,
  xxl: 18,
  pill: 100,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
};

/** Overdue-severity colour, shared by Dashboard's "Due soon" list and DuePaymentsList. */
export function priorityColor(daysOverdue: number): string {
  if (daysOverdue >= 14) return colors.danger;
  if (daysOverdue >= 1) return colors.warning;
  return colors.ink2;
}
