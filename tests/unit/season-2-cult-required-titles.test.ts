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

  it('includes canonical cult animation while excluding mainstream animation outliers', () => {
    const spec = loadSpec();
    const titles = new Set(
      spec.nodes.flatMap((node) => node.titles.map((entry) => normalize(entry.title))),
    );
    [
      'Akira',
      'Fantastic Planet',
      'Heavy Metal',
    ].forEach((required) => {
      expect(titles.has(normalize(required))).toBe(true);
    });
    [
      'Who Framed Roger Rabbit',
      'Toy Story',
    ].forEach((forbidden) => {
      expect(titles.has(normalize(forbidden))).toBe(false);
    });
  });
});
