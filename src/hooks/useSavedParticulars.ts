import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firebaseSync from '../services/firebaseSync';
import * as panVault from '../services/panVault';
import { usePanVault } from '../context/PanVaultContext';

const STORAGE_KEY = 'saved_particulars';

/**
 * A reusable particular. The name is stored in AsyncStorage and synced to Firestore;
 * the PAN is only ever in the secure store, so `hasPan` is all the rest of the app sees.
 */
export interface SavedParticular {
  id: string;
  name: string;
  createdAt: string;
  /** False until the name has been written to Firestore (retried on the next sync). */
  synced: boolean;
  hasPan: boolean;
}

type StoredParticular = Omit<SavedParticular, 'hasPan'>;

export const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ');

/**
 * Deterministic id derived from the name (case-insensitive), so the same person maps to
 * the same Firestore doc and secure-store key on every device: re-saving updates in
 * place and syncing can't create duplicates. Only [a-z0-9_] so it is a valid key everywhere.
 */
export function idForName(name: string): string {
  const codePoints = Array.from(normalizeName(name).toLowerCase()).map((c) => c.codePointAt(0)!.toString(16));
  return `n_${codePoints.join('_')}`;
}

const byName = (a: SavedParticular, b: SavedParticular) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** Saved names for the EMI statement picker: local-first, names synced to Firestore, PANs device-only. */
export function useSavedParticulars() {
  const { ensureUnlocked, requiresUnlock } = usePanVault();
  const [items, setItems] = useState<SavedParticular[]>([]);
  const [panSupported, setPanSupported] = useState(false);
  // Latest list, so back-to-back async writes build on each other instead of on stale state.
  const itemsRef = useRef<SavedParticular[]>([]);
  const panSupportedRef = useRef(false);

  const commit = useCallback((next: SavedParticular[]) => {
    const sorted = [...next].sort(byName);
    itemsRef.current = sorted;
    setItems(sorted);
    const stored: StoredParticular[] = sorted.map(({ hasPan: _hasPan, ...rest }) => rest);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored)).catch((e) => console.warn('Failed to save names', e));
  }, []);

  const withPanFlags = useCallback(async (list: StoredParticular[]): Promise<SavedParticular[]> => {
    return Promise.all(
      list.map(async (s) => ({
        ...s,
        hasPan: panSupportedRef.current ? await panVault.hasPan(s.id) : false,
      })),
    );
  }, []);

  /** Pushes names that never reached Firestore, then adopts Firestore's list as the source of truth. */
  const sync = useCallback(async () => {
    for (const entry of itemsRef.current.filter((i) => !i.synced)) {
      const res = await firebaseSync.upsertSavedParticular(entry);
      if (res.ok) commit(itemsRef.current.map((i) => (i.id === entry.id ? { ...i, synced: true } : i)));
    }

    const remote = await firebaseSync.fetchSavedParticulars();
    if (!remote.ok) return;

    const stillUnsynced = itemsRef.current.filter((i) => !i.synced && !remote.items.some((r) => r.id === i.id));
    const merged: StoredParticular[] = [
      ...remote.items.map((r) => ({ ...r, synced: true })),
      ...stillUnsynced.map(({ hasPan: _hasPan, ...rest }) => rest),
    ];
    commit(await withPanFlags(merged));
  }, [commit, withPanFlags]);

  useEffect(() => {
    (async () => {
      const supported = await panVault.isAvailable();
      panSupportedRef.current = supported;
      setPanSupported(supported);

      let stored: StoredParticular[] = [];
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) stored = JSON.parse(raw);
      } catch (e) {
        console.warn('Failed to load saved names', e);
      }
      commit(await withPanFlags(stored));
      await sync();
    })();
  }, [commit, withPanFlags, sync]);

  /** Saves (or updates) a name, and its PAN when given and the secure store exists. A blank PAN never erases a stored one. */
  const save = useCallback(
    async (rawName: string, pan: string): Promise<{ panSaved: boolean }> => {
      const name = normalizeName(rawName);
      const id = idForName(name);

      let panSaved = false;
      if (pan && panSupportedRef.current) {
        // Web: PANs are encrypted with the vault passphrase, so unlock (or set up) the vault first.
        if (await ensureUnlocked()) {
          await panVault.setPan(id, pan);
          panSaved = true;
        }
      }

      const existing = itemsRef.current.find((i) => i.id === id);
      const entry: SavedParticular = {
        id,
        name,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        synced: false,
        hasPan: panSaved || (existing?.hasPan ?? false),
      };
      commit([...itemsRef.current.filter((i) => i.id !== id), entry]);

      const res = await firebaseSync.upsertSavedParticular(entry);
      if (res.ok) commit(itemsRef.current.map((i) => (i.id === id ? { ...i, synced: true } : i)));
      return { panSaved };
    },
    [commit, ensureUnlocked],
  );

  /** Removes the name everywhere: secure store, local list and Firestore. */
  const remove = useCallback(
    async (id: string) => {
      await panVault.deletePan(id);
      commit(itemsRef.current.filter((i) => i.id !== id));
      await firebaseSync.deleteSavedParticular(id);
    },
    [commit],
  );

  const getPan = useCallback(
    async (id: string) => {
      if (!panSupportedRef.current) return null;
      if (!(await ensureUnlocked())) return null;
      return panVault.getPan(id);
    },
    [ensureUnlocked],
  );

  return { items, panSupported, requiresUnlock, save, remove, getPan };
}
