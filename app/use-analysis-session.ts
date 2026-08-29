'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Usage } from '@/lib/analyze-input';
import { ensureAnonymousSession } from '@/lib/anonymous-session';
import { authenticatedFetch } from '@/lib/authenticated-fetch';

export function useAnalysisSession() {
  const [user, setUser] = useState<User | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const nextUser = await ensureAnonymousSession();
      const response = await authenticatedFetch(nextUser, '/api/usage', { signal: AbortSignal.timeout(15000) });
      const data = await response.json().catch(() => null) as (Partial<Usage> & { error?: string }) | null;
      if (!data) throw new Error('サーバーの認証処理に失敗しました。再デプロイ後に再試行してください。');
      if (!response.ok) throw new Error(data.error || '利用枠を確認できませんでした。');
      if (typeof data.freeAnalysisUsed !== 'boolean' || !Number.isSafeInteger(data.remainingCredits) || data.remainingCredits! < 0) throw new Error('利用枠を確認できませんでした。');
      if (generation.current === current) {
        setUser(nextUser);
        setUsage({ freeAnalysisUsed: data.freeAnalysisUsed, remainingCredits: data.remainingCredits! });
      }
    } catch (error) {
      if (generation.current === current) {
        setUser(null); setUsage(null);
        setError(error instanceof Error && error.name !== 'TimeoutError' && !error.message.startsWith('Firebase:') && error.message !== 'Failed to fetch'
          ? error.message : '認証に失敗しました。再試行してください。');
      }
    } finally { if (generation.current === current) setBusy(false); }
  }, []);
  useEffect(() => {
    const lifecycle = generation;
    let active = true;
    // Start asynchronously, and ignore stale requests after unmount / StrictMode.
    void Promise.resolve().then(() => { if (active) void refresh(); });
    return () => { active = false; lifecycle.current++; };
  }, [refresh]);
  return { user, usage, busy, error, refresh };
}
