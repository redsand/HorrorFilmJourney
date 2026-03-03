import type { Metadata } from 'next';
import React from 'react';
import type { ReactNode } from 'react';
import { FloatingFeedbackButton } from '@/components/feedback/FloatingFeedbackButton';
import { CabinetFrame } from '@/components/layout/CabinetFrame';
import { HorrorMistOverlay } from '@/components/layout/HorrorMistOverlay';
import { getActiveThemeForRequest } from '@/lib/theme/getActiveThemeForRequest';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Horror Film Journey',
  description: 'Mobile-first horror companion experience',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { theme } = await getActiveThemeForRequest();
  const bodyStyle = theme.cssVars as React.CSSProperties;

  return (
    <html data-theme={theme.themeName} lang="en">
      <body className="min-h-dvh bg-[var(--cc-bg)] text-[var(--cc-text)] antialiased" style={bodyStyle}>
        <ThemeProvider cssVars={theme.cssVars} theme={theme.themeName} />
        <CabinetFrame cabinetImagePath={theme.cabinetImagePath} themeName={theme.themeName}>
          {children}
        </CabinetFrame>
        <HorrorMistOverlay themeName={theme.themeName} />
        <FloatingFeedbackButton />
      </body>
    </html>
  );
}
