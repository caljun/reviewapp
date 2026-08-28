import Papa from 'papaparse';
import type { SimpleAnalysis } from './simple-analysis';

export function analysisMarkdown(result: SimpleAnalysis, appName: string): string {
  const parts = [`# ${appName.trim() || 'アプリ'} のレビュー分析`];
  if (result.summary.trim()) parts.push(`## 全体サマリー\n\n${result.summary}`);
  const priority = [result.topPriority.title, result.topPriority.reason,
    result.topPriority.action.trim() ? `推奨対応：${result.topPriority.action}` : ''].filter(v => v.trim());
  if (priority.length) parts.push(`## 最優先の対応\n\n${priority.join('\n\n')}`);
  const issues = result.issues.filter(i => i.title.trim());
  if (issues.length) parts.push(`## 問題・要望\n\n${issues.map(i => `- ${i.title}：${i.count}件`).join('\n')}`);
  const positives = result.positivePoints.filter(p => p.trim());
  if (positives.length) parts.push(`## 高評価ポイント\n\n${positives.map(p => `- ${p}`).join('\n')}`);
  return parts.join('\n\n');
}

export function rankingCsv(result: SimpleAnalysis): string {
  return '\uFEFF' + Papa.unparse({ fields: ['rank', 'issue', 'count', 'severity'],
    data: result.issues.map((i, index) => [index + 1, i.title, i.count, i.severity]) },
  { newline: '\r\n', escapeFormulae: /^[\s]*[=+\-@]|^[\t\r]/ });
}

export function rankingFilename(appName: string, date = new Date()): string {
  const name = Array.from(appName.trim()).filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127 && !'<>:"/\\|?*'.includes(c)).join('').replace(/[. ]+$/g, '').slice(0, 80) || 'アプリ';
  const stamp = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  return `reviewscope-${name}-${stamp}.csv`;
}
