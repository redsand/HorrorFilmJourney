# Season 1 Best-Movie Coverage Audit

Generated: 2026-03-04T18:57:18.836Z
Artifact directory: `C:\Users\TimShelton\source\repos\HorrorFilmJourney\artifacts\season1\rebuild\2026-03-04T12-36-51\audit-toplist-robustness-check`

## Snapshot Summary

- Release ID: `cmmcdszbv01r4yl47ro9g6fd6`
- Run ID: `season1-weak-supervision-2026-03-04T18:36:52.513Z`
- Taxonomy Version: `season-1-horror-v3.5`
- Core unique movies: **411**
- Extended unique movies: **1360**
- Extended unique only movies: **1290**
- Total unique movies: **1701**

## Top List Coverage

| Top List | In Core | In Extended | Not In Snapshot | Core % | Total Snapshot % |
|---|---:|---:|---:|---:|---:|
| TopByVotes | 179 | 73 | 248 | 35.80 | 50.40 |
| TopByRating | 51 | 25 | 79 | 32.90 | 49.03 |
| TopByHybrid | 188 | 67 | 245 | 37.60 | 51.00 |

## Top 20 Omitted High-Quality Titles

1. The Avengers (2012) - rating 8, votes 36233, reason: `node_score_below_quality_floor`
2. Avatar: Fire and Ash (2025) - rating 7.3, votes 1849, reason: `node_score_below_quality_floor`
3. Predator: Badlands (2025) - rating 7.7, votes 2235, reason: `node_score_below_quality_floor`
4. The Housemaid (2025) - rating 7.3, votes 1378, reason: `node_score_below_quality_floor`
5. The Matrix (1999) - rating 8.2, votes 27457, reason: `node_score_below_quality_floor`
6. Mercy (2026) - rating 7.1, votes 631, reason: `node_score_below_quality_floor`
7. Spider-Man: Into the Spider-Verse (2018) - rating 8.4, votes 16923, reason: `node_score_below_quality_floor`
8. Joker (2019) - rating 8.1, votes 27365, reason: `node_score_below_quality_floor`
9. The Shadow's Edge (2025) - rating 7.2, votes 460, reason: `node_score_below_quality_floor`
10. Shutter Island (2010) - rating 8.2, votes 25489, reason: `node_score_below_quality_floor`
11. Inglourious Basterds (2009) - rating 8.2, votes 23817, reason: `node_score_below_quality_floor`
12. Avengers: Endgame (2019) - rating 8.2, votes 27320, reason: `node_score_below_quality_floor`
13. The Empire Strikes Back (1980) - rating 8.4, votes 18123, reason: `node_score_below_quality_floor`
14. Star Wars (1977) - rating 8.2, votes 21998, reason: `node_score_below_quality_floor`
15. Psycho (1960) - rating 8.4, votes 10838, reason: `node_score_below_quality_floor`
16. The Prestige (2006) - rating 8.2, votes 17278, reason: `node_score_below_quality_floor`
17. Iron Man (2008) - rating 7.7, votes 27807, reason: `node_score_below_quality_floor`
18. The Silence of the Lambs (1991) - rating 8.3, votes 17637, reason: `node_score_below_quality_floor`
19. The Dark Knight Rises (2012) - rating 7.8, votes 24042, reason: `node_score_below_quality_floor`
20. The Departed (2006) - rating 8.2, votes 15936, reason: `node_score_below_quality_floor`

## Omission Triage (Top 100)

- A) not horror / out of scope: **0**
- B) horror but missing credits/metadata: **0**
- C) horror and eligible but nodeScore too low: **100**
- D) horror but not in catalog pool: **0**

## Recommendations

### Must Fix Before Publish
- low_snapshot_coverage_TopByVotes:50.4%
- low_snapshot_coverage_TopByRating:49.032258%
- low_snapshot_coverage_TopByHybrid:51%

### Nice To Improve
- high_cap_pressure:supernatural-horror:delta=0.000422:pressure=24
- high_cap_pressure:sci-fi-horror:delta=0.000823:pressure=49
- high_cap_pressure:apocalyptic-horror:delta=0.000795:pressure=23
- high_cap_pressure:horror-comedy:delta=0.000382:pressure=147
- high_cap_pressure:social-domestic-horror:delta=0.00042:pressure=75
- underfilled_core:supernatural-horror:36/120
- underfilled_core:psychological-horror:21/120
- underfilled_core:slasher-serial-killer:28/120
- underfilled_core:creature-monster:30/120
- underfilled_core:body-horror:21/120
- underfilled_core:cosmic-horror:22/120
- underfilled_core:folk-horror:23/120
- underfilled_core:sci-fi-horror:75/120
- underfilled_core:found-footage:19/120
- underfilled_core:survival-horror:37/120
- underfilled_core:apocalyptic-horror:37/120
- underfilled_core:gothic-horror:23/120
- underfilled_core:horror-comedy:42/120
- underfilled_core:splatter-extreme:22/120
- underfilled_core:social-domestic-horror:34/120
- underfilled_core:experimental-horror:30/120

### Manual Curation Candidates
- The Avengers (2012) - node_score_below_quality_floor
- Avatar: Fire and Ash (2025) - node_score_below_quality_floor
- Predator: Badlands (2025) - node_score_below_quality_floor
- The Housemaid (2025) - node_score_below_quality_floor
- The Matrix (1999) - node_score_below_quality_floor
- Mercy (2026) - node_score_below_quality_floor
- Spider-Man: Into the Spider-Verse (2018) - node_score_below_quality_floor
- Joker (2019) - node_score_below_quality_floor
- The Shadow's Edge (2025) - node_score_below_quality_floor
- Shutter Island (2010) - node_score_below_quality_floor
- Inglourious Basterds (2009) - node_score_below_quality_floor
- Avengers: Endgame (2019) - node_score_below_quality_floor
- The Empire Strikes Back (1980) - node_score_below_quality_floor
- Star Wars (1977) - node_score_below_quality_floor
- Psycho (1960) - node_score_below_quality_floor
- The Prestige (2006) - node_score_below_quality_floor
- Iron Man (2008) - node_score_below_quality_floor
- The Silence of the Lambs (1991) - node_score_below_quality_floor
- The Dark Knight Rises (2012) - node_score_below_quality_floor
- The Departed (2006) - node_score_below_quality_floor

## Artifact Files

- `snapshot-summary.json`
- `toplistCandidatePoolSize.json`
- `toplistCandidatePoolExamples.json`
- `scope-filtered-out.json`
- `node-core-boundaries.json`
- `omissions-toplists.json`
- `omission-triage.json`
- `omissions-by-node.json`
- `score-distribution.json`
- `recommendations.json`
