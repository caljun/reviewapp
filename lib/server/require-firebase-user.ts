import { ApiError } from './api-error';

type Identity = { uid: string; email?: string; name?: string };

export function createFirebaseUserRequirement(verify: (token: string) => Promise<Identity>) {
  return async function requireFirebaseUser(request: Request): Promise<Identity> {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new ApiError(401, 'NO_AUTH_HEADER', 'ログインしてください。');
    const match = authorization.match(/^Bearer ([^\s]+)$/i);
    if (!match) throw new ApiError(401, 'INVALID_BEARER_FORMAT', '認証情報の形式が不正です。');
    return verify(match[1]);
  };
}
