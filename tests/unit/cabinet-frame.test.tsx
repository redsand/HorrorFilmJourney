import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CabinetFrame } from '@/components/layout/CabinetFrame';

describe('CabinetFrame', () => {
  it('renders cult theme class and cabinet path when provided', () => {
    const html = renderToStaticMarkup(
      <CabinetFrame cabinetImagePath="/assets/cabinets/cult-classics-season-2.png" themeName="cult">
        <div>content</div>
      </CabinetFrame>,
    );

    expect(html).toContain('theme-cult');
    expect(html).toContain('/assets/cabinets/cult-classics-season-2.png');
  });
});
