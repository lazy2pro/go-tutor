import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '바둑 한 수 · 초보 바둑 튜터',
  description: '한 수씩 천천히 배우는 초보자용 바둑 튜터',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
