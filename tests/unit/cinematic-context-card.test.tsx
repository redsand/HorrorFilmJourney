import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CinematicContextCard } from '@/components/context/CinematicContextCard';
import type { FilmContextExplanation } from '@/lib/context/build-film-context-explanation';

vi.mock('@/components/ui', () => ({
  Card: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div className={className ?? ''}>{children}</div>
  ),
  Chip: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

function loadFixture(fileName: string): FilmContextExplanation {
  const fixturePath = resolve(process.cwd(), 'tests', 'fixtures', fileName);
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as FilmContextExplanation;
}

describe('CinematicContextCard', () => {
  it('renders Season 1 fixture', () => {
    const fixture = loadFixture('cinematic-context-season1.json');
    const html = renderToStaticMarkup(<CinematicContextCard data={fixture} />);

    expect(html).toContain('Cinematic Context');
    expect(html).toContain('Supernatural Horror');
    expect(html).not.toContain('Signals');
    expect(html).toMatchSnapshot();
  });

  it('renders Season 2 fixture in compact mode', () => {
    const fixture = loadFixture('cinematic-context-season2.json');
    const html = renderToStaticMarkup(<CinematicContextCard compact data={fixture} />);

    expect(html).toContain('Midnight Movies');
    expect(html).not.toContain('Signals');
    expect(html).toMatchSnapshot();
  });

  it('renders nothing when assignment is missing', () => {
    const html = renderToStaticMarkup(<CinematicContextCard data={null} />);
    expect(html).toBe('');
  });
});
