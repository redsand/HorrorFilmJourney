import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../globals.css';

export const metadata: Metadata = {
  title: 'CinemaCodex — Guided Film Curriculum',
  description: 'A guided cinematic curriculum with an AI companion. Explore Horror Classics, Cult Cinema, and beyond.',
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased" style={{ background: '#060607', color: '#f7f3ef' }}>
        {children}
      </body>
    </html>
  );
}
