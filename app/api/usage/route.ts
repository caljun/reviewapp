import { authenticate, errorResponse } from '@/lib/server/api-error';
import { verifyToken } from '@/lib/server/firebase-admin';
import { quota } from '@/lib/server/firestore-quota';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const identity = await authenticate(request, verifyToken);
    return Response.json(await quota.usage(identity.uid, { email: identity.email ?? '', displayName: identity.name ?? null }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
