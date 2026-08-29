'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type Props = {
  busy: boolean; error: string; onClose(): void;
  onGoogle(): Promise<void>; onEmail(email: string, password: string, create: boolean): Promise<void>;
};

export default function LoginModal({ busy, error, onClose, onGoogle, onEmail }: Props) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [create, setCreate] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [busy, onClose]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!email.trim() || password.length < 6 || busy) return; try { await onEmail(email.trim(), password, create); onClose(); } catch {} };
  const google = async () => { try { await onGoogle(); onClose(); } catch {} };
  return <div className="login-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <button className="modal-close" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button>
      <h2 id="login-title" ref={title} tabIndex={-1}>分析するにはログイン</h2>
      <p>初回登録で10レビュー分を無料で分析できます。</p>
      <button className="google-login" disabled={busy} onClick={() => void google()}>Googleでログイン</button>
      <div className="login-divider"><span>または</span></div>
      <form onSubmit={event => void submit(event)}>
        <label className="field"><span>メールアドレス</span><input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label className="field"><span>パスワード</span><input type="password" autoComplete={create ? 'new-password' : 'current-password'} minLength={6} required value={password} onChange={event => setPassword(event.target.value)} /></label>
        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="primary login-submit" disabled={busy || !email.trim() || password.length < 6}>{busy ? '処理中…' : create ? '無料アカウントを作成' : 'メールでログイン'}</button>
      </form>
      <button className="link-button login-switch" disabled={busy} onClick={() => setCreate(value => !value)}>{create ? 'アカウントをお持ちの方' : '初めての方はこちら'}</button>
    </section>
  </div>;
}
