/**
 * PAN vault logic on top of panCrypto, independent of where ciphertext is stored
 * (see VaultStore) so it can be tested without Firebase.
 *
 * States: 'none' (never set up) -> 'locked' -> 'unlocked'. The data key lives only in this
 * object's memory and is dropped by lock(); a page reload or sign-out locks the vault again.
 */
import { DEFAULT_KDF, KdfParams, Sealed, VaultMeta, createMeta, open, rewrapMeta, seal, unwrapDek } from './panCrypto';

export interface VaultStore {
  getMeta(): Promise<VaultMeta | null>;
  setMeta(meta: VaultMeta): Promise<void>;
  getEntry(id: string): Promise<Sealed | null>;
  setEntry(id: string, sealed: Sealed): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  /** Deletes every entry and the meta document. */
  clear(): Promise<void>;
}

export type VaultStatus = 'none' | 'locked' | 'unlocked';

export class VaultLockedError extends Error {
  constructor() {
    super('PAN vault is locked');
    this.name = 'VaultLockedError';
  }
}

export const MIN_PASSPHRASE_LENGTH = 8;

export function createVault(store: VaultStore, kdf: KdfParams = DEFAULT_KDF) {
  let key: Uint8Array | null = null;
  let metaCache: VaultMeta | null | undefined; // undefined = not loaded yet

  const loadMeta = async () => {
    if (metaCache === undefined) metaCache = await store.getMeta();
    return metaCache;
  };
  const requireKey = () => {
    if (!key) throw new VaultLockedError();
    return key;
  };

  return {
    async status(): Promise<VaultStatus> {
      if (key) return 'unlocked';
      return (await loadMeta()) ? 'locked' : 'none';
    },

    isUnlocked: () => key !== null,

    /** First-time setup: picks a fresh salt/key and leaves the vault unlocked. */
    async setup(passphrase: string): Promise<void> {
      if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
        throw new Error(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
      }
      if (await loadMeta()) throw new Error('A vault already exists.');
      const { meta, dek } = await createMeta(passphrase, kdf);
      await store.setMeta(meta);
      metaCache = meta;
      key = dek;
    },

    /** Returns false for a wrong passphrase. */
    async unlock(passphrase: string): Promise<boolean> {
      const meta = await loadMeta();
      if (!meta) throw new Error('No vault has been set up.');
      const k = await unwrapDek(passphrase, meta);
      if (!k) return false;
      key = k;
      return true;
    },

    lock(): void {
      if (key) key.fill(0);
      key = null;
    },

    async get(id: string): Promise<string | null> {
      const k = requireKey();
      const sealed = await store.getEntry(id);
      if (!sealed) return null;
      try {
        return open(k, id, sealed);
      } catch {
        return null; // corrupted or tampered entry: treat as absent rather than crash
      }
    },

    async set(id: string, value: string): Promise<void> {
      await store.setEntry(id, seal(requireKey(), id, value));
    },

    /** Whether a PAN is stored for this id. Needs no key: only ciphertext existence is checked. */
    async has(id: string): Promise<boolean> {
      return (await store.getEntry(id)) !== null;
    },

    async remove(id: string): Promise<void> {
      await store.deleteEntry(id);
    },

    /** Re-wraps the data key under a new passphrase; PANs are untouched. False if the old one is wrong. */
    async changePassphrase(oldPassphrase: string, newPassphrase: string): Promise<boolean> {
      if (newPassphrase.length < MIN_PASSPHRASE_LENGTH) {
        throw new Error(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
      }
      const meta = await loadMeta();
      if (!meta) throw new Error('No vault has been set up.');
      const dek = await unwrapDek(oldPassphrase, meta);
      if (!dek) return false;

      const newMeta = await rewrapMeta(dek, newPassphrase, kdf);
      await store.setMeta(newMeta);
      metaCache = newMeta;
      key = dek;
      return true;
    },

    /** Forgotten passphrase: wipes every stored PAN and the vault itself. Irreversible. */
    async reset(): Promise<void> {
      await store.clear();
      metaCache = null;
      this.lock();
    },
  };
}

export type PanVault = ReturnType<typeof createVault>;
