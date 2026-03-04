import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReasonPanel } from '@/components/context/ReasonPanel';
import type { SeasonReasonPanel } from '@/lib/context/build-season-reason-panel';

vi.mock('@/components/ui', () => ({
  Card: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div className={className ?? ''}>{children}</div>
  ),
  Chip: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

function loadFixture(name: string): SeasonReasonPanel {
  const path = resolve(process.cwd(), 'tests', 'fixtures', name);
  return JSON.parse(readFileSync(path, 'utf8')) as SeasonReasonPanel;
}

describe('ReasonPanel', () => {
  it('renders season-1 curriculum framing', () => {
    const fixture = loadFixture('reason-panel-season1.json');
    const html = renderToStaticMarkup(<ReasonPanel {...fixture} />);
    expect(html).toContain('Why it&#x27;s Horror (in this curriculum)');
    expect(html).toContain('Curriculum Fit');
    expect(html).toContain('must-include');
    expect(html).toMatchSnapshot();
  });

  it('renders season-2 cult framing', () => {
    const fixture = loadFixture('reason-panel-season2.json');
    const html = renderToStaticMarkup(<ReasonPanel {...fixture} />);
    expect(html).toContain('Why it&#x27;s Cult');
    expect(html).toContain('Cult Confidence');
    expect(html).toContain('HK Category III');
    expect(html).toMatchSnapshot();
  });
});
