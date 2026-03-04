export type AuditMovie = {
  id: string;
  tmdbId?: number;
  title: string;
  year: number | null;
  genres: string[];
};

export type NodeScoreEvidence = {
  score: number;
  passed: boolean;
  strongHits: string[];
  mediumHits: string[];
  weakHits: string[];
  excludeHits: string[];
  titleHits: string[];
  minScore: number;
};

export type GoldFixtureSample = {
  title: string;
  year: number;
  expectedNodes: string[];
  tmdbId?: number;
};

export type GoldFixture = {
  version: string;
  seasonSlug: string;
  packSlug: string;
  samples: GoldFixtureSample[];
};

type NodeClassifier = {
  strongTags: string[];
  mediumTags: string[];
  weakTags?: string[];
  excludeTags?: string[];
  titlePatterns?: RegExp[];
  minScore: number;
};

export const SEASON1_DISTINCT_NODE_PAIRS: Array<[string, string]> = [
  ['slasher-serial-killer', 'folk-horror'],
  ['slasher-serial-killer', 'horror-comedy'],
  ['found-footage', 'gothic-horror'],
  ['splatter-extreme', 'gothic-horror'],
];

export const SEASON1_CLASSIFIER_BY_NODE: Record<string, NodeClassifier> = {
  'supernatural-horror': {
    strongTags: ['supernatural-horror', 'supernatural', 'occult', 'paranormal', 'ghost', 'haunting', 'demonic', 'possession'],
    mediumTags: ['mystery', 'fantasy', 'horror', 'religious-dread'],
    titlePatterns: [/\bghost\b/i, /\bhaunt/i, /\bconjuring\b/i, /\bparanormal\b/i, /\bexorcist\b/i, /\bgrudge\b/i, /\bring\b/i, /\binsidious\b/i, /\bamityville\b/i],
    minScore: 2.4,
  },
  'psychological-horror': {
    strongTags: ['psychological-horror', 'paranoia', 'surreal', 'dream-logic', 'lynchian', 'identity-horror'],
    mediumTags: ['mystery', 'horror'],
    weakTags: ['psychological'],
    titlePatterns: [/\bpsycho\b/i, /\bshining\b/i, /\blighthouse\b/i, /\bpossession\b/i, /\bmaud\b/i],
    minScore: 3.4,
  },
  'slasher-serial-killer': {
    strongTags: ['slasher-serial-killer', 'slasher', 'serial-killer', 'masked-killer', 'stalker', 'home-invasion'],
    mediumTags: ['thriller', 'crime', 'horror'],
    titlePatterns: [/\bhalloween\b/i, /\bfriday the 13th\b/i, /\bnightmare\b/i, /\bscream\b/i, /\bmaniac\b/i],
    minScore: 2.8,
  },
  'creature-monster': {
    strongTags: ['creature-monster', 'monster', 'creature-feature', 'animal-attack', 'kaiju', 'werewolf', 'vampire', 'mutant'],
    mediumTags: ['sci-fi', 'fantasy', 'horror'],
    titlePatterns: [/\bgodzilla\b/i, /\bking kong\b/i, /\bjaws\b/i, /\bpredator\b/i, /\btremors\b/i],
    minScore: 2.8,
  },
  'body-horror': {
    strongTags: ['body-horror', 'mutation', 'infection', 'parasite', 'medical', 'metamorphosis'],
    mediumTags: ['sci-fi-horror', 'sci-fi', 'horror'],
    titlePatterns: [/\bfly\b/i, /\bvideodrome\b/i, /\btetsuo\b/i, /\brabid\b/i, /\bcrimes of the future\b/i],
    minScore: 2.9,
  },
  'cosmic-horror': {
    strongTags: ['cosmic-horror', 'eldritch', 'existential', 'forbidden-knowledge', 'ancient-gods'],
    mediumTags: ['sci-fi-horror', 'sci-fi', 'horror', 'mystery'],
    weakTags: ['supernatural-horror'],
    titlePatterns: [/\bevent horizon\b/i, /\bannihilation\b/i, /\bmouth of madness\b/i, /\bcthulhu\b/i, /\bvoid\b/i],
    minScore: 2.6,
  },
  'folk-horror': {
    strongTags: ['folk-horror', 'pagan', 'ritual', 'rural', 'village-cult', 'witchcraft', 'occult'],
    mediumTags: ['fantasy', 'horror', 'mystery'],
    titlePatterns: [/\bwicker man\b/i, /\bwitch\b/i, /\bmidsommar\b/i, /\bapostle\b/i, /\bwailing\b/i],
    minScore: 2.9,
  },
  'sci-fi-horror': {
    strongTags: ['alien', 'tech-horror', 'cybernetic', 'genetic-experiment', 'space-horror'],
    mediumTags: ['horror', 'thriller', 'mystery', 'sci-fi'],
    weakTags: ['sci-fi-horror', 'sci-fi'],
    titlePatterns: [/\balien\b/i, /\bthing\b/i, /\bannihilation\b/i, /\bscanners\b/i, /\binvisible man\b/i],
    minScore: 3.4,
  },
  'found-footage': {
    strongTags: ['found-footage', 'mockumentary', 'screenlife', 'surveillance', 'analog-horror', 'lost-media'],
    mediumTags: ['horror', 'thriller', 'mystery'],
    titlePatterns: [/\bblair witch\b/i, /\bparanormal activity\b/i, /\brec\b/i, /\bv\/h\/s\b/i, /\blake mungo\b/i],
    minScore: 2.8,
  },
  'survival-horror': {
    strongTags: ['survival-horror', 'survival', 'wilderness', 'siege', 'escape', 'isolation'],
    mediumTags: ['thriller', 'horror', 'adventure'],
    titlePatterns: [/\bdescent\b/i, /\bhills have eyes\b/i, /\bwrong turn\b/i, /\bcrawl\b/i, /\bshallows\b/i],
    minScore: 2.8,
  },
  'apocalyptic-horror': {
    strongTags: ['apocalyptic-horror', 'zombie', 'outbreak', 'end-of-world', 'post-apocalyptic', 'viral-apocalypse'],
    mediumTags: ['sci-fi-horror', 'sci-fi', 'horror'],
    titlePatterns: [/\b28 days later\b/i, /\bdawn of the dead\b/i, /\bnight of the living dead\b/i, /\btrain to busan\b/i, /\bpontypool\b/i],
    minScore: 2.9,
  },
  'gothic-horror': {
    strongTags: ['gothic-horror', 'gothic', 'victorian', 'period-gothic', 'haunted-house'],
    mediumTags: ['fantasy', 'horror', 'drama'],
    titlePatterns: [/\bdracula\b/i, /\bfrankenstein\b/i, /\bnosferatu\b/i, /\bcrimson peak\b/i, /\bwoman in black\b/i],
    minScore: 2.8,
  },
  'horror-comedy': {
    strongTags: ['satire', 'parody', 'absurdist-horror', 'dark-comedy-horror'],
    mediumTags: ['comedy', 'horror', 'fantasy'],
    weakTags: ['horror-comedy', 'fantasy'],
    titlePatterns: [/\bshaun of the dead\b/i, /\bwhat we do in the shadows\b/i, /\btucker and dale\b/i, /\bre-animator\b/i, /\barmy of darkness\b/i],
    minScore: 3.5,
  },
  'splatter-extreme': {
    strongTags: ['splatter-extreme', 'gore', 'extreme', 'transgressive', 'new-french-extremity', 'shock-cinema'],
    mediumTags: ['horror', 'thriller', 'crime'],
    titlePatterns: [/\bmartyrs\b/i, /\bhostel\b/i, /\bsaw\b/i, /\bterrifier\b/i, /\bcannibal\b/i],
    minScore: 2.8,
  },
  'social-domestic-horror': {
    strongTags: ['social-allegory-horror', 'class-horror', 'family-horror', 'domestic-horror'],
    mediumTags: ['horror', 'thriller', 'drama'],
    weakTags: ['social-domestic-horror', 'drama'],
    titlePatterns: [/\bget out\b/i, /\bstepford\b/i, /\bhereditary\b/i, /\bus\b/i, /\bparasite\b/i],
    minScore: 3,
  },
  'experimental-horror': {
    strongTags: ['experimental-horror', 'avant-garde', 'surreal', 'dream-logic', 'lynchian'],
    mediumTags: ['horror', 'drama', 'fantasy'],
    weakTags: ['psychological'],
    excludeTags: ['horror-comedy', 'slasher'],
    titlePatterns: [/\beraserhead\b/i, /\bbegotten\b/i, /\bskinamarink\b/i, /\bhausu\b/i, /\bbeyond the black rainbow\b/i],
    minScore: 2.6,
  },
};

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectHits(values: Set<string>, tags: string[]): string[] {
  return tags.filter((tag) => values.has(tag));
}

