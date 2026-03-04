import type { SeasonPrototypePack } from '@/lib/ontology/prototype-types';

export const SEASON_2_CULT_CLASSICS_PROTOTYPE_PACK: SeasonPrototypePack = {
  seasonId: 'season-2',
  taxonomyVersion: 'season-2-cult-v1',
  nodes: [
    {
      nodeSlug: 'birth-of-midnight',
      positivePrototypes: [[0.9, 0.2, 0.3, 0.6]],
      positiveTitles: ['Eraserhead', 'The Rocky Horror Picture Show', 'El Topo'],
    },
    {
      nodeSlug: 'grindhouse-exploitation',
      positivePrototypes: [[0.86, 0.25, 0.82, 0.18]],
      positiveTitles: ['Cannibal Holocaust', 'The Beyond', 'I Spit on Your Grave'],
    },
    {
      nodeSlug: 'so-bad-its-good',
      positivePrototypes: [[0.72, 0.45, 0.2, 0.22]],
      positiveTitles: ['The Room', 'Troll 2', 'Birdemic: Shock and Terror'],
    },
    {
      nodeSlug: 'cult-sci-fi-fantasy',
      positivePrototypes: [[0.8, 0.52, 0.88, 0.64]],
      positiveTitles: ['Blade Runner', 'Heavy Metal', 'Stalker'],
    },
    {
      nodeSlug: 'punk-counterculture',
      positivePrototypes: [[0.78, 0.66, 0.35, 0.51]],
      positiveTitles: ['Repo Man', 'Sid and Nancy', 'Hedwig and the Angry Inch'],
    },
    {
      nodeSlug: 'vhs-video-store-era',
      positivePrototypes: [[0.82, 0.34, 0.48, 0.29]],
      positiveTitles: ['Re-Animator', 'The Gate', 'Night of the Creeps'],
    },
    {
      nodeSlug: 'cult-comedy-absurdism',
      positivePrototypes: [[0.65, 0.31, 0.24, 0.4]],
      positiveTitles: ['The Big Lebowski', 'Office Space', 'Wet Hot American Summer'],
    },
    {
      nodeSlug: 'modern-cult-phenomena',
      positivePrototypes: [[0.58, 0.74, 0.5, 0.69]],
      positiveTitles: ['Donnie Darko', 'Mulholland Drive', "Jennifer's Body"],
    },
  ],
};
