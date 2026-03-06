// ─── DETERMINISTIC SCI-FI RELEVANCE SCORER ───────────────────────────────────
//
// Assigns a sci-fi relevance score [0, 1] to a film candidate using five
// explicit, rule-based feature groups. No trained model. No stochastic
// inference. Same inputs always produce identical outputs.
//
// SCORING FORMULA
//   final_score = clamp(
//     genre_sub    × 0.30 +
//     keyword_sub  × 0.35 +
//     synopsis_sub × 0.25 +
//     temporal_sub × 0.05 +
//     ontology_sub × 0.05,
//     0, 1
//   )
//
// Each sub-score is itself [0, 1]. Every signal that contributes is recorded
// in the SciFiFeatureSignal array for full explainability.
//
// ─────────────────────────────────────────────────────────────────────────────

// ── TMDB Genre IDs ────────────────────────────────────────────────────────────

const G_SCI_FI    = 878;
const G_DRAMA     = 18;
const G_HORROR    = 27;
const G_ACTION    = 28;
const G_ADVENTURE = 12;
const G_FANTASY   = 14;
const G_FAMILY    = 10751;

// ── Feature Group Weights (must sum to 1.0) ───────────────────────────────────

const WEIGHTS = {
  genre:    0.30,
  keyword:  0.35,
  synopsis: 0.25,
  temporal: 0.05,
  ontology: 0.05,
} as const;

// ── Keyword Tiers ─────────────────────────────────────────────────────────────
//
// TIER 1 — Definitive sci-fi (any single hit = full group score):
//   Presence of any Tier 1 keyword establishes the film as unambiguously
//   within the sci-fi genre regardless of other signals.
//
// TIER 2 — Strong indicators (weight 0.50 each, capped at 1.0):
//   These keywords are strongly associated with sci-fi but also appear in
//   adjacent genres (thriller, fantasy, horror).
//
// TIER 3 — Moderate indicators (weight 0.20 each, capped at 0.60):
//   Contextual signals. Individually weak; meaningful when combined.
//
// NEGATIVE — Non-sci-fi genre markers (weight −0.35 each, floor 0.0):
//   Applied before clamping. These indicate the sci-fi tag may be incidental.

const TIER1_KEYWORDS: readonly string[] = [
  'science fiction',
  'sci-fi',
  'cyberpunk',
  'space opera',
  'transhumanism',
  'posthumanism',
  'singularity',
  'hard science fiction',
  'soft science fiction',
  'generation ship',
  'dyson sphere',
  'first contact',
  'uploaded consciousness',
  'terraforming',
  'faster than light travel',
  'xenomorph',
  'biopunk',
  'solarpunk',
  'dieselpunk',
  'atompunk',
];

const TIER2_KEYWORDS: readonly string[] = [
  'artificial intelligence',
  'time travel',
  'dystopia',
  'dystopian society',
  'dystopian future',
  'robot',
  'android',
  'cyborg',
  'clone',
  'genetic engineering',
  'virtual reality',
  'simulation',
  'parallel universe',
  'alternate universe',
  'alternate history',
  'space exploration',
  'alien',
  'extraterrestrial',
  'wormhole',
  'teleportation',
  'nanotechnology',
  'mind control',
  'space colonization',
  'alien invasion',
  'cyberspace',
  'neural interface',
  'body modification',
  'hive mind',
  'post-human',
  'memory implant',
  'brain-computer interface',
];

const TIER3_KEYWORDS: readonly string[] = [
  'future',
  'spaceship',
  'space station',
  'nuclear war',
  'post-apocalyptic',
  'mutation',
  'laboratory',
  'radiation',
  'interstellar',
  'multiverse',
  'time loop',
  'genetic mutation',
  'pandemic',
  'scientist',
  'cold war',
  'atomic age',
  'surveillance state',
  'megacity',
];

const NEGATIVE_KEYWORDS: readonly string[] = [
  'superhero',
  'based on comic book',
  'marvel cinematic universe',
  'dc extended universe',
  'magical realism',
  'fairy tale',
];

// ── Synopsis Concept Clusters ─────────────────────────────────────────────────
//
// Each cluster represents a domain of sci-fi thought. The film's normalized
// overview text is scanned for any token in the cluster's token list.
// A cluster FIRES (all-or-nothing per cluster) if any token matches.
//
// synopsis_score = clamp(sum of fired cluster weights, 0, 1)

