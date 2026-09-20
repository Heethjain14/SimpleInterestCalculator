import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { colors, radii } from '../theme/tokens';

export type VaultModalMode = 'setup' | 'unlock';

interface Props {
  visible: boolean;
  mode: VaultModalMode;
  minLength: number;
  onSetup: (passphrase: string) => Promise<void>;
  /** Resolves false when the passphrase is wrong. */
  onUnlock: (passphrase: string) => Promise<boolean>;
  /** Wipes the vault and all saved PANs (used when the passphrase is forgotten). */
  onReset: () => Promise<void>;
  onCancel: () => void;
}

/** Passphrase prompt for the PAN vault: first-time setup, or unlocking for this session. */
export default function PanVaultModal({ visible, mode, minLength, onSetup, onUnlock, onReset, onCancel }: Props) {
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    if (visible) {
      setPass('');
      setConfirm('');
      setError(null);
      setBusy(false);
      setConfirmingReset(false);
    }
  }, [visible, mode]);

  const submit = async () => {
    setError(null);
    if (mode === 'setup') {
      if (pass.length < minLength) return setError(`Use at least ${minLength} characters.`);
      if (pass !== confirm) return setError('The two passphrases do not match.');
    } else if (!pass) {
      return setError('Enter your vault passphrase.');
    }
    setBusy(true);
    try {
      if (mode === 'setup') {
        await onSetup(pass);
      } else if (!(await onUnlock(pass))) {
        setError('Wrong passphrase.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    setBusy(true);
    try {
      await onReset();
    } catch (e: any) {
      setError(e?.message ?? 'Could not reset the vault.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.card}>
          {confirmingReset ? (
            <>
              <Text style={styles.title}>Reset PAN vault?</Text>
              <Text style={styles.body}>
                This permanently deletes every saved PAN and the vault itself. It cannot be undone, and
                there is no way to recover PANs without the passphrase. Names and loans are not affected.
              </Text>
              {error && <Text style={styles.error}>{error}</Text>}
              <View style={styles.row}>
                <TouchableOpacity style={styles.secondary} onPress={() => setConfirmingReset(false)} disabled={busy}>
                  <Text style={styles.secondaryText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.danger} onPress={doReset} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Delete all PANs</Text>}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>{mode === 'setup' ? 'Create a PAN vault passphrase' : 'Unlock PAN vault'}</Text>
              <Text style={styles.body}>
                {mode === 'setup'
                  ? 'PANs are encrypted in your browser with this passphrase before they are saved, so only you can read them. Use something different from your login password. If you forget it, saved PANs cannot be recovered.'
                  : 'Enter your vault passphrase to view or save PANs. It stays in memory for this session only.'}
              </Text>

              <TextInput
                style={styles.input}
                value={pass}
                onChangeText={setPass}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                autoComplete="off"
                placeholder="Vault passphrase"
                placeholderTextColor={colors.ink3}
                onSubmitEditing={submit}
              />
              {mode === 'setup' && (
                <TextInput
                  style={styles.input}
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  placeholder="Repeat passphrase"
                  placeholderTextColor={colors.ink3}
                  onSubmitEditing={submit}
                />
              )}

              {error && <Text style={styles.error}>{error}</Text>}
              {busy && <Text style={styles.hint}>Deriving key… this takes a couple of seconds.</Text>}

              <View style={styles.row}>
                <TouchableOpacity style={styles.secondary} onPress={onCancel} disabled={busy}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primary, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : (
                    <Text style={styles.primaryText}>{mode === 'setup' ? 'Create vault' : 'Unlock'}</Text>
                  )}
                </TouchableOpacity>
              </View>

              {mode === 'unlock' && (
                <TouchableOpacity style={styles.link} onPress={() => { setError(null); setConfirmingReset(true); }} disabled={busy}>
                  <Text style={styles.linkText}>Forgot passphrase?</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(8,10,18,0.52)', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%', maxWidth: 440, alignSelf: 'center', backgroundColor: colors.surface,
    borderRadius: radii.xl, padding: 20,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 },
  body: { fontSize: 13.5, color: colors.ink2, marginTop: 8, marginBottom: 14, lineHeight: 19 },
  input: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, borderRadius: radii.md,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: colors.ink, marginBottom: 10,
  },
  error: { color: colors.danger, fontSize: 13, marginBottom: 8 },
  hint: { color: colors.ink2, fontSize: 12.5, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  primary: { flex: 2, backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: 13, alignItems: 'center' },
  danger: { flex: 2, backgroundColor: colors.danger, borderRadius: radii.md, paddingVertical: 13, alignItems: 'center' },
  primaryText: { color: colors.accentInk, fontWeight: '800', fontSize: 14.5 },
  secondary: { flex: 1, backgroundColor: colors.surface2, borderRadius: radii.md, paddingVertical: 13, alignItems: 'center' },
  secondaryText: { color: colors.ink2, fontWeight: '700', fontSize: 14.5 },
  link: { alignItems: 'center', marginTop: 14 },
  linkText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
});