export function scoreMovieForNode(nodeSlug: string, movie: AuditMovie): NodeScoreEvidence {
  const classifier = SEASON1_CLASSIFIER_BY_NODE[nodeSlug];
  if (!movie.genres.includes('horror')) {
    return {
      score: Number.NEGATIVE_INFINITY,
      passed: false,
      strongHits: [],
      mediumHits: [],
      weakHits: [],
      excludeHits: [],
      titleHits: [],
      minScore: classifier?.minScore ?? Number.POSITIVE_INFINITY,
    };
  }

  if (!classifier) {
    const score = movie.genres.includes(nodeSlug) ? 10 : 1;
    return {
      score,
      passed: Number.isFinite(score),
      strongHits: movie.genres.includes(nodeSlug) ? [nodeSlug] : [],
      mediumHits: [],
      weakHits: [],
      excludeHits: [],
      titleHits: [],
      minScore: 0,
    };
  }

  const tagSet = new Set(movie.genres);
  const strongHits = collectHits(tagSet, classifier.strongTags);
  const mediumHits = collectHits(tagSet, classifier.mediumTags);
  const weakHits = collectHits(tagSet, classifier.weakTags ?? []);
  const excludeHits = collectHits(tagSet, classifier.excludeTags ?? []);
  const titleHits = (classifier.titlePatterns ?? [])
    .filter((pattern) => pattern.test(movie.title))
    .map((pattern) => pattern.source);

  let score = 0;
  score += Math.min(strongHits.length, 3) * 2;
  score += Math.min(mediumHits.length, 3) * 0.8;
  score += Math.min(weakHits.length, 2) * 0.35;
  score -= excludeHits.length * 0.7;
  score += Math.min(titleHits.length, 2) * 1.8;

  const passed = score >= classifier.minScore;

  return {
    score: passed ? score : Number.NEGATIVE_INFINITY,
    passed,
    strongHits,
    mediumHits,
    weakHits,
    excludeHits,
    titleHits,
    minScore: classifier.minScore,
  };
}

