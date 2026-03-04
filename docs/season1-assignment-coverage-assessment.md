# Season 1 Assignment Coverage Assessment

## Scope and context
- Date: 2026-03-04 (local)
- Catalog size: 17,628 movies
- Published Season 1 snapshot reviewed:
  - `taxonomyVersion`: `season-1-horror-v3.5`
  - assignments: 559
  - unique assigned movies: 487

This assessment was run locally and deterministically with:
- `npm run diagnose:season1:coverage`
- Output artifact: `artifacts/season1-coverage-diagnosis.json`

## Current approach summary
- Season 1 assignment is hybrid:
  - curated anchors from curriculum spec are always included
  - weak-supervision LFs score additional candidates per node
  - governance applies threshold + overlap + per-movie cap + per-node target
- Eligibility gating is strict and currently requires:
  - poster
  - IMDB + at least one additional rating
  - reception source
  - both director and cast (credits completeness)

## Code map (ingestion + assignment)
- TMDB ingestion (full sync): `scripts/sync-tmdb-catalog.ts`
  - discover endpoint: `/discover/movie` with `with_genres`
  - details endpoint: `/movie/{id}` with `append_to_response=keywords,credits`
  - writes `genres`, `keywords`, `country`, `director`, `castTop`
- TMDB ingestion (incremental): `scripts/sync-tmdb-catalog-update.ts`
  - details endpoint per id with `append_to_response=keywords,credits`
  - merges genres and updates metadata/ratings
- TMDB normalization/mapping: `src/lib/tmdb/tmdb-normalization.ts`
  - `TMDB_HORROR_GENRE_ID=27`
  - `toGenreIds`, `toGenreNames`, `parseKeywords`, `parseDirector`, `parseCastTop`
- Eligibility gate: `src/lib/curriculum/eligibility.ts`
  - `evaluateCurriculumEligibility(...)`
- Weak supervision:
  - LFs: `src/lib/nodes/weak-supervision/lfs.ts`
  - Aggregation: `src/lib/nodes/weak-supervision/label-model.ts`
- Governance config: `src/config/seasons/season1-node-governance.ts`
- Selection + persistence + release snapshot:
  - `scripts/seed-season1-horror-subgenres.ts`
  - `src/lib/nodes/governance/release-artifact.ts`
- Diagnostics: `scripts/diagnose-season1-coverage.ts`

## Funnel analysis (where coverage drops)

| Stage | Count | Drop from previous |
|---|---:|---:|
| Total catalog movies | 17,628 | - |
| Movies with TMDB id present | 17,628 | 0 |
| Movies with genres present | 17,628 | 0 |
| Movies with Horror genre tag | 5,551 | -12,077 |
| Movies with any horror-adjacent signals | 5,582 | +31 |
| Eligible before scoring | 1,876 | -3,675 |
| Curated anchors resolved in catalog | 241 | n/a |
| Weak-supervision above threshold for >=1 node | 261 | n/a |
| Selected into published snapshot | 487 | n/a (curated + weak supervision union) |

Current no-node rate within horror-tagged catalog (from local verify):
- `5095 / 5551 = 91.79%` have no Season 1 node assignment.
- This confirms Season 1 is still highly selective relative to horror-tagged catalog size.

### Biggest choke point
- Absolute largest funnel drop: `genres -> horror-tag` (`-12,077`).
- Biggest controllable drop inside Season 1 pipeline: eligibility loss (`-3,675`) driven overwhelmingly by missing credits completeness (`missingCredits: 3,675`).

## Ingestion correctness findings

### What is correct
- Horror genre id mapping is present and correct (`27 -> "horror"`).
- 200-movie deterministic integrity sample:
  - empty genres: `0`
  - one-genre-only: `19` (9.5%)
  - avg genres/movie: `3.585`
- No evidence that genres are being dropped to empty on update in sampled data.

### What was missing / high impact
- Ingestion did not consistently guarantee credits persistence earlier in the pipeline path.
- Season 1 eligibility requires both director and cast; missing credits directly removes movies from candidate pool.

### Implemented fix
- TMDB sync scripts now fetch and persist credits in both full and incremental paths:
  - `append_to_response=keywords,credits`
  - `director: parseDirector(...)`
  - `castTop: parseCastTop(...)`
- Regression tests added:
  - `tests/unit/tmdb-normalization.test.ts`
  - `tests/unit/tmdb-sync-script-contract.test.ts`

## Governance and ablation results (deterministic)

Baseline simulation matches current scale:
- unique assigned movies: `487`
- total assignments: `561` (near current 559)

Ablations:
- Lower thresholds by `0.05`: jumps to `890` unique / `1248` assignments, several nodes hit near-cap quickly.
  - Conclusion: very high breadth gain, but high likely noise risk.
- Increase target by `+50`: no change from baseline.
  - Conclusion: target caps are not the current bottleneck.
- `maxNodesPerMovie 2 -> 3`: near-no change.
  - Conclusion: per-movie cap is not binding materially today.
- Disable disallowed overlap pairs: no change.
  - Conclusion: overlap constraints are not a major blocker at current thresholds.
- Include adjacent genres with horror keyword gate: no meaningful baseline lift.
  - Conclusion: current catalog has limited additional high-confidence adjacent candidates under present rules.

## Ranked root-cause hypotheses (with evidence)
1. Eligibility strictness + missing credits is the primary controllable bottleneck.
   - Evidence: `missingCredits=3,675` among horror-tagged titles failing eligibility.
2. Horror-tag pool is narrower than the full catalog by design and by TMDB genre filtering.
   - Evidence: `5,551 / 17,628` have `horror` tag.
3. Weak-supervision thresholds are precision-heavy and limit non-curated expansion.
   - Evidence: only `261` non-curated candidates above threshold; lowering thresholds massively increases volume.
4. Target size / overlap constraints are not currently limiting coverage.
   - Evidence: ablations changing those controls produce negligible change.

## Most defensible next moves (quality-first)

## Quick fixes (1-2 days)
1. Re-run local TMDB sync with credits-enabled scripts, then rebuild Season 1 snapshot.
2. Add a coverage monitor in local verify output for:
   - `% horror-tagged titles failing only credits`
   - `% no-node among eligible horror pool`
3. Keep current thresholds for now (do not lower globally yet).

## Medium (1-2 sprints)
1. Add a precision-first horror-eligibility score (local features only) before node scoring:
   - genres + keywords + synopsis presence + metadata completeness
2. Add per-node prototype positives/negatives to improve borderline LF cases.
3. Add node-specific threshold calibration against gold fixture + reviewed sample.

## Longer-term
1. Train the Season 1 assistive multi-label classifier artifact and calibrate per node.
2. Use classifier score as reranker signal only (curated remains authoritative).
3. Add drift dashboard and CI gates for:
   - node size drift
   - overlap anomaly drift
   - no-node rate among eligible horror titles

## Changes implemented in this pass
- Added deterministic coverage diagnostic script:
  - `scripts/diagnose-season1-coverage.ts`
- Added TMDB normalization helper + coverage-related parsing:
  - `src/lib/tmdb/tmdb-normalization.ts`
- Updated ingestion scripts to persist `keywords/country/director/castTop` with TMDB details+credits:
  - `scripts/sync-tmdb-catalog.ts`
  - `scripts/sync-tmdb-catalog-update.ts`
- Added regression tests:
  - `tests/unit/tmdb-normalization.test.ts`
  - `tests/unit/tmdb-sync-script-contract.test.ts`
