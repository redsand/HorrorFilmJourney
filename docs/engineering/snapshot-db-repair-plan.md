# Snapshot/DB Repair Plan

Generated: 2026-03-04 (America/Chicago)

## Scope
- Reconciled curated authority snapshots with runtime DB for:
  - Season 1 snapshot: `backups/season1-horror-snapshot-2026-03-04T19-19-00-138Z.json`
  - Season 2 snapshot: `docs/season/season-2-cult-classics-mastered.json`
- Compared and repaired:
  - `NodeMovie` assignments
  - published `SeasonNodeReleaseItem` rows

## What Was Added
- New repair pipeline script: `scripts/repair-season-dataset.ts`
  - Loads both curated snapshots.
  - Computes divergence using `computeSnapshotDivergence`.
  - Classifies missing titles by existing logic:
    - `unresolved-tmdb`
    - `eligibility-gate:poster`
    - `eligibility-gate:credits`
    - `eligibility-gate:votes`
    - `importer-schema`
  - Repairs DB for valid curated titles by upserting `NodeMovie` with authoritative `nodeSlug` + `tier`.
  - Corrects `node-drift` and `tier-drift`.
  - Rebuilds/publishes release from repaired assignments.
  - Re-runs divergence and fails if loss rate is `>= 2%`.
- Divergence fix in `src/lib/audit/snapshot-db-divergence.ts`:
  - `missing-in-release` is now computed for `CORE` items only (release snapshot is CORE-scoped).

## Repair Results
Source report: `docs/engineering/snapshot-db-repair-report.json`

| Season | Pack | Pre-loss | Post-loss | NodeMovie inserted | Node drift fixed | Tier drift fixed | Published release items |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| season-1 | horror | 9.26% | 0.00% | 207 | 1 | 1 | 500 |
| season-2 | cult-classics | 100.00% | 0.18% | 551 | 0 | 0 | 170 |

Post-repair verification: both seasons are now below the `< 2%` loss threshold.

## Classification Output

### Titles requiring TMDB resolution (`unresolved-tmdb`)
- `Naked Blood` (1996), node `grindhouse-exploitation`, tier `EXTENDED`, tmdbId `778000`

### Titles missing metadata
- `eligibility-gate:poster`: none
- `eligibility-gate:credits`: none
- `eligibility-gate:votes`: none

### Importer failures (`importer-schema`)
- Season 1: 207 titles
- Season 2: 551 titles
- Full title-level lists are in:
  - `docs/engineering/snapshot-db-repair-report.json`:
    - `results[].buckets.importerSchema`

## Repair Strategy (Pipeline)
1. Resolve season + pack context.
2. Load authoritative assignments from curated snapshots.
3. Detect divergence (`missing-in-db`, `node-drift`, `tier-drift`, `missing-in-release`).
4. For repairable entries (`importer-schema`, `node-drift`, `tier-drift`):
   - upsert/update `NodeMovie` using authoritative `nodeSlug`, `tier`, `rank`, `coreRank`, and active taxonomy version.
5. Publish a fresh release snapshot from repaired assignments.
6. Re-run divergence and enforce loss `< 2%`.

## Validation Run
- Executed:
  - `node --experimental-strip-types scripts/repair-season-dataset.ts`
- Output:
  - `docs/engineering/snapshot-db-repair-report.json`

