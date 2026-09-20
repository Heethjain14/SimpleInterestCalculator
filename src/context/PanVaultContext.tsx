import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import PanVaultModal, { VaultModalMode } from '../components/PanVaultModal';
import { MIN_PASSPHRASE_LENGTH } from '../services/pan/panVaultCore';
import { getVault, lockVault } from '../services/panVault.web';

interface PanVaultContextValue {
  /** False on native, where PANs use the device's secure store and need no passphrase. */
  requiresUnlock: boolean;
  /**
   * Resolves true once PANs can be read/written: immediately when already unlocked (or on
   * native), otherwise after the user sets up / unlocks the vault. Resolves false if they
   * cancel or the vault can't be reached. Call before getPan/setPan on web.
   */
  ensureUnlocked: () => Promise<boolean>;
  lock: () => void;
  changePassphrase: (oldPassphrase: string, newPassphrase: string) => Promise<boolean>;
}

const PanVaultContext = createContext<PanVaultContextValue | null>(null);

const isWeb = Platform.OS === 'web';

export function PanVaultProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<VaultModalMode>('unlock');
  const waiters = useRef<((ok: boolean) => void)[]>([]);

  const settle = useCallback((ok: boolean) => {
    setVisible(false);
    const pending = waiters.current;
    waiters.current = [];
    pending.forEach((resolve) => resolve(ok));
  }, []);

  // Sign-out (this provider unmounts with the signed-in tree) drops the in-memory key.
  useEffect(() => () => lockVault(), []);

  const ensureUnlocked = useCallback(async (): Promise<boolean> => {
    if (!isWeb) return true;
    try {
      const vault = getVault();
      if (vault.isUnlocked()) return true;
      const status = await vault.status(); // one Firestore read the first time
      setMode(status === 'none' ? 'setup' : 'unlock');
    } catch (e) {
      console.warn('[PanVault] could not reach the vault', e);
      return false;
    }
    return new Promise<boolean>((resolve) => {
      waiters.current.push(resolve);
      setVisible(true);
    });
  }, []);

  const value = useMemo<PanVaultContextValue>(() => ({
    requiresUnlock: isWeb,
    ensureUnlocked,
    lock: () => { if (isWeb) { try { getVault().lock(); } catch { /* signed out */ } } },
    changePassphrase: (o, n) => getVault().changePassphrase(o, n),
  }), [ensureUnlocked]);

  return (
    <PanVaultContext.Provider value={value}>
      {children}
      {isWeb && (
        <PanVaultModal
          visible={visible}
          mode={mode}
          minLength={MIN_PASSPHRASE_LENGTH}
          onSetup={async (pass) => { await getVault().setup(pass); settle(true); }}
          onUnlock={async (pass) => {
            const ok = await getVault().unlock(pass);
            if (ok) settle(true);
            return ok;
          }}
          onReset={async () => { await getVault().reset(); setMode('setup'); }}
          onCancel={() => settle(false)}
        />
      )}
    </PanVaultContext.Provider>
  );
}

export function usePanVault(): PanVaultContextValue {
  const ctx = useContext(PanVaultContext);
  if (!ctx) throw new Error('usePanVault must be used within PanVaultProvider');
  return ctx;
}
