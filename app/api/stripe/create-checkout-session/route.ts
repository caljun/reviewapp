import { createCheckoutHandler } from '@/lib/server/checkout';
import { requireFirebaseUser } from '@/lib/server/firebase-user';
import { stripe, stripePriceId } from '@/lib/server/stripe';

export const runtime = 'nodejs';

export const POST = createCheckoutHandler({
  authenticate: requireFirebaseUser,
  priceId: stripePriceId,
  create: async ({ uid, priceId, successUrl, cancelUrl }) => stripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: uid,
    metadata: { firebaseUid: uid, reviewCredits: '50' },
    success_url: successUrl,
    cancel_url: cancelUrl,
  }),
});
