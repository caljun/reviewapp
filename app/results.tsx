'use client';

import { useState } from 'react';
import type { SimpleAnalysis } from '@/lib/simple-analysis';

export default function Results({ result, appName, onReset }: { result: SimpleAnalysis; appName: string; onReset: () => void }) {
  const [copyStatus, setCopyStatus] = useState('');
  const { topPriority } = result;
  async function copy() {
    const markdown = [
      '# ' + (appName || 'アプリ') + ' のレビュー分析', result.summary,
      '## 最優先の対応', topPriority.title, topPriority.reason, '推奨対応：' + topPriority.action,
      '## 問題・要望', ...result.issues.map(i => '- ' + i.title + '：' + i.count + '件'),
      '## 高評価ポイント', ...result.positivePoints.map(p => '- ' + p),
    ].join('\n\n');
    try { await navigator.clipboard.writeText(markdown); setCopyStatus('コピーしました'); }
    catch { setCopyStatus('コピーできませんでした。ブラウザの権限を確認してください。'); }
  }
  return <div className="page-shell results-shell">
    <div className="result-top"><div><span className="eyebrow">ANALYSIS COMPLETE</span><h1>{appName || 'アプリ'} のレビュー分析</h1><p>件数・分類はAIによる集計です。原文と照らし合わせてご確認ください。</p></div><button className="secondary" onClick={onReset}>＋ 新しい分析</button></div>
    <section className="panel compact-card"><span className="eyebrow">SUMMARY</span><h2>全体サマリー</h2><p style={{ lineHeight: 1.8, marginTop: 12 }}>{result.summary}</p></section>
    <section className="panel priority-card"><div className="section-heading"><div><span className="eyebrow">TOP PRIORITY</span><h2>最優先で対応すべきこと</h2></div></div><div className="priority-content"><div className="rank">01</div><div><h3>{topPriority.title}</h3><p>{topPriority.reason}</p><div className="impact-row"><span><b>推奨対応</b>{topPriority.action}</span></div></div></div></section>
    <section className="panel ranking-card"><div className="section-heading"><div><span className="eyebrow">ISSUE RANKING</span><h2>よくある問題・要望</h2></div><span className="subtle">件数順</span></div><div className="issue-list">
      {result.issues.length === 0 && <p>明確な問題・要望は見つかりませんでした。</p>}
      {result.issues.map((issue, index) => <article className="issue" key={index}><span className="issue-rank">{index + 1}</span><div className={'issue-icon ' + (issue.severity === 'high' ? 'red' : issue.severity === 'medium' ? 'orange' : 'blue')}>!</div><div className="issue-main"><h3>{issue.title}</h3><span className="category">重要度 {({ high: '高', medium: '中', low: '低' })[issue.severity]}</span></div><div className="issue-count"><strong>{issue.count}</strong><span>件</span></div></article>)}
    </div></section>
    <section className="panel compact-card" style={{ marginTop: 16 }}><div className="section-heading"><h2>高く評価されている点</h2></div><div className="good-points">{result.positivePoints.map((p, i) => <span key={i}>✓ {p}</span>)}{!result.positivePoints.length && <p>明確な高評価ポイントは見つかりませんでした。</p>}</div></section>
    <div className="result-actions"><span role="status">{copyStatus}</span><button className="secondary" onClick={copy}>結果をコピー</button><button className="primary" onClick={onReset}>別のレビューを分析</button></div>
  </div>;
}
