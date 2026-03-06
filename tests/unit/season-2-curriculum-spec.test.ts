import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type CurriculumTitle = { title: string; year: number; altTitle?: string };
type CurriculumNode = { slug: string; name: string; titles: CurriculumTitle[] };
type CurriculumSpec = {
  minimumEligiblePerNode: number;
  nodes: CurriculumNode[];
  allowedOverlapKeys?: string[];
};

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toKey(entry: CurriculumTitle): string {
  return `${normalizeTitle(entry.altTitle ?? entry.title)}:${entry.year}`;
}

function loadSpec(): CurriculumSpec {
  return JSON.parse(readFileSync('docs/season/season-2-cult-classics-curriculum.json', 'utf8')) as CurriculumSpec;
}

describe('Season 2 Cult Classics curriculum spec', () => {
  it('contains 11 nodes with at least 25 titles each', () => {
    const spec = loadSpec();
    expect(spec.nodes).toHaveLength(11);
    spec.nodes.forEach((node) => {
      expect(node.titles.length).toBeGreaterThanOrEqual(25);
    });
  });

  it('keeps cross-node duplicate rate within 2% after explicit overlap whitelist', () => {
    const spec = loadSpec();
    const allowed = new Set((spec.allowedOverlapKeys ?? []).map((entry) => entry.toLowerCase()));
    const frequency = new Map<string, number>();

    let total = 0;
    spec.nodes.forEach((node) => {
      node.titles.forEach((entry) => {
        total += 1;
        const key = toKey(entry);
        frequency.set(key, (frequency.get(key) ?? 0) + 1);
      });
    });

    const duplicates = [...frequency.entries()]
      .filter(([, count]) => count > 1)
      .map(([key]) => key);
    const unapproved = duplicates.filter((key) => !allowed.has(key));
    expect(unapproved).toEqual([]);

    const effectiveDuplicateCount = duplicates.filter((key) => !allowed.has(key)).length;
    const duplicateRate = total > 0 ? (effectiveDuplicateCount / total) * 100 : 0;
    expect(duplicateRate).toBeLessThanOrEqual(2);
  });
});
