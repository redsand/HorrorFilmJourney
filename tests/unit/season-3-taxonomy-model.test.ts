import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEASON3_SCI_FI_NODE_KEYWORDS, SEASON3_SCI_FI_NODE_SLUGS, SEASON3_SCI_FI_TAXONOMY } from '@/lib/seasons/season3/taxonomy';

type GovernanceFile = {
  nodes?: Record<string, unknown>;
};

describe('season-3 sci-fi taxonomy model', () => {
  it('defines both historical movement and motif node kinds', () => {
    const kinds = new Set(SEASON3_SCI_FI_TAXONOMY.map((node) => node.kind));
    expect(kinds.has('historical-movement')).toBe(true);
    expect(kinds.has('motif')).toBe(true);
    expect(SEASON3_SCI_FI_TAXONOMY.length).toBeGreaterThanOrEqual(16);
  });

  it('provides deterministic keyword lexicon for every taxonomy node', () => {
    for (const slug of SEASON3_SCI_FI_NODE_SLUGS) {
      const keywords = SEASON3_SCI_FI_NODE_KEYWORDS[slug] ?? [];
      expect(keywords.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('stays in lockstep with season-3 governance node definitions', () => {
    const governancePath = path.resolve('docs', 'season', 'season-3-sci-fi-node-governance.json');
    const governance = JSON.parse(fs.readFileSync(governancePath, 'utf8')) as GovernanceFile;
    const governanceNodes = Object.keys(governance.nodes ?? {}).sort();
    const taxonomyNodes = [...SEASON3_SCI_FI_NODE_SLUGS].sort();
    expect(governanceNodes).toEqual(taxonomyNodes);
  });
});
