import React, { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { authErrorMessage, useAuth } from '../context/AuthContext';
import { colors, radii } from '../theme/tokens';

type Mode = 'signin' | 'signup';

/** Sign-up UI is hidden unless app.json sets expo.extra.allowSignUp to true (single-user setup). */
const ALLOW_SIGN_UP = ((Constants as any).expoConfig?.extra ?? {}).allowSignUp === true;

/** Email/password sign-in shown whenever there's no signed-in user. */
export default function LoginScreen() {
  const { signIn, signUp, resetPassword, configured } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await (mode === 'signin' ? signIn(email, password) : signUp(email, password));
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('Enter your email above first, then tap "Forgot password".');
      return;
    }
    try {
      await resetPassword(email);
      setInfo('If that account exists, a password reset email is on its way.');
    } catch (e) {
      setError(authErrorMessage(e));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.brand}>Portfolio Ledger</Text>
            <Text style={styles.sub}>{mode === 'signin' ? 'Sign in to your ledger' : 'Create your account'}</Text>

            {!configured && (
              <Text style={styles.error}>Firebase is not configured in app.json (expo.extra.firebaseConfig).</Text>
            )}

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
              placeholder="you@example.com"
              placeholderTextColor={colors.ink3}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              textContentType={mode === 'signin' ? 'password' : 'newPassword'}
              placeholder="••••••••"
              placeholderTextColor={colors.ink3}
              onSubmitEditing={submit}
            />

            {error && <Text style={styles.error}>{error}</Text>}
            {info && <Text style={styles.info}>{info}</Text>}

            <TouchableOpacity style={[styles.button, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy || !configured}>
              {busy ? <ActivityIndicator color={colors.accentInk} /> : (
                <Text style={styles.buttonText}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Text>
              )}
            </TouchableOpacity>

            {mode === 'signin' && (
              <TouchableOpacity onPress={forgot} style={styles.link}>
                <Text style={styles.linkText}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            {ALLOW_SIGN_UP && (
              <TouchableOpacity
                onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setInfo(null); }}
                style={styles.link}
              >
                <Text style={styles.linkText}>
                  {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: colors.surface,
    borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, padding: 22,
  },
  brand: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  sub: { fontSize: 14, color: colors.ink2, marginTop: 4, marginBottom: 18 },
  label: { fontSize: 12.5, fontWeight: '700', color: colors.ink2, marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, borderRadius: radii.md,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: colors.ink,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: 12 },
  info: { color: colors.success, fontSize: 13, marginTop: 12 },
  button: {
    backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: 13, alignItems: 'center', marginTop: 18,
  },
  buttonText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
  link: { alignItems: 'center', marginTop: 14 },
  linkText: { color: colors.accent, fontWeight: '700', fontSize: 13.5 },
});
