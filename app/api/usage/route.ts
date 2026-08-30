import { errorResponse } from '@/lib/server/api-error';
import { requireFirebaseUser } from '@/lib/server/firebase-user';
import { quota } from '@/lib/server/firestore-quota';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const identity = await requireFirebaseUser(request);
    return Response.json(await quota.usage(identity.uid, { email: identity.email ?? '', displayName: identity.name ?? null }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
