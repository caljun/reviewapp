import { browserLocalPersistence, getAuth, onAuthStateChanged, setPersistence, signInAnonymously, type User } from 'firebase/auth';
import { getFirebaseApp } from './firebase';

let pending: Promise<User> | undefined;

export function ensureAnonymousSession(): Promise<User> {
  if (pending) return pending;
  pending = (async () => {
    const auth = getAuth(getFirebaseApp());
    await setPersistence(auth, browserLocalPersistence);
    // Wait for Firebase to restore the persisted user before creating anyone.
    const restored = await new Promise<User | null>((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(auth, user => { unsubscribe(); resolve(user); }, reject);
    });
    return restored ?? (await signInAnonymously(auth)).user;
  })().finally(() => { pending = undefined; });
  return pending;
}
