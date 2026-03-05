# CI Integrity Pipeline

Generated: 2026-03-05 (America/Chicago)

## Goal

Integrate platform integrity checks into CI as non-blocking jobs while we stabilize data/runtime parity.

## Workflow

- File: [ci-integrity-pipeline.yml](C:/Users/TimShelton/source/repos/HorrorFilmJourney/.github/workflows/ci-integrity-pipeline.yml)
- Trigger:
  - `workflow_dispatch`
  - `pull_request`
  - `push` on `main`

## Non-Blocking Jobs

All jobs are configured with `continue-on-error: true`.

1. `Seasons Doctor (Dry Run)`
   - Command: `npm run seasons:doctor:dry-run`
2. `RAG Grounding Harness`
   - Command: `npx vitest run tests/rag/grounding.test.ts`
3. `Release Core Contract`
   - Command: `npx vitest run tests/unit/release-core-contract.test.ts`
4. `Canon Anchor Audit`
   - Command: `node --experimental-strip-types scripts/audit-canon-anchors.ts`

## Artifacts Uploaded

The workflow always attempts to upload these outputs (`if: always()`):

- `docs/engineering/season-doctor/*`
- `artifacts/release-core-contract/*`
- `docs/engineering/canon-anchor-integrity-report.json`

If a path is absent in a run, artifact upload uses `if-no-files-found: warn`.

## Notes

- DB-dependent jobs read `DATABASE_URL`/`TEST_DATABASE_URL` from CI secrets.
- Current mode is observability-first (non-blocking); jobs can be made blocking once stability is confirmed.
