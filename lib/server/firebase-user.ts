import 'server-only';
import { verifyToken } from './firebase-admin';
import { createFirebaseUserRequirement } from './require-firebase-user';

export type FirebaseIdentity = { uid: string; email?: string; name?: string };
export const requireFirebaseUser = createFirebaseUserRequirement(verifyToken);
