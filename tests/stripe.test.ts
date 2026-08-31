import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../lib/server/api-error';
import { createCheckoutHandler } from '../lib/server/checkout';
import { createPaymentCredits, type PaymentRecord, type PaymentStore } from '../lib/server/payment-credit';
import type { UserRecord } from '../lib/server/quota';
import { createStripeWebhookHandler } from '../lib/server/stripe-webhook';

class MemoryPaymentStore implements PaymentStore {
  users = new Map<string, UserRecord>(); payments = new Map<string, PaymentRecord>();
  now = () => 123;
  async transaction<T>(operation: Parameters<PaymentStore['transaction']>[0]): Promise<T> {
    return operation({
      user: async id => this.users.get(id), payment: async id => this.payments.get(id),
      writeUser: (id, value) => { this.users.set(id, value); },
      writePayment: (id, value) => { this.payments.set(id, value); },
    });
  }
}

const profile = (remainingReviews = 10): UserRecord => ({ email: 'test@example.com', displayName: 'Test', remainingReviews, createdAt: 1, updatedAt: 1 });

test('checkout requires auth and uses verified uid plus fixed server Price ID', async () => {
  const unauthenticated = createCheckoutHandler({
    authenticate: async () => { throw new ApiError(401, 'NO_AUTH_HEADER', 'login'); },
    priceId: () => 'price_fixed', create: async () => ({ url: 'https://checkout.stripe.com/x' }),
  });
  assert.equal((await unauthenticated(new Request('https://reviewapp-muta.vercel.app/api/stripe/create-checkout-session', { method: 'POST' }))).status, 401);
  let received: unknown;
  const handler = createCheckoutHandler({
    authenticate: async () => ({ uid: 'firebase-user' }), priceId: () => 'price_fixed',
    create: async input => { received = input; return { url: 'https://checkout.stripe.com/test' }; },
  });
  const response = await handler(new Request('https://reviewapp-muta.vercel.app/api/stripe/create-checkout-session', { method: 'POST' }));
  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    uid: 'firebase-user', priceId: 'price_fixed',
    successUrl: 'https://reviewapp-muta.vercel.app/?payment=success&session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://reviewapp-muta.vercel.app/?payment=cancelled',
  });
});

test('paid webhook adds 50 exactly once; invalid signatures and unpaid sessions add nothing', async () => {
  const store = new MemoryPaymentStore(); store.users.set('u1', profile());
  const credit = createPaymentCredits(store);
  let event = { type: 'checkout.session.completed', data: { object: {
    id: 'cs_1', payment_status: 'paid', metadata: { firebaseUid: 'u1', reviewCredits: '9999' }, amount_total: 980, currency: 'jpy',
  } } };
  const handler = createStripeWebhookHandler({
    secret: () => 'whsec_test', construct: (_body, signature) => { if (signature !== 'valid') throw Error('bad'); return event; }, credit,
  });
  const request = (signature: string) => new Request('http://x/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': signature }, body: '{}' });
  assert.equal((await handler(request('bad'))).status, 400);
  assert.equal(store.users.get('u1')!.remainingReviews, 10);
  assert.equal((await handler(request('valid'))).status, 200);
  assert.equal(store.users.get('u1')!.remainingReviews, 60);
  assert.equal(store.payments.get('cs_1')!.credits, 50);
  assert.equal((await handler(request('valid'))).status, 200);
  assert.equal(store.users.get('u1')!.remainingReviews, 60);
  event = { ...event, data: { object: { ...event.data.object, id: 'cs_2', payment_status: 'unpaid' } } };
  assert.equal((await handler(request('valid'))).status, 200);
  assert.equal(store.users.get('u1')!.remainingReviews, 60);
  assert.equal(store.payments.has('cs_2'), false);
});
