import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 바둑 튜터',
  description: 'Gemini Pro 기반 맞춤형 바둑 코칭 및 기보 관리 서비스',
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
