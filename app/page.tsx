'use client';

import './quota.css';

import { useEffect, useMemo, useRef, useState } from 'react';
import { reviewInputSchema } from '@/lib/analyze-input';
import { type SimpleAnalysis } from '@/lib/simple-analysis';
import Results from './results';
import CsvInput, { type CsvInputState } from './csv-input';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { useAnalysisSession } from './use-analysis-session';
import LoginModal from './login-modal';

const sample = `★1
アップデート後にアプリが起動しなくなりました。早く直してほしいです。

★2
広告が多すぎて操作しづらい。動画広告も長いです。

★3
便利ですが、通知設定がどこにあるか分かりにくいです。

★1
ログインしようとすると落ちて、アプリが起動できません。

★5
シンプルで見やすく、毎日使っています。

★2
アップデートしてから起動しません。大切なデータが見られず困っています。

★4
操作が簡単で使いやすいです。ダークモードにも対応してほしいです。

★2
無料版の広告が多すぎます。もう少し減らしてほしい。`;

type Review = { text: string; rating?: number };
const splitReviews = (value: string): Review[] => value.replace(/\r/g, '').trim().split(/\n\s*\n|\n-{3,}\n|(?=^★[1-5]\s*$)/gm).map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
  const rating = chunk.match(/★\s*([1-5])/)?.[1];
  return { rating: rating ? Number(rating) : undefined, text: chunk.replace(/^★\s*[1-5]\s*/m, '').trim() };
}).filter((review) => review.text.length > 0);

