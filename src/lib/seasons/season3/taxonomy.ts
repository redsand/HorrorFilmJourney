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
    keywords: ['silent', 'early', 'metropolis', 'frankenstein', 'futurism'],
  },
  {
    slug: 'space-opera',
    kind: 'historical-movement',
    keywords: ['space', 'star', 'galaxy', 'planet', 'spaceship', 'interstellar'],
  },
  {
    slug: 'hard-science-fiction',
    kind: 'hybrid',
    keywords: ['science', 'physics', 'astronaut', 'experiment', 'orbital', 'quantum'],
  },
  {
    slug: 'cyberpunk',
    kind: 'historical-movement',
    keywords: ['cyber', 'hacker', 'virtual', 'android', 'matrix', 'neon'],
  },
  {
    slug: 'dystopian-science-fiction',
    kind: 'historical-movement',
    keywords: ['dystopia', 'totalitarian', 'surveillance', 'future society', 'authoritarian'],
  },
  {
    slug: 'post-apocalyptic-science-fiction',
    kind: 'historical-movement',
    keywords: ['apocalypse', 'post apocalyptic', 'wasteland', 'collapse', 'nuclear'],
  },
  {
    slug: 'time-travel-science-fiction',
    kind: 'motif',
    keywords: ['time travel', 'future', 'past', 'timeline', 'paradox', 'loop'],
  },
  {
    slug: 'alternate-history-multiverse',
    kind: 'motif',
    keywords: ['multiverse', 'alternate', 'parallel', 'alternate history', 'dimension'],
  },
  {
    slug: 'artificial-intelligence-robotics',
    kind: 'motif',
    keywords: ['ai', 'artificial intelligence', 'robot', 'android', 'machine'],
  },
  {
    slug: 'alien-contact-invasion',
    kind: 'motif',
    keywords: ['alien', 'invasion', 'extraterrestrial', 'ufo', 'first contact'],
  },
  {
    slug: 'biopunk-genetic-engineering',
    kind: 'motif',
    keywords: ['genetic', 'clone', 'virus', 'bio', 'mutation', 'dna'],
  },
  {
    slug: 'military-science-fiction',
    kind: 'motif',
    keywords: ['war', 'soldier', 'military', 'battle', 'combat', 'weapon'],
  },
  {
    slug: 'science-fiction-horror',
    kind: 'hybrid',
    keywords: ['horror', 'creature', 'monster', 'infection', 'body horror', 'terror'],
  },
  {
    slug: 'social-speculative-science-fiction',
    kind: 'hybrid',
    keywords: ['society', 'class', 'identity', 'political', 'social', 'speculative'],
  },
  {
    slug: 'new-weird-cosmic-science-fiction',
    kind: 'hybrid',
    keywords: ['cosmic', 'weird', 'eldritch', 'surreal', 'dream', 'lovecraft'],
  },
  {
    slug: 'retrofuturism-steampunk-dieselpunk',
    kind: 'historical-movement',
    keywords: ['retro', 'steampunk', 'dieselpunk', 'clockwork', 'victorian'],
  },
];

export const SEASON3_SCI_FI_NODE_SLUGS = SEASON3_SCI_FI_TAXONOMY.map((node) => node.slug);

export const SEASON3_SCI_FI_NODE_KEYWORDS: Record<string, string[]> = Object.fromEntries(
  SEASON3_SCI_FI_TAXONOMY.map((node) => [node.slug, [...node.keywords]]),
);
