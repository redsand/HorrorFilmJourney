export type Season3NodeKind = 'historical-movement' | 'motif' | 'hybrid';

export type Season3SciFiNodeTaxonomy = {
  slug: string;
  kind: Season3NodeKind;
  keywords: string[];
};

export const SEASON3_SCI_FI_TAXONOMY: Season3SciFiNodeTaxonomy[] = [
  {
    slug: 'proto-science-fiction',
    kind: 'historical-movement',
    keywords: ['silent', 'early', 'metropolis', 'frankenstein', 'futurism', 'automaton', 'mad scientist', 'invisible man'],
  },
  {
    slug: 'atomic-age-science-fiction',
    kind: 'historical-movement',
    keywords: ['atomic', 'nuclear', 'radiation', 'giant', 'mutation', 'bomb', 'cold war', 'forbidden planet'],
  },
  {
    slug: 'cold-war-paranoia',
    kind: 'historical-movement',
    keywords: ['cold war', 'infiltration', 'conformity', 'doomsday', 'conspiracy', 'pod people', 'red scare', 'spy'],
  },
  {
    slug: 'space-race-cinema',
    kind: 'historical-movement',
    keywords: ['space', 'astronaut', 'orbital', 'mission', 'planet', 'monolith', '2001', 'moon landing'],
  },
  {
    slug: 'new-hollywood-science-fiction',
    kind: 'historical-movement',
    keywords: ['dystopia', 'counterculture', 'state control', 'conditioning', 'soylent', 'population', 'thx'],
  },
  {
    slug: 'philosophical-science-fiction',
    kind: 'hybrid',
    keywords: ['consciousness', 'identity', 'memory', 'perception', 'existential', 'stalker', 'contemplative'],
  },
  {
    slug: 'blockbuster-science-fiction',
    kind: 'historical-movement',
    keywords: ['star wars', 'galaxy', 'empire', 'force', 'alien', 'terminator', 'et', 'spectacle'],
  },
  {
    slug: 'cyberpunk',
    kind: 'historical-movement',
    keywords: ['cyber', 'hacker', 'virtual', 'android', 'matrix', 'neon', 'replicant', 'megacorp'],
  },
  {
    slug: 'ai-cinema',
    kind: 'motif',
    keywords: ['artificial intelligence', 'robot', 'android', 'machine learning', 'sentience', 'hal', 'ex machina'],
  },
  {
    slug: 'alien-encounter',
    kind: 'motif',
    keywords: ['alien', 'extraterrestrial', 'first contact', 'invasion', 'ufo', 'signal', 'arrival', 'district 9'],
  },
  {
    slug: 'time-travel',
    kind: 'motif',
    keywords: ['time travel', 'timeline', 'paradox', 'future self', 'time machine', 'loop', 'bootstrap'],
  },
  {
    slug: 'modern-speculative',
    kind: 'hybrid',
    keywords: ['near future', 'climate', 'civilizational', 'interstellar', 'annihilation', 'children of men', 'gravity'],
  },
];

export const SEASON3_SCI_FI_NODE_SLUGS = SEASON3_SCI_FI_TAXONOMY.map((node) => node.slug);

export const SEASON3_SCI_FI_NODE_KEYWORDS: Record<string, string[]> = Object.fromEntries(
  SEASON3_SCI_FI_TAXONOMY.map((node) => [node.slug, [...node.keywords]]),
);
