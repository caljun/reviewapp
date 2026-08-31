import { ApiError, errorResponse } from './api-error';

type Identity = { uid: string };
type Session = { url: string | null };
type Plan = { id: string; credits: number; priceId: string };

const ALLOWED_PRODUCTION_HOST = 'reviewapp-muta.vercel.app';

function safeOrigin(request: Request) {
  const url = new URL(request.url);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if ((!local && url.hostname !== ALLOWED_PRODUCTION_HOST) || (!local && url.protocol !== 'https:')) {
    throw new ApiError(400, 'INVALID_ORIGIN', '決済の戻り先を確認できませんでした。');
  }
  return url.origin;
}

export function createCheckoutHandler(deps: {
  authenticate(request: Request): Promise<Identity>;
  create(input: {
    uid: string; planId: string; credits: number; priceId: string; successUrl: string; cancelUrl: string;
  }): Promise<Session>;
  plan(planId: string): Plan;
}) {
  return async function POST(request: Request) {
    try {
      const identity = await deps.authenticate(request);
      const origin = safeOrigin(request);
      const body = await request.json().catch(() => null) as { planId?: unknown } | null;
      if (!body || typeof body.planId !== 'string') throw new ApiError(400, 'INVALID_PLAN', '購入プランを選択してください。');
      const plan = deps.plan(body.planId);
      const session = await deps.create({
        uid: identity.uid,
        planId: plan.id,
        credits: plan.credits,
        priceId: plan.priceId,
        successUrl: `${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/?payment=cancelled`,
      });
      if (!session.url) throw new ApiError(502, 'CHECKOUT_FAILED', '決済画面を作成できませんでした。');
      return Response.json({ url: session.url }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return errorResponse(error); }
  };
}
