# Season 2 Status Audit (Cult Classics)

Generated: 2026-03-04 (America/Chicago)  
Scope: analysis-only audit of current Season 2 implementation in CinemaCodex.

## 1. Season 2 files discovered

### Core season/pack/node scaffolding

- `prisma/migrations/20260309120000_season2_cult_classics_prep/migration.sql`  
  Seeds `season-2`, `cult-classics`, and 8 Season 2 `JourneyNode` definitions.
- `docs/season/season-2-cult-classics.md`  
  Human-facing Season 2 spec and launch checklist.
- `docs/season/season-2-cult-classics-curriculum.json`  
  Canonical curated list spec (`seasonSlug`, `packSlug`, 8 nodes, titles, subgenres).
- `docs/season/season-2-cult-classics-readiness.md`  
  Seed output report with per-node readiness stats.
- `docs/season/season-2-cult-classics-mastered.json`  
  Canonical/mastered snapshot export artifact.
- `backups/season2-cult-mastered-*.json`  
  Timestamped mastered backups.

### Curation + source-vote artifacts

- `docs/season/season-2-cult-candidates-full-review.json`  
  Full candidate pool classification output.
- `docs/season/season-2-cult-candidates-shortlist.json`  
  Filtered shortlist from full review.
- `docs/season/season-2-cult-candidates-curated.json`  
  Curated shortlist output after rejection policy.
- `docs/season/season-2-cult-candidates-needing-review.json`  
  Manual review queue generated during seed/top-up.
- `docs/season/season-2-cult-classics-blocklist.json`  
  Curated rejects/blocks.
- `docs/season/season-2-cult-classics-allowlist.json`  
  Curated override includes.
- `docs/season/season-2-source-vote-input.json`  
  Source-vote input list.
- `docs/season/season-2-source-votes.json`  
  Source-vote aggregation output.
- `docs/season/season-2-source-vote-missing.json`  
  Source-vote threshold misses for gap filling.
- `docs/season/season-2-curation-summary.md`  
  Workflow summary for review/curate/seed/publish.

### Season 2 scripts and commands

- `scripts/seed-season2-cult-curriculum.ts` (`npm run seed:season2:cult`)  
  Main resolver + eligibility-gated assignment script.
- `scripts/review-season2-candidate-pool.ts` (`npm run review:season2:candidates`)  
  Builds full candidate pool from catalog.
- `scripts/curate-season2-shortlist.ts` (`npm run curate:season2`)  
  Applies curated block/allow policy.
- `scripts/season2-source-vote-gate.ts` (`npm run season2:source-votes`)  
  Aggregates source votes and optionally patches curriculum.
- `scripts/publish-season2.ts` (`npm run publish:season2`)  
  Readiness/publish gate for season activation.
- `scripts/season2-lock.ts` (`npm run season2:lock`)  
  Pipeline orchestration wrapper.
- `scripts/export-season2-mastered.ts` (`npm run export:season2:cult`)  
  DB -> timestamped backup export.
- `scripts/export-season2-canonical.ts` (`npm run export:season2:canonical`)  
  DB -> canonical `docs/season/season-2-cult-classics-mastered.json`.
- `scripts/import-season2-mastered.ts` (`npm run import:season2:cult`)  
  Mastered JSON -> DB upsert/import.
- `scripts/audit-cult-controls.ts` (`npm run audit:cult:controls`)  
  Cult-score control set check against TMDB.
- `scripts/update-seasons.ts`  
  Runs Season 1 seed + Season 2 seed + Season 2 publish dry-run/apply.

### Related config/runtime wiring findings

- `src/ontology/seasons/index.ts`  
  Only Season 1 ontology is registered.
- `src/ontology/prototypes/seasons/index.ts`  
  Only Season 1 prototype pack is registered.
- `src/lib/nodes/weak-supervision/seasons/index.ts`  
  Only Season 1 weak-supervision plugin is registered.
- `src/lib/nodes/governance/index.ts` and `src/lib/nodes/governance/season1-governance.ts`  
  Governance config is Season 1-only.
- `src/lib/curriculum/eligibility.ts`  
  Shared eligibility gate used by both Season 1 and Season 2 seed scripts.
- `tests/unit/season-2-curriculum-spec.test.ts`  
  Asserts 8 nodes and title/duplicate constraints in curriculum file.
- `tests/prisma/season-2-curriculum-integrity.test.ts`  
  Integrity test exists, but only enforced when `SEASON2_ENFORCE_THRESHOLDS=true`.

## 2. Current ontology

### Node count and confirmation

- Current Season 2 node count: **8**.
- Expected “~8 nodes” is **accurate**.

### Node definitions (live DB)