const CONCEPT_CLUSTERS = [
  {
    name: 'space',
    weight: 0.40,
    tokens: [
      'space', 'planet', 'galaxy', 'orbit', 'spacecraft', 'astronaut',
      'starship', 'cosmos', 'stellar', 'interstellar', 'wormhole', 'nasa',
      'rocket', 'moon colony', 'solar system', 'alien world', 'light year',
      'nebula', 'supernova', 'deep space',
    ],
  },
  {
    name: 'ai_robot',
    weight: 0.40,
    tokens: [
      'robot', 'android', 'artificial intelligence', 'algorithm', 'cyborg',
      'automaton', 'synthetic', 'replicant', 'sentient machine', 'supercomputer',
      'neural network', 'autonomous machine', 'machine intelligence',
      'hal', 'drone', 'mechanical', 'programmed',
    ],
  },
  {
    name: 'temporal',
    weight: 0.35,
    tokens: [
      'time travel', 'timeline', 'paradox', 'temporal', 'time machine',
      'causality', 'bootstrap', 'alternate timeline', 'time loop',
      '22nd century', '23rd century', '24th century', '25th century',
      'year 2', 'distant future', 'far future',
    ],
  },
  {
    name: 'dystopia',
    weight: 0.30,
    tokens: [
      'dystopian', 'totalitarian', 'surveillance', 'authoritarian',
      'oppressive regime', 'conformity', 'propaganda', 'state control',
      'megacorporation', 'corporate state', 'thought police', 'controlled society',
    ],
  },
  {
    name: 'biotech',
    weight: 0.25,
    tokens: [
      'genetic', 'clone', 'mutation', 'bioengineering', 'dna',
      'pathogen', 'gene splicing', 'specimen', 'experiment on humans',
      'human experiment', 'biological weapon', 'virus strain',
    ],
  },
  {
    name: 'nuclear',
    weight: 0.20,
    tokens: [
      'nuclear', 'atomic', 'radiation', 'fallout', 'nuclear war',
      'nuclear missile', 'nuclear bomb', 'mushroom cloud', 'fission',
      'radioactive', 'nuclear holocaust',
    ],
  },
  {
    name: 'cosmic',
    weight: 0.20,
    tokens: [
      'cosmic', 'anomaly', 'zone', 'incomprehensible force',
      'dimensional rift', 'void', 'unknown entity', 'eldritch',
      'beyond human understanding',
    ],
  },
] as const;

// ── Temporal Reliability Table ────────────────────────────────────────────────
//
// Films tagged genre 878 in earlier eras are more reliably sci-fi because
// TMDB tagging was sparse and deliberate. Modern catalogues have higher
// false-positive rates from adjacent genre sweeps.

