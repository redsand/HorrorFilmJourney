import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HorrorMistOverlay, shouldRenderHorrorMist } from '@/components/layout/HorrorMistOverlay';

describe('HorrorMistOverlay', () => {
  it('renders for horror theme', () => {
    expect(shouldRenderHorrorMist('horror')).toBe(true);
    const html = renderToStaticMarkup(<HorrorMistOverlay themeName="horror" />);
    expect(html).toContain('horror-mist-overlay');
    expect(html).toContain('horror-mist-overlay__layer--left');
  });

  it('does not render for non-horror themes', () => {
    expect(shouldRenderHorrorMist('scifi')).toBe(false);
    const html = renderToStaticMarkup(<HorrorMistOverlay themeName="scifi" />);
    expect(html).toBe('');
  });
});
