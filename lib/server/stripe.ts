import 'server-only';
import Stripe from 'stripe';
import { ApiError } from './api-error';

let stripeClient: Stripe | undefined;

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new ApiError(500, 'STRIPE_CONFIGURATION_ERROR', '決済設定が完了していません。');
  return stripeClient ??= new Stripe(key);
}

export const REVIEW_PLANS = {
  '50': { credits: 50, priceEnv: 'STRIPE_PRICE_ID_50' },
  '150': { credits: 150, priceEnv: 'STRIPE_PRICE_ID_150' },
  '500': { credits: 500, priceEnv: 'STRIPE_PRICE_ID_500' },
} as const;

export type ReviewPlanId = keyof typeof REVIEW_PLANS;

export function reviewPlan(planId: string) {
  if (!(planId in REVIEW_PLANS)) throw new ApiError(400, 'INVALID_PLAN', '購入プランが正しくありません。');
  const id = planId as ReviewPlanId;
  const plan = REVIEW_PLANS[id];
  const priceId = process.env[plan.priceEnv]?.trim();
  if (!priceId) throw new ApiError(500, 'STRIPE_CONFIGURATION_ERROR', '決済商品が設定されていません。');
  return { id, credits: plan.credits, priceId };
}

export function reviewCredits(planId: string) {
  if (!(planId in REVIEW_PLANS)) throw new ApiError(400, 'INVALID_PLAN', '購入プランが正しくありません。');
  return REVIEW_PLANS[planId as ReviewPlanId].credits;
}
