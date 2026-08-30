import 'server-only';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { ApiError } from './api-error';

function adminApp() {
  const existing = getApps().find(app => app.name === 'reviewscope-admin');
  if (existing) return existing;
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId?.trim() || !clientEmail?.trim() || !privateKey?.trim()) {
    throw new ApiError(500, 'ADMIN_INIT_FAILED', 'サーバーのAdmin環境変数が不足しています。');
  }
  try { return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, 'reviewscope-admin'); }
  catch { throw new ApiError(500, 'ADMIN_INIT_FAILED', 'サービスアカウント資格情報を読み込めませんでした。'); }
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
