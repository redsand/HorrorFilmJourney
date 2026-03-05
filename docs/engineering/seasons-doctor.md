# Seasons Doctor

`seasons:doctor` is the operational workflow for season integrity drift.

## What it does
1. Computes snapshot/database divergence for all seasons in `docs/season/season-integrity-registry.json`.
2. Checks each season loss rate against threshold (default `2%`, configurable).
3. If any season is over threshold:
   - runs `repair-season-dataset.ts`
   - reruns divergence after repair.
4. Writes a timestamped report bundle under:
   - `docs/engineering/season-doctor/<timestamp>/`

Bundle contents:
- `divergence-pre.json`
- `repair-report.json` (only when repair is triggered)
- `divergence-post.json`
- `summary.json`

## Commands
- Normal mode (can write DB):
  - `npm run seasons:doctor`
- Dry run (read-only reporting; no DB writes):
  - `npm run seasons:doctor:dry-run`
- Custom threshold:
  - `npm run seasons:doctor -- --threshold-pct 1.5`

## Dry-run behavior
- `--dry-run` passes through to `repair-season-dataset.ts --dry-run`.
- Repair actions are reported as planned counts.
- No `Movie`, `NodeMovie`, or release rows are written.

## Threshold configuration
- CLI:
  - `--threshold-pct <number>`
- Env fallback:
  - `SNAPSHOT_DIVERGENCE_THRESHOLD_PCT`
- Default:
  - `2`

## CI mode (read-only)
- CI should run `npm run seasons:doctor:dry-run`.
- Start non-blocking and archive the generated report directory as artifacts.

## Season onboarding
- Add new season scaffolds with:
  - `npm run seasons:create-template -- --season-slug <slug> --pack-slug <pack>`
- This updates `docs/season/season-integrity-registry.json`, which automatically includes the season in doctor runs.
