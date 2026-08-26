'use client';

import { useMemo, useState } from 'react';

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

const issues = [
  { title: 'アップデート後にアプリが起動しない', count: 3, category: '不具合', tone: 'red' },
  { title: '広告が多く、操作を妨げている', count: 2, category: '広告', tone: 'orange' },
  { title: '通知設定の場所が分かりにくい', count: 1, category: '操作性', tone: 'yellow' },
  { title: 'ダークモードに対応してほしい', count: 1, category: '機能要望', tone: 'blue' },
];

export default function Home() {
  const [text, setText] = useState(sample);
  const [appName, setAppName] = useState('Habit Note');
  const [focus, setFocus] = useState('次のアップデートで直すべき機能を知りたい');
  const [view, setView] = useState<'input' | 'preview' | 'result'>('input');
  const [loading, setLoading] = useState(false);
  const reviews = useMemo(() => splitReviews(text), [text]);
  const rated = reviews.filter((review) => review.rating).length;
  const analyze = () => { setLoading(true); window.setTimeout(() => { setLoading(false); setView('result'); window.scrollTo({ top: 0, behavior: 'smooth' }); }, 1100); };

  return <main>
    <header className="site-header"><button className="brand" onClick={() => setView('input')} aria-label="ReviewScope ホーム"><span className="brand-mark">R</span><span>ReviewScope</span></button><span className="prototype-badge">PROTOTYPE</span></header>
    {view !== 'result' ? <div className="page-shell input-shell">
      <section className="hero"><span className="eyebrow">AI REVIEW ANALYSIS</span><h1>大量のレビューから、<br /><em>次に直すべきこと</em>を見つける。</h1><p>レビューをまとめて貼り付けるだけ。よくある不満を分類・集計し、改善の優先順位を整理します。</p></section>
      <section className="panel input-panel">
        <div className="steps" aria-label="進捗"><span className="active"><b>1</b>レビュー入力</span><i /><span className={view === 'preview' ? 'active' : ''}><b>2</b>内容を確認</span><i /><span><b>3</b>分析結果</span></div>
        {view === 'input' ? <>
          <div className="field-row"><label className="field"><span>アプリ名 <small>任意</small></span><input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="例：Habit Note" /></label><label className="field"><span>特に知りたいこと <small>任意</small></span><input value={focus} onChange={(e) => setFocus(e.target.value)} /></label></div>
          <div className="tabs"><button className="selected">テキスト貼り付け</button><button disabled>CSVアップロード <small>近日対応</small></button></div>
          <label className="field textarea-field"><span>レビューを貼り付け</span><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="レビューを空行で区切って貼り付けてください" /><span className="counter">{text.length.toLocaleString()} 文字</span></label>
          <div className="detected"><div><span className="pulse" /><strong>{reviews.length}件</strong>のレビューを認識しました</div><span>星評価を認識：{rated}/{reviews.length}件</span></div>
          <div className="panel-footer"><p>入力データは保存されません</p><button className="primary" disabled={!reviews.length} onClick={() => setView('preview')}>入力内容を確認 <span>→</span></button></div>
        </> : <>
          <div className="preview-heading"><div><span className="eyebrow">PREVIEW</span><h2>{reviews.length}件のレビューを確認</h2></div><button className="link-button" onClick={() => setView('input')}>← 入力を編集</button></div>
          <div className="review-list">{reviews.map((review, index) => <article className="review-item" key={`${review.text}-${index}`}><span className="number">{String(index + 1).padStart(2, '0')}</span><div><span className="stars">{review.rating ? '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating) : '評価なし'}</span><p>{review.text}</p></div></article>)}</div>
          <div className="panel-footer sticky"><p>{appName || 'アプリ名未設定'} ・ {reviews.length}件を分析</p><button className="primary" onClick={analyze} disabled={loading}>{loading ? '分析しています…' : 'AIで分析する'} <span>{loading ? '◌' : '✦'}</span></button></div>
        </>}
      </section><p className="privacy-note">レビュー内容は分析処理以外に使用せず、サーバーに保存しません。</p>
    </div> : <div className="page-shell results-shell">
      <div className="result-top"><div><span className="eyebrow">ANALYSIS COMPLETE</span><h1>{appName || 'アプリ'} のレビュー分析</h1><p>{reviews.length}件のレビューから、改善すべきポイントを抽出しました。</p></div><button className="secondary" onClick={() => setView('input')}>＋ 新しい分析</button></div>
      <section className="summary-grid"><div className="score-card panel"><span>総合インサイト</span><strong>改善が必要</strong><p>起動不能の報告が複数あり、利用継続に直接影響しています。</p></div><div className="metric panel"><span>分析件数</span><strong>{reviews.length}<small>件</small></strong><p>星評価あり {rated}件</p></div><div className="metric panel negative"><span>ネガティブ</span><strong>62<small>%</small></strong><p>5件のレビュー</p></div><div className="metric panel positive"><span>ポジティブ</span><strong>25<small>%</small></strong><p>2件のレビュー</p></div></section>
      <section className="panel priority-card"><div className="section-heading"><div><span className="eyebrow">TOP PRIORITY</span><h2>最優先で対応すべきこと</h2></div><span className="high-badge">優先度 高</span></div><div className="priority-content"><div className="rank">01</div><div><h3>アップデート後にアプリが起動しない問題を修正</h3><p>全レビューの38%で報告されており、アプリを利用できない重大な不具合です。低評価と離脱に直結しているため、次回更新を待たずに修正版の配信を推奨します。</p><div className="impact-row"><span><b>推奨対応</b>クラッシュログを確認し、緊急パッチを配信</span><span><b>期待効果</b>低評価・ユーザー離脱の抑制</span></div></div></div></section>
      <section className="panel ranking-card"><div className="section-heading"><div><span className="eyebrow">ISSUE RANKING</span><h2>よくある問題・要望</h2></div><span className="subtle">件数順</span></div><div className="issue-list">{issues.map((issue, index) => <article className="issue" key={issue.title}><span className="issue-rank">{index + 1}</span><div className={`issue-icon ${issue.tone}`}>{issue.category.slice(0, 1)}</div><div className="issue-main"><h3>{issue.title}</h3><span className="category">{issue.category}</span><div className="bar"><i style={{ width: `${Math.min(100, (issue.count / Math.max(reviews.length, 1)) * 100)}%` }} /></div></div><div className="issue-count"><strong>{issue.count}</strong><span>件・{Math.round((issue.count / Math.max(reviews.length, 1)) * 100)}%</span></div></article>)}</div></section>
      <div className="two-columns"><section className="panel compact-card"><div className="section-heading"><h2>感情分析</h2></div><div className="sentiment-bar"><i className="pos" /><i className="neu" /><i className="neg" /></div><div className="legend"><span><i className="dot green" />ポジティブ <b>25%</b></span><span><i className="dot gray" />中立 <b>13%</b></span><span><i className="dot coral" />ネガティブ <b>62%</b></span></div></section><section className="panel compact-card"><div className="section-heading"><h2>高く評価されている点</h2></div><div className="good-points"><span>✓ シンプルで見やすい</span><span>✓ 操作が簡単</span><span>✓ 毎日使いやすい</span></div></section></div>
      <div className="result-actions"><button className="secondary" onClick={() => navigator.clipboard?.writeText('ReviewScope 分析結果：起動不能の不具合を最優先で修正してください。')}>結果をコピー</button><button className="primary" onClick={() => setView('input')}>別のレビューを分析</button></div>
    </div>}
  </main>;
}
