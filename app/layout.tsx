import type { Metadata } from 'next';
import './globals.css';
import FirebaseInit from './firebase-init';

export const metadata: Metadata = {
  title: 'ReviewScope | 大量のアプリレビューを分析',
  description: '複数のアプリレビューから、よくある不満と次に直すべき機能を見つけます。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body><FirebaseInit />{children}<footer className="privacy-note">アクセス解析にGoogle Analyticsを使用しています。レビュー本文を解析イベントとして送信する処理は行いません。</footer></body>
    </html>
  );
}
