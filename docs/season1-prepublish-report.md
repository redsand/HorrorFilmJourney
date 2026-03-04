# Season 1 Prepublish Report

Generated: 2026-03-04T15:19:02.907Z
Artifacts: `C:\Users\TimShelton\source\repos\HorrorFilmJourney\artifacts\season1\prepublish\2026-03-04T15-18-33-595Z`

## Snapshot

- Release ID: `cmmc6gcks012an69x4y7fucha`
- Run ID: `season1-weak-supervision-2026-03-04T15:14:02.838Z`
- Taxonomy Version: `season-1-horror-v3.5`
- Published At: 2026-03-04T15:14:16.108Z

## Gate Results

| Check | Status | Details |
|---|---|---|
| local:verify-catalog | FAIL | FAIL (exit=1) |
| audit:season1:best-coverage | PASS | PASS (C:\Users\TimShelton\source\repos\HorrorFilmJourney\artifacts\season1\prepublish\2026-03-04T15-18-33-595Z\audit) |
| runtime coverage >= 0.90 | PASS | 98.65% |
| voteCount coverage >= 0.90 | PASS | 96.75% |
| credits coverage >= 0.85 | PASS | 99.45% |
| receptionCount coverage >= 0.80 | PASS | 100.00% |
| TopByVotes coverage (core+extended) >= 0.80 | FAIL | 68.80% |
| TopByHybrid coverage (core+extended) >= 0.90 | FAIL | 76.40% |
| totalUniqueMovies >= 850 (or --allowShrink with reason) | PASS | override accepted: totalUniqueMovies=847; reason="temporary shrink accepted while fixing overlap + toplist coverage" |
| extendedUniqueOnly >= 100 | PASS | 552 |
| journey gate removals <= 60.00% | FAIL | eligible=5510, journeyExtendedPass=1297, removalRate=76.46% |
| no disallowed overlaps | FAIL | folk-horror||horror-comedy:1, found-footage||gothic-horror:6, found-footage||gothic-horror:6 |
| essentials list PASS | FAIL | missing=15 (first: The Omen (1976); Carrie (1976); Hellraiser (1987); Candyman (1992); Audition (1999)) |

## Underfilled Nodes (Allowed, Justified)

- supernatural-horror: 27/120. Core constrained by overlap/selection despite deep extended pool.
- psychological-horror: 17/120. Eligible pool currently below target under quality and journey gates.
- slasher-serial-killer: 37/120. Core constrained by overlap/selection despite deep extended pool.
- creature-monster: 34/120. Eligible pool currently below target under quality and journey gates.
- body-horror: 24/120. Eligible pool currently below target under quality and journey gates.
- cosmic-horror: 16/120. Eligible pool currently below target under quality and journey gates.
- folk-horror: 21/120. Eligible pool currently below target under quality and journey gates.
- sci-fi-horror: 26/120. Core constrained by overlap/selection despite deep extended pool.
- found-footage: 20/120. Eligible pool currently below target under quality and journey gates.
- survival-horror: 31/120. Eligible pool currently below target under quality and journey gates.
- apocalyptic-horror: 22/120. Core constrained by overlap/selection despite deep extended pool.
- gothic-horror: 27/120. Eligible pool currently below target under quality and journey gates.
- horror-comedy: 20/120. Eligible pool currently below target under quality and journey gates.
- splatter-extreme: 19/120. Eligible pool currently below target under quality and journey gates.
- social-domestic-horror: 30/120. Eligible pool currently below target under quality and journey gates.
- experimental-horror: 20/120. Eligible pool currently below target under quality and journey gates.

## Coverage Metrics

- Runtime: 98.65%
- Vote count: 96.75%
- Credits (director+castTop): 99.45%
- Reception count: 100.00%

## Collapse Guards

- allowShrink: true
- allowShrinkReason: temporary shrink accepted while fixing overlap + toplist coverage
- totalUniqueMovies: 847
- extendedUniqueOnlyMovies: 552
- eligiblePoolCount: 5510
- journeyExtendedPassCount: 1297

## Artifact Files

- `verify-log.txt`
- `audit-log.txt`
- `checks.json`
- `coverage-metrics.json`
- `underfilled-nodes.json`
- `summary.json`
- `audit/*`

Overall status: **FAIL**
