import type { Metadata } from 'next';
import React from 'react';
import type { ReactNode } from 'react';
import { FloatingFeedbackButton } from '@/components/feedback/FloatingFeedbackButton';
import './globals.css';

export const metadata: Metadata = {
  title: 'Horror Film Journey',
  description: 'Mobile-first horror companion experience',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-[var(--bg)] text-[var(--text)] antialiased">
        <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col px-4 pb-24 pt-[max(16px,env(safe-area-inset-top))]">
          {children}
        </div>
        <FloatingFeedbackButton />
      </body>
    </html>
  );
}
