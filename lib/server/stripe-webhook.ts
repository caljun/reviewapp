type CheckoutSession = {
  id: string; payment_status: string; metadata?: Record<string, string> | null;
  amount_total: number | null; currency: string | null;
};
type StripeEvent = { type: string; data: { object: unknown } };

export function createStripeWebhookHandler(deps: {
  secret(): string;
  construct(body: string, signature: string, secret: string): StripeEvent;
  credit(session: { id: string; uid: string; amountTotal: number | null; currency: string | null; paymentStatus: string }): Promise<unknown>;
}) {
  return async function POST(request: Request) {
    const signature = request.headers.get('stripe-signature');
    if (!signature) return Response.json({ error: 'Webhookを検証できません。' }, { status: 400 });
    let event: StripeEvent;
    try { event = deps.construct(await request.text(), signature, deps.secret()); }
    catch { return Response.json({ error: 'Webhook署名が不正です。' }, { status: 400 }); }
    if (event.type !== 'checkout.session.completed') return Response.json({ received: true });
    const session = event.data.object as CheckoutSession;
    if (session.payment_status !== 'paid') return Response.json({ received: true });
    const uid = session.metadata?.firebaseUid;
    if (!uid) return Response.json({ error: '決済利用者を確認できません。' }, { status: 400 });
    try {
      await deps.credit({ id: session.id, uid, amountTotal: session.amount_total, currency: session.currency, paymentStatus: session.payment_status });
      return Response.json({ received: true });
    } catch { return Response.json({ error: '決済反映に失敗しました。' }, { status: 500 }); }
  };
}
