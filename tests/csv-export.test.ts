import { test } from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import { parseReviewCsv, mapCsvReviews, csvReviewError, reviewsToText } from '../lib/review-csv';
import { analysisMarkdown, rankingCsv, rankingFilename } from '../lib/result-export';
import type { SimpleAnalysis } from '../lib/simple-analysis';

test('UTF-8 BOM, quoted commas/newlines and blank rows; optional rating column', () => {
  const table = parseReviewCsv('\uFEFFreview,rating\r\n"便利,です",5\r\n"複数\n行",2\r\n,\r\n');
  assert.deepEqual(table.headers, ['review', 'rating']);
  const unrated = mapCsvReviews(table, '0', '');
  assert.equal(unrated.length, 2); assert.equal(unrated[0].rating, undefined);
  const rated = mapCsvReviews(table, '0', '1');
  assert.equal(rated[0].rating, 5); assert.equal(rated[1].rating, 2);
  assert.equal(reviewsToText(rated), '★5\n便利,です\n\n★2\n複数\n行');
});
test('only numeric ratings 1–5, no metadata columns enter reviews', () => {
  const table = parseReviewCsv('body,rating,private\nA,1,secret\nB,5,secret\nC,0,x\nD,6,x\nE,abc,x\nF,3.5,x\nG,3.0,x');
  const result = mapCsvReviews(table, '0', '1');
  assert.deepEqual(result.map(r => r.rating), [1, 5, undefined, undefined, undefined, undefined, 3]);
  assert.ok(!JSON.stringify(result).includes('secret'));
});
test('CSV missing header, empty, malformed and unselected column errors', () => {
  assert.throws(() => parseReviewCsv(''), /空/);
  assert.throws(() => parseReviewCsv(',\na,b'), /ヘッダー/);
  assert.throws(() => parseReviewCsv('review,rating\n"broken'), /失敗/);
  assert.throws(() => mapCsvReviews(parseReviewCsv('review\na'), '', ''), /選択/);
  assert.match(csvReviewError([]), /0件/);
  assert.match(csvReviewError(Array.from({ length: 51 }, () => ({ text: 'a' }))), /50件/);
  assert.match(csvReviewError([{ text: 'a'.repeat(2001) }]), /2,000/);
  assert.equal(csvReviewError(Array.from({ length: 50 }, () => ({ text: 'a' }))), '');
});
const result: SimpleAnalysis = { summary: '全体の傾向', topPriority: { title: '修正', reason: '利用不能', action: '調査' }, issues: [{ title: '起動しない,"エラー"\n発生', count: 2, severity: 'high' }], positivePoints: ['操作が簡単'] };
test('Markdown uses displayed data and omits empty sections', () => {
  const md = analysisMarkdown(result, '習慣');
  assert.ok(md.includes('# 習慣 のレビュー分析\n\n## 全体サマリー\n\n全体の傾向'));
  assert.ok(md.includes('推奨対応：調査')); assert.ok(md.includes('- 操作が簡単'));
  assert.equal(analysisMarkdown({ summary: '', topPriority: { title: '', reason: '', action: '' }, issues: [], positivePoints: [] }, ''), '# アプリ のレビュー分析');
});
test('CSV BOM bytes, Japanese round trip, quotes, newlines, numeric columns and file name', () => {
  const csv = rankingCsv(result);
  assert.deepEqual([...Buffer.from(csv).subarray(0, 3)], [239, 187, 191]);
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true }).data;
  assert.equal(parsed[0].issue, result.issues[0].title);
  assert.equal(parsed[0].rank, '1'); assert.equal(parsed[0].count, '2'); assert.equal(parsed[0].severity, 'high');
  assert.equal(rankingFilename('テスト/名:*?', new Date(2026, 7, 28)), 'reviewscope-テスト名-2026-08-28.csv');
  assert.equal(rankingFilename('///', new Date(2026, 7, 28)), 'reviewscope-アプリ-2026-08-28.csv');
});
test('formula injection is escaped for spreadsheet viewers', () => {
  const csv = rankingCsv({ ...result, issues: [{ title: '=HYPERLINK("evil")', count: 1, severity: 'low' }] });
  assert.ok(Papa.parse<Record<string, string>>(csv, { header: true }).data[0].issue.startsWith("'="));
});
