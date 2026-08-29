'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Usage } from '@/lib/analyze-input';
import { firebaseSignOut, googleSignIn, observeUser } from '@/lib/firebase-auth';
import { authenticatedFetch } from '@/lib/authenticated-fetch';

export function useAnalysisSession() {
  const [user, setUser] = useState<User | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const currentUser = useRef<User | null>(null);
  const loadUsage = useCallback(async (nextUser: User) => {
    setBusy(true); setError('');
    try {
      const response = await authenticatedFetch(nextUser, '/api/usage', { signal: AbortSignal.timeout(15000) });
      const data = await response.json().catch(() => null) as (Partial<Usage> & { code?: string; error?: string }) | null;
      if (!data) throw new Error('サーバーの認証処理に失敗しました。');
      if (!response.ok) throw new Error(`${data.error || '利用枠を確認できませんでした。'} [${data.code || `HTTP_${response.status}`}]`);
      if (!Number.isSafeInteger(data.remainingReviews) || data.remainingReviews! < 0) throw new Error('利用枠を確認できませんでした。');
      if (currentUser.current?.uid === nextUser.uid) setUsage({ remainingReviews: data.remainingReviews! });
    } catch (value) {
      if (currentUser.current?.uid === nextUser.uid) setError(value instanceof Error && value.name !== 'TimeoutError' && !value.message.startsWith('Firebase:') ? value.message : '認証に失敗しました。再試行してください。');
    } finally { if (currentUser.current?.uid === nextUser.uid) setBusy(false); }
  }, []);
  useEffect(() => observeUser(nextUser => {
    currentUser.current = nextUser; setUser(nextUser); setUsage(null); setError('');
    if (nextUser) void loadUsage(nextUser); else setBusy(false);
  }, () => { currentUser.current = null; setUser(null); setUsage(null); setBusy(false); setError('認証状態を確認できませんでした。'); }), [loadUsage]);
  const login = useCallback(async () => {
    setBusy(true); setError('');
    try { await googleSignIn(); }
    catch (value) { setBusy(false); setError(value instanceof Error && value.message.includes('popup-closed') ? 'ログインがキャンセルされました。' : 'Googleログインに失敗しました。'); }
  }, []);
  const logout = useCallback(async () => { setBusy(true); setError(''); try { await firebaseSignOut(); } catch { setBusy(false); setError('ログアウトに失敗しました。'); } }, []);
  const refresh = useCallback(async () => { if (currentUser.current) await loadUsage(currentUser.current); }, [loadUsage]);
  return { user, usage, busy, error, login, logout, refresh };
}
