import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RootLayout from '@/app/layout';

describe('RootLayout mobile shell', () => {
  it('renders full-height dark wrapper with max-width mobile column', () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <div>child</div>
      </RootLayout>,
    );

    expect(html).toContain('min-h-dvh bg-[var(--bg)] text-[var(--text)]');
    expect(html).toContain('max-w-[420px]');
    expect(html).toContain('pb-24');
  });
});
