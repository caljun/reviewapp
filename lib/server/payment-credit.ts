import { ApiError } from './api-error';
import type { UserRecord } from './quota';

export type PaymentRecord = {
  uid: string; credits: 50; amountTotal: number | null; currency: string | null;
  paymentStatus: string; createdAt: unknown;
};

export interface PaymentTransaction {
  user(uid: string): Promise<UserRecord | undefined>;
  payment(id: string): Promise<PaymentRecord | undefined>;
  writeUser(uid: string, value: UserRecord): void;
  writePayment(id: string, value: PaymentRecord): void;
}

export interface PaymentStore {
  now(): unknown;
  transaction<T>(operation: (tx: PaymentTransaction) => Promise<T>): Promise<T>;
}

export function createPaymentCredits(store: PaymentStore) {
  return async (session: { id: string; uid: string; amountTotal: number | null; currency: string | null; paymentStatus: string }) =>
    store.transaction(async tx => {
      if (await tx.payment(session.id)) return { credited: false };
      const user = await tx.user(session.uid);
      if (!user || !Number.isSafeInteger(user.remainingReviews) || user.remainingReviews < 0) {
        throw new ApiError(500, 'USAGE_DATA_ERROR', '利用者情報を更新できませんでした。');
      }
      const now = store.now();
      tx.writeUser(session.uid, { ...user, remainingReviews: user.remainingReviews + 50, updatedAt: now });
      tx.writePayment(session.id, {
        uid: session.uid, credits: 50, amountTotal: session.amountTotal, currency: session.currency,
        paymentStatus: session.paymentStatus, createdAt: now,
      });
      return { credited: true };
    });
}
