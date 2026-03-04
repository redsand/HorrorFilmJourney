import type { LabelingFunction, LabelingFunctionResult, NodeExclusivityRule, WeakSupervisionMovie } from '../types';
import type { BuildSeasonPluginLfInput, SeasonWeakSupervisionPlugin } from './types';
import { SEASON1_NODE_GOVERNANCE_CONFIG } from '@/config/seasons/season1-node-governance';

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

type Season1TargetedPatternRule = {
  nodeSlug: string;
  name: string;
  patterns: RegExp[];
  confidence: number;
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

const EXCLUSIVITY_RULES: NodeExclusivityRule[] = [
  { a: 'folk-horror', b: 'slasher-serial-killer', strictness: 'soft', reason: 'ritual slowburn rarely overlaps slasher grammar' },
  { a: 'folk-horror', b: 'horror-comedy', strictness: 'hard', reason: 'folk dread tone is usually incompatible with overt comedy' },
  { a: 'gothic-horror', b: 'found-footage', strictness: 'hard', reason: 'gothic formalism conflicts with documentary style framing' },
  { a: 'experimental-horror', b: 'slasher-serial-killer', strictness: 'hard', reason: 'formal experimentation rarely follows slasher schema' },
];

const TARGETED_OMISSION_RULES: Season1TargetedPatternRule[] = [
  {
    nodeSlug: 'social-domestic-horror',
    name: 'social-domestic-horror.targeted.get-out-social-thriller',
    patterns: [/\bget out\b/i, /\bsocial thriller\b/i, /\brace|racial\b/i, /\bclass\b/i, /\bsuburban\b/i],
    confidence: 0.84,
  },
  {
    nodeSlug: 'slasher-serial-killer',
    name: 'slasher-serial-killer.targeted.scream-franchise',
    patterns: [/\bscream\b/i, /\bghostface\b/i, /\bfinal girl\b/i],
    confidence: 0.83,
  },
  {
    nodeSlug: 'slasher-serial-killer',
    name: 'slasher-serial-killer.targeted.fnaf-and-giallo',
    patterns: [/\bfive nights at freddy'?s\b/i, /\bdeep red\b/i, /\bgiallo\b/i, /\bmasked killer\b/i],
    confidence: 0.81,
  },
  {
    nodeSlug: 'supernatural-horror',
    name: 'supernatural-horror.targeted.conjuring-universe',
    patterns: [/\bconjuring\b/i, /\binsidious\b/i, /\bparanormal\b/i, /\bexorcism\b/i],
    confidence: 0.82,
  },
  {
    nodeSlug: 'sci-fi-horror',
    name: 'sci-fi-horror.targeted.infection-collapse',
    patterns: [/\b28 days later\b/i, /\b28 weeks later\b/i, /\boutbreak\b/i, /\binfected\b/i, /\bquarantine\b/i],
    confidence: 0.8,
  },
  {
    nodeSlug: 'sci-fi-horror',
    name: 'sci-fi-horror.targeted.space-lab-containment',
    patterns: [/\bspace\b/i, /\bspaceship\b/i, /\blab\b/i, /\bexperiment\b/i, /\bcontainment\b/i, /\borganism\b/i],
    confidence: 0.79,
  },
  {
    nodeSlug: 'survival-horror',
    name: 'survival-horror.targeted.outbreak-siege',
    patterns: [/\b28 years later\b/i, /\bbone temple\b/i, /\boutbreak\b/i, /\binfected\b/i, /\bquarantine\b/i, /\bsiege\b/i],
    confidence: 0.82,
  },
  {
    nodeSlug: 'survival-horror',
    name: 'survival-horror.targeted.isolation-trap',
    patterns: [/\bfrom dusk till dawn\b/i, /\bstranded\b/i, /\btrapped\b/i, /\bescape\b/i, /\bnight siege\b/i],
    confidence: 0.79,
  },
  {
    nodeSlug: 'apocalyptic-horror',
    name: 'apocalyptic-horror.targeted.collapse-signals',
    patterns: [/\boutbreak\b/i, /\bpandemic\b/i, /\bend of the world\b/i, /\bpost-apocalyptic\b/i, /\bcollapse\b/i],
    confidence: 0.8,
  },
  {
    nodeSlug: 'apocalyptic-horror',
    name: 'apocalyptic-horror.targeted.zombie-collapse',
    patterns: [/\bzombie\b/i, /\bquarantine\b/i, /\bmass panic\b/i, /\bevacuat/i, /\binfected city\b/i],
    confidence: 0.8,
  },
  {
    nodeSlug: 'apocalyptic-horror',
    name: 'apocalyptic-horror.targeted.years-later-franchise',
    patterns: [/\b28 years later\b/i, /\b28 years later: the bone temple\b/i, /\bcollapse\b/i, /\bviral\b/i],
    confidence: 0.82,
  },
  {
    nodeSlug: 'supernatural-horror',
    name: 'supernatural-horror.targeted.curse-and-hellgate',
    patterns: [/\breturn to silent hill\b/i, /\bconstantine\b/i, /\bthe omen\b/i, /\bcursed town\b/i, /\bdemonic\b/i],
    confidence: 0.82,
  },
  {
    nodeSlug: 'supernatural-horror',
    name: 'supernatural-horror.targeted.possessed-animatronic',
    patterns: [/\bfive nights at freddy'?s\b/i, /\bpossessed\b/i, /\bhaunted attraction\b/i, /\banimatronic\b/i],
    confidence: 0.8,
  },
  {
    nodeSlug: 'gothic-horror',
    name: 'gothic-horror.targeted.modern-gothic-icons',
    patterns: [/\bdracula\b/i, /\bthe crow\b/i, /\bromantic gothic\b/i, /\bgothic revenge\b/i],
    confidence: 0.81,
  },
  {
    nodeSlug: 'psychological-horror',
    name: 'psychological-horror.targeted.family-manipulation',
    patterns: [/\borphan\b/i, /\bspeak no evil\b/i, /\bstonehearst asylum\b/i, /\bgaslighting\b/i, /\bpsychological abuse\b/i],
    confidence: 0.82,
  },
  {
    nodeSlug: 'splatter-extreme',
    name: 'splatter-extreme.targeted.trap-gore-death',
    patterns: [/\bfinal destination\b/i, /\bbloodlines\b/i, /\bgore set piece\b/i, /\bgraphic death\b/i, /\bextreme violence\b/i],
    confidence: 0.8,
  },
  {
    nodeSlug: 'creature-monster',
    name: 'creature-monster.targeted.vampire-predator',
    patterns: [/\bsinners\b/i, /\bvampire\b/i, /\bpredatory creature\b/i, /\bnight creature\b/i, /\bmonster\b/i],
    confidence: 0.79,
  },
  {
    nodeSlug: 'cosmic-horror',
    name: 'cosmic-horror.targeted.eldritch-unknown',
    patterns: [/\beldritch\b/i, /\blovecraft/i, /\bancient god\b/i, /\bforbidden knowledge\b/i, /\breality (?:collapse|warps?)\b/i],
    confidence: 0.82,
  },
  {
    nodeSlug: 'cosmic-horror',
    name: 'cosmic-horror.targeted.void-dimensional',
    patterns: [/\bvoid\b/i, /\bdimensional\b/i, /\bnon[- ]euclidean\b/i, /\bincomprehensible\b/i, /\botherworldly\b/i],
    confidence: 0.81,
  },
  {
    nodeSlug: 'horror-comedy',
    name: 'horror-comedy.targeted.zom-com-meta',
    patterns: [/\bzom[- ]?com\b/i, /\bmeta[- ]horror\b/i, /\bparody\b/i, /\bsatire\b/i, /\bcamp\b/i],
    confidence: 0.81,
  },
  {
    nodeSlug: 'horror-comedy',
    name: 'horror-comedy.targeted.deadpan-absurd',
    patterns: [/\bdark comedy\b/i, /\bdeadpan\b/i, /\babsurd\b/i, /\bcomedic gore\b/i, /\bhorror comedy\b/i],
    confidence: 0.8,
  },
  {
    nodeSlug: 'experimental-horror',
    name: 'experimental-horror.targeted.formal-disruption',
    patterns: [/\bavant[- ]garde\b/i, /\bnonlinear\b/i, /\bformal (?:experiment|disruption)\b/i, /\babstract\b/i, /\boneiric\b/i],
    confidence: 0.82,
  },
  {
    nodeSlug: 'experimental-horror',
    name: 'experimental-horror.targeted.surreal-structure',
    patterns: [/\bsurreal\b/i, /\bdream logic\b/i, /\bsymbolic\b/i, /\bpsychedelic\b/i, /\bfragmented narrative\b/i],
    confidence: 0.81,
  },
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function corpus(movie: WeakSupervisionMovie): string {
  return [
    movie.title,
    ...movie.genres.map((tag) => tag.replace(/-/g, ' ')),
    ...(movie.keywords ?? []),
    movie.synopsis ?? '',
  ].join(' ').toLowerCase();
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

function createTargetedPatternLf(rule: Season1TargetedPatternRule): LabelingFunction {
  return {
    name: rule.name,
    nodeSlug: rule.nodeSlug,
    apply: (movie) => {
      const text = corpus(movie);
      const matches = rule.patterns.filter((pattern) => pattern.test(text));
      if (matches.length === 0) {
        return result(0, 0);
      }
      return result(1, rule.confidence, matches.slice(0, 3).map((pattern) => `targeted:${pattern.source}`));
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

function buildLegacySeason1Lfs(nodeSlugs?: Set<string>): LabelingFunction[] {
  const lfs: LabelingFunction[] = [];

  for (const [nodeSlug, classifier] of Object.entries(CLASSIFIER_BY_NODE)) {
    if (nodeSlugs && !nodeSlugs.has(nodeSlug)) {
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

  for (const rule of TARGETED_OMISSION_RULES) {
    if (nodeSlugs && !nodeSlugs.has(rule.nodeSlug)) {
      continue;
    }
    lfs.push(createTargetedPatternLf(rule));
  }

  return lfs;
}

export const SEASON_1_DEFAULT_NODE_THRESHOLDS: Record<string, number> = Object.fromEntries(
  Object.entries(SEASON1_NODE_GOVERNANCE_CONFIG.nodes).map(([slug, node]) => [slug, node.threshold ?? SEASON1_NODE_GOVERNANCE_CONFIG.defaults.threshold]),
);

export const season1WeakSupervisionPlugin: SeasonWeakSupervisionPlugin = {
  seasonId: 'season-1',
  buildLabelingFunctions: (input: BuildSeasonPluginLfInput) => buildLegacySeason1Lfs(input.allowedNodeSlugs),
  defaultNodeThresholds: SEASON_1_DEFAULT_NODE_THRESHOLDS,
  exclusivityRules: EXCLUSIVITY_RULES,
};
