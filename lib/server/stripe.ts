import 'server-only';
import Stripe from 'stripe';
import { ApiError } from './api-error';

let stripeClient: Stripe | undefined;

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new ApiError(500, 'STRIPE_CONFIGURATION_ERROR', '決済設定が完了していません。');
  return stripeClient ??= new Stripe(key);
}

export function stripePriceId() {
  const price = process.env.STRIPE_PRICE_ID_50?.trim();
  if (!price) throw new ApiError(500, 'STRIPE_CONFIGURATION_ERROR', '決済商品が設定されていません。');
  return price;
}
