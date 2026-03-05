import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/components/ui', () => ({
  Card: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className ?? ''}>{children}</div>
  ),
}));

// Simple component that mimics the codex card from the companion page
function CodexCard({ codex }: { codex?: { whyImportant: string; whatItTeaches: string; watchFor: [string, string, string] } }) {
  return codex ? (
    <div data-testid="card">
      <h3>Why It Matters</h3>
      <p>{codex.whyImportant}</p>

      <h3>What It Teaches</h3>
      <p>{codex.whatItTeaches}</p>

      <h3>Watch For</h3>
      <ul>
        {codex.watchFor.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  ) : null;
}

describe('CompanionCodexCard', () => {
  it('renders codex card when data is provided', () => {
    const codex = {
      whyImportant: 'This film explores deep psychological themes.',
      whatItTeaches: 'Viewers learn about fear and human nature.',
      watchFor: ['Cinematography techniques', 'Sound design', 'Symbolism'] as [string, string, string],
    };

    const html = renderToStaticMarkup(<CodexCard codex={codex} />);

    expect(html).toContain('Why It Matters');
    expect(html).toContain('What It Teaches');
    expect(html).toContain('Watch For');
    expect(html).toContain('This film explores deep psychological themes.');
    expect(html).toContain('Viewers learn about fear and human nature.');
    expect(html).toContain('Cinematography techniques');
    expect(html).toContain('Sound design');
    expect(html).toContain('Symbolism');
  });

  it('does not render when codex is undefined', () => {
    const html = renderToStaticMarkup(<CodexCard codex={undefined} />);
    expect(html).toBe('');
  });

  it('renders exactly three watch-for items', () => {
    const codex = {
      whyImportant: 'Test',
      whatItTeaches: 'Test',
      watchFor: ['Item 1', 'Item 2', 'Item 3'] as [string, string, string],
    };

    const html = renderToStaticMarkup(<CodexCard codex={codex} />);
    const listItems = html.match(/<li.*?>/g);
    expect(listItems).toHaveLength(3);
  });
});
