import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { JourneyMap } from '@/components/journey/JourneyMap';

vi.mock('next/link', () => ({
  default: ({ href, children, className, ...rest }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    [key: string]: unknown;
  }) => (
    <a className={className} href={href} {...rest}>{children}</a>
  ),
}));

describe('JourneyMap', () => {
  it('renders nodes in order and highlights current + completed nodes', () => {
    const html = renderToStaticMarkup(
      <JourneyMap
        currentNodeSlug="midnight-movies"
        data={{
          nodes: [
            { slug: 'origins-of-cult-cinema', name: 'Origins', order: 1, coreCount: 10, extendedCount: 20 },
            { slug: 'midnight-movies', name: 'Midnight Movies', order: 2, coreCount: 12, extendedCount: 22 },
            { slug: 'psychotronic-cinema', name: 'Psychotronic Cinema', order: 3, coreCount: 8, extendedCount: 18 },
          ],
          progress: { completedNodeSlugs: ['origins-of-cult-cinema'], currentNodeSlug: 'midnight-movies' },
        }}
        packSlug="cult-classics"
        seasonSlug="season-2"
      />,
    );

    expect(html.indexOf('1. Completed')).toBeLessThan(html.indexOf('2. Current'));
    expect(html.indexOf('2. Current')).toBeLessThan(html.indexOf('3. Upcoming'));
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('/journey?nodeSlug=midnight-movies');
    expect(html).toMatchSnapshot();
  });

  it('renders gracefully without progress', () => {
    const html = renderToStaticMarkup(
      <JourneyMap
        data={{
          nodes: [
            { slug: 'supernatural-horror', name: 'Supernatural Horror', order: 1 },
            { slug: 'psychological-horror', name: 'Psychological Horror', order: 2 },
          ],
        }}
        packSlug="horror"
        seasonSlug="season-1"
      />,
    );

    expect(html).toContain('Journey Map');
    expect(html).toContain('1. Upcoming');
    expect(html).toContain('2. Upcoming');
    expect(html).toMatchSnapshot();
  });
});
