import type { SeasonOntology } from '@/lib/ontology/types';

export const SEASON_2_CULT_CLASSICS_ONTOLOGY: SeasonOntology = {
  seasonId: 'season-2',
  seasonSlug: 'cult-classics',
  taxonomyVersion: 'season-2-cult-v1',
  nodes: [
    {
      slug: 'birth-of-midnight',
      name: 'The Birth of Midnight Movies',
      description: 'Origins of cult fandom and underground screenings.',
      canonicalThemes: ['midnight screenings', 'outsider cinema', 'DIY authorship', 'word-of-mouth discovery'],
      commonKeywords: ['midnight movie', 'underground', 'cult', 'outsider', 'arthouse'],
      negativeSignals: ['four-quadrant blockbuster', 'franchise tentpole'],
    },
    {
      slug: 'grindhouse-exploitation',
      name: 'Grindhouse & Exploitation',
      description: 'Low-budget rebellion and shock cinema.',
      canonicalThemes: ['transgression', 'shock aesthetics', 'taboo marketing', 'rough-cut energy'],
      commonKeywords: ['grindhouse', 'exploitation', 'video nasty', 'sleaze', 'transgressive'],
      negativeSignals: ['family animation', 'prestige period drama'],
    },
    {
      slug: 'so-bad-its-good',
      name: "So-Bad-It's-Good",
      description: 'Accidental masterpieces and ironic worship.',
      canonicalThemes: ['camp sincerity', 'quote culture', 'audience ritual', 'unintended comedy'],
      commonKeywords: ['so bad it is good', 'camp', 'cult comedy', 'midnight screening', 'riffing'],
      negativeSignals: ['awards prestige drama', 'serious biopic'],
    },
    {
      slug: 'cult-sci-fi-fantasy',
      name: 'Cult Sci-Fi & Fantasy',
      description: 'Visionary oddities and misunderstood epics.',
      canonicalThemes: ['world-building cult hooks', 'speculative myth', 'ambitious genre experiments'],
      commonKeywords: ['cult sci fi', 'fantasy oddity', 'space cult', 'visionary', 'retro-futurist'],
      negativeSignals: ['mainstream superhero tentpole', 'toyetic franchise'],
    },
    {
      slug: 'punk-counterculture',
      name: 'Punk & Counterculture Cinema',
      description: 'Anti-establishment film movements.',
      canonicalThemes: ['DIY ethos', 'political provocation', 'subculture iconography', 'youth rebellion'],
      commonKeywords: ['punk', 'counterculture', 'transgressive', 'underground scene', 'subculture'],
      negativeSignals: ['institutional prestige', 'franchise IP sequel'],
    },
    {
      slug: 'vhs-video-store-era',
      name: 'VHS & The Video Store Era',
      description: 'Shelf discoveries and rental legends.',
      canonicalThemes: ['rental-era canon', 'cover-art discovery', 'late-night cable circulation'],
      commonKeywords: ['vhs', 'video store', 'rental', 'cult rental', 'home video'],
      negativeSignals: ['streaming original prestige', 'modern franchise launch'],
    },
    {
      slug: 'cult-comedy-absurdism',
      name: 'Cult Comedy & Absurdism',
      description: 'Offbeat humor that found devoted fans.',
      canonicalThemes: ['deadpan absurdism', 'community in-jokes', 'repeat-viewing humor'],
      commonKeywords: ['absurdist', 'deadpan', 'offbeat comedy', 'cult comedy', 'midnight laughter'],
      negativeSignals: ['earnest inspirational drama', 'straight-ahead romcom'],
    },
    {
      slug: 'modern-cult-phenomena',
      name: 'Modern Cult Phenomena',
      description: 'Films that became cult in the internet age.',
      canonicalThemes: ['meme-era rediscovery', 'online fandom', 'long-tail canonization'],
      commonKeywords: ['internet cult', 'meme', 'rediscovered', 'fandom', 'festival breakout'],
      negativeSignals: ['algorithmic blockbuster', 'family animation franchise'],
    },
  ],
};

