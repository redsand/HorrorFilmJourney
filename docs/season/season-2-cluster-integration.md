# Season 2 Cluster Integration (v2)

Generated: 2026-03-04T21:36:08.641Z

## Integration policy
- Source candidates: `season-2-missing-clusters.json` (`status = candidate-addition`).
- Applied conservative credibility filter: only historically documented, repeatedly cited cult titles were integrated.
- Deduplication checks: normalized `title + year` plus `tmdbId` when available.
- Default tier for additions: `extended`; limited core promotions for canonical movement-defining entries.

## Clusters integrated
### Hong Kong Category III and Heroic Bloodshed Fringe
Added: 10
- The Boxers Omen (1983) -> psychotronic-cinema (core)
- Dangerous Encounters of the First Kind (1980) -> psychotronic-cinema (extended)
- The Seventh Curse (1986) -> psychotronic-cinema (extended) [TMDB 39900]
- Mr. Vampire (1985) -> psychotronic-cinema (extended) [TMDB 67342]
- A Chinese Ghost Story (1987) -> psychotronic-cinema (extended) [TMDB 30421]
- Ebola Syndrome (1996) -> psychotronic-cinema (extended) [TMDB 24922]
- The Untold Story (1993) -> psychotronic-cinema (extended)
- Dr. Lamb (1992) -> psychotronic-cinema (extended)
- The Heroic Trio (1993) -> psychotronic-cinema (extended) [TMDB 43636]
- The Bride with White Hair (1993) -> psychotronic-cinema (extended)

### Japanese Pinku, Ero-Guro, and Delinquent Cult
Added: 7
- Female Prisoner #701 Scorpion (1972) -> psychotronic-cinema (core) [TMDB 71138]
- Female Prisoner Scorpion Jailhouse 41 (1972) -> psychotronic-cinema (extended)
- Female Prisoner Scorpion 701s Grudge Song (1973) -> psychotronic-cinema (extended)
- Sex and Fury (1973) -> psychotronic-cinema (extended)
- School of the Holy Beast (1974) -> psychotronic-cinema (extended)
- Branded to Kill (1967) -> psychotronic-cinema (core) [TMDB 17905]
- Funeral Parade of Roses (1969) -> psychotronic-cinema (extended)

### Italian Post-Giallo Exploitation and Video-Nasty Adjacent
Added: 8
- Burial Ground (1981) -> cult-horror (extended)
- City of the Living Dead (1980) -> cult-horror (extended)
- The House by the Cemetery (1981) -> cult-horror (extended)
- Nightmare City (1980) -> cult-horror (extended) [TMDB 28319]
- StageFright (1987) -> cult-horror (extended)
- Demons 2 (1986) -> cult-horror (extended)
- Zombie Holocaust (1980) -> cult-horror (extended)
- The Church (1989) -> cult-horror (extended) [TMDB 40364]

### VHS Sword-and-Sorcery and Fantasy Cult
Added: 6
- The Beastmaster (1982) -> video-store-era (extended) [TMDB 16441]
- Hawk the Slayer (1980) -> video-store-era (extended)
- The Sword and the Sorcerer (1982) -> video-store-era (core) [TMDB 13945]
- Red Sonja (1985) -> video-store-era (extended) [TMDB 9626]
- Masters of the Universe (1987) -> video-store-era (extended) [TMDB 11649]
- Fire and Ice (1983) -> video-store-era (extended) [TMDB 15035]

### Global Adult Cult Animation and Psychedelic Animation
Added: 3
- Wizards (1977) -> cult-science-fiction (extended) [TMDB 16220]
- Rock and Rule (1983) -> cult-science-fiction (extended)
- Son of the White Mare (1981) -> cult-science-fiction (extended)

### Mexican Gothic, Lucha, and Borderline Exploitation Cult
Added: 10
- Santo vs the Vampire Women (1962) -> grindhouse-exploitation (extended)
- The World of the Vampires (1961) -> grindhouse-exploitation (extended)
- The Batwoman (1968) -> grindhouse-exploitation (extended)
- Alucarda (1977) -> grindhouse-exploitation (core) [TMDB 40074]
- Cemetery of Terror (1985) -> grindhouse-exploitation (extended) [TMDB 85002]
- Grave Robbers (1989) -> grindhouse-exploitation (extended)
- Even the Wind Is Afraid (1968) -> grindhouse-exploitation (extended) [TMDB 68627]
- The Book of Stone (1969) -> grindhouse-exploitation (extended) [TMDB 68632]
- Poison for the Fairies (1986) -> grindhouse-exploitation (extended) [TMDB 28968]
- The Brainiac (1962) -> grindhouse-exploitation (extended) [TMDB 42992]

## Core promotions
- The Boxers Omen (1983) -> psychotronic-cinema
- Female Prisoner #701 Scorpion (1972) -> psychotronic-cinema
- Branded to Kill (1967) -> psychotronic-cinema
- The Sword and the Sorcerer (1982) -> video-store-era
- Alucarda (1977) -> grindhouse-exploitation

## Nodes affected
- cult-science-fiction: core 22, extended 58, total 80
- outsider-cinema: core 22, extended 57, total 79
- modern-cult-phenomena: core 22, extended 54, total 76
- camp-cult-comedy: core 22, extended 51, total 73
- grindhouse-exploitation: core 18, extended 45, total 63
- psychotronic-cinema: core 18, extended 45, total 63
- video-store-era: core 16, extended 35, total 51
- origins-of-cult-cinema: core 13, extended 25, total 38
- midnight-movies: core 11, extended 22, total 33
- cult-horror: core 9, extended 20, total 29
- eurocult: core 9, extended 19, total 28

## Balance checks
- Ideal guidance range: 40-80 films per node.
- Nodes above 80: none.
- Nodes above 90 (editorial review threshold): none.

## Summary
- Added films: 44
- Skipped during dedupe/validation: 0
- New taxonomy version: season-2-cult-v2
- Updated totals: core 182, extended 431, unique 613
