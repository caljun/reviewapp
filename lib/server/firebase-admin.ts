import 'server-only';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { ApiError } from './api-error';

function adminApp() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.trim().replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new ApiError(500, 'ADMIN_INIT_FAILED', 'サーバーの認証初期化に失敗しました。');
  }
  try { return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }); }
  catch { throw new ApiError(500, 'ADMIN_INIT_FAILED', 'サーバーの認証初期化に失敗しました。'); }
}

type TokenEnvelope = { aud?: unknown; iss?: unknown };

function tokenEnvelope(token: string): TokenEnvelope {
  try {
    const part = token.split('.')[1];
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as TokenEnvelope;
  } catch {
    throw new ApiError(401, 'TOKEN_VERIFY_FAILED', '認証情報を検証できませんでした。再ログインしてください。');
  }
}

export async function verifyToken(token: string) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim();
  if (!projectId) adminApp(); // Produce the existing safe configuration error.
  const envelope = tokenEnvelope(token);
  if (envelope.aud !== projectId || envelope.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new ApiError(401, 'TOKEN_PROJECT_MISMATCH', 'FirebaseのWeb設定とAdmin設定のプロジェクトが一致していません。');
  }
  let decoded;
  try {
    decoded = await getAuth(adminApp()).verifyIdToken(token);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (code === 'auth/id-token-expired') throw new ApiError(401, 'TOKEN_EXPIRED', '認証の有効期限が切れました。再試行してください。');
    console.warn('Firebase ID token verification failed', { code: code || 'UNKNOWN', projectId, aud: envelope.aud, iss: envelope.iss });
    throw new ApiError(401, 'TOKEN_VERIFY_FAILED', '認証情報を検証できませんでした。再ログインしてください。');
  }
  return decoded;
}
export const adminDatabase = () => getFirestore(adminApp());
