import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyzeHandler } from '../lib/analyze-handler';
import type { AnalysisResult } from '../lib/analysis';

test('live Gemini: grouping, separate categories, positive points and different input', { skip: process.env.RUN_LIVE_GEMINI !== '1', timeout: 120000 }, async () => {
  const post = createAnalyzeHandler();
  const first = await post(new Request('http://localhost/api/analyze', { method: 'POST', body: JSON.stringify({ reviews: [
    { id: 11, text: '更新後に起動しません。使えません。', rating: 5 },
    { id: 22, text: 'アプリが起動せず開けません。', rating: 1 },
    { id: 33, text: '広告が多すぎます。', rating: 2 },
    { id: 44, text: '通知が全く届かず困っています。', rating: 2 },
    { id: 55, text: 'ダークモードを追加してほしい。', rating: 3 },
    { id: 66, text: '操作がシンプルで使いやすく最高です。', rating: 5 },
  ] }) }));
  assert.equal(first.status, 200, `Live API returned HTTP ${first.status}; provider details intentionally hidden`);
  const a = await first.json() as AnalysisResult;
  assert.ok(a.issues.some(i => i.reviewIndexes.includes(11) && i.reviewIndexes.includes(22)));
  for (const category of ['ads', 'notification', 'feature_request']) assert.ok(a.issues.some(i => i.category === category));
  assert.ok(a.positivePoints.some(p => p.reviewIndexes.includes(66)));
  assert.equal(a.sentimentByReview.find(s => s.reviewIndex === 11)?.sentiment, 'negative');
  const second = await post(new Request('http://localhost/api/analyze', { method: 'POST', body: JSON.stringify({ reviews: [{ id: 99, text: 'デザインが美しくて大満足。操作も簡単で最高です。', rating: 5 }] }) }));
  assert.equal(second.status, 200);
  const b = await second.json() as AnalysisResult;
  assert.notEqual(a.overallInsight, b.overallInsight);
  assert.equal(b.total, 1);
  assert.equal(b.sentiment.positive.count, 1);
  assert.equal(b.issues.length, 0);
});
