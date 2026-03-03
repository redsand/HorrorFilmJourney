import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RootLayout from '@/app/layout';
import { Button } from '@/components/ui';

describe('RootLayout mobile shell', () => {
  it('renders full-height dark wrapper with max-width mobile column', async () => {
    const tree = await RootLayout({
      children: <div>child</div>,
    });
    const html = renderToStaticMarkup(
      tree,
    );

    expect(html).toContain('data-theme=\"horror\"');
    expect(html).toContain('min-h-dvh bg-[var(--cc-bg)] text-[var(--cc-text)]');
    expect(html).toContain('cabinet-frame');
    expect(html).toContain('cabinet-frame__content');
    expect(html).toContain('/assets/cabinets/horror-season-1.png');
  });

  it('renders primary button with accent token classes', () => {
    const html = renderToStaticMarkup(<Button>Action</Button>);
    expect(html).toContain('bg-[var(--cc-accent)]');
    expect(html).toContain('hover:bg-[var(--cc-accent-2)]');
  });
});
