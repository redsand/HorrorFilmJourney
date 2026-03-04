# Season 1 Best-Movie Coverage Audit

Generated: 2026-03-04T15:47:01.370Z
Artifact directory: `C:\Users\TimShelton\source\repos\HorrorFilmJourney\artifacts\season1\coverage-audit\2026-03-04T15-46-57-106Z`

## Snapshot Summary

- Release ID: `cmmc7j23x017ib69ep34fne0o`
- Run ID: `season1-node-calibrated-rebuild-2026-03-04`
- Taxonomy Version: `season-1-horror-v3.5`
- Core unique movies: **316**
- Extended unique movies: **721**
- Extended unique only movies: **599**
- Total unique movies: **915**

## Top List Coverage

| Top List | In Core | In Extended | Not In Snapshot | Core % | Total Snapshot % |
|---|---:|---:|---:|---:|---:|
| TopByVotes | 193 | 191 | 116 | 38.60 | 76.80 |
| TopByRating | 18 | 1 | 1 | 90.00 | 95.00 |
| TopByHybrid | 201 | 224 | 75 | 40.20 | 85.00 |

## Top 20 Omitted High-Quality Titles

1. Pan's Labyrinth (2006) - rating 7.757, votes 11291, reason: `likely_excluded_by_extended_cap_or_overlap_constraints`
2. Don't Breathe (2016) - rating 7, votes 7856, reason: `journey_gate_fail:missing_metadata`
3. Resident Evil (2002) - rating 6.6, votes 6790, reason: `journey_gate_fail:missing_metadata`
4. Final Destination (2000) - rating 6.6, votes 6532, reason: `journey_gate_fail:missing_metadata`
5. The Birds (1963) - rating 7.5, votes 4389, reason: `journey_gate_fail:missing_metadata`
6. Signs (2002) - rating 6.7, votes 6120, reason: `journey_gate_fail:missing_metadata`
7. Annabelle: Creation (2017) - rating 6.6, votes 5931, reason: `journey_gate_fail:missing_metadata`
8. They Live (1988) - rating 7.293, votes 3371, reason: `likely_excluded_by_extended_cap_or_overlap_constraints`
9. Nope (2022) - rating 6.8, votes 4732, reason: `journey_gate_fail:missing_metadata`
10. Last Night in Soho (2021) - rating 7.3, votes 3774, reason: `journey_gate_fail:missing_metadata`
11. The Neon Demon (2016) - rating 6.5, votes 3887, reason: `journey_gate_fail:missing_metadata`
12. The Bride! (2026) - rating 8.4, votes 5, reason: `journey_gate_fail:low_vote_count`
13. Succubus (2024) - rating 8.7, votes 218, reason: `journey_gate_fail:low_vote_count`
14. Heretic (2024) - rating 7, votes 2495, reason: `journey_gate_fail:low_vote_count`
15. Peninsula (2020) - rating 6.7, votes 2537, reason: `journey_gate_fail:low_vote_count`
16. I Spit on Your Grave (2010) - rating 6.5, votes 2501, reason: `journey_gate_fail:low_vote_count`
17. Exam (2009) - rating 6.7, votes 2242, reason: `journey_gate_fail:low_vote_count`
18. Funny Games (2008) - rating 6.555, votes 2222, reason: `journey_gate_fail:low_vote_count`
19. Christine (1983) - rating 6.9, votes 2190, reason: `journey_gate_fail:low_vote_count`
20. Orphan: First Kill (2022) - rating 6.6, votes 2271, reason: `journey_gate_fail:low_vote_count`

## Omission Triage (Top 100)

- A) not horror / out of scope: **0**
- B) horror but missing credits/metadata: **79**
- C) horror and eligible but nodeScore too low: **6**
- D) horror but not in catalog pool: **15**

## Recommendations

### Must Fix Before Publish
- none identified

### Nice To Improve
- high_cap_pressure:slasher-serial-killer:delta=0:pressure=26
- underfilled_core:supernatural-horror:31/120
- underfilled_core:psychological-horror:20/120
- underfilled_core:slasher-serial-killer:32/120
- underfilled_core:creature-monster:37/120
- underfilled_core:body-horror:20/120
- underfilled_core:cosmic-horror:17/120
- underfilled_core:folk-horror:20/120
- underfilled_core:sci-fi-horror:26/120
- underfilled_core:found-footage:19/120
- underfilled_core:survival-horror:22/120
- underfilled_core:apocalyptic-horror:24/120
- underfilled_core:gothic-horror:20/120
- underfilled_core:horror-comedy:26/120
- underfilled_core:splatter-extreme:17/120
- underfilled_core:social-domestic-horror:30/120
- underfilled_core:experimental-horror:20/120

### Manual Curation Candidates
- Pan's Labyrinth (2006) - likely_excluded_by_extended_cap_or_overlap_constraints
- Don't Breathe (2016) - journey_gate_fail:missing_metadata
- Resident Evil (2002) - journey_gate_fail:missing_metadata
- Final Destination (2000) - journey_gate_fail:missing_metadata
- The Birds (1963) - journey_gate_fail:missing_metadata
- Signs (2002) - journey_gate_fail:missing_metadata
- Annabelle: Creation (2017) - journey_gate_fail:missing_metadata
- They Live (1988) - likely_excluded_by_extended_cap_or_overlap_constraints
- Nope (2022) - journey_gate_fail:missing_metadata
- Last Night in Soho (2021) - journey_gate_fail:missing_metadata
- The Neon Demon (2016) - journey_gate_fail:missing_metadata
- The Bride! (2026) - journey_gate_fail:low_vote_count
- Succubus (2024) - journey_gate_fail:low_vote_count
- Heretic (2024) - journey_gate_fail:low_vote_count
- Peninsula (2020) - journey_gate_fail:low_vote_count
- I Spit on Your Grave (2010) - journey_gate_fail:low_vote_count
- Exam (2009) - journey_gate_fail:low_vote_count
- Funny Games (2008) - journey_gate_fail:low_vote_count
- Christine (1983) - journey_gate_fail:low_vote_count
- Orphan: First Kill (2022) - journey_gate_fail:low_vote_count

## Artifact Files

- `snapshot-summary.json`
- `node-core-boundaries.json`
- `omissions-toplists.json`
- `omission-triage.json`
- `omissions-by-node.json`
- `score-distribution.json`
- `recommendations.json`
