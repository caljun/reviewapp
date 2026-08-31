import { ApiError, errorResponse } from './api-error';

type Identity = { uid: string };
type Session = { url: string | null };

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
    uid: string; priceId: string; successUrl: string; cancelUrl: string;
  }): Promise<Session>;
  priceId(): string;
}) {
  return async function POST(request: Request) {
    try {
      const identity = await deps.authenticate(request);
      const origin = safeOrigin(request);
      const session = await deps.create({
        uid: identity.uid,
        priceId: deps.priceId(),
        successUrl: `${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/?payment=cancelled`,
      });
      if (!session.url) throw new ApiError(502, 'CHECKOUT_FAILED', '決済画面を作成できませんでした。');
      return Response.json({ url: session.url }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return errorResponse(error); }
  };
}
