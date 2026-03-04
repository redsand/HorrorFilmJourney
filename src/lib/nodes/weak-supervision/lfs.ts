import { loadSeasonOntology } from '@/lib/ontology/loadSeasonOntology';
import type { OntologyNode, SeasonOntology } from '@/lib/ontology/types';
import type { LabelingFunction, LabelingFunctionResult, NodeExclusivityRule, WeakSupervisionMovie } from './types';
import { getSeasonWeakSupervisionPlugin } from './seasons';

export type BuildSeasonLabelingFunctionsInput = {
  seasonId: string;
  taxonomyVersion?: string;
  nodeSlugs?: string[];
  includeThemeMatch?: boolean;
};

const SEPARATOR_PATTERN = /[^a-z0-9]+/g;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(SEPARATOR_PATTERN, ' ')
    .replace(/\s+/g, ' ');
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(' ').filter((entry) => entry.length > 1);
}

function buildMovieCorpus(movie: WeakSupervisionMovie): string {
  const parts: string[] = [movie.title, ...(movie.genres ?? []), ...(movie.keywords ?? [])];
  if (movie.synopsis) {
    parts.push(movie.synopsis);
  }
  return normalizeText(parts.join(' '));
}

function result(label: -1 | 0 | 1, confidence: number, evidence: string[] = []): LabelingFunctionResult {
  return {
    label,
    confidence: clamp01(confidence),
    ...(evidence.length > 0 ? { evidence } : {}),
  };
}

function countPhraseMatches(corpus: string, phrases: string[]): string[] {
  const matches: string[] = [];
  for (const phrase of phrases) {
    const normalized = normalizeText(phrase);
    if (normalized.length === 0) {
      continue;
    }
    if (corpus.includes(normalized)) {
      matches.push(normalized);
    }
  }
  return matches;
}

function createOntologyKeywordMatchLf(node: OntologyNode): LabelingFunction {
  return {
    name: `${node.slug}.LF_ontology_keyword_match`,
    nodeSlug: node.slug,
    apply: (movie) => {
      const corpus = buildMovieCorpus(movie);
      const matches = countPhraseMatches(corpus, node.commonKeywords);
      if (matches.length === 0) {
        return result(0, 0);
      }
      const confidence = 0.62 + (Math.min(matches.length, 4) * 0.08);
      return result(1, confidence, matches.slice(0, 4).map((entry) => `keyword:${entry}`));
    },
  };
}

function createOntologyNegativeSignalLf(node: OntologyNode): LabelingFunction {
  return {
    name: `${node.slug}.LF_ontology_negative_signal`,
    nodeSlug: node.slug,
    apply: (movie) => {
      const corpus = buildMovieCorpus(movie);
      const matches = countPhraseMatches(corpus, node.negativeSignals);
      if (matches.length === 0) {
        return result(0, 0);
      }
      const confidence = 0.7 + (Math.min(matches.length, 3) * 0.08);
      return result(-1, confidence, matches.slice(0, 3).map((entry) => `negative:${entry}`));
    },
  };
}

function createThemeMatchLf(node: OntologyNode): LabelingFunction {
  return {
    name: `${node.slug}.LF_theme_match`,
    nodeSlug: node.slug,
    apply: (movie) => {
      const corpus = buildMovieCorpus(movie);
      const themeTokens = node.canonicalThemes.flatMap((theme) => tokenize(theme));
      const uniqueTokens = [...new Set(themeTokens)];
      const matches = uniqueTokens.filter((token) => corpus.includes(token));
      if (matches.length === 0) {
        return result(0, 0);
      }
      const confidence = 0.45 + (Math.min(matches.length, 4) * 0.08);
      return result(1, confidence, matches.slice(0, 4).map((entry) => `theme:${entry}`));
    },
  };
}

type TargetedKeywordRule = {
  lfName: string;
  keywords: string[];
  baseConfidence: number;
};

