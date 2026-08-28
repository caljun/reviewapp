import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateAnalysis, inputSchema, parseAnalysis, validIndexes, type ModelAnalysis } from '../lib/analysis';
import { createAnalyzeHandler } from '../lib/analyze-handler';

const input = { reviews: [{ id: 10, text: '起動しない', rating: 5 }, { id: 20, text: '使いやすい', rating: 5 }] };
const valid: ModelAnalysis = {
  overallInsight: '起動不良の改善が必要です。',
  sentimentByReview: [{ reviewIndex: 10, sentiment: 'negative' }, { reviewIndex: 20, sentiment: 'positive' }],
  topPriority: { title: '起動不良', reason: '利用できないため', recommendedAction: '再現確認', expectedEffect: '利用可能になることが期待されます' },
  issues: [{ title: '起動しない', category: 'bug', reviewIndexes: [10], severity: 'high' }],
  positivePoints: [{ title: '使いやすい', reviewIndexes: [20] }],
};
const request = (body: unknown) => new Request('http://localhost/api/analyze', { method: 'POST', body: JSON.stringify(body) });
const handler = (generate = async () => JSON.stringify(valid)) => createAnalyzeHandler({ getKey: () => 'test-only', generate });

test('valid input, deduplicated IDs, server counts and percentages', () => {
  const parsed = parseAnalysis(JSON.stringify({ ...valid, issues: [{ ...valid.issues[0], reviewIndexes: [10, 10] }] }), input);
  const result = aggregateAnalysis(parsed, input);
  assert.equal(result.total, 2);
  assert.equal(result.issues[0].count, 1);
  assert.equal(result.issues[0].percentage, 50);
  assert.equal(result.sentiment.negative.count, 1);
  assert.equal(result.positivePoints[0].count, 1);
});
test('unknown IDs are excluded by defensive aggregation and rejected for retry by validation', () => {
  assert.deepEqual(validIndexes([10, 99, 10, -1], new Set([10, 20])), [10]);
  const bad = { ...valid, issues: [{ ...valid.issues[0], reviewIndexes: [10, 99] }] };
  assert.throws(() => parseAnalysis(JSON.stringify(bad), input));
  assert.equal(aggregateAnalysis(bad, input).issues[0].count, 1);
});
test('invalid JSON, missing fields, missing/duplicate sentiments, invalid group, empty priority are rejected', () => {
  for (const value of [
    {}, { ...valid, sentimentByReview: [valid.sentimentByReview[0]] },
    { ...valid, sentimentByReview: [valid.sentimentByReview[0], valid.sentimentByReview[0]] },
    { ...valid, sentimentByReview: [{ reviewIndex: 99, sentiment: 'neutral' }, valid.sentimentByReview[1]] },
    { ...valid, issues: [{ ...valid.issues[0], reviewIndexes: [99] }] },
    { ...valid, topPriority: { ...valid.topPriority, title: ' ' } },
    { ...valid, positivePoints: [{ title: 'test', reviewIndexes: [99] }] },
  ]) assert.throws(() => parseAnalysis(JSON.stringify(value), input));
  assert.throws(() => parseAnalysis('not JSON', input));
});
test('invalid inputs return 400 without calling provider', async () => {
  for (const body of [{}, { reviews: [] }, { reviews: Array.from({ length: 51 }, (_, id) => ({ id, text: 'a' })) },
    { reviews: [{ id: 1, text: ' ' }] }, { reviews: [{ id: 1, text: 'a', rating: 6 }] },
    { reviews: [{ id: 1, text: 'a'.repeat(2001) }] }, { reviews: [input.reviews[0], input.reviews[0]] },
    { reviews: Array.from({ length: 26 }, (_, id) => ({ id, text: 'a'.repeat(2000) })) },
    { ...input, appName: 'a'.repeat(201) }, { ...input, focus: 'a'.repeat(1001) }]) {
    const res = await handler(async () => { assert.fail('Provider must not be called'); })(request(body));
    assert.equal(res.status, 400);
  }
  assert.equal(inputSchema.safeParse(input).success, true);
});
test('missing key safely returns 500', async () => {
  const res = await createAnalyzeHandler({ getKey: () => undefined })(request(input));
  assert.equal(res.status, 500);
  assert.deepEqual(Object.keys(await res.json()), ['error']);
});
test('one validation failure retries with repair instruction, no third call', async () => {
  const calls: boolean[] = [];
  const res = await handler(async (_, repair) => { calls.push(repair); return repair ? JSON.stringify(valid) : '{}'; })(request(input));
  assert.equal(res.status, 200);
  assert.deepEqual(calls, [false, true]);
  let count = 0;
  const bad = await handler(async () => { count++; return '{}'; })(request(input));
  assert.equal(bad.status, 502);
  assert.equal(count, 2);
});
test('provider errors and oversized/malformed bodies never leak details', async () => {
  const res = await handler(async () => { throw new Error('secret-provider-response'); })(request(input));
  assert.equal(res.status, 502);
  assert.ok(!(await res.text()).includes('secret-provider-response'));
  for (const body of ['{broken', 'x'.repeat(400001)]) {
    assert.equal((await handler()(new Request('http://localhost/api/analyze', { method: 'POST', body }))).status, 400);
  }
});
