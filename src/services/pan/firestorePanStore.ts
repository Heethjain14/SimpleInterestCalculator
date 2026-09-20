/**
 * VaultStore backed by Firestore. Only ciphertext and key-wrapping metadata are stored:
 *   users/{uid}/panVault/{recordId}   -> Sealed PAN
 *   users/{uid}/meta/panVault         -> VaultMeta (salt, KDF params, wrapped data key)
 * The rules in firestore.rules already restrict users/{uid}/** to its owner.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { getFirebase } from '../firebaseApp';
import { Sealed, VaultMeta } from './panCrypto';
import { VaultStore } from './panVaultCore';

export function createFirestorePanStore(uid: string): VaultStore {
  const ctx = () => {
    const fb = getFirebase();
    if (!fb) throw new Error('Firebase is not configured.');
    if (fb.auth.currentUser?.uid !== uid) throw new Error('Signed-in user changed.');
    return fb.db;
  };
  const entries = () => collection(ctx(), 'users', uid, 'panVault');
  const metaRef = () => doc(ctx(), 'users', uid, 'meta', 'panVault');

  return {
    async getMeta() {
      const snap = await getDoc(metaRef());
      return snap.exists() ? (snap.data() as VaultMeta) : null;
    },
    setMeta: (meta: VaultMeta) => setDoc(metaRef(), meta),
    async getEntry(id: string) {
      const snap = await getDoc(doc(entries(), id));
      return snap.exists() ? (snap.data() as Sealed) : null;
    },
    setEntry: (id: string, sealed: Sealed) => setDoc(doc(entries(), id), sealed),
    deleteEntry: (id: string) => deleteDoc(doc(entries(), id)),
    async clear() {
      const snap = await getDocs(entries());
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = writeBatch(ctx());
        for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
        await batch.commit();
      }
      await deleteDoc(metaRef());
    },
  };
}
