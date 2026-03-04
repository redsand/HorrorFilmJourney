# Season 1 Reassessment After Ontology Refactor

Generated from local rebuild artifacts in:
- `artifacts/season1/rebuild/20260303-220707`

## Snapshot identifiers
- Release ID: `cmmbin13f0126rgutnj649fjr`
- Taxonomy version: `season-1-horror-v3.5`
- Run ID: `season1-ontology-reassess-fixed-v1`
- Previous published local release: `cmmbgkuoi00gkzxgeygqccekx`

## Rebuild + verify status
- Local rebuild: completed
- Local verify (`npm run local:verify-catalog`): PASS
- Verification highlights:
  - 16/16 nodes present
  - disallowed overlap violations: 0
  - published snapshot exists and points to new release
  - regression tests pass

## Funnel and choke points

| Stage | Count |
| --- | ---: |
| Total catalog | 17,628 |
| Horror-tagged pool | 5,551 |
| Eligibility-pass pool | 1,876 |
| Journey-worthiness-pass pool | 1 |
| Selected unique movies | 934 |
| Selected total assignments | 1,337 |

Top choke points:
1. `catalog -> horrorTagged`: -12,077
2. `horrorTagged -> eligibilityPass`: -3,675
3. `eligibilityPass -> journeyWorthinessPass`: -1,875

Notes:
- Unique assigned improved strongly vs previous snapshot (+447).
- Journey-worthiness gate is currently over-restrictive in diagnostics (`1` pass) because runtime/vote_count signals are sparse in local metadata; this indicates a data/gate mismatch, not necessarily assignment collapse.

## Node distribution highlights

Underfilled nodes (below min floor target intent):
- `horror-comedy`: 21
- `experimental-horror`: 23
- `cosmic-horror`: 24
- `sci-fi-horror`: 31
- `apocalyptic-horror`: 32

Well-filled nodes:
- `supernatural-horror`: 120
- `slasher-serial-killer`: 120
- `creature-monster`: 120
- `survival-horror`: 120
- `gothic-horror`: 120
- `splatter-extreme`: 120
- `social-domestic-horror`: 120

Overlap checks:
- Movies assigned to `>3` nodes: 1
- Disallowed pair violations: 0
- Top co-occurrence pairs:
  - `gothic-horror + supernatural-horror`: 29
  - `slasher-serial-killer + survival-horror`: 25
  - `psychological-horror + social-domestic-horror`: 24

## Quality gate results

Configured strict gate in reassessment:
- min vote count: 1500
- min ratings quality: 0.6
- min metadata completeness: 0.8
- require reception presence: true

Result:
- Assigned unique movies: 934
- Pass all quality gates: 0 (0.00%)
- Below gates: 934

Interpretation:
- Current strict gate is failing almost everything due missing/insufficient vote-count and metadata normalization coverage for local catalog rows.
- This is a signal that quality-gate feature engineering is not yet aligned with current stored rating sources and runtime coverage.

## Diff vs previous snapshot

- Previous unique movies: 487
- Current unique movies: 934
- Delta unique movies: +447
- Previous assignments: 559
- Current assignments: 1,337
- Delta assignments: +778
- Added unique movies: 447
- Removed unique movies: 0

## Near-miss candidates for expansion

Strict criterion: high journey score and just below node threshold.

Only one candidate met the strict near-miss criterion:
1. `28 Years Later: The Bone Temple` (`tmdbId=1272837`) for `sci-fi-horror`  
   finalScore 0.5875 vs threshold 0.6700 (gap 0.0825), journeyWorthiness 0.6651

Because only one title qualifies under strict criteria, no full top-20 list is currently available without relaxing near-miss rules.

## What changed

1. Local rebuild produced a much larger Season 1 snapshot (`934` unique movies, `1337` assignments).
2. Verification status remains green (governance/overlap/regression checks all pass).
3. Distribution imbalance remains in several nodes (especially `horror-comedy`, `experimental-horror`, `cosmic-horror`, `sci-fi-horror`, `apocalyptic-horror`).
4. Strict quality gate currently rejects all assigned titles due data-feature mismatch.

## What to do next

1. Integrate journey-worthiness gating into assignment pipeline with calibrated thresholds:
   - use available local fields first (ratings sources + popularity + credits completeness)
   - avoid runtime hard-fail until runtime coverage is reliable
2. Tune starving nodes via season assets:
   - expand ontology keywords/themes for `horror-comedy`, `experimental-horror`, `cosmic-horror`, `sci-fi-horror`, `apocalyptic-horror`
   - add stronger prototype positives for those nodes
   - add targeted Season 1 plugin LFs for missing patterns
3. Normalize quality inputs before strict gating:
   - standardize vote-count source mapping
   - backfill runtime where available
   - ensure reception presence derivation aligns with stored rating sources

