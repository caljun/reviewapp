import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSimpleAnalysis } from '../lib/simple-analysis';

const value = { summary: '起動不良', topPriority: { title: '修正', reason: '利用不能', action: '調査する' }, issues: [{ title: '広告', count: 1, severity: 'medium' }, { title: '起動しない', count: 2, severity: 'high' }], positivePoints: ['使いやすい'] };
test('plain JSON and Markdown fenced JSON both parse and sort by count', () => {
  for (const raw of [JSON.stringify(value), '```json\n' + JSON.stringify(value) + '\n```']) {
    const result = parseSimpleAnalysis(raw);
    assert.equal(result?.issues[0].title, '起動しない');
    assert.equal(result?.issues[0].count, 2);
  }
});
test('free text, broken JSON and unsuitable shapes fall back without repairing JSON', () => {
  for (const raw of ['自由文の分析です', '{broken', '{}', 'null', '説明\n' + JSON.stringify(value), JSON.stringify({ ...value, issues: [null] })])
    assert.equal(parseSimpleAnalysis(raw), null);
});
test('different responses produce different ranking contents', () => {
  const other = { ...value, issues: [{ title: '通知が届かない', count: 3, severity: 'high' }] };
  assert.notDeepEqual(parseSimpleAnalysis(JSON.stringify(value))?.issues, parseSimpleAnalysis(JSON.stringify(other))?.issues);
});
