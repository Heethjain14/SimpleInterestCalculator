/**
 * Single place that initialises the Firebase app, Auth and Firestore, so auth state and
 * Firestore always share one app instance. Config comes from app.json's expo.extra.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, initializeAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';

function getExtra(): any {
  return (Constants as any).expoConfig?.extra ?? (Constants as any).manifest?.extra ?? {};
}

export interface FirebaseContext {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
}

let ctx: FirebaseContext | null = null;

/** Returns null when no Firebase config has been provided. */
export function getFirebase(): FirebaseContext | null {
  if (ctx) return ctx;
  const extra = getExtra();
  const config = extra.firebaseConfig;
  if (!config || !config.apiKey) return null;

  const alreadyInitialised = getApps().length > 0;
  const app = alreadyInitialised ? getApp() : initializeApp(config);

  let auth: Auth;
  if (Platform.OS === 'web' || alreadyInitialised) {
    auth = getAuth(app);
  } else {
    // React Native needs explicit persistence, otherwise the session is lost on every restart.
    // The RN build of firebase/auth exports getReactNativePersistence; its types aren't in the default entry.
    const { getReactNativePersistence } = require('firebase/auth');
    auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  }

  // App Check (web only, optional): enabled once extra.appCheckSiteKey holds a reCAPTCHA v3 site key.
  if (Platform.OS === 'web' && extra.appCheckSiteKey && !alreadyInitialised) {
    try {
      const { initializeAppCheck, ReCaptchaV3Provider } = require('firebase/app-check');
      if (__DEV__ && extra.appCheckDebugToken) {
        (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = extra.appCheckDebugToken;
      }
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(extra.appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (e) {
      console.warn('[Firebase] App Check init failed', e);
    }
  }

  ctx = { app, db: getFirestore(app), auth };
  return ctx;
}
