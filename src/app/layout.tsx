import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mapa Aguiar da Beira',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body style={{ height: '100%' }}>{children}</body>
    </html>
  );
}
