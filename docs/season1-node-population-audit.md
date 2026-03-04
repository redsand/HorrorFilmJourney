# Season 1 Node Population Audit

Generated: 2026-03-03 (local runtime audit)

## Current approach summary (how nodes are assigned today)

Season 1 is currently **hybrid**:

- Ground-truth curation: `docs/season/season-1-horror-subgenre-curriculum.json` defines the 16 node slugs and 20 curated titles per node.
- Automated derivation/top-up: `scripts/seed-season1-horror-subgenres.ts` resolves curated titles to local/TMDB movies, then expands each node using rule-based scoring over `Movie.genres` + title regex.
- Persistence: node assignments are stored in `JourneyNode` + `NodeMovie` tables.

Authoritative source of truth in practice:

1. Taxonomy spec file (`docs/season/season-1-horror-subgenre-curriculum.json`) for intended 16 nodes.
2. Database (`JourneyNode`/`NodeMovie`) for runtime truth consumed by recommendations/admin UI.

Important drift found:

- A legacy 10-node curriculum path still existed in `src/lib/testing/catalog-seed.ts` and was used by `seed:catalog` (`scripts/seed-catalog.ts`, `scripts/seed.ts`).
- This caused workflows that run only `seed:catalog` to diverge from 16-node Season 1.
- This turn includes a fix to keep active Season 1 aligned to 16 nodes (details in findings).

## Taxonomy map (Season 1, 16-node)

Source: `docs/season/season-1-horror-subgenre-curriculum.json`

- `supernatural-horror` — Supernatural Horror
- `psychological-horror` — Psychological Horror
- `slasher-serial-killer` — Slasher / Serial Killer
- `creature-monster` — Creature / Monster
- `body-horror` — Body Horror
- `cosmic-horror` — Cosmic Horror
- `folk-horror` — Folk Horror
- `sci-fi-horror` — Sci-Fi Horror
- `found-footage` — Found Footage
- `survival-horror` — Survival Horror
- `apocalyptic-horror` — Apocalyptic Horror
- `gothic-horror` — Gothic Horror
- `horror-comedy` — Horror Comedy
- `splatter-extreme` — Splatter / Extreme Horror
- `social-domestic-horror` — Social / Domestic Horror
- `experimental-horror` — Experimental Horror

Definitions/learning metadata are written into DB `JourneyNode.learningObjective`, `JourneyNode.eraSubgenreFocus`, `JourneyNode.whatToNotice`, `JourneyNode.spoilerPolicyDefault` by `scripts/seed-season1-horror-subgenres.ts` (`OBJECTIVE_BY_NODE`, `ERA_BY_NODE`, `SPOILER_BY_NODE`).

Relationships:

- There is no explicit parent/child or prerequisite schema in DB; ordering is linear via `JourneyNode.orderIndex`.
- Coverage goals are implicit via seed thresholds (`SEASON1_REQUIRED_LIMIT_PER_NODE`, `SEASON1_TARGET_PER_NODE`, `SEASON1_MIN_ELIGIBLE_PER_NODE`).

## Code map (files/functions)

Taxonomy and seed sources:

- `docs/season/season-1-horror-subgenre-curriculum.json`
- `scripts/seed-season1-horror-subgenres.ts`
  - `loadSpec`, `resolveMovieId`, `computeNodeScore`, `scoreMovieForNode`, `mapDiscoverGenres`
- `scripts/enrich-season1-horror-tags.ts`
  - `fetchTmdbKeywords`, `inferTagsFromKeywords`, `TAG_RULES`

Schema / persistence:

- `prisma/schema.prisma`
  - `JourneyNode`, `NodeMovie`, `Movie`
- `prisma/migrations/20260308190000_curriculum_nodes/migration.sql`

Catalog ingestion / normalization:

- `scripts/sync-tmdb-catalog.ts`
- `scripts/sync-tmdb-catalog-update.ts`
- `src/lib/tmdb/live-candidate-sync.ts`

Node retrieval and admin overrides:

- `src/app/api/admin/curriculum/route.ts`
- `src/app/api/admin/curriculum/node-movies/route.ts`
- `src/app/admin/curriculum/page.tsx`