| order | slug | name | learning objective | node signals |
| ---: | --- | --- | --- | --- |
| 1 | `origins-of-cult-cinema` | The Birth of Midnight Movies | Origins of cult fandom and underground screenings. | whatToNotice + subgenres |
| 2 | `grindhouse-exploitation` | Grindhouse & Exploitation | Low-budget rebellion and shock cinema. | whatToNotice + subgenres |
| 3 | `psychotronic-cinema` | So-Bad-It's-Good | Accidental masterpieces and ironic worship. | whatToNotice + subgenres |
| 4 | `cult-science-fiction` | Cult Sci-Fi & Fantasy | Visionary oddities and misunderstood epics. | whatToNotice + subgenres |
| 5 | `outsider-cinema` | Punk & Counterculture Cinema | Anti-establishment film movements. | whatToNotice + subgenres |
| 6 | `video-store-era` | VHS & The Video Store Era | Shelf discoveries and rental legends. | whatToNotice + subgenres |
| 7 | `camp-cult-comedy` | Cult Comedy & Absurdism | Offbeat humor that found devoted fans. | whatToNotice + subgenres |
| 8 | `modern-cult-phenomena` | Modern Cult Phenomena | Films that became cult in the internet age. | whatToNotice + subgenres |

### Keywords / LF signals status

- No Season 2 ontology file in `src/config/seasons/ontologies/season-2.json`.
- No Season 2 weak-supervision plugin (`src/lib/nodes/weak-supervision/seasons` is Season 1-only).
- No Season 2 node-level LF keyword maps.
- Practical Season 2 “signals” currently come from:
  - `JourneyNode.whatToNotice`
  - Curriculum `subgenres`
  - Script-level cult heuristics (`CULT_KEYWORD_HINTS`, franchise/animation penalties, etc.) in `seed-season2-cult-curriculum.ts`.

## 3. Prototype sets

### Current implementation status

- No Season 2 prototype pack file exists at `src/config/seasons/prototype-packs/season-2.json`.
- No Season 2 in-memory prototype pack is registered in `src/ontology/prototypes/seasons/index.ts`.
- No Season 2 ontology registration exists, so prototype similarity cannot run for Season 2 via the ontology/prototype pipeline.

### Per-node prototype table

| node_slug | prototype_count | example_titles |
| --- | ---: | --- |
| `origins-of-cult-cinema` | 0 | n/a |
| `grindhouse-exploitation` | 0 | n/a |
| `psychotronic-cinema` | 0 | n/a |
| `cult-science-fiction` | 0 | n/a |
| `outsider-cinema` | 0 | n/a |
| `video-store-era` | 0 | n/a |
| `camp-cult-comedy` | 0 | n/a |
| `modern-cult-phenomena` | 0 | n/a |

### Embeddings + similarity status

- Prototype embeddings for Season 2: **not present** (no prototype pack).
- Similarity scoring code exists globally (`prototypeSimilarity.ts`) but Season 2 is effectively **inactive** because required Season 2 ontology/prototype assets are missing.

## 4. Ingestion scripts

### `scripts/review-season2-candidate-pool.ts`

- Input source: DB catalog (`Movie` + selected ratings).
- Output: `docs/season/season-2-cult-candidates-full-review.json`.
- Output behavior: classifies catalog rows into `keep` / `review` / `reject`.
- Dedup: none in-script for generation (list output can include distinct rows by movie).
- TMDB ID resolution: none (reads existing `Movie.tmdbId`).

### `scripts/curate-season2-shortlist.ts`

- Input source: `season-2-cult-candidates-shortlist.json`.
- Output:
  - `season-2-cult-candidates-curated.json`
  - `season-2-cult-classics-blocklist.json`
  - `season-2-cult-classics-allowlist.json`
- Output behavior: rejects by policy (post-2010, animation, franchise/high-mainstream patterns).
- Dedup: yes (`normalizeTitle + year` key set).
- TMDB ID resolution: none (uses existing IDs in shortlist rows).

### `scripts/season2-source-vote-gate.ts`

- Input source:
  - `season-2-source-vote-input.json`
  - `season-2-cult-classics-curriculum.json`
- Output:
  - `season-2-source-votes.json`
  - `season-2-source-vote-missing.json`
  - optional curriculum mutation with `--apply`
- Output behavior: vote aggregation and threshold-gated missing-title detection.
- Dedup: yes (normalized `title|year` key map).
- TMDB ID resolution: none (title/year-level voting).

### `scripts/seed-season2-cult-curriculum.ts`

- Input source:
  - Primary: `season-2-cult-classics-curriculum.json`
  - Overrides: blocklist/allowlist JSON
  - Optional CSV: `SEASON2_IMDB_LIST_PATH` (`title,year` parser)
  - Optional TMDB discover/top-up feed
- Output behavior:
  - Upserts `Movie` + ratings as needed
  - Rewrites `NodeMovie` assignments per node
  - Writes readiness + review queue artifacts
- Dedup logic:
  - Title/year key dedup in spec merges
  - Optional global dedup across node assignments
  - Duplicate counter + allowed overlap keys
- TMDB ID resolution logic:
  - Local DB title/year lookup first
  - Fallback TMDB search (`/search/movie`) + details (`/movie/{id}?append=credits,keywords`)
  - Optional discover top-up (`/discover/movie`)
  - Persists/upserts TMDB + popularity + metadata.

### `scripts/import-season2-mastered.ts`

