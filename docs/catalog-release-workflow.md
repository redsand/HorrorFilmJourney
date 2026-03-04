# Catalog Release Workflow (Season 1, Local-First)

This workflow keeps all writes local until you explicitly run the guarded remote publish command.

## Scope

- Season: `season-1`
- Pack: `horror`
- Taxonomy source of truth: `src/config/seasons/season1-node-governance.ts`
- Canonical user-facing assignments: latest published `SeasonNodeRelease` snapshot

## Commands

1. Build local catalog

```bash
npm run local:build-catalog
```

What it does:
- Seeds local catalog (`seed:catalog`) unless `--skipCatalog`
- Seeds Season 1 nodes + assignments using weak supervision/governance
- Creates and publishes local Season 1 snapshot (`SEASON1_PUBLISH_SNAPSHOT=true`)

Optional:

```bash
npm run local:build-catalog -- --withClassifierAssist
```

2. Verify local catalog

```bash
npm run local:verify-catalog
```

What it checks:
- Runs `audit:season1:nodes`
- CI-like regression tests (taxonomy count, overlap constraints, snapshot read path, fixtures)
- Writes verification stamp:
  - `artifacts/verification/season1-catalog-verification.json`

The remote publish command requires this stamp and all checks passing.

3. Preview locally

```bash
npm run local:preview-catalog
```

Shows current published snapshot summary and URLs to inspect in UI.

## Local Snapshot Publish (Admin)

UI:
- `/admin/curriculum` now includes a "Season 1 Node Governance" panel.
- You can:
  - inspect proposed assignments (sample list with score/source)
  - accept/reject assignments
  - publish latest snapshot

API:
- `GET/POST /api/admin/season1/node-assignments`
- `GET/POST /api/admin/season1/node-releases`
- `GET /api/admin/season1/node-monitor`

## Optional Local Model Training

```bash
npm run train:season1:classifier
```

Then use classifier assist in seed:

```bash
SEASON1_CLASSIFIER_ASSIST_ENABLED=true npm run seed:season1:subgenres
```

## Guarded Remote Publish

Remote writes are blocked unless both flags are provided:
- `--publishRemote`
- `--iUnderstandThisWritesRemote`

Command:

```bash
npm run remote:publish-catalog -- --publishRemote --iUnderstandThisWritesRemote --remoteUrl="postgresql://..."
```

Preflight behavior:
- Requires verification stamp from `local:verify-catalog`
- Requires all checks passing
- Requires local published snapshot taxonomy/run to match stamp
- Requires remote catalog to already contain referenced movies (matched by `tmdbId`)

Safety behavior:
- Creates backup file before writing:
  - `artifacts/backups/season1-remote-catalog-backup-*.json`
- Publishes in a single transaction
- Leaves previous remote releases in DB (not deleted), marks newest published

## Rollback

Use rollback mode to re-publish a prior remote release id:

```bash
npm run remote:publish-catalog -- --publishRemote --iUnderstandThisWritesRemote --remoteUrl="postgresql://..." --rollbackToReleaseId="<release-id>"
```

How to find release id:
- Use backup file fields `currentPublishedReleaseId` or `releases[]`.

## Determinism Notes

- No network calls are used in CI tests.
- Seeding/audit behavior is deterministic for fixed local data + run inputs.
- For deterministic test runs, inject run ids via env:
  - `SEASON1_ASSIGNMENT_RUN_ID`
  - `SEASON1_TAXONOMY_VERSION`