Recommendation retrieval layer:

- `src/lib/recommendation/recommendation-engine.ts`
  - `resolveJourneyNodeWithCapacity`
  - `SqlCandidateGeneratorV1.generateCandidates` (curriculum-first, node fallback)
- `src/lib/recommendation/recommendation-engine-v1.ts`

Progression/journey state:

- `src/lib/journey/journey-progression-service.ts`
- `src/lib/experience-state.ts`

UI rendering:

- `src/app/journey/page.tsx`
- `src/components/journey/MovieCard.tsx`
- `src/app/api/movies/subgenres/route.ts` (renders `Movie.genres`, not `NodeMovie`)

## Dataflow diagram (text)

1. Ingestion/catalog creation
   - TMDB sync scripts upsert `Movie` + rating sources + coarse genres.

2. Metadata normalization
   - Genre IDs mapped to text tags; optional keyword enrichment appends inferred tags.

3. Node modeling
   - Seed script loads 16-node taxonomy spec and per-node curated title lists.

4. Node assignment
   - Curated title resolution: local title/year match, then TMDB lookup fallback.
   - Top-up derivation: rules over `Movie.genres` + title patterns + node thresholds.

5. Persistence
   - Node definitions in `JourneyNode`, assignments in `NodeMovie`.

6. Retrieval (Companion/Recs)
   - Recs: candidate generator uses `NodeMovie` for current journey node (curriculum-first).
   - Companion subgenre chip API uses `Movie.genres` (not node assignments).

7. UI rendering
   - Journey/recommendation cards display narrative + subgenres from `Movie.genres` endpoint.

## Audit findings (coverage stats + anomalies)

Audit script: `scripts/audit-season1-node-population.ts`
Gold fixture: `tests/fixtures/season1-node-gold.json` (32 films)

Runtime results (current DB):

- Taxonomy nodes in spec: `16`
- DB nodes for `season-1/horror`: `16`
- Total `NodeMovie` assignments: `2374`
- Unique assigned movies: `1454`
- Horror-tagged catalog movies with no node assignment: `4130`
- Nodes never used: `0`
- Films assigned to >4 nodes: `13`
- Distinct-pair co-occurrence anomalies found: `3` pairs

Node size imbalance (selected):

- `supernatural-horror`: `376`
- `creature-monster`: `335`
- `slasher-serial-killer`: `317`
- `splatter-extreme`: `204`
- vs several fixed at `64`

Gold fixture outcome:

- Samples: `32`
- Missing movie in DB: `1` (`Hausu`, 1977)
- Hard mismatch (no expected-node overlap): `0`
- Partial mismatch example: `Shaun of the Dead` expected `horror-comedy + apocalyptic-horror`, assigned `horror-comedy + survival-horror`

Interpretation:

- Assignment system is recall-heavy and over-assigns broad/high-overlap nodes.
- Coverage is broad but specificity is inconsistent.

## Root cause hypotheses (ranked, with evidence)

1. Competing Season 1 seed paths (10-node vs 16-node)
- Evidence: `seed:catalog` uses `seedStarterHorrorCatalog` with legacy 10-node `SEASON_1_CURRICULUM` in `src/lib/testing/catalog-seed.ts`; 16-node flow is separate in `scripts/seed-season1-horror-subgenres.ts`.
- Impact: depending on operator workflow, "missing nodes" occurs.

2. Top-up default is effectively unbounded
- Evidence: `parseTargetPerNode` defaults to `'all'` when `SEASON1_TARGET_PER_NODE` unset; then seed inserts all passing candidates.
- Impact: huge node inflation and cross-node overlap.

3. Broad tag model collapses distinctions
- Evidence: heavy dependence on generic tags (`horror`, `thriller`, `mystery`) and title regex in `computeNodeScore` + `enrich-season1-horror-tags.ts` rules.
- Impact: unrelated co-occurrence and multi-node dominance.

4. No assignment provenance stored
- Evidence: `NodeMovie` stores only `(nodeId, movieId, rank)`; no source type, score, evidence, seed run id.
- Impact: difficult root-cause debugging and regressions.

