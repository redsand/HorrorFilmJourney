import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FurtherReadingSection } from '@/components/companion/FurtherReadingSection';

describe('FurtherReadingSection', () => {
  it('renders section when externalReadings exist', () => {
    const html = renderToStaticMarkup(
      <FurtherReadingSection
        externalReadings={[
          {
            sourceName: 'Bloody Disgusting',
            articleTitle: 'The Dark (2005) Revisited',
            url: 'https://bloody-disgusting.com/editorials/example',
            seasonId: 'season-1',
            sourceType: 'retrospective',
            publicationDate: '2024-10-31T00:00:00.000Z',
          },
        ]}
      />,
    );

    expect(html).toContain('Further Reading');
    expect(html).toContain('Bloody Disgusting');
    expect(html).toContain('The Dark (2005) Revisited');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toMatchSnapshot();
  });

  it('does not render section when externalReadings is missing or empty', () => {
    const missingHtml = renderToStaticMarkup(<FurtherReadingSection />);
    const emptyHtml = renderToStaticMarkup(<FurtherReadingSection externalReadings={[]} />);

    expect(missingHtml).toBe('');
    expect(emptyHtml).toBe('');
  });
});

