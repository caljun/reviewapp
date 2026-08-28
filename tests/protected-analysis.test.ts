import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createQuota, type QuotaStore, type UserRecord, type RequestRecord } from '../lib/server/quota';
import { createProtectedAnalysis } from '../lib/server/protected-analysis';
import { ApiError } from '../lib/server/api-error';
import { authenticatedFetch } from '../lib/authenticated-fetch';
import { analyzeInputSchema, type AnalyzeInput } from '../lib/analyze-input';

// Serialized, atomic fake transaction adapter. No Firebase/Gemini network calls.
class MemoryStore implements QuotaStore {
  users = new Map<string, UserRecord>();
  requests = new Map<string, RequestRecord>();
  private queue: Promise<unknown> = Promise.resolve();
  now = () => 123;
  transaction<T>(operation: Parameters<QuotaStore['transaction']>[0]): Promise<T> {
    const next = this.queue.then(async () => {
      const users = new Map(structuredClone([...this.users]));
      const requests = new Map(structuredClone([...this.requests]));
      const result = await operation({
        user: async uid => users.get(uid), request: async id => requests.get(id),
        writeUser: (uid, user) => { users.set(uid, user); },
        writeRequest: (id, request) => { requests.set(id, request); },
      });
      this.users = users; this.requests = requests;
      return result as T;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}
const input = (count = 1): AnalyzeInput => ({ requestId: randomUUID(), appName: '習慣', focus: '起動不良', reviews: Array.from({ length: count }, (_, id) => ({ id, text: '起動できない', rating: 1 })) });
function request(body: unknown, token: string | null = 'Bearer valid') {
  return new Request('http://localhost/api/analyze', { method: 'POST', headers: token ? { Authorization: token } : {}, body: JSON.stringify(body) });
}
function setup(generate: (data: AnalyzeInput) => Promise<unknown> = async () => ({ text: '分析成功' })) {
  const store = new MemoryStore(); const quota = createQuota(store);
  const handler = createProtectedAnalysis({ quota, generate, verify: async token => {
    if (token !== 'valid') throw new Error('secret token details');
    return { uid: 'user1' };
  } });
  return { store, quota, handler };
}
async function code(response: Response) { return (await response.json() as { code: string }).code; }

test('missing, malformed, invalid and expired tokens are 401 without quota writes', async () => {
  const { handler, store } = setup();
  for (const token of [null, 'Basic abc', 'Bearer', 'Bearer a b', 'Bearer invalid', 'Bearer expired']) {
    const response = await handler(request(input(), token));
    assert.equal(response.status, 401); assert.equal(await code(response), 'UNAUTHORIZED');
  }
  assert.equal(store.users.size, 0); assert.equal(store.requests.size, 0);
});
test('user initialized once, existing balances/timestamps preserved', async () => {
  const { quota, store } = setup();
  assert.deepEqual(await quota.usage('user1'), { freeAnalysisUsed: false, remainingCredits: 0 });
  store.users.get('user1')!.remainingCredits = 3;
  store.users.get('user1')!.createdAt = 99;
  assert.equal((await quota.usage('user1')).remainingCredits, 3);
  assert.equal(store.users.get('user1')!.createdAt, 99);
});
test('free first analysis succeeds, next is 403, metadata only is stored', async () => {
  let sent: AnalyzeInput | undefined;
  const { handler, store } = setup(async data => { sent = data; return { text: 'secret result' }; });
  const data = input(10);
  assert.equal((await handler(request(data))).status, 200);
  assert.deepEqual(sent, data);
  assert.equal(store.requests.get(data.requestId)?.status, 'completed');
  const next = await handler(request(input()));
  assert.equal(next.status, 403); assert.equal(await code(next), 'FREE_LIMIT_REACHED');
  assert.deepEqual(Object.keys(store.requests.get(data.requestId)!).sort(), ['createdAt', 'reviewCount', 'source', 'status', 'uid', 'updatedAt'].sort());
  assert.deepEqual(Object.keys(store.users.get('user1')!).sort(), ['createdAt', 'updatedAt', 'freeAnalysisUsed', 'remainingCredits'].sort());
  assert.ok(!JSON.stringify([...store.requests]).includes('secret result'));
  assert.ok(!JSON.stringify([...store.requests]).includes('起動できない'));
});
test('11 free reviews rejected; 50 with credit accepted; free stays available', async () => {
  const { handler, quota, store } = setup();
  const denied = await handler(request(input(11)));
  assert.equal(denied.status, 403); assert.equal(await code(denied), 'PAID_PLAN_REQUIRED');
  assert.equal(store.requests.size, 0);
  await quota.usage('user1'); store.users.get('user1')!.remainingCredits = 1;
  assert.equal((await handler(request(input(50)))).status, 200);
  assert.equal(store.users.get('user1')!.remainingCredits, 0);
  assert.equal(store.users.get('user1')!.freeAnalysisUsed, false);
});
test('Gemini failure refunds free once and allows a new request', async () => {
  const { handler, store, quota } = setup(async () => { throw new Error('private raw Gemini error'); });
  const data = input();
  const response = await handler(request(data));
  assert.equal(response.status, 502); assert.equal(await code(response), 'ANALYSIS_FAILED');
  assert.equal(store.users.get('user1')!.freeAnalysisUsed, false);
  assert.equal(store.requests.get(data.requestId)!.status, 'refunded');
  await quota.settle('user1', data.requestId, 'refunded');
  assert.equal(store.users.get('user1')!.remainingCredits, 0);
  assert.equal((await handler(request(input()))).status, 502);
  assert.equal((await handler(request(data))).status, 409);
});
test('credit refund is idempotent and completed requests are never refunded', async () => {
  const { quota, store } = setup(); await quota.usage('user1');
  store.users.get('user1')!.remainingCredits = 1;
  const id = randomUUID(); await quota.reserve('user1', id, 11);
  assert.equal(store.users.get('user1')!.remainingCredits, 0);
  await Promise.all([quota.settle('user1', id, 'refunded'), quota.settle('user1', id, 'refunded')]);
  assert.equal(store.users.get('user1')!.remainingCredits, 1);
  const done = randomUUID(); await quota.reserve('user1', done, 11); await quota.settle('user1', done, 'completed');
  await quota.settle('user1', done, 'refunded');
  assert.equal(store.users.get('user1')!.remainingCredits, 0);
});
test('same request replay never runs Gemini twice, including concurrent requests', async () => {
  let calls = 0;
  const { handler, store } = setup(async () => { calls++; return { text: 'ok' }; });
  const data = input();
  const responses = await Promise.all([handler(request(data)), handler(request(data))]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal(calls, 1); assert.equal(store.requests.size, 1);
  assert.equal((await handler(request(data))).status, 409); assert.equal(calls, 1);
});
test('different simultaneous requests cannot double-consume free or credit', async () => {
  const { handler, store } = setup();
  assert.deepEqual((await Promise.all([handler(request(input())), handler(request(input()))])).map(r => r.status).sort(), [200, 403]);
  store.users.get('user1')!.remainingCredits = 1;
  assert.deepEqual((await Promise.all([handler(request(input(11))), handler(request(input(11)))])).map(r => r.status).sort(), [200, 403]);
  assert.equal(store.users.get('user1')!.remainingCredits, 0);
});
test('request ID belonging to another UID is rejected without changing quotas', async () => {
  const { quota, store } = setup(); await quota.usage('a'); await quota.usage('b');
  const id = randomUUID(); await quota.reserve('a', id, 1);
  await assert.rejects(quota.reserve('b', id, 1), (e: unknown) => e instanceof ApiError && e.code === 'REQUEST_CONFLICT');
  assert.equal(store.users.get('b')!.freeAnalysisUsed, false);
});
test('all invalid input boundaries rejected before reserving', async () => {
  const { handler, store } = setup();
  const base = input();
  const invalid = [null, {}, { ...base, requestId: undefined }, { ...base, requestId: '../x' },
    { ...base, reviews: [] }, input(51), { ...base, reviews: [{ text: 'x'.repeat(2001) }] },
    { ...base, reviews: Array.from({ length: 26 }, () => ({ text: 'x'.repeat(2000) })) },
    { ...base, appName: 'x'.repeat(101) }, { ...base, focus: 'x'.repeat(501) },
    { ...base, appName: 1 }, { ...base, focus: null }, { ...base, reviews: 'text' },
    ...['', '   ', 123, null].map(text => ({ ...base, reviews: [{ text }] })),
    ...[0, 6, 1.5, '5', null].map(rating => ({ ...base, reviews: [{ text: 'abc', rating }] })),
  ];
  for (const value of invalid) assert.equal((await handler(request(value))).status, 400);
  assert.equal(store.requests.size, 0);
  assert.ok(analyzeInputSchema.safeParse({ ...base, appName: 'x'.repeat(100), focus: 'x'.repeat(500), reviews: Array.from({ length: 25 }, () => ({ text: 'x'.repeat(2000), rating: 5 })) }).success);
});
test('malformed JSON and oversized body are safe 400 responses', async () => {
  const { handler } = setup();
  for (const body of ['{broken', 'x'.repeat(700001)]) assert.equal((await handler(new Request('http://localhost/api/analyze', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body }))).status, 400);
});
test('safe configuration error and failed refund/completion do not claim success', async () => {
  const configured = setup(async () => { throw new ApiError(500, 'SERVER_CONFIGURATION_ERROR', '設定が必要です'); });
  assert.equal((await configured.handler(request(input()))).status, 500);
  assert.equal(configured.store.users.get('user1')!.freeAnalysisUsed, false);
  for (const failGemini of [false, true]) {
    const { quota } = setup();
    const handler = createProtectedAnalysis({ verify: async () => ({ uid: 'user1' }), quota: { ...quota, settle: async () => { throw new Error('private stack'); } }, generate: async () => { if (failGemini) throw new Error('secret'); return { text: 'ok' }; } });
    const response = await handler(request(input()));
    assert.equal(response.status, 503); assert.equal(await code(response), failGemini ? 'REFUND_PENDING' : 'COMPLETION_PENDING');
  }
});
test('token refresh only on 401, only once, same request body / ID', async () => {
  const forced: (boolean | undefined)[] = []; const bodies: unknown[] = []; const tokens: unknown[] = [];
  const user = { getIdToken: async (force?: boolean) => { forced.push(force); return force ? 'new' : 'old'; } };
  const send: typeof fetch = async (_url, init) => { bodies.push(init?.body); tokens.push(new Headers(init?.headers).get('Authorization')); return new Response(null, { status: bodies.length === 1 ? 401 : 200 }); };
  const body = JSON.stringify(input());
  assert.equal((await authenticatedFetch(user, '/api/analyze', { method: 'POST', body }, send)).status, 200);
  assert.deepEqual(forced, [false, true]); assert.deepEqual(bodies, [body, body]); assert.deepEqual(tokens, ['Bearer old', 'Bearer new']);
  let attempts = 0;
  assert.equal((await authenticatedFetch(user, '/', {}, async () => { attempts++; return new Response(null, { status: 401 }); })).status, 401);
  assert.equal(attempts, 2);
  attempts = 0;
  await authenticatedFetch(user, '/', {}, async () => { attempts++; return new Response(null, { status: 502 }); });
  assert.equal(attempts, 1);
});
