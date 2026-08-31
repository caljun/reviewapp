import { creditPayment } from '@/lib/server/firestore-payments';
import { stripe } from '@/lib/server/stripe';
import { createStripeWebhookHandler } from '@/lib/server/stripe-webhook';

export const runtime = 'nodejs';

export const POST = createStripeWebhookHandler({
  secret: () => {
    const value = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!value) throw new Error('missing webhook secret');
    return value;
  },
  construct: (body, signature, secret) => stripe().webhooks.constructEvent(body, signature, secret),
  credit: creditPayment,
});