- Input source: mastered JSON (`--input`).
- Output behavior:
  - Upserts season/pack/nodes/movies/ratings
  - Deletes and recreates node assignments for imported nodes
  - Optional activation (`--activate`)
- Dedup logic:
  - Node-local dedup by `tmdbId` via `Map`
- TMDB ID resolution:
  - None (expects explicit `tmdbId` in import file).

### `scripts/export-season2-mastered.ts` / `scripts/export-season2-canonical.ts`

- Input source: DB.
- Output behavior: exports node/title assignments with metadata and summary.
- Dedup logic: summary includes unique TMDB count.
- TMDB ID resolution: none (reads persisted IDs).

## 5. Candidate pool size

Live DB counts (queried 2026-03-04):

- `totalTmdbMovies`: **22546**
- `season2Assignments`: **0**
- `season2UniqueMovies`: **0**

Artifact-derived Season 2 pool/snapshot counts:

- `season2CandidatePool`: **17616**  
  Source: `season-2-cult-candidates-full-review.json` (`summary.total`, generated `2026-03-04T04:59:54.421Z`)
- `season2Assignments` (snapshot): **516**  
  Source: `season-2-cult-classics-mastered.json` (`summary.totalAssigned`, generated `2026-03-04T00:29:07.883Z`)
- `season2UniqueMovies` (snapshot): **515**  
  Source: `season-2-cult-classics-mastered.json` (`summary.uniqueTmdb`)

Requested count block:

- `totalTmdbMovies`: **22546**
- `season2CandidatePool`: **17616**
- `season2Assignments`: **0** (live DB) / **516** (snapshot artifact)
- `season2UniqueMovies`: **0** (live DB) / **515** (snapshot artifact)

## 6. Node distribution

Live DB distribution (current runtime state):

| node_slug | core_count | extended_count | total_count |
| --- | ---: | ---: | ---: |
| `origins-of-cult-cinema` | 0 | 0 | 0 |
| `grindhouse-exploitation` | 0 | 0 | 0 |
| `psychotronic-cinema` | 0 | 0 | 0 |
| `cult-science-fiction` | 0 | 0 | 0 |
| `outsider-cinema` | 0 | 0 | 0 |
| `video-store-era` | 0 | 0 | 0 |
| `camp-cult-comedy` | 0 | 0 | 0 |
| `modern-cult-phenomena` | 0 | 0 | 0 |

Snapshot distribution (`season-2-cult-classics-mastered.json`, tier split not stored there):

| node_slug | total_count |
| --- | ---: |
| `origins-of-cult-cinema` | 85 |
| `grindhouse-exploitation` | 65 |
| `psychotronic-cinema` | 41 |
| `cult-science-fiction` | 53 |
| `outsider-cinema` | 69 |
| `video-store-era` | 61 |
| `camp-cult-comedy` | 71 |
| `modern-cult-phenomena` | 71 |

## 7. Governance rules

### Journey-worthiness and quality gating

- Season 2 seed does **not** use Season 1 weak-supervision + journey-worthiness scoring pipeline.
- Season 2 seed does use shared `evaluateCurriculumEligibility(...)` gate (poster, ratings, reception, credits).
- No Season 2-specific `src/config/seasons/season2-node-governance.ts` exists.
- No Season 2 weak-supervision plugin exists.

### Season 2-specific rule controls currently in use

- Cult heuristic score threshold: `SEASON2_CULT_SCORE_MIN` (default 4).
- Discover controls: `SEASON2_DISCOVER_*` env family.
- Year cap: `SEASON2_MAX_YEAR` (default 2010 in seed script).
- Optional top-up mode + node sizing: `SEASON2_ENABLE_TOPUP`, `SEASON2_NODE_SIZE`.
- Source-vote threshold: `SEASON2_SOURCE_VOTE_THRESHOLD` (default 3).
- Publish-time balance gate: `SEASON2_ENFORCE_BALANCE` in `publish-season2.ts`.
- Curated overrides:
  - Allowlist JSON (`season-2-cult-classics-allowlist.json`)
  - Blocklist JSON (`season-2-cult-classics-blocklist.json`)

## 8. Known issues

1. Live DB has zero Season 2 assignments despite a populated mastered snapshot artifact.
2. Season 2 runtime ontology is missing (`season-2` ontology file/registration absent).
3. Season 2 prototype pack is missing (no prototype embeddings or prototype-title sets wired).
4. Season 2 LF plugin is missing (Season 1-only weak-supervision plugin architecture).
5. Season 2 governance config is missing (Season 1-only governance model files).
6. Candidate pool is large (17,616), but curated-to-assigned state is not reflected in live DB.
7. Tiered core/extended modeling is effectively unused for Season 2 in current live DB state.
8. CSV ingestion exists only as optional hook (`SEASON2_IMDB_LIST_PATH`) and is not wired to `resources/cult classic list 1.csv` by default.
9. Integrity tests for Season 2 strict gates are opt-in (`SEASON2_ENFORCE_THRESHOLDS=true`), so critical failures can bypass CI by default.
10. State divergence risk: docs/backups can show “ready” while runtime DB remains empty.

