import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type CurriculumSpec = {
  nodes: Array<{ titles: Array<{ title: string; year: number; altTitle?: string }> }>;
};

function loadSpec(): CurriculumSpec {
  return JSON.parse(readFileSync('docs/season/season-2-cult-classics-curriculum.json', 'utf8')) as CurriculumSpec;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

describe('Season 2 required title and animation guards', () => {
  it('includes key cult anchors', () => {
    const spec = loadSpec();
    const titles = new Set(
      spec.nodes.flatMap((node) => node.titles.map((entry) => normalize(entry.title))),
    );
    expect(titles.has(normalize('The Big Lebowski'))).toBe(true);
    expect(titles.has(normalize('Scarface'))).toBe(true);
    expect(titles.has(normalize('Pulp Fiction'))).toBe(true);
  });

  it('excludes known animated titles from the curated source list', () => {
    const spec = loadSpec();
    const titles = new Set(
      spec.nodes.flatMap((node) => node.titles.map((entry) => normalize(entry.title))),
    );
    [
      'Akira',
      'Fantastic Planet',
      'Wizards',
      'Heavy Metal',
      'Who Framed Roger Rabbit',
    ].forEach((forbidden) => {
      expect(titles.has(normalize(forbidden))).toBe(false);
    });
  });
});
