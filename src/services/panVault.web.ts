/**
 * Web implementation of the PAN vault API (Metro picks this file over panVault.ts on web).
 * PANs are encrypted in the browser with a key derived from a vault passphrase and only the
 * ciphertext is synced to Firestore (see services/pan/). Until the vault is unlocked,
 * getPan returns null and setPan throws VaultLockedError; UI should call
 * usePanVault().ensureUnlocked() first.
 */
import { getFirebase } from './firebaseApp';
import { createFirestorePanStore } from './pan/firestorePanStore';
import { PanVault, VaultLockedError, createVault } from './pan/panVaultCore';

export { VaultLockedError, MIN_PASSPHRASE_LENGTH } from './pan/panVaultCore';
export type { VaultStatus } from './pan/panVaultCore';

let current: { uid: string; vault: PanVault } | null = null;

/** The vault for the signed-in user; switching users locks and discards the previous one. */
export function getVault(): PanVault {
  const uid = getFirebase()?.auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');
  if (!current || current.uid !== uid) {
    current?.vault.lock();
    current = { uid, vault: createVault(createFirestorePanStore(uid)) };
  }
  return current.vault;
}

/** Drops the in-memory key (call on sign-out). */
export function lockVault(): void {
  current?.vault.lock();
  current = null;
}

export async function isAvailable(): Promise<boolean> {
  return true;
}

/** Returns the stored PAN, or null if none / unreadable / vault locked. Never logs the value. */
export async function getPan(id: string): Promise<string | null> {
  const vault = getVault();
  if (!vault.isUnlocked()) return null;
  try {
    return await vault.get(id);
  } catch {
    return null;
  }
}

/** True when a PAN is stored for this id, even while the vault is locked. */
export async function hasPan(id: string): Promise<boolean> {
  try {
    return await getVault().has(id);
  } catch {
    return false;
  }
}

export async function setPan(id: string, pan: string): Promise<void> {
  await getVault().set(id, pan);
}

export async function deletePan(id: string): Promise<void> {
  try {
    await getVault().remove(id);
  } catch {
    // Nothing stored or unreachable; either way there is nothing left to remove locally.
  }
}
