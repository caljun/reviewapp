import type { Metadata } from 'next';
import './globals.css';

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
      <body>{children}</body>
    </html>
  );
}
