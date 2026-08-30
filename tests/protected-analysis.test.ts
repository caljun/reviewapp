import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createQuota, type QuotaStore, type UserRecord, type RequestRecord } from '../lib/server/quota';
import { createProtectedAnalysis } from '../lib/server/protected-analysis';
import { ApiError } from '../lib/server/api-error';
import { createFirebaseUserRequirement } from '../lib/server/require-firebase-user';
import { authenticatedFetch } from '../lib/authenticated-fetch';
import type { AnalyzeInput } from '../lib/analyze-input';

class MemoryStore implements QuotaStore {
  users = new Map<string, UserRecord>(); requests = new Map<string, RequestRecord>();
  private queue: Promise<unknown> = Promise.resolve(); now = () => 123;
  transaction<T>(operation: Parameters<QuotaStore['transaction']>[0]): Promise<T> {
    const next = this.queue.then(async () => {
      const users = new Map(structuredClone([...this.users])); const requests = new Map(structuredClone([...this.requests]));
      const result = await operation({ user: async id => users.get(id), request: async id => requests.get(id),
        writeUser: (id, value) => { users.set(id, value); }, writeRequest: (id, value) => { requests.set(id, value); } });
      this.users = users; this.requests = requests; return result as T;
    }); this.queue = next.catch(() => undefined); return next;
  }
}
const identity = { uid: 'u1', email: 'user@example.com', name: 'User' };
const input = (count = 1): AnalyzeInput => ({ requestId: randomUUID(), reviews: Array.from({ length: count }, (_, id) => ({ id, text: `レビュー${id}` })) });
const req = (body: unknown, token: string | null = 'Bearer valid') => new Request('http://x/api/analyze', { method: 'POST', headers: token ? { Authorization: token } : {}, body: JSON.stringify(body) });
function setup(generate: (value: AnalyzeInput) => Promise<unknown> = async () => ({ text: 'ok' })) {
  const store = new MemoryStore(); const quota = createQuota(store);
  const handler = createProtectedAnalysis({ quota, generate, authenticate: async request => {
    if (request.headers.get('Authorization') !== 'Bearer valid') throw new ApiError(401, 'TOKEN_VERIFY_FAILED', 'invalid');
    return identity;
  } });
  return { store, quota, handler };
}
const code = async (response: Response) => (await response.json() as { code: string }).code;

test('shared Firebase requirement distinguishes missing, malformed and rejected tokens', async () => {
  const requireUser = createFirebaseUserRequirement(async token => {
    if (token !== 'valid') throw new ApiError(401, 'TOKEN_VERIFY_FAILED', 'invalid');
    return identity;
  });
  await assert.rejects(() => requireUser(new Request('http://x')), (error: ApiError) => error.code === 'NO_AUTH_HEADER');
  await assert.rejects(() => requireUser(new Request('http://x', { headers: { Authorization: 'Basic x' } })), (error: ApiError) => error.code === 'INVALID_BEARER_FORMAT');
  await assert.rejects(() => requireUser(new Request('http://x', { headers: { Authorization: 'Bearer bad' } })), (error: ApiError) => error.code === 'TOKEN_VERIFY_FAILED');
  assert.equal((await requireUser(new Request('http://x', { headers: { Authorization: 'Bearer valid' } }))).uid, identity.uid);
});

test('missing and invalid authentication are 401 with no user or analysis', async () => {
  const { handler, store } = setup();
  for (const token of [null, 'Basic x', 'Bearer invalid']) assert.equal((await handler(req(input(), token))).status, 401);
  assert.equal(store.users.size, 0); assert.equal(store.requests.size, 0);
});
test('first Google user gets 10 reviews and existing balance is never overwritten', async () => {
  const { quota, store } = setup();
  assert.deepEqual(await quota.usage(identity.uid, { email: identity.email, displayName: identity.name }), { remainingReviews: 10 });
  store.users.get(identity.uid)!.remainingReviews = 4;
  assert.deepEqual(await quota.usage(identity.uid, { email: 'changed@example.com', displayName: null }), { remainingReviews: 4 });
  assert.equal(store.users.get(identity.uid)!.email, identity.email);
});
test('three reviews consume three and successful request is completed', async () => {
  const { handler, store } = setup(); const value = input(3);
  assert.equal((await handler(req(value))).status, 200);
  assert.equal(store.users.get(identity.uid)!.remainingReviews, 7);
  assert.equal(store.requests.get(value.requestId)!.status, 'completed');
});
test('insufficient balance is 403 and Gemini is not called', async () => {
  let calls = 0; const { handler, quota, store } = setup(async () => { calls++; return {}; });
  await quota.usage(identity.uid, { email: identity.email, displayName: identity.name }); store.users.get(identity.uid)!.remainingReviews = 2;
  const response = await handler(req(input(3)));
  assert.equal(response.status, 403); assert.equal(await code(response), 'INSUFFICIENT_REVIEWS'); assert.equal(calls, 0);
});
test('Gemini failure refunds exact review count once', async () => {
  const { handler, store, quota } = setup(async () => { throw Error('provider secret'); }); const value = input(4);
  assert.equal((await handler(req(value))).status, 502);
  assert.equal(store.users.get(identity.uid)!.remainingReviews, 10); assert.equal(store.requests.get(value.requestId)!.status, 'refunded');
  await quota.settle(identity.uid, value.requestId, 'refunded'); assert.equal(store.users.get(identity.uid)!.remainingReviews, 10);
});
test('same requestId and concurrent requests never double consume', async () => {
  let calls = 0; const { handler, store } = setup(async () => { calls++; return { text: 'ok' }; }); const value = input(3);
  assert.deepEqual((await Promise.all([handler(req(value)), handler(req(value))])).map(r => r.status).sort(), [200, 409]);
  assert.equal(calls, 1); assert.equal(store.users.get(identity.uid)!.remainingReviews, 7);
});
test('input limits still reject before consumption', async () => {
  const { handler, store } = setup();
  for (const value of [{}, { ...input(), reviews: [] }, input(51), { ...input(), reviews: [{ text: 'x'.repeat(2001) }] }, { ...input(), appName: 'x'.repeat(101) }, { ...input(), focus: 'x'.repeat(501) }]) assert.equal((await handler(req(value))).status, 400);
  assert.equal(store.requests.size, 0);
});
test('Firestore metadata contains no reviews, result, appName or focus', async () => {
  const { handler, store } = setup(); await handler(req({ ...input(2), appName: 'Secret app', focus: 'Secret focus' }));
  const saved = JSON.stringify([...store.users, ...store.requests]);
  assert.ok(!saved.includes('レビュー')); assert.ok(!saved.includes('Secret')); assert.deepEqual(Object.keys(store.requests.values().next().value!).sort(), ['createdAt', 'reviewCount', 'status', 'uid', 'updatedAt'].sort());
});
test('401 refreshes token once with identical request', async () => {
  const forced: unknown[] = []; const bodies: unknown[] = []; let attempts = 0;
  const user = { getIdToken: async (force?: boolean) => { forced.push(force); return force ? 'new' : 'old'; } };
  const response = await authenticatedFetch(user, '/', { method: 'POST', body: 'same' }, async (_url, init) => { attempts++; bodies.push(init?.body); return new Response(null, { status: attempts === 1 ? 401 : 200 }); });
  assert.equal(response.status, 200); assert.deepEqual(forced, [false, true]); assert.deepEqual(bodies, ['same', 'same']);
});
