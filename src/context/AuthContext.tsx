import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from 'firebase/auth';
import { getFirebase } from '../services/firebaseApp';

interface AuthContextValue {
  /** The signed-in (non-anonymous) user, or null. */
  user: User | null;
  /** True until Firebase has restored any saved session. */
  initializing: boolean;
  /** False when no Firebase config is present in app.json. */
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const fb = getFirebase();
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (!fb) {
      setInitializing(false);
      return;
    }
    return onAuthStateChanged(fb.auth, (u) => {
      // Sessions left over from the old anonymous-auth build have no identity and no data access.
      if (u?.isAnonymous) {
        fbSignOut(fb.auth).catch(() => {});
        setUser(null);
      } else {
        setUser(u);
      }
      setInitializing(false);
    });
  }, [fb]);

  const need = () => {
    if (!fb) throw new Error('Firebase is not configured.');
    return fb.auth;
  };

  const value: AuthContextValue = {
    user,
    initializing,
    configured: !!fb,
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(need(), email.trim(), password);
    },
    signUp: async (email, password) => {
      await createUserWithEmailAndPassword(need(), email.trim(), password);
    },
    resetPassword: async (email) => {
      await sendPasswordResetEmail(need(), email.trim());
    },
    signOut: async () => {
      await fbSignOut(need());
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Maps Firebase Auth error codes to short, user-facing messages. */
export function authErrorMessage(e: any): string {
  switch (e?.code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a bit and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.';
    case 'auth/admin-restricted-operation':
      return 'New accounts are disabled. Ask the owner to add you in the Firebase console.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in (or sign-up) is disabled for this project in the Firebase console.';
    default:
      return e?.message ?? 'Something went wrong. Please try again.';
  }
}