const TARGETED_RECALL_LF_RULES: Record<string, TargetedKeywordRule[]> = {
  'cosmic-horror': [
    {
      lfName: 'LF_cosmic_keywords',
      keywords: ['cosmic', 'elder god', 'void', 'dimension', 'lovecraft', 'unknown'],
      baseConfidence: 0.64,
    },
  ],
  'horror-comedy': [
    {
      lfName: 'LF_horror_comedy_tone',
      keywords: ['satire', 'parody', 'dark comedy', 'absurd'],
      baseConfidence: 0.62,
    },
  ],
  'experimental-horror': [
    {
      lfName: 'LF_experimental_structure',
      keywords: ['avant-garde', 'dream', 'nonlinear', 'surreal'],
      baseConfidence: 0.63,
    },
  ],
  'apocalyptic-horror': [
    {
      lfName: 'LF_apocalyptic_keywords',
      keywords: ['end of the world', 'collapse', 'pandemic', 'extinction'],
      baseConfidence: 0.64,
    },
  ],
  'sci-fi-horror': [
    {
      lfName: 'LF_scifi_horror_keywords',
      keywords: ['alien', 'experiment', 'space', 'lab', 'mutation'],
      baseConfidence: 0.64,
    },
  ],
};

function createTargetedKeywordLf(nodeSlug: string, rule: TargetedKeywordRule): LabelingFunction {
  return {
    name: `${nodeSlug}.${rule.lfName}`,
    nodeSlug,
    apply: (movie) => {
      const corpus = buildMovieCorpus(movie);
      const matches = countPhraseMatches(corpus, rule.keywords);
      if (matches.length === 0) {
        return result(0, 0);
      }
      const confidence = rule.baseConfidence + (Math.min(matches.length, 3) * 0.08);
      return result(1, confidence, matches.slice(0, 4).map((entry) => `targeted:${entry}`));
    },
  };
}

function buildGenericOntologyLfs(ontology: SeasonOntology, allowedNodeSlugs?: Set<string>, includeThemeMatch = true): LabelingFunction[] {
  const lfs: LabelingFunction[] = [];

  for (const node of ontology.nodes) {
    if (allowedNodeSlugs && !allowedNodeSlugs.has(node.slug)) {
      continue;
    }
    lfs.push(createOntologyKeywordMatchLf(node));
    lfs.push(createOntologyNegativeSignalLf(node));
    if (includeThemeMatch) {
      lfs.push(createThemeMatchLf(node));
    }
    const targetedRules = TARGETED_RECALL_LF_RULES[node.slug] ?? [];
    for (const targetedRule of targetedRules) {
      lfs.push(createTargetedKeywordLf(node.slug, targetedRule));
    }
  }

  return lfs;
}

export function buildSeasonLabelingFunctions(input: BuildSeasonLabelingFunctionsInput): LabelingFunction[] {
  const ontology = loadSeasonOntology(input.seasonId);
  if (input.taxonomyVersion && ontology.taxonomyVersion !== input.taxonomyVersion) {
    throw new Error(
      `Taxonomy version mismatch for ${input.seasonId}: expected ${input.taxonomyVersion}, got ${ontology.taxonomyVersion}`,
    );
  }

  const allowedNodeSlugs = input.nodeSlugs ? new Set(input.nodeSlugs) : undefined;
  const genericLfs = buildGenericOntologyLfs(ontology, allowedNodeSlugs, input.includeThemeMatch ?? true);
  const plugin = getSeasonWeakSupervisionPlugin(input.seasonId);
  const pluginLfs = plugin
    ? plugin.buildLabelingFunctions({
      ontology,
      taxonomyVersion: input.taxonomyVersion,
      allowedNodeSlugs,
    })
    : [];
  return [...genericLfs, ...pluginLfs];
}

export function buildSeason1LabelingFunctions(nodeSlugs?: string[], taxonomyVersion?: string): LabelingFunction[] {
  return buildSeasonLabelingFunctions({
    seasonId: 'season-1',
    taxonomyVersion,
    nodeSlugs,
  });
}

export const DEFAULT_NODE_THRESHOLDS: Record<string, number> = (
  getSeasonWeakSupervisionPlugin('season-1')?.defaultNodeThresholds ?? {}
);

export const NODE_EXCLUSIVITY_RULES: NodeExclusivityRule[] = (
  getSeasonWeakSupervisionPlugin('season-1')?.exclusivityRules ?? []
);

export function getExclusivityConflicts(
  nodeSlug: string,
  assignedNodes: Iterable<string>,
  seasonId = 'season-1',
): NodeExclusivityRule[] {
  const assigned = new Set(assignedNodes);
  const rules = getSeasonWeakSupervisionPlugin(seasonId)?.exclusivityRules ?? [];
  return rules.filter((rule) => {
    return (rule.a === nodeSlug && assigned.has(rule.b)) || (rule.b === nodeSlug && assigned.has(rule.a));
  });
}
