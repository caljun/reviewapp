import { createCheckoutHandler } from '@/lib/server/checkout';
import { requireFirebaseUser } from '@/lib/server/firebase-user';
import { reviewPlan, stripe } from '@/lib/server/stripe';

export const runtime = 'nodejs';

export const POST = createCheckoutHandler({
  authenticate: requireFirebaseUser,
  plan: reviewPlan,
  create: async ({ uid, planId, credits, priceId, successUrl, cancelUrl }) => stripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: uid,
    metadata: { firebaseUid: uid, reviewPlan: planId, reviewCredits: String(credits) },
    success_url: successUrl,
    cancel_url: cancelUrl,
  }),
});
