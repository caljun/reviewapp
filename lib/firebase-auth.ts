import {
  browserLocalPersistence, getAuth, GoogleAuthProvider, onAuthStateChanged,
  setPersistence, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, type User,
} from 'firebase/auth';
import { getFirebaseApp } from './firebase';

let persistenceReady: Promise<void> | undefined;
export function firebaseAuth() {
  const auth = getAuth(getFirebaseApp());
  persistenceReady ??= (async () => {
    await setPersistence(auth, browserLocalPersistence);
    const version = 'google-email-v1';
    if (localStorage.getItem('reviewscope-auth-version') !== version) {
      await signOut(auth);
      localStorage.setItem('reviewscope-auth-version', version);
    }
  })();
  return { auth, ready: persistenceReady };
}

export function observeUser(next: (user: User | null) => void, error: (value: Error) => void) {
  const { auth, ready } = firebaseAuth();
  let unsubscribe = () => {};
  void ready.then(() => {
    unsubscribe = onAuthStateChanged(auth, next, error);
  }).catch(error);
  return () => unsubscribe();
}

export async function googleSignIn() {
  const { auth, ready } = firebaseAuth();
  await ready;
  return (await signInWithPopup(auth, new GoogleAuthProvider())).user;
}

export async function emailSignIn(email: string, password: string) {
  const { auth, ready } = firebaseAuth(); await ready;
  return (await signInWithEmailAndPassword(auth, email, password)).user;
}

export async function emailSignUp(email: string, password: string) {
  const { auth, ready } = firebaseAuth(); await ready;
  return (await createUserWithEmailAndPassword(auth, email, password)).user;
}

export async function firebaseSignOut() {
  const { auth, ready } = firebaseAuth();
  await ready;
  await signOut(auth);
}
