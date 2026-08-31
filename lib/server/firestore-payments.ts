import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDatabase } from './firebase-admin';
import { createPaymentCredits, type PaymentRecord } from './payment-credit';
import type { UserRecord } from './quota';

export const creditPayment = createPaymentCredits({
  now: () => FieldValue.serverTimestamp(),
  transaction: operation => {
    const db = adminDatabase();
    return db.runTransaction(tx => operation({
      user: async uid => (await tx.get(db.collection('users').doc(uid))).data() as UserRecord | undefined,
      payment: async id => (await tx.get(db.collection('payments').doc(id))).data() as PaymentRecord | undefined,
      writeUser: (uid, value) => { tx.set(db.collection('users').doc(uid), value); },
      writePayment: (id, value) => { tx.set(db.collection('payments').doc(id), value); },
    }));
  },
});
