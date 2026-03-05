# Snapshot / DB Divergence Audit

Generated: 2026-03-05 (America/Chicago)

## Goal
Detect divergence between the curated authority artifacts (mastered snapshots), the imported `NodeMovie` assignments, and the materialized release items so we can block production publication when too many curated titles drop out of the end-to-end pipeline.

## Authority surfaces
- **Season 1**: `backups/season1-horror-snapshot-2026-03-04T19-19-00-138Z.json` (the latest snapshot emitted by the pre-publish pipeline; `assignments[]` lists the curated node slug, tier, and TMDB id).
- **Season 2**: `docs/season/season-2-cult-classics-mastered.json` (the canonical v3 snapshot populated from the import/build scripts; each node has `core`/`extended` arrays with `tmdbId`).

The audit script `scripts/audit-snapshot-db-divergence.ts` iterates both snapshots, loads the current `NodeMovie` and the latest published `SeasonNodeReleaseItem` for the matching pack, and writes the itemized summary files to `docs/engineering/snapshot-db-divergence.json`.

## Metrics (from the JSON output)
| Season | Pack | Curated count | Missing in DB | Missing in release | Loss rate |
| --- | --- | --- | --- | --- | --- |
| season-1 | `horror` | 2,235 | 207 | 1,467 | 74.9% |
| season-2 | `cult-classics` | 552 | 552 | 0 | 100% |

These numbers demonstrate that the current production catalog has neither the NodeMovie assignments nor the release items for a majority of the curated titles (Season 2 is still in migrate/seed phase). The raw items and classifications are available in `docs/engineering/snapshot-db-divergence.json` for deep-dive triage.

## Classification of missing items
The audit classifies missing items with `classifyMissingReason` (`src/lib/audit/snapshot-db-divergence.ts`):
1. `unresolved-tmdb`: curated snapshot refers to a TMDB id that does not exist in the `movie` table.
2. `eligibility-gate:poster`: the movie exists in the catalog but lacks a poster URL.
3. `eligibility-gate:credits`: there are zero cast entries in `movie.castTop`.
4. `eligibility-gate:votes`: no rating rows were recorded for the title.
5. `importer-schema`: all metadata is present, but the importer still did not populate a `NodeMovie`.

Use these categories to prioritize camera metadata fixes (poster/credits/votes) before re-running the importer.

## Guardrail for publishing
`enforceSnapshotGuardrail` (`src/lib/audit/snapshot-db-divergence.ts`) now runs as part of both `scripts/publish-season1-node-release.ts` and `scripts/publish-season2.ts`. It:
1. Computes the divergence summary for the release about to be published (using the same snapshot and the newly created release id).
2. Emits an unresolved titles report at `artifacts/snapshot-db-divergence/<season-slug>-unresolved.json` every time (even if there are zero unresolved titles).
3. Throws and aborts the publish when `(missingInDb + missingInRelease) / curatedCount > threshold`. The threshold defaults to `SNAPSHOT_DIVERGENCE_THRESHOLD_PCT=2` but can be widened temporarily with `SNAPSHOT_DIVERGENCE_OVERRIDE=true` for emergency reruns. Release scripts log the computed loss rate so the operator can decide when to re-seed.

Because Season 1 currently reports a 74.9% loss and Season 2 100%, a publish attempt would fail until the NodeMovie assignments and release items match the curated snapshots. That’s desired: the guardrail prevents “empty” releases from shipping silently.

## Outputs
- `docs/engineering/snapshot-db-divergence.json`: the canonical machine-readable record of every missing/tier-drift/node-drift item.
- `artifacts/snapshot-db-divergence/<season>-unresolved.json`: a per-season unresolved TMDB report emitted on each guardrail run.
- `scripts/audit-snapshot-db-divergence.ts`: rerunnable script for regenerating the JSON snapshot (also used to refresh the doc).
- `src/lib/audit/snapshot-db-divergence.ts`: shared diff/guardrail logic and helper tests.
- `tests/unit/snapshot-db-divergence.test.ts`: unit tests that cover reason classification and guardrail threshold math.

## Next steps
1. Resolve the Season 1 release mismatch by importing the 1,467 missing release rows (or widening the guardrail threshold temporarily while maintaining data hygiene).
2. Complete Season 2 seeding so the 552 curated titles reach the DB before retrying publish.
3. Re-run `scripts/audit-snapshot-db-divergence.ts` and verify the loss rates drop below the guardrail; keeping the JSON/src artifacts in sync ensures the guardrail and recommendations stay honest.
