import { useStorageContext } from '../context/StorageContext';

/** @deprecated Prefer useStorageContext — kept for backward compatibility. */
export function useStorage() {
  return useStorageContext();
}

export type { RefreshResult } from '../context/StorageContext';