export default function Home() {
  const session = useAnalysisSession();
  const [text, setText] = useState(sample);
  const [inputMode, setInputMode] = useState<'text' | 'csv'>('text');
  const [csv, setCsv] = useState<CsvInputState>({ reviews: [], error: '', busy: false });
  const [appName, setAppName] = useState('Habit Note');
  const [focus, setFocus] = useState('次のアップデートで直すべき機能を知りたい');
  const [view, setView] = useState<'input' | 'preview' | 'result'>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SimpleAnalysis | null>(null);
  const [analysisText, setAnalysisText] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState(false);
  const [pendingPurchase, setPendingPurchase] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState('');
  const inFlight = useRef(false);
  const attempt = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const textReviews = useMemo(() => splitReviews(text), [text]);
  const reviews = inputMode === 'csv' ? csv.reviews : textReviews;
  const rated = reviews.filter((review) => review.rating).length;
  const payload = { appName, focus, reviews: reviews.map((r, id) => ({ ...r, id })) };
  const validInput = reviewInputSchema.safeParse(payload).success && (inputMode !== 'csv' || (!csv.busy && !csv.error));
  const canAnalyze = validInput && !session.busy && !!session.user && !!session.usage
    && session.usage.remainingReviews >= reviews.length;
  const analyze = async () => {
    if (inFlight.current || !canAnalyze || !session.user) return;
    inFlight.current = true;
    setLoading(true);
    setError('');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 65000);
    try {
      const fingerprint = JSON.stringify(payload);
      if (!attempt.current || attempt.current.fingerprint !== fingerprint) attempt.current = { fingerprint, requestId: crypto.randomUUID() };
      const response = await authenticatedFetch(session.user, '/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, requestId: attempt.current.requestId }), signal: controller.signal,
      });
      const data = await response.json().catch(() => { throw new Error('サーバーから正しい応答を受け取れませんでした。再試行してください。'); });
      // Only start a new ID when the server explicitly confirms failure/refund.
      if (!response.ok && data && typeof data === 'object' && 'code' in data
        && ['ANALYSIS_FAILED', 'SERVER_CONFIGURATION_ERROR', 'INVALID_INPUT', 'PAID_PLAN_REQUIRED', 'FREE_LIMIT_REACHED', 'REQUEST_REFUNDED'].includes(String(data.code))) attempt.current = null;
      if (!response.ok) throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : '分析に失敗しました。');
      if (data && typeof data === 'object' && 'summary' in data) {
        setResult(data as SimpleAnalysis);
        setAnalysisText('');
      } else if (data && typeof data === 'object' && 'text' in data && typeof data.text === 'string' && data.text.trim()) {
        setResult(null);
        setAnalysisText(data.text);
      } else throw new Error('分析結果が空でした。再試行してください。');
      attempt.current = null;
      setView('result');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof Error && e.name !== 'AbortError' && e.message !== 'Failed to fetch'
        ? e.message : '通信が切断されたか、時間がかかりすぎています。再試行してください。');
    } finally {
      window.clearTimeout(timeout);
      inFlight.current = false;
      setLoading(false);
      await session.refresh();
    }
  };
  const analyzeRef = useRef(analyze);
  useEffect(() => { analyzeRef.current = analyze; });
  useEffect(() => {
    if (pendingAnalysis && canAnalyze) {
      const timer = window.setTimeout(() => { setPendingAnalysis(false); void analyzeRef.current(); }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [pendingAnalysis, canAnalyze]);
  const purchase = async () => {
    if (purchaseBusy || !session.user) return;
    setPurchaseBusy(true); setPaymentMessage('購入処理中です…');
    try {
      const response = await authenticatedFetch(session.user, '/api/stripe/create-checkout-session', { method: 'POST' });
      const data = await response.json().catch(() => null) as { url?: string; error?: string } | null;
      if (!response.ok || !data?.url) throw new Error(data?.error || 'Checkoutを作成できませんでした。');
      window.location.assign(data.url);
    } catch (value) {
      setPaymentMessage(value instanceof Error ? value.message : 'Checkoutを作成できませんでした。');
      setPurchaseBusy(false);
    }
  };
  const purchaseRef = useRef(purchase);
  useEffect(() => { purchaseRef.current = purchase; });
  useEffect(() => {
    if (pendingPurchase && session.user && !session.busy && session.usage) {
      const timer = window.setTimeout(() => {
        setPendingPurchase(false);
        void purchaseRef.current();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [pendingPurchase, session.user, session.busy, session.usage]);
  const refreshUsage = session.refresh;
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('payment');
    if (status === 'cancelled') {
      const timer = window.setTimeout(() => setPaymentMessage('購入をキャンセルしました。'), 0);
      return () => window.clearTimeout(timer);
    }
    if (status !== 'success') return;
    const message = window.setTimeout(() => setPaymentMessage('購入が完了しました。残高を反映しています。'), 0);
    const timers = [0, 800, 1800, 3500].map(delay => window.setTimeout(() => void refreshUsage(), delay));
    const done = window.setTimeout(() => setPaymentMessage('購入が完了しました。'), 3800);
    return () => { window.clearTimeout(message); timers.forEach(window.clearTimeout); window.clearTimeout(done); };
  }, [refreshUsage]);
  const requestPurchase = () => {
    setPaymentMessage('');
    if (!session.user) { setPendingPurchase(true); setPendingAnalysis(false); setShowLogin(true); return; }
    void purchase();
  };
  const requestAnalysis = () => {
    setError('');
    if (!session.user) { setPendingAnalysis(true); setShowLogin(true); return; }
    if (!session.usage || session.usage.remainingReviews < reviews.length) { setError('レビュー枠が不足しています'); return; }
    void analyze();
  };

  return <main>
    <header className="site-header"><button className="brand" disabled={loading} onClick={() => setView('input')} aria-label="ReviewScope ホーム"><span className="brand-mark">R</span><span>ReviewScope</span></button></header>
    {view !== 'result' ? <div className="page-shell input-shell">
      <section className="hero"><span className="eyebrow">AI REVIEW ANALYSIS</span><h1>大量のレビューから、<br /><em>次に直すべきこと</em>を見つける。</h1><p>レビューをまとめて貼り付けるだけ。よくある不満を分類・集計し、改善の優先順位を整理します。</p></section>
      <section className="panel input-panel">
        {session.user && <div className="quota-notice" aria-live="polite">
          {session.busy ? <p>利用枠を確認しています</p> : session.error ? <><p role="alert">{session.error}</p><button className="secondary" onClick={() => void session.refresh()}>利用枠を再確認</button></> : session.usage && <p>残り無料レビュー数：{session.usage.remainingReviews}</p>}
          <button className="link-button" onClick={() => void session.logout()}>ログアウト</button>
          <button className="secondary purchase-button" disabled={session.busy || purchaseBusy} onClick={requestPurchase}>{purchaseBusy ? '購入処理中…' : '50レビュー分を980円で追加'}</button>
        </div>}
        {paymentMessage && <p className={paymentMessage.includes('できません') ? 'error-message' : 'payment-message'} role="status">{paymentMessage}</p>}
        <div className="steps" aria-label="進捗"><span className="active"><b>1</b>レビュー入力</span><i /><span className={view === 'preview' ? 'active' : ''}><b>2</b>内容を確認</span><i /><span><b>3</b>分析結果</span></div>
        <div hidden={view !== 'input'}>
          <div className="field-row"><label className="field"><span>アプリ名 <small>任意</small></span><input maxLength={100} value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="例：Habit Note" /></label><label className="field"><span>特に知りたいこと <small>任意</small></span><input maxLength={500} value={focus} onChange={(e) => setFocus(e.target.value)} /></label></div>
          <div className="tabs" aria-label="入力方法"><button type="button" aria-pressed={inputMode === 'text'} className={inputMode === 'text' ? 'selected' : ''} onClick={() => setInputMode('text')}>テキスト貼り付け</button><button type="button" aria-pressed={inputMode === 'csv'} className={inputMode === 'csv' ? 'selected' : ''} onClick={() => setInputMode('csv')}>CSVアップロード</button></div>
          <div hidden={inputMode !== 'text'}>
          <label className="field textarea-field"><span>レビューを貼り付け</span><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="レビューを空行で区切って貼り付けてください" /><span className="counter">{text.length.toLocaleString()} 文字</span></label>
          </div>
          <div hidden={inputMode !== 'csv'}><CsvInput onChange={setCsv} /></div>
          <div className="detected" role="status"><div><span className="pulse" /><strong>{reviews.length}件</strong>のレビューを認識しました</div><span>星評価を認識：{rated}/{reviews.length}件</span></div>
          <div className="panel-footer"><p>入力データは保存されません</p><button className="primary" disabled={!validInput} onClick={() => setView('preview')}>入力内容を確認 <span>→</span></button></div>
        </div><div hidden={view !== 'preview'}>
          <div className="preview-heading"><div><span className="eyebrow">PREVIEW</span><h2>{reviews.length}件のレビューを確認</h2></div><button className="link-button" disabled={loading} onClick={() => setView('input')}>← 入力を編集</button></div>
          <div className="review-list">{reviews.map((review, index) => <article className="review-item" key={`${review.text}-${index}`}><span className="number">{String(index + 1).padStart(2, '0')}</span><div><span className="stars">{review.rating ? '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating) : '評価なし'}</span><p>{review.text}</p></div></article>)}</div>
          <div className="panel-footer sticky"><p>{appName || 'アプリ名未設定'} ・ {reviews.length}件を分析</p><button className="primary" onClick={requestAnalysis} disabled={loading || session.busy || !validInput}>{loading ? '分析しています…' : error ? '再試行する' : 'AIで分析する'} <span>{loading ? '◌' : '✦'}</span></button></div>
        </div>
        {loading && <p role="status" className="privacy-note">レビューを分析しています。このままお待ちください。</p>}
        {error && <p role="alert" className="error-message">{error}</p>}
        {!validInput && <p className="error-message">レビューは1〜50件、各2,000文字、合計50,000文字まで入力できます。</p>}
      </section><p className="privacy-note">分析時にレビューをGoogle Geminiへ送信します。本アプリでは保存しません。個人情報・機密情報は入力しないでください。</p>
    </div> : analysisText ? <div className="page-shell results-shell"><section className="panel compact-card"><div className="section-heading"><h2>レビュー分析（自由文）</h2><button className="secondary" onClick={() => setView('input')}>入力へ戻る</button></div><p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.9, marginTop: 24 }}>{analysisText}</p></section></div> : result && <Results result={result} appName={appName} onReset={() => setView('input')} />}
    {showLogin && <LoginModal purpose={pendingPurchase ? 'purchase' : 'analysis'} busy={session.busy} error={session.error} onClose={() => { setShowLogin(false); if (!session.user) { setPendingAnalysis(false); setPendingPurchase(false); } }} onGoogle={session.login} onEmail={session.loginWithEmail} />}
  </main>;
}
