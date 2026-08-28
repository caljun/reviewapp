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
    throw new ApiError(500, 'SERVER_CONFIGURATION_ERROR', 'サーバーの認証設定が完了していません。');
  }
  try { return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, 'reviewscope-admin'); }
  catch { throw new ApiError(500, 'SERVER_CONFIGURATION_ERROR', 'サーバーの認証設定を確認してください。'); }
}

export const verifyToken = (token: string) => getAuth(adminApp()).verifyIdToken(token);
export const adminDatabase = () => getFirestore(adminApp());