export function evaluateGoldSample(expectedNodes: string[], assignedNodes: string[]): {
  expected: string[];
  assigned: string[];
  overlap: string[];
  missingExpected: string[];
  unexpectedAssigned: string[];
  matched: boolean;
} {
  const expected = [...new Set(expectedNodes.map((item) => item.toLowerCase()))];
  const assigned = [...new Set(assignedNodes.map((item) => item.toLowerCase()))];
  const expectedSet = new Set(expected);
  const assignedSet = new Set(assigned);
  const overlap = expected.filter((item) => assignedSet.has(item));
  const missingExpected = expected.filter((item) => !assignedSet.has(item));
  const unexpectedAssigned = assigned.filter((item) => !expectedSet.has(item));
  return {
    expected,
    assigned,
    overlap,
    missingExpected,
    unexpectedAssigned,
    matched: overlap.length > 0,
  };
}

export function detectUnexpectedCooccurrence(
  assignmentsByMovie: Map<string, string[]>,
  nodePairs: Array<[string, string]> = SEASON1_DISTINCT_NODE_PAIRS,
): Array<{ pair: [string, string]; movieIds: string[] }> {
  const results: Array<{ pair: [string, string]; movieIds: string[] }> = [];
  for (const pair of nodePairs) {
    const [a, b] = pair;
    const movieIds: string[] = [];
    for (const [movieId, nodes] of assignmentsByMovie.entries()) {
      const set = new Set(nodes);
      if (set.has(a) && set.has(b)) {
        movieIds.push(movieId);
      }
    }
    results.push({ pair, movieIds });
  }
  return results;
}
