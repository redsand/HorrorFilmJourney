# Season Template Workflow

This workflow creates a new season/pack scaffold and automatically registers it for integrity audits.

## Command

```bash
npm run seasons:create-template -- \
  --season-slug season-3 \
  --pack-slug neo-noir \
  --season-name "Season 3" \
  --pack-name "Neo Noir" \
  --taxonomy-version season-3-neo-noir-v1 \
  --node-slugs foundations,crime,classics,modern
```

Required flags:
- `--season-slug`
- `--pack-slug`

Optional flags:
- `--season-name`
- `--pack-name`
- `--taxonomy-version`
- `--node-slugs` (comma-separated)
- `--provision-db` (upsert `Season` + `GenrePack`)
- `--primary-genre` (default: pack slug with spaces)
- `--season-active` (default: false)
- `--pack-enabled` (default: false)
- `--allow-custom-node-slugs` (only for intentional non-comprehensive custom sets)

## One-Step Provisioning

To scaffold and provision DB rows in one command:

```bash
npm run seasons:create-template -- \
  --season-slug season-3 \
  --pack-slug sci-fi \
  --season-name "Season 3" \
  --pack-name "Sci-Fi" \
  --taxonomy-version season-3-sci-fi-v1 \
  --node-slugs foundations,space-opera,cyberpunk,time-travel,alien-contact \
  --provision-db \
  --primary-genre "science fiction"
```

## Generated Files

The scaffold generator writes:
- `docs/season/<season>-<pack>-config.json` (season config)
- `docs/season/<season>-<pack>-node-governance.json` (node governance template)
- `docs/season/<season>-<pack>-mastered.template.json` (snapshot template)
- `docs/season/<season>-<pack>-fallback-candidates.json` (fallback snapshot)
- `docs/season/<season>-<pack>-anchors.json` (anchor list)

It also updates:
- `docs/season/season-integrity-registry.json`

## Sci-Fi Node Coverage Guardrail

For `--pack-slug sci-fi`, the generator now uses a built-in comprehensive profile by default (16 nodes), including:
- proto-science-fiction
- space-opera
- hard-science-fiction
- cyberpunk
- dystopian-science-fiction
- post-apocalyptic-science-fiction
- time-travel-science-fiction
- alternate-history-multiverse
- artificial-intelligence-robotics
- alien-contact-invasion
- biopunk-genetic-engineering
- military-science-fiction
- science-fiction-horror
- social-speculative-science-fiction
- new-weird-cosmic-science-fiction
- retrofuturism-steampunk-dieselpunk

If you pass a custom `--node-slugs` list for sci-fi that is narrower than this set, the command fails unless `--allow-custom-node-slugs` is also passed.

## CI Auto-Inclusion

Integrity CI jobs automatically include every season in `docs/season/season-integrity-registry.json`:
- `npm run seasons:doctor:dry-run`
- `node --experimental-strip-types scripts/audit-canon-anchors.ts`
- `node --experimental-strip-types scripts/audit-snapshot-db-divergence.ts`

No workflow edits are required when adding a new season through the scaffold generator.

## Operational Notes

- New season templates start with empty anchors and empty snapshot entries.
- If a season has no authority entries yet, divergence loss rate remains `0.00%` until curation data is added.
- After curating data, rerun:
  - `npm run seasons:doctor:dry-run`
  - `npm run audit:canon:anchors`
