import type {
  LabelingFunction,
  LabelingFunctionResult,
  NodeExclusivityRule,
  WeakSupervisionMovie,
} from './types';

type NodeClassifier = {
  strongTags: string[];
  mediumTags: string[];
  weakTags?: string[];
  excludeTags?: string[];
  titlePatterns?: RegExp[];
};

type KeywordRule = {
  tag: string;
  patterns: RegExp[];
};

const CLASSIFIER_BY_NODE: Record<string, NodeClassifier> = {
  'supernatural-horror': {
    strongTags: ['supernatural-horror', 'supernatural', 'occult', 'paranormal', 'ghost', 'haunting', 'demonic', 'possession'],
    mediumTags: ['mystery', 'fantasy', 'horror', 'religious-dread'],
    titlePatterns: [/\bghost\b/i, /\bhaunt/i, /\bconjuring\b/i, /\bparanormal\b/i, /\bexorcist\b/i, /\bgrudge\b/i, /\bring\b/i, /\binsidious\b/i, /\bamityville\b/i],
  },
  'psychological-horror': {
    strongTags: ['psychological-horror', 'paranoia', 'surreal', 'dream-logic', 'lynchian', 'identity-horror'],
    mediumTags: ['mystery', 'horror'],
    weakTags: ['psychological'],
    titlePatterns: [/\bpsycho\b/i, /\bshining\b/i, /\blighthouse\b/i, /\bpossession\b/i, /\bmaud\b/i],
  },
  'slasher-serial-killer': {
    strongTags: ['slasher-serial-killer', 'slasher', 'serial-killer', 'masked-killer', 'stalker', 'home-invasion'],
    mediumTags: ['thriller', 'crime', 'horror'],
    titlePatterns: [/\bhalloween\b/i, /\bfriday the 13th\b/i, /\bnightmare\b/i, /\bscream\b/i, /\bmaniac\b/i],
  },
  'creature-monster': {
    strongTags: ['creature-monster', 'monster', 'creature-feature', 'animal-attack', 'kaiju', 'werewolf', 'vampire', 'mutant'],
    mediumTags: ['sci-fi', 'fantasy', 'horror'],
    titlePatterns: [/\bgodzilla\b/i, /\bking kong\b/i, /\bjaws\b/i, /\bpredator\b/i, /\btremors\b/i],
  },
  'body-horror': {
    strongTags: ['body-horror', 'mutation', 'infection', 'parasite', 'medical', 'metamorphosis'],
    mediumTags: ['sci-fi-horror', 'sci-fi', 'horror'],
    titlePatterns: [/\bfly\b/i, /\bvideodrome\b/i, /\btetsuo\b/i, /\brabid\b/i, /\bcrimes of the future\b/i],
  },
  'cosmic-horror': {
    strongTags: ['cosmic-horror', 'eldritch', 'existential', 'forbidden-knowledge', 'ancient-gods'],
    mediumTags: ['sci-fi-horror', 'sci-fi', 'horror', 'mystery'],
    weakTags: ['supernatural-horror'],
    titlePatterns: [/\bevent horizon\b/i, /\bannihilation\b/i, /\bmouth of madness\b/i, /\bcthulhu\b/i, /\bvoid\b/i],
  },
  'folk-horror': {
    strongTags: ['folk-horror', 'pagan', 'ritual', 'rural', 'village-cult', 'witchcraft', 'occult'],
    mediumTags: ['fantasy', 'horror', 'mystery'],
    titlePatterns: [/\bwicker man\b/i, /\bwitch\b/i, /\bmidsommar\b/i, /\bapostle\b/i, /\bwailing\b/i],
  },
  'sci-fi-horror': {
    strongTags: ['alien', 'tech-horror', 'cybernetic', 'genetic-experiment', 'space-horror'],
    mediumTags: ['horror', 'thriller', 'mystery', 'sci-fi'],
    weakTags: ['sci-fi-horror', 'sci-fi'],
    titlePatterns: [/\balien\b/i, /\bthing\b/i, /\bannihilation\b/i, /\bscanners\b/i, /\binvisible man\b/i],
  },
  'found-footage': {
    strongTags: ['found-footage', 'mockumentary', 'screenlife', 'surveillance', 'analog-horror', 'lost-media'],
    mediumTags: ['horror', 'thriller', 'mystery'],
    titlePatterns: [/\bblair witch\b/i, /\bparanormal activity\b/i, /\brec\b/i, /\bv\/h\/s\b/i, /\blake mungo\b/i],
  },
  'survival-horror': {
    strongTags: ['survival-horror', 'survival', 'wilderness', 'siege', 'escape', 'isolation'],
    mediumTags: ['thriller', 'horror', 'adventure'],
    titlePatterns: [/\bdescent\b/i, /\bhills have eyes\b/i, /\bwrong turn\b/i, /\bcrawl\b/i, /\bshallows\b/i],
  },
  'apocalyptic-horror': {
    strongTags: ['apocalyptic-horror', 'zombie', 'outbreak', 'end-of-world', 'post-apocalyptic', 'viral-apocalypse'],
    mediumTags: ['sci-fi-horror', 'sci-fi', 'horror'],
    titlePatterns: [/\b28 days later\b/i, /\bdawn of the dead\b/i, /\bnight of the living dead\b/i, /\btrain to busan\b/i, /\bpontypool\b/i],
  },
  'gothic-horror': {
    strongTags: ['gothic-horror', 'gothic', 'victorian', 'period-gothic', 'haunted-house'],
    mediumTags: ['fantasy', 'horror', 'drama'],
    titlePatterns: [/\bdracula\b/i, /\bfrankenstein\b/i, /\bnosferatu\b/i, /\bcrimson peak\b/i, /\bwoman in black\b/i],
  },
  'horror-comedy': {
    strongTags: ['satire', 'parody', 'absurdist-horror', 'dark-comedy-horror'],
    mediumTags: ['comedy', 'horror', 'fantasy'],
    weakTags: ['horror-comedy', 'fantasy'],
    titlePatterns: [/\bshaun of the dead\b/i, /\bwhat we do in the shadows\b/i, /\btucker and dale\b/i, /\bre-animator\b/i, /\barmy of darkness\b/i],
  },
  'splatter-extreme': {
    strongTags: ['splatter-extreme', 'gore', 'extreme', 'transgressive', 'new-french-extremity', 'shock-cinema'],
    mediumTags: ['horror', 'thriller', 'crime'],
    titlePatterns: [/\bmartyrs\b/i, /\bhostel\b/i, /\bsaw\b/i, /\bterrifier\b/i, /\bcannibal\b/i],
  },
  'social-domestic-horror': {
    strongTags: ['social-allegory-horror', 'class-horror', 'family-horror', 'domestic-horror'],
    mediumTags: ['horror', 'thriller', 'drama'],
    weakTags: ['social-domestic-horror', 'drama'],
    titlePatterns: [/\bget out\b/i, /\bstepford\b/i, /\bhereditary\b/i, /\bus\b/i, /\bparasite\b/i],
  },
  'experimental-horror': {
    strongTags: ['experimental-horror', 'avant-garde', 'surreal', 'dream-logic', 'lynchian'],
    mediumTags: ['horror', 'drama', 'fantasy'],
    weakTags: ['psychological'],
    excludeTags: ['horror-comedy', 'slasher'],
    titlePatterns: [/\beraserhead\b/i, /\bbegotten\b/i, /\bskinamarink\b/i, /\bhausu\b/i, /\bbeyond the black rainbow\b/i],
  },
};

