import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDatabase } from './firebase-admin';
import { createQuota, type UserRecord, type RequestRecord } from './quota';

export const quota = createQuota({
  now: () => FieldValue.serverTimestamp(),
  transaction: operation => {
    const db = adminDatabase();
    return db.runTransaction(tx => operation({
      user: async uid => (await tx.get(db.collection('users').doc(uid))).data() as UserRecord | undefined,
      request: async id => (await tx.get(db.collection('analysisRequests').doc(id))).data() as RequestRecord | undefined,
      writeUser: (uid, value) => { tx.set(db.collection('users').doc(uid), value); },
      writeRequest: (id, value) => { tx.set(db.collection('analysisRequests').doc(id), value); },
    }));
  },
});
