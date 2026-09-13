import { Borrower } from '../types';

/** Stub hook for future local payment reminders. Currently no-op. */
export function useNotifications() {
  const scheduleRemindersForBorrower = async (_borrower: Borrower) => undefined;
  const cancelRemindersForBorrower = async (_borrowerId: string) => undefined;

  return { scheduleRemindersForBorrower, cancelRemindersForBorrower };
}