const KEYWORD_RULES: KeywordRule[] = [
  { tag: 'supernatural-horror', patterns: [/\bghost\b/i, /\bhaunt/i, /\bparanormal\b/i, /\bpossession\b/i, /\bdemon/i, /\bexorc/i, /\bcurse/i] },
  { tag: 'psychological-horror', patterns: [/\bpsychological\b/i, /\bparanoia\b/i, /\bmadness\b/i, /\bdream\b/i, /\bsurreal\b/i] },
  { tag: 'slasher-serial-killer', patterns: [/\bslasher\b/i, /\bserial killer\b/i, /\bstalker\b/i, /\bmasked killer\b/i, /\bhome invasion\b/i] },
  { tag: 'creature-monster', patterns: [/\bmonster\b/i, /\bcreature\b/i, /\bwerewolf\b/i, /\bvampire\b/i, /\bshark\b/i, /\bkaiju\b/i, /\bcryptid\b/i] },
  { tag: 'body-horror', patterns: [/\bbody horror\b/i, /\bmutation\b/i, /\binfection\b/i, /\bparasite\b/i, /\bmetamorphosis\b/i, /\bdisease\b/i] },
  { tag: 'cosmic-horror', patterns: [/\bcosmic\b/i, /\beldritch\b/i, /\blovecraft\b/i, /\bancient god/i, /\bforbidden knowledge\b/i] },
  { tag: 'folk-horror', patterns: [/\bfolk horror\b/i, /\bpagan\b/i, /\britual\b/i, /\bcult ritual\b/i, /\bvillage\b/i] },
  { tag: 'sci-fi-horror', patterns: [/\bsci[\s-]?fi\b/i, /\balien\b/i, /\bspace horror\b/i, /\bcybernetic\b/i, /\bgenetic experiment\b/i] },
  { tag: 'found-footage', patterns: [/\bfound footage\b/i, /\bmockumentary\b/i, /\bscreenlife\b/i, /\bsurveillance\b/i, /\banalog horror\b/i] },
  { tag: 'survival-horror', patterns: [/\bsurvival\b/i, /\bsiege\b/i, /\bwilderness\b/i, /\bescape\b/i, /\bisolation\b/i] },
  { tag: 'apocalyptic-horror', patterns: [/\bapocalypse\b/i, /\bpost-apocalyptic\b/i, /\boutbreak\b/i, /\bzombie\b/i, /\bend of the world\b/i] },
  { tag: 'gothic-horror', patterns: [/\bgothic\b/i, /\bvictorian\b/i, /\bcastle\b/i, /\bhaunted house\b/i] },
  { tag: 'horror-comedy', patterns: [/\bhorror comedy\b/i, /\bparody\b/i, /\bsatire\b/i, /\bdark comedy\b/i, /\bcamp\b/i] },
  { tag: 'splatter-extreme', patterns: [/\bsplatter\b/i, /\bgore\b/i, /\bextreme horror\b/i, /\btransgressive\b/i, /\btorture\b/i] },
  { tag: 'social-domestic-horror', patterns: [/\bsocial horror\b/i, /\bdomestic horror\b/i, /\bfamily trauma\b/i, /\bclass horror\b/i, /\bsuburban horror\b/i] },
  { tag: 'experimental-horror', patterns: [/\bexperimental\b/i, /\bavant[- ]garde\b/i, /\blynchian\b/i, /\bdream logic\b/i] },
];

