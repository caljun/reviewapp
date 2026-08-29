import type { Usage } from '../analyze-input';
import { ApiError } from './api-error';

export type UserProfile = { email: string; displayName: string | null };
export type UserRecord = Usage & UserProfile & { createdAt: unknown; updatedAt: unknown };
export type RequestRecord = {
  uid: string; reviewCount: number;
  status: 'reserved' | 'completed' | 'refunded'; createdAt: unknown; updatedAt: unknown;
};
export interface QuotaTransaction {
  user(uid: string): Promise<UserRecord | undefined>;
  request(id: string): Promise<RequestRecord | undefined>;
  writeUser(uid: string, value: UserRecord): void;
  writeRequest(id: string, value: RequestRecord): void;
}
export interface QuotaStore {
  transaction<T>(operation: (tx: QuotaTransaction) => Promise<T>): Promise<T>;
  now(): unknown;
}

export function createQuota(store: QuotaStore) {
  function validUser(user: UserRecord) {
    if (!Number.isSafeInteger(user.remainingReviews) || user.remainingReviews < 0 || typeof user.email !== 'string'
      || !(typeof user.displayName === 'string' || user.displayName === null)) {
      throw new ApiError(500, 'USAGE_DATA_ERROR', '利用枠を確認できませんでした。');
    }
    return user;
  }
  return {
    async usage(uid: string, profile?: UserProfile): Promise<Usage> {
      return store.transaction(async tx => {
        let user = await tx.user(uid);
        if (!user) {
          if (!profile?.email) throw new ApiError(401, 'ACCOUNT_EMAIL_REQUIRED', 'Googleアカウントのメールアドレスを確認できません。');
          user = { email: profile.email, displayName: profile.displayName, remainingReviews: 10, createdAt: store.now(), updatedAt: store.now() };
          tx.writeUser(uid, user);
        }
        validUser(user);
        return { remainingReviews: user.remainingReviews };
      });
    },
    async reserve(uid: string, id: string, reviewCount: number) {
      return store.transaction(async tx => {
        const existing = await tx.request(id);
        const stored = await tx.user(uid);
        if (existing) {
          const code = existing.uid !== uid ? 'REQUEST_CONFLICT' : `REQUEST_${existing.status.toUpperCase()}`;
          throw new ApiError(409, code, 'この分析リクエストは受付済みです。再分析・二重消費は行いません。');
        }
        if (!stored) throw new ApiError(500, 'USAGE_DATA_ERROR', '利用者情報を確認できませんでした。');
        const user = validUser(stored);
        if (user.remainingReviews < reviewCount) throw new ApiError(403, 'INSUFFICIENT_REVIEWS', 'レビュー枠が不足しています。');
        const now = store.now();
        tx.writeUser(uid, { ...user, remainingReviews: user.remainingReviews - reviewCount, updatedAt: now });
        tx.writeRequest(id, { uid, reviewCount, status: 'reserved', createdAt: now, updatedAt: now });
      });
    },
    async settle(uid: string, id: string, status: 'completed' | 'refunded') {
      return store.transaction(async tx => {
        const request = await tx.request(id);
        const stored = await tx.user(uid);
        if (!request || request.uid !== uid || !stored) throw new ApiError(500, 'USAGE_DATA_ERROR', '利用枠を更新できませんでした。');
        if (request.status !== 'reserved') return;
        const user = validUser(stored);
        const now = store.now();
        if (status === 'refunded') tx.writeUser(uid, {
          ...user, remainingReviews: user.remainingReviews + request.reviewCount, updatedAt: now,
        });
        tx.writeRequest(id, { ...request, status, updatedAt: now });
      });
    },
  };
}
export type Quota = ReturnType<typeof createQuota>;