5. Retrieval/rendering split-brain (`NodeMovie` vs `Movie.genres`)
- Evidence: Recs use node assignments; UI subgenre chips use `Movie.genres` endpoint.
- Impact: user-visible labels can diverge from node assignment logic.

6. Legacy docs and operational flow created taxonomy drift risk
- Evidence: `docs/season/season-1-horror.md` previously described 10-unit map while active taxonomy is 16-node JSON.
- Impact: operator confusion and inconsistent maintenance.

## Failure-mode checklist evaluation

- Taxonomy drift: **YES (historically)** due dual seed/doc paths.
- Overly broad tags: **YES**.
- Embeddings mismatch: **Not primary** (node assignment is not embedding-driven today).
- Threshold issues: **YES** (default `'all'` top-up too loose).
- Missing metadata fields: **Contributing** (keyword/tag sparsity hurts precision).
- LLM extraction inconsistency: **Low for node assignment** (LLM not in node assignment path).
- Leakage between seasons: **Potential but low** (pack scoping exists; still ensure seed scripts never cross-pack).
- Caching/materialized-view staleness: **No materialized views found for nodes**.
- Admin overrides overwritten: **Potential** (re-running full seed rewrites node assignments).
- Wrong join keys (filmId/externalId): **No direct mismatch found**; joins are DB `movieId`/`nodeId` based.

## Recommendations (adapted to current stack)

A) Hybrid ontology + ML classifier

- Keep current curated 16-node ontology with definitions and canonical positives/negatives per node.
- Train multi-label classifier over local features:
  - synopsis text (if stored), keywords/themes, cast/crew, existing tags.
- Use model score + ontology constraints; keep admin override as final control.

B) Embedding-based multi-label + calibration

- Add domain-tuned embedding features for movie text/tags.
- Use per-node calibrated thresholds (temperature scaling/isotonic) instead of one global threshold style.
- Apply top-k with diversity/anti-correlation constraints.

C) Weak supervision label model (Snorkel-style)

- Convert current regex/rule heuristics into explicit labeling functions.
- Learn LF accuracies and conflicts; generate probabilistic labels.
- Train discriminative multi-label model on those labels.

D) LLM-assisted but deterministic offline labeling

- Use LLM only in offline curation jobs to propose `(nodes, evidence)`.
- Cache results, enforce human approval in admin, lock per release.
- Persist evidence strings and confidence for each assignment.

E) Ontology governance and regression controls

- Version taxonomy per season release (`taxonomy_version`).
- Store provenance per `NodeMovie` (`source=curated|rule|ml|override`, score, evidence, runId).
- Add CI regression tests for node coverage, overlap, and fixture agreement.
- Add drift dashboard: node size distribution, co-occurrence alerts, % no-node horror titles.

## Proposed next steps (2-phase plan)

Phase 1: quick fixes (1-3 days)

1. Enforce 16-node authoritative seed path in all setup/deploy workflows.
2. Change default `SEASON1_TARGET_PER_NODE` from `'all'` to bounded numeric target.
3. Add provenance fields to `NodeMovie` (or sidecar table) and write source/score/evidence on seed.
4. Add CI check that Season 1 DB nodes exactly match taxonomy 16 slugs.

Phase 2: robust redesign (1-3 sprints)

1. Build weak-supervision + calibrated multi-label classifier pipeline.
2. Introduce offline label proposal workflow with human approval + release locking.
3. Unify display semantics so user-visible subgenre chips are derived from audited node assignments (or clearly separated labels).
4. Add continuous drift monitoring + automatic alerts.

## Added artifacts in this change

- Audit report: `docs/season1-node-population-audit.md`
- Deterministic audit script: `scripts/audit-season1-node-population.ts`
- Gold fixture: `tests/fixtures/season1-node-gold.json`
- Minimal regression tests: `tests/unit/season1-node-audit.test.ts`

Also applied to remove legacy 10-node path from active Season 1 operation:

- `scripts/seed-season1-horror-subgenres.ts` now deletes non-spec nodes for the pack.
- `package.json` `setup:dev` now runs `seed:season1:subgenres` after `seed:catalog`.
- `docs/season/season-1-horror.md` updated to point to 16-node taxonomy as active.
