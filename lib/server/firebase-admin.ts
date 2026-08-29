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
    throw new ApiError(500, 'SERVER_CONFIGURATION_ERROR', 'サーバーの認証設定が完了していません。');
  }
  try { return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, 'reviewscope-admin'); }
  catch { throw new ApiError(500, 'SERVER_CONFIGURATION_ERROR', 'サーバーの認証設定を確認してください。'); }
}

type TokenEnvelope = { aud?: unknown; iss?: unknown };

function tokenEnvelope(token: string): TokenEnvelope {
  try {
    const part = token.split('.')[1];
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as TokenEnvelope;
  } catch {
    throw new ApiError(401, 'INVALID_ID_TOKEN', '認証情報の形式が不正です。再試行してください。');
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
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (code === 'auth/id-token-expired') throw new ApiError(401, 'ID_TOKEN_EXPIRED', '認証の有効期限が切れました。再試行してください。');
    if (code === 'auth/id-token-revoked' || code === 'auth/user-disabled') throw new ApiError(401, 'ID_TOKEN_REJECTED', 'この認証情報は利用できません。');
    throw new ApiError(401, 'ID_TOKEN_VERIFICATION_FAILED', 'Firebase IDトークンを検証できませんでした。Admin認証情報を確認してください。');
  }
  if (!decoded.email) {
    throw new ApiError(401, 'LOGIN_REQUIRED', 'ログインしてください。');
  }
  return decoded;
}
export const adminDatabase = () => getFirestore(adminApp());
