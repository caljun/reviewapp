import { getApp, getApps, initializeApp } from 'firebase/app';
import type { Analytics } from 'firebase/analytics';

// Public Firebase Web app configuration (not a server credential).
// Never put GEMINI_API_KEY or service-account credentials here.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export function getFirebaseApp() {
  if (!firebaseConfig.apiKey?.trim() || !firebaseConfig.projectId?.trim() || !firebaseConfig.appId?.trim()) {
    throw new Error('Firebaseの環境変数が不足しています。');
  }
  return getApps().some(app => app.name === '[DEFAULT]') ? getApp() : initializeApp(firebaseConfig);
}

let analyticsPromise: Promise<Analytics | null> | undefined;
export function initializeFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  analyticsPromise ??= (async () => {
    const app = getFirebaseApp();
    if (!firebaseConfig.measurementId?.trim()) return null;
    const { getAnalytics, isSupported } = await import('firebase/analytics');
    return await isSupported() ? getAnalytics(app) : null;
  })().catch(() => null); // Analytics must never interrupt review analysis.
  return analyticsPromise;
}