export const DEFAULT_NODE_THRESHOLDS: Record<string, number> = {
  'supernatural-horror': 0.62,
  'psychological-horror': 0.68,
  'slasher-serial-killer': 0.64,
  'creature-monster': 0.64,
  'body-horror': 0.66,
  'cosmic-horror': 0.63,
  'folk-horror': 0.65,
  'sci-fi-horror': 0.67,
  'found-footage': 0.64,
  'survival-horror': 0.64,
  'apocalyptic-horror': 0.65,
  'gothic-horror': 0.64,
  'horror-comedy': 0.7,
  'splatter-extreme': 0.64,
  'social-domestic-horror': 0.66,
  'experimental-horror': 0.62,
};

export const NODE_EXCLUSIVITY_RULES: NodeExclusivityRule[] = [
  { a: 'folk-horror', b: 'slasher-serial-killer', strictness: 'soft', reason: 'ritual slowburn rarely overlaps slasher grammar' },
  { a: 'folk-horror', b: 'horror-comedy', strictness: 'hard', reason: 'folk dread tone is usually incompatible with overt comedy' },
  { a: 'folk-horror', b: 'found-footage', strictness: 'soft', reason: 'folk period framing rarely uses diegetic camera realism' },
  { a: 'folk-horror', b: 'splatter-extreme', strictness: 'soft', reason: 'folk emphasis is atmosphere over explicit gore' },
  { a: 'cosmic-horror', b: 'horror-comedy', strictness: 'hard', reason: 'existential dread rarely overlaps parody register' },
  { a: 'cosmic-horror', b: 'slasher-serial-killer', strictness: 'soft', reason: 'cosmic scale is usually non-human threat driven' },
  { a: 'cosmic-horror', b: 'found-footage', strictness: 'soft', reason: 'cosmic films rarely use handheld realism formats' },
  { a: 'cosmic-horror', b: 'social-domestic-horror', strictness: 'soft', reason: 'cosmic ontology and domestic allegory rarely co-anchor' },
  { a: 'gothic-horror', b: 'found-footage', strictness: 'hard', reason: 'gothic formalism conflicts with documentary style framing' },
  { a: 'gothic-horror', b: 'splatter-extreme', strictness: 'soft', reason: 'gothic mood is typically less transgressive-gore centric' },
  { a: 'gothic-horror', b: 'apocalyptic-horror', strictness: 'soft', reason: 'gothic inheritance stories rarely become collapse narratives' },
  { a: 'horror-comedy', b: 'splatter-extreme', strictness: 'soft', reason: 'comedic release and relentless extremity rarely co-dominate' },
  { a: 'horror-comedy', b: 'body-horror', strictness: 'soft', reason: 'visceral transformation focus is rarely comic-forward' },
  { a: 'horror-comedy', b: 'apocalyptic-horror', strictness: 'soft', reason: 'collapse stakes rarely preserve comic center of gravity' },
  { a: 'horror-comedy', b: 'psychological-horror', strictness: 'soft', reason: 'psychological dread tone rarely overlaps broad comedy' },
  { a: 'experimental-horror', b: 'slasher-serial-killer', strictness: 'hard', reason: 'formal experimentation rarely follows slasher schema' },
  { a: 'experimental-horror', b: 'found-footage', strictness: 'soft', reason: 'experimental abstraction differs from faux-realism constraints' },
  { a: 'experimental-horror', b: 'apocalyptic-horror', strictness: 'soft', reason: 'experimental works rarely foreground world-collapse plotting' },
  { a: 'experimental-horror', b: 'survival-horror', strictness: 'soft', reason: 'survival mechanics rarely pair with abstract structure' },
  { a: 'social-domestic-horror', b: 'creature-monster', strictness: 'soft', reason: 'domestic allegory and creature spectacle seldom co-lead' },
  { a: 'social-domestic-horror', b: 'splatter-extreme', strictness: 'soft', reason: 'social/domestic focus is rarely splatter-driven' },
  { a: 'social-domestic-horror', b: 'found-footage', strictness: 'soft', reason: 'domestic allegory is less often diegetic-camera formatted' },
  { a: 'social-domestic-horror', b: 'apocalyptic-horror', strictness: 'soft', reason: 'household-scale allegory rarely expands to full collapse' },
  { a: 'supernatural-horror', b: 'slasher-serial-killer', strictness: 'soft', reason: 'supernatural threat and human slasher logic often diverge' },
  { a: 'supernatural-horror', b: 'splatter-extreme', strictness: 'soft', reason: 'occult/haunting emphasis usually not extreme-gore dominant' },
  { a: 'supernatural-horror', b: 'horror-comedy', strictness: 'soft', reason: 'haunting tone rarely supports sustained comedic framing' },
  { a: 'psychological-horror', b: 'creature-monster', strictness: 'soft', reason: 'internal dread focus and creature spectacle often separate' },
  { a: 'psychological-horror', b: 'apocalyptic-horror', strictness: 'soft', reason: 'subjective paranoia rarely aligns with outbreak macro-plot' },
  { a: 'psychological-horror', b: 'horror-comedy', strictness: 'soft', reason: 'psychological pressure typically resists comedic release' },
  { a: 'slasher-serial-killer', b: 'cosmic-horror', strictness: 'soft', reason: 'human-killer mechanics differ from cosmic existential threat' },
  { a: 'slasher-serial-killer', b: 'folk-horror', strictness: 'soft', reason: 'slasher kinetics and folk ritual structure rarely co-dominate' },
  { a: 'slasher-serial-killer', b: 'gothic-horror', strictness: 'soft', reason: 'slasher pacing and gothic atmosphere are often distinct modes' },
  { a: 'slasher-serial-killer', b: 'experimental-horror', strictness: 'hard', reason: 'formulaic slasher grammar conflicts with avant-garde design' },
  { a: 'creature-monster', b: 'social-domestic-horror', strictness: 'soft', reason: 'monster-action framing is rarely domestic allegory first' },
  { a: 'creature-monster', b: 'experimental-horror', strictness: 'soft', reason: 'creature-feature clarity rarely pairs with abstract form' },
  { a: 'creature-monster', b: 'horror-comedy', strictness: 'soft', reason: 'creature threat usually stays earnest instead of comedic' },
  { a: 'body-horror', b: 'horror-comedy', strictness: 'soft', reason: 'body anxiety stories are less frequently played for laughs' },
  { a: 'body-horror', b: 'folk-horror', strictness: 'soft', reason: 'corporeal mutation and ritual landscape are usually separate cores' },
  { a: 'body-horror', b: 'gothic-horror', strictness: 'soft', reason: 'body-transformation focus and gothic formalism often diverge' },
  { a: 'found-footage', b: 'gothic-horror', strictness: 'hard', reason: 'diegetic camera grammar conflicts with period-gothic style' },
  { a: 'found-footage', b: 'experimental-horror', strictness: 'soft', reason: 'documentary realism and abstract experimentation rarely align' },
  { a: 'found-footage', b: 'horror-comedy', strictness: 'soft', reason: 'found-footage tonal contract tends to avoid overt comedy' },
  { a: 'survival-horror', b: 'experimental-horror', strictness: 'soft', reason: 'survival plot mechanics are usually not experimental-first' },
  { a: 'survival-horror', b: 'gothic-horror', strictness: 'soft', reason: 'survival urgency and gothic mood/period are rarely co-primary' },
  { a: 'apocalyptic-horror', b: 'gothic-horror', strictness: 'soft', reason: 'macro-collapse narratives rarely stay gothic in mode' },
  { a: 'apocalyptic-horror', b: 'horror-comedy', strictness: 'soft', reason: 'end-state dread and comedy-first intent seldom co-dominate' },
  { a: 'apocalyptic-horror', b: 'experimental-horror', strictness: 'soft', reason: 'collapse plots are usually conventional in storytelling form' },
  { a: 'splatter-extreme', b: 'gothic-horror', strictness: 'soft', reason: 'extreme transgression rarely aligns with gothic restraint' },
  { a: 'splatter-extreme', b: 'social-domestic-horror', strictness: 'soft', reason: 'social/domestic terror tends to avoid extreme splatter framing' },
  { a: 'splatter-extreme', b: 'folk-horror', strictness: 'soft', reason: 'folk ritual narratives generally prioritize atmosphere over gore' },
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function corpus(movie: WeakSupervisionMovie): string {
  return [movie.title, ...movie.genres.map((tag) => tag.replace(/-/g, ' '))].join(' ').toLowerCase();
}

function hitTags(movie: WeakSupervisionMovie, tags: string[]): string[] {
  const set = new Set(movie.genres);
  return tags.filter((tag) => set.has(tag));
}

function result(label: -1 | 0 | 1, confidence: number, evidence: string[] = []): LabelingFunctionResult {
  return {
    label,
    confidence: clamp01(confidence),
    ...(evidence.length > 0 ? { evidence } : {}),
  };
}

function createPositiveGenreLf(nodeSlug: string, name: string, tags: string[], confidence: number): LabelingFunction {
  return {
    name,
    nodeSlug,
    apply: (movie) => {
      const hits = hitTags(movie, tags);
      return hits.length > 0 ? result(1, confidence, hits.map((hit) => `tag:${hit}`)) : result(0, 0);
    },
  };
}

function createNegativeGenreLf(nodeSlug: string, name: string, tags: string[], confidence: number): LabelingFunction {
  return {
    name,
    nodeSlug,
    apply: (movie) => {
      const hits = hitTags(movie, tags);
      return hits.length > 0 ? result(-1, confidence, hits.map((hit) => `negative-tag:${hit}`)) : result(0, 0);
    },
  };
}

function createTitlePatternLf(nodeSlug: string, pattern: RegExp): LabelingFunction {
  return {
    name: `${nodeSlug}.title.${pattern.source}`,
    nodeSlug,
    apply: (movie) => {
      if (pattern.test(movie.title.toLowerCase())) {
        return result(1, 0.82, [`title-pattern:${pattern.source}`]);
      }
      return result(0, 0);
    },
  };
}

function createKeywordLf(nodeSlug: string, patterns: RegExp[]): LabelingFunction {
  return {
    name: `${nodeSlug}.keyword-pattern`,
    nodeSlug,
    apply: (movie) => {
      const text = corpus(movie);
      const matches = patterns.filter((pattern) => pattern.test(text));
      if (matches.length === 0) {
        return result(0, 0);
      }
      return result(1, 0.7, matches.slice(0, 3).map((pattern) => `keyword:${pattern.source}`));
    },
  };
}

function createObviousNegativeLf(nodeSlug: string): LabelingFunction[] {
  if (nodeSlug === 'horror-comedy') {
    return [{
      name: 'horror-comedy.negative.grim-psych-no-comedy',
      nodeSlug,
      apply: (movie) => {
        const set = new Set(movie.genres);
        const hasComedy = set.has('comedy') || set.has('horror-comedy') || set.has('parody') || set.has('satire');
        const hasGrimPsych = set.has('psychological-horror') || set.has('social-domestic-horror') || set.has('gothic-horror');
        if (!hasComedy && hasGrimPsych) {
          return result(-1, 0.78, ['negative:grim-psych-without-comedy']);
        }
        return result(0, 0);
      },
    }];
  }

  if (nodeSlug === 'cosmic-horror') {
    return [{
      name: 'cosmic-horror.negative.comedic-register',
      nodeSlug,
      apply: (movie) => {
        const set = new Set(movie.genres);
        if (set.has('horror-comedy') || set.has('parody') || set.has('satire')) {
          return result(-1, 0.82, ['negative:comedic-register']);
        }
        return result(0, 0);
      },
    }];
  }

  if (nodeSlug === 'folk-horror') {
    return [{
      name: 'folk-horror.negative.pure-slasher',
      nodeSlug,
      apply: (movie) => {
        const set = new Set(movie.genres);
        if (set.has('slasher') && !set.has('folk-horror') && !set.has('ritual') && !set.has('pagan')) {
          return result(-1, 0.74, ['negative:pure-slasher-signal']);
        }
        return result(0, 0);
      },
    }];
  }

  return [];
}

export function buildSeason1LabelingFunctions(nodeSlugs?: string[]): LabelingFunction[] {
  const allowed = nodeSlugs ? new Set(nodeSlugs) : null;
  const lfs: LabelingFunction[] = [];

  for (const [nodeSlug, classifier] of Object.entries(CLASSIFIER_BY_NODE)) {
    if (allowed && !allowed.has(nodeSlug)) {
      continue;
    }

    lfs.push(createPositiveGenreLf(nodeSlug, `${nodeSlug}.positive.strong-tags`, classifier.strongTags, 0.9));
    lfs.push(createPositiveGenreLf(nodeSlug, `${nodeSlug}.positive.medium-tags`, classifier.mediumTags, 0.62));
    lfs.push(createPositiveGenreLf(nodeSlug, `${nodeSlug}.positive.weak-tags`, classifier.weakTags ?? [], 0.46));

    for (const pattern of classifier.titlePatterns ?? []) {
      lfs.push(createTitlePatternLf(nodeSlug, pattern));
    }

    if ((classifier.excludeTags ?? []).length > 0) {
      lfs.push(createNegativeGenreLf(nodeSlug, `${nodeSlug}.negative.exclude-tags`, classifier.excludeTags ?? [], 0.82));
    }

    const keywordRule = KEYWORD_RULES.find((rule) => rule.tag === nodeSlug);
    if (keywordRule) {
      lfs.push(createKeywordLf(nodeSlug, keywordRule.patterns));
    }

    lfs.push(...createObviousNegativeLf(nodeSlug));
  }

  return lfs;
}

export function getExclusivityConflicts(nodeSlug: string, assignedNodes: Iterable<string>): NodeExclusivityRule[] {
  const assigned = new Set(assignedNodes);
  return NODE_EXCLUSIVITY_RULES.filter((rule) => {
    return (rule.a === nodeSlug && assigned.has(rule.b)) || (rule.b === nodeSlug && assigned.has(rule.a));
  });
}
