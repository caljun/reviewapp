'use client';

import { useState } from 'react';
import { categoryLabels, type AnalysisResult } from '@/lib/analysis';

export default function Results({ result, appName, onReset }: { result: AnalysisResult; appName: string; onReset: () => void }) {
  const [copyStatus, setCopyStatus] = useState('');
  const { sentiment, topPriority } = result;
  async function copy() {
    const markdown = [
      `# ${appName || 'アプリ'} のレビュー分析`, `分析件数：${result.total}件`, result.overallInsight,
      `## 最優先の対応\n${topPriority.title}\n${topPriority.reason}\n推奨対応：${topPriority.recommendedAction}\n期待効果：${topPriority.expectedEffect}`,
      '## 問題・要望', ...result.issues.map(i => `- ${i.title}：${i.count}件（${i.percentage}%）／${categoryLabels[i.category]}`),
      '## 感情分析', ...(['positive', 'neutral', 'negative'] as const).map(s => `- ${s}：${sentiment[s].count}件（${sentiment[s].percentage}%）`),
      '## 高評価ポイント', ...result.positivePoints.map(p => `- ${p.title}：${p.count}件`),
    ].join('\n\n');
    try { await navigator.clipboard.writeText(markdown); setCopyStatus('コピーしました'); }
    catch { setCopyStatus('コピーできませんでした。ブラウザの権限を確認してください。'); }
  }
  return <div className="page-shell results-shell">
    <div className="result-top"><div><span className="eyebrow">ANALYSIS COMPLETE</span><h1>{appName || 'アプリ'} のレビュー分析</h1><p>{result.total}件のレビューを分析しました。AIの提案は原文と照らし合わせてご確認ください。</p></div><button className="secondary" onClick={onReset}>＋ 新しい分析</button></div>
    <section className="summary-grid">
      <div className="score-card panel"><span>総合インサイト</span><p>{result.overallInsight}</p></div>
      <div className="metric panel"><span>分析件数</span><strong>{result.total}<small>件</small></strong><p>星評価あり {result.ratedCount}件</p></div>
      <div className="metric panel negative"><span>ネガティブ</span><strong>{sentiment.negative.percentage}<small>%</small></strong><p>{sentiment.negative.count}件のレビュー</p></div>
      <div className="metric panel positive"><span>ポジティブ</span><strong>{sentiment.positive.percentage}<small>%</small></strong><p>{sentiment.positive.count}件のレビュー</p></div>
    </section>
    <section className="panel priority-card"><div className="section-heading"><div><span className="eyebrow">TOP PRIORITY</span><h2>最優先で対応すべきこと</h2></div></div><div className="priority-content"><div className="rank">01</div><div><h3>{topPriority.title}</h3><p>{topPriority.reason}</p><div className="impact-row"><span><b>推奨対応</b>{topPriority.recommendedAction}</span><span><b>期待効果</b>{topPriority.expectedEffect}</span></div></div></div></section>
    <section className="panel ranking-card"><div className="section-heading"><div><span className="eyebrow">ISSUE RANKING</span><h2>よくある問題・要望</h2></div><span className="subtle">件数順・複数分類あり</span></div><div className="issue-list">
      {result.issues.length === 0 && <p>明確な問題・要望は見つかりませんでした。</p>}
      {result.issues.map((issue, index) => <article className="issue" key={index}><span className="issue-rank">{index + 1}</span><div className={`issue-icon ${issue.severity === 'high' ? 'red' : issue.severity === 'medium' ? 'orange' : 'blue'}`}>{categoryLabels[issue.category].slice(0, 1)}</div><div className="issue-main"><h3>{issue.title}</h3><span className="category">{categoryLabels[issue.category]}・重要度 {({ high: '高', medium: '中', low: '低' })[issue.severity]}</span><div className="bar"><i style={{ width: `${issue.percentage}%` }} /></div></div><div className="issue-count"><strong>{issue.count}</strong><span>件・{issue.percentage}%</span></div></article>)}
    </div></section>
    <div className="two-columns"><section className="panel compact-card"><div className="section-heading"><h2>感情分析</h2></div><div className="sentiment-bar" aria-hidden="true"><i className="pos" style={{ width: `${sentiment.positive.percentage}%` }} /><i className="neu" style={{ width: `${sentiment.neutral.percentage}%` }} /><i className="neg" style={{ width: `${sentiment.negative.percentage}%` }} /></div><div className="legend">
      {(['positive', 'neutral', 'negative'] as const).map((key, index) => <span key={key}><i className={`dot ${['green', 'gray', 'coral'][index]}`} />{['ポジティブ', '中立', 'ネガティブ'][index]} <b>{sentiment[key].count}件・{sentiment[key].percentage}%</b></span>)}
    </div></section><section className="panel compact-card"><div className="section-heading"><h2>高く評価されている点</h2></div><div className="good-points">{result.positivePoints.map((p, i) => <span key={i}>✓ {p.title}（{p.count}件）</span>)}{!result.positivePoints.length && <p>明確な高評価ポイントは見つかりませんでした。</p>}</div></section></div>
    <div className="result-actions"><span role="status">{copyStatus}</span><button className="secondary" onClick={copy}>結果をコピー</button><button className="primary" onClick={onReset}>別のレビューを分析</button></div>
  </div>;
}
