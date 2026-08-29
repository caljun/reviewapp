export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && error !== null
    && 'name' in error && error.name === 'ApiError'
    && 'status' in error && Number.isInteger(error.status)
    && 'code' in error && typeof error.code === 'string'
    && 'message' in error && typeof error.message === 'string';
}

export function errorResponse(error: unknown) {
  const safe = isApiError(error) ? error : new ApiError(500, 'SERVER_ERROR', 'サーバー処理に失敗しました。時間をおいて再試行してください。');
  return Response.json({ code: safe.code, error: safe.message }, {
    status: safe.status,
    headers: { 'Cache-Control': 'no-store', 'X-ReviewScope-Revision': 'auth-v5' },
  });
}

export async function authenticate(request: Request, verify: (token: string) => Promise<{ uid: string }>) {
  const match = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i);
  if (!match) throw new ApiError(401, 'UNAUTHORIZED', '認証が必要です。再試行してください。');
  try { return (await verify(match[1])).uid; }
  catch (error) {
    if (isApiError(error)) throw error;
    throw new ApiError(401, 'UNAUTHORIZED', '認証の有効期限が切れたか、認証情報が無効です。再試行してください。');
  }
}
