import { authenticate, errorResponse } from '@/lib/server/api-error';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const uid = await authenticate(request, async token => {
      const { verifyToken } = await import('@/lib/server/firebase-admin');
      return verifyToken(token);
    });
    const { quota } = await import('@/lib/server/firestore-quota');
    return Response.json(await quota.usage(uid), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
