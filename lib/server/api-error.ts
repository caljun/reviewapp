export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  const safe = error instanceof ApiError ? error : new ApiError(500, 'SERVER_ERROR', 'サーバー処理に失敗しました。時間をおいて再試行してください。');
  return Response.json({ code: safe.code, error: safe.message }, { status: safe.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function authenticate(request: Request, verify: (token: string) => Promise<{ uid: string }>) {
  const match = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i);
  if (!match) throw new ApiError(401, 'UNAUTHORIZED', '認証が必要です。再試行してください。');
  try { return (await verify(match[1])).uid; }
  catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'UNAUTHORIZED', '認証の有効期限が切れたか、認証情報が無効です。再試行してください。');
  }
}
