import type { Usage } from '../analyze-input';
import { ApiError } from './api-error';

export type UserRecord = Usage & { createdAt: unknown; updatedAt: unknown };
export type RequestRecord = {
  uid: string; reviewCount: number; source: 'free' | 'credit';
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
    if (typeof user.freeAnalysisUsed !== 'boolean' || !Number.isSafeInteger(user.remainingCredits) || user.remainingCredits < 0) {
      throw new ApiError(500, 'USAGE_DATA_ERROR', '利用枠を確認できませんでした。');
    }
    return user;
  }
  return {
    async usage(uid: string): Promise<Usage> {
      return store.transaction(async tx => {
        let user = await tx.user(uid);
        if (!user) {
          user = { freeAnalysisUsed: false, remainingCredits: 0, createdAt: store.now(), updatedAt: store.now() };
          tx.writeUser(uid, user);
        }
        validUser(user);
        return { freeAnalysisUsed: user.freeAnalysisUsed, remainingCredits: user.remainingCredits };
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
        const source = !user.freeAnalysisUsed && reviewCount <= 10 ? 'free' : 'credit';
        if (source === 'credit' && user.remainingCredits < 1) {
          throw reviewCount > 10
            ? new ApiError(403, 'PAID_PLAN_REQUIRED', '無料分析は10件までです。有料プランは準備中です。')
            : new ApiError(403, 'FREE_LIMIT_REACHED', '無料枠を利用済みです。有料プランは準備中です。');
        }
        const now = store.now();
        tx.writeUser(uid, { ...user, freeAnalysisUsed: source === 'free' ? true : user.freeAnalysisUsed, remainingCredits: user.remainingCredits - (source === 'credit' ? 1 : 0), updatedAt: now });
        tx.writeRequest(id, { uid, reviewCount, source, status: 'reserved', createdAt: now, updatedAt: now });
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
          ...user, freeAnalysisUsed: request.source === 'free' ? false : user.freeAnalysisUsed,
          remainingCredits: user.remainingCredits + (request.source === 'credit' ? 1 : 0), updatedAt: now,
        });
        tx.writeRequest(id, { ...request, status, updatedAt: now });
      });
    },
  };
}
export type Quota = ReturnType<typeof createQuota>;
