'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Usage } from '@/lib/analyze-input';
import { emailSignIn, emailSignUp, firebaseSignOut, googleSignIn, observeUser } from '@/lib/firebase-auth';
import { authenticatedFetch } from '@/lib/authenticated-fetch';

const usageRequests = new Map<string, Promise<Usage>>();

function fetchUsageForUser(nextUser: User): Promise<Usage> {
  const existing = usageRequests.get(nextUser.uid);
  if (existing) return existing;
  const request = (async () => {
    const response = await authenticatedFetch(nextUser, '/api/usage', { signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => null) as (Partial<Usage> & { code?: string; error?: string }) | null;
    if (!data) throw new Error('サーバーの認証処理に失敗しました。');
    if (!response.ok) throw new Error(`${data.error || '利用枠を確認できませんでした。'} [${data.code || `HTTP_${response.status}`}]`);
    if (!Number.isSafeInteger(data.remainingReviews) || data.remainingReviews! < 0) throw new Error('利用枠を確認できませんでした。');
    return { remainingReviews: data.remainingReviews! };
  })();
  usageRequests.set(nextUser.uid, request);
  void request.finally(() => usageRequests.delete(nextUser.uid)).catch(() => undefined);
  return request;
}

export function useAnalysisSession() {
  const [user, setUser] = useState<User | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const currentUser = useRef<User | null>(null);
  const loadUsage = useCallback(async (nextUser: User) => {
    setBusy(true); setError('');
    try {
      const nextUsage = await fetchUsageForUser(nextUser);
      if (currentUser.current?.uid === nextUser.uid) setUsage(nextUsage);
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
    catch (value) { setBusy(false); setError(value instanceof Error && value.message.includes('popup-closed') ? 'ログインがキャンセルされました。' : 'Googleログインに失敗しました。'); throw new Error('LOGIN_FAILED'); }
  }, []);
  const loginWithEmail = useCallback(async (email: string, password: string, create: boolean) => {
    setBusy(true); setError('');
    try { await (create ? emailSignUp(email, password) : emailSignIn(email, password)); }
    catch { setBusy(false); setError(create ? 'アカウントを作成できませんでした。入力内容を確認してください。' : 'メールアドレスまたはパスワードが正しくありません。'); throw new Error('LOGIN_FAILED'); }
  }, []);
  const logout = useCallback(async () => { setBusy(true); setError(''); try { await firebaseSignOut(); } catch { setBusy(false); setError('ログアウトに失敗しました。'); } }, []);
  const refresh = useCallback(async () => { if (currentUser.current) await loadUsage(currentUser.current); }, [loadUsage]);
  return { user, usage, busy, error, login, loginWithEmail, logout, refresh };
}