const ERA_RELIABILITY: ReadonlyArray<{ yearMax: number; score: number }> = [
  { yearMax: 1949, score: 1.0 },   // Silent / pre-war era — tagging is rare and precise
  { yearMax: 1979, score: 0.6 },   // Cold War / Space Race / New Hollywood
  { yearMax: 1999, score: 0.3 },   // Blockbuster / cyberpunk era
  { yearMax: 2013, score: 0.1 },   // Early streaming catalogue
  { yearMax: Infinity, score: 0.0 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SciFiFeatureSignal = {
  group: 'genre' | 'keyword' | 'synopsis' | 'temporal' | 'ontology';
  name: string;
  matched: string;
  rawContribution: number;
  weightedContribution: number;
};

export type SciFiScoreBreakdown = {
  genre: number;
  keyword: number;
  synopsis: number;
  temporal: number;
  ontology: number;
};

export type SciFiScoreResult = {
  score: number;
  breakdown: SciFiScoreBreakdown;
  signals: SciFiFeatureSignal[];
  topNode: string | null;
};

export type SciFiOntologyNodeDef = {
  slug: string;
  commonKeywords: string[];
  negativeSignals?: string[];
};

export type SciFiScorerInput = {
  title: string;
  year: number | null;
  genreIds?: number[];
  genreNames?: string[];
  keywords?: string[];
  synopsis?: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasGenreId(genreIds: number[] | undefined, id: number): boolean {
  return Array.isArray(genreIds) && genreIds.includes(id);
}

function hasGenreName(genreNames: string[] | undefined, name: string): boolean {
  if (!Array.isArray(genreNames)) return false;
  const n = norm(name);
  return genreNames.some((g) => norm(g) === n || norm(g).includes(n));
}

function hasGenre(
  genreIds: number[] | undefined,
  genreNames: string[] | undefined,
  id: number,
  name: string,
): boolean {
  return hasGenreId(genreIds, id) || hasGenreName(genreNames, name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature Group 1 — Genre Signals
// ─────────────────────────────────────────────────────────────────────────────
//
// Genre 878 (Science Fiction) present → base 1.0
// Genre 878 absent                    → base 0.0
//
// Modifiers (applied to base, range-clamped):
//   + Drama (18)                  → +0.15  serious/literary sci-fi
//   + Horror (27)                 → +0.05  sci-fi horror hybrid is legitimate
//   - Fantasy (14)                → −0.20  risk of fantasy miscategorization
//   - Family (10751)              → −0.10  risk of children's adventure
//   - Action+Adventure only       → −0.10  pure action without literary signal

function computeGenreScore(
  genreIds: number[] | undefined,
  genreNames: string[] | undefined,
  signals: SciFiFeatureSignal[],
): number {
  const hasSciFi = hasGenre(genreIds, genreNames, G_SCI_FI, 'science fiction');

  if (!hasSciFi) {
    return 0.0;
  }

  signals.push({
    group: 'genre',
    name: 'genre_sci_fi',
    matched: 'genre:878 (Science Fiction)',
    rawContribution: 1.0,
    weightedContribution: WEIGHTS.genre,
  });

  let modifier = 0.0;

  if (hasGenre(genreIds, genreNames, G_DRAMA, 'drama')) {
    modifier += 0.15;
    signals.push({
      group: 'genre',
      name: 'genre_drama_boost',
      matched: 'genre:18 (Drama) — literary sci-fi signal',
      rawContribution: 0.15,
      weightedContribution: 0.15 * WEIGHTS.genre,
    });
  }

  if (hasGenre(genreIds, genreNames, G_HORROR, 'horror')) {
    modifier += 0.05;
    signals.push({
      group: 'genre',
      name: 'genre_horror_boost',
      matched: 'genre:27 (Horror) — sci-fi horror hybrid',
      rawContribution: 0.05,
      weightedContribution: 0.05 * WEIGHTS.genre,
    });
  }

  if (hasGenre(genreIds, genreNames, G_FANTASY, 'fantasy')) {
    modifier -= 0.20;
    signals.push({
      group: 'genre',
      name: 'genre_fantasy_penalty',
      matched: 'genre:14 (Fantasy) — miscategorization risk',
      rawContribution: -0.20,
      weightedContribution: -0.20 * WEIGHTS.genre,
    });
  }

  if (hasGenre(genreIds, genreNames, G_FAMILY, 'family')) {
    modifier -= 0.10;
    signals.push({
      group: 'genre',
      name: 'genre_family_penalty',
      matched: 'genre:10751 (Family) — children\'s adventure risk',
      rawContribution: -0.10,
      weightedContribution: -0.10 * WEIGHTS.genre,
    });
  }

  const actionOnly = hasGenre(genreIds, genreNames, G_ACTION, 'action')
    && hasGenre(genreIds, genreNames, G_ADVENTURE, 'adventure')
    && !hasGenre(genreIds, genreNames, G_DRAMA, 'drama')
    && !hasGenre(genreIds, genreNames, G_HORROR, 'horror');

  if (actionOnly) {
    modifier -= 0.10;
    signals.push({
      group: 'genre',
      name: 'genre_action_adventure_penalty',
      matched: 'genre:28+12 (Action+Adventure only) — pure spectacle signal',
      rawContribution: -0.10,
      weightedContribution: -0.10 * WEIGHTS.genre,
    });
  }

  return Math.max(0, Math.min(1, 1.0 + modifier));
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature Group 2 — Keyword Signals
// ─────────────────────────────────────────────────────────────────────────────
//
// TMDB keyword metadata is checked against three tiers and a negative tier.
// Keywords are normalized before comparison.
//
// Tier 1: any single match → sub-score 1.0 immediately
// Tier 2: 0.50 per match, capped at 1.0
// Tier 3: 0.20 per match, capped at 0.60 (to prevent tier 3 flooding)
// Negative: −0.35 per match, floor 0.0

function computeKeywordScore(
  keywords: string[] | undefined,
  signals: SciFiFeatureSignal[],
): number {
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return 0.0;
  }

  const normalizedKeywords = keywords.map(norm);

  // Tier 1 check
  for (const kw of TIER1_KEYWORDS) {
    const nkw = norm(kw);
    if (normalizedKeywords.some((k) => k === nkw || k.includes(nkw))) {
      signals.push({
        group: 'keyword',
        name: 'keyword_tier1',
        matched: kw,
        rawContribution: 1.0,
        weightedContribution: WEIGHTS.keyword,
      });
      return 1.0; // Tier 1 hit = full score, stop here
    }
  }

  let tier2Sum = 0;
  let tier3Sum = 0;
  let negativeSum = 0;

  for (const kw of TIER2_KEYWORDS) {
    const nkw = norm(kw);
    if (normalizedKeywords.some((k) => k === nkw || k.includes(nkw))) {
      tier2Sum += 0.50;
      signals.push({
        group: 'keyword',
        name: 'keyword_tier2',
        matched: kw,
        rawContribution: 0.50,
        weightedContribution: Math.min(0.50, tier2Sum) * WEIGHTS.keyword,
      });
    }
  }

  for (const kw of TIER3_KEYWORDS) {
    const nkw = norm(kw);
    if (normalizedKeywords.some((k) => k === nkw || k.includes(nkw))) {
      tier3Sum += 0.20;
      signals.push({
        group: 'keyword',
        name: 'keyword_tier3',
        matched: kw,
        rawContribution: 0.20,
        weightedContribution: Math.min(0.20, tier3Sum) * WEIGHTS.keyword,
      });
    }
  }

  for (const kw of NEGATIVE_KEYWORDS) {
    const nkw = norm(kw);
    if (normalizedKeywords.some((k) => k === nkw || k.includes(nkw))) {
      negativeSum += 0.35;
      signals.push({
        group: 'keyword',
        name: 'keyword_negative',
        matched: kw,
        rawContribution: -0.35,
        weightedContribution: -0.35 * WEIGHTS.keyword,
      });
    }
  }

  const tier2Capped  = Math.min(1.0, tier2Sum);
  const tier3Capped  = Math.min(0.60, tier3Sum);
  const negCapped    = Math.min(0.80, negativeSum);

  return Math.max(0, Math.min(1, tier2Capped + tier3Capped - negCapped));
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature Group 3 — Synopsis Signals
// ─────────────────────────────────────────────────────────────────────────────
//
// The plot overview is normalized and scanned for concept cluster tokens.
// Each cluster fires (boolean) if any of its tokens appear in the text.
// synopsis_score = clamp(sum of fired cluster weights, 0, 1)

function computeSynopsisScore(
  synopsis: string | null | undefined,
  signals: SciFiFeatureSignal[],
): number {
  if (!synopsis || synopsis.trim().length === 0) {
    return 0.0;
  }

  const text = norm(synopsis);
  let total = 0;

  for (const cluster of CONCEPT_CLUSTERS) {
    const matchedToken = cluster.tokens.find((token) => text.includes(norm(token)));
    if (matchedToken) {
      total += cluster.weight;
      signals.push({
        group: 'synopsis',
        name: `synopsis_cluster_${cluster.name}`,
        matched: matchedToken,
        rawContribution: cluster.weight,
        weightedContribution: cluster.weight * WEIGHTS.synopsis,
      });
    }
  }

  return Math.min(1.0, total);
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature Group 4 — Temporal Signals
// ─────────────────────────────────────────────────────────────────────────────
//
// Only applied when genre 878 IS present. The tagging reliability of genre 878
// varies significantly by era. Pre-1950 sci-fi tagging is sparse and precise;
// post-2013 tagging has high false-positive rates from adjacent genre sweeps.

function computeTemporalScore(
  year: number | null,
  hasSciFiGenre: boolean,
  signals: SciFiFeatureSignal[],
): number {
  if (!hasSciFiGenre || year === null || !Number.isFinite(year)) {
    return 0.0;
  }

  for (const era of ERA_RELIABILITY) {
    if (year <= era.yearMax) {
      if (era.score > 0) {
        signals.push({
          group: 'temporal',
          name: 'temporal_era_reliability',
          matched: `year=${year} → era reliability ${era.score.toFixed(1)}`,
          rawContribution: era.score,
          weightedContribution: era.score * WEIGHTS.temporal,
        });
      }
      return era.score;
    }
  }

  return 0.0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature Group 5 — Ontology Alignment
// ─────────────────────────────────────────────────────────────────────────────
//
// The film's combined text (synopsis + keywords) is checked for overlap with
// each ontology node's commonKeywords. The node with the highest overlap ratio
// determines both this feature's score and the topNode assignment.
//
// For each node:
//   overlap_count = count of node.commonKeywords present in film text
//   node_score    = overlap_count / min(5, node.commonKeywords.length)
//
// ontology_score = max(node_score) over all provided nodes
// topNode        = slug of the highest-scoring node

function computeOntologyScore(
  synopsis: string | null | undefined,
  keywords: string[] | undefined,
  ontologyNodes: ReadonlyArray<SciFiOntologyNodeDef>,
  signals: SciFiFeatureSignal[],
): { score: number; topNode: string | null } {
  if (ontologyNodes.length === 0) {
    return { score: 0, topNode: null };
  }

  const filmText = norm([
    synopsis ?? '',
    ...(Array.isArray(keywords) ? keywords : []),
  ].join(' '));

  let bestScore = 0;
  let bestNode: string | null = null;

  for (const node of ontologyNodes) {
    if (node.commonKeywords.length === 0) continue;

    const denominator = Math.min(5, node.commonKeywords.length);
    let matched = 0;

    for (const kw of node.commonKeywords) {
      if (filmText.includes(norm(kw))) {
        matched++;
      }
    }

    const nodeScore = matched / denominator;
    if (nodeScore > bestScore) {
      bestScore = nodeScore;
      bestNode = node.slug;
    }
  }

  const clamped = Math.min(1.0, bestScore);
  if (clamped > 0 && bestNode) {
    signals.push({
      group: 'ontology',
      name: 'ontology_alignment',
      matched: bestNode,
      rawContribution: clamped,
      weightedContribution: clamped * WEIGHTS.ontology,
    });
  }

  return { score: clamped, topNode: bestNode };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Scorer
// ─────────────────────────────────────────────────────────────────────────────

export function scoreSciFiDeterministic(
  input: SciFiScorerInput,
  ontologyNodes: ReadonlyArray<SciFiOntologyNodeDef> = [],
): SciFiScoreResult {
  const signals: SciFiFeatureSignal[] = [];

  const hasSciFiGenre = hasGenreId(input.genreIds, G_SCI_FI)
    || hasGenreName(input.genreNames, 'science fiction');

  // Compute each group sub-score
  const genreRaw    = computeGenreScore(input.genreIds, input.genreNames, signals);
  const keywordRaw  = computeKeywordScore(input.keywords, signals);
  const synopsisRaw = computeSynopsisScore(input.synopsis, signals);
  const temporalRaw = computeTemporalScore(input.year, hasSciFiGenre, signals);
  const { score: ontologyRaw, topNode } = computeOntologyScore(
    input.synopsis,
    input.keywords,
    ontologyNodes,
    signals,
  );

  // Weighted contributions
  const genreContrib    = genreRaw    * WEIGHTS.genre;
  const keywordContrib  = keywordRaw  * WEIGHTS.keyword;
  const synopsisContrib = synopsisRaw * WEIGHTS.synopsis;
  const temporalContrib = temporalRaw * WEIGHTS.temporal;
  const ontologyContrib = ontologyRaw * WEIGHTS.ontology;

  const raw = genreContrib + keywordContrib + synopsisContrib + temporalContrib + ontologyContrib;
  const score = Math.max(0, Math.min(1, raw));

  return {
    score: Number(score.toFixed(6)),
    breakdown: {
      genre:    Number(genreContrib.toFixed(6)),
      keyword:  Number(keywordContrib.toFixed(6)),
      synopsis: Number(synopsisContrib.toFixed(6)),
      temporal: Number(temporalContrib.toFixed(6)),
      ontology: Number(ontologyContrib.toFixed(6)),
    },
    signals,
    topNode,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter — ClassifierMovieInput → SciFiScorerInput
// ─────────────────────────────────────────────────────────────────────────────
//
// Converts the existing ClassifierMovieInput format to SciFiScorerInput.
// Handles both "genre-878" ID-encoded strings and normalized genre name strings.

import type { ClassifierMovieInput } from './types';

export function toSciFiScorerInput(movie: ClassifierMovieInput): SciFiScorerInput {
  // Genre IDs may be encoded as "genre-878" strings when no DB record exists
  const encodedIds = movie.genres
    .filter((g) => /^genre-\d+$/.test(g))
    .map((g) => parseInt(g.slice(6), 10))
    .filter((id) => Number.isFinite(id));

  const namedGenres = movie.genres.filter((g) => !/^genre-\d+$/.test(g));

  return {
    title:      movie.title,
    year:       movie.year,
    genreIds:   encodedIds.length > 0 ? encodedIds : undefined,
    genreNames: namedGenres.length > 0 ? namedGenres : undefined,
    keywords:   Array.isArray(movie.keywords) ? movie.keywords : undefined,
    synopsis:   movie.synopsis ?? null,
  };
}
