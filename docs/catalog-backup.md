# Catalog Backup and Restore

Use these scripts to snapshot your current local movie dataset, restore it later, and then run incremental TMDB updates for newer releases only.

## 1) Backup current dataset

```bash
npm run catalog:backup
```

Optional custom path:

```bash
npm run catalog:backup -- --output backups/my-catalog-backup.json
```

Backup includes:
- movies
- movie ratings
- evidence packets
- summary metadata (`maxTmdbId`, `latestReleaseDate`)

## 2) Restore dataset locally (non-destructive)

```bash
npm run catalog:restore -- --input backups/my-catalog-backup.json
```

Restore behavior:
- idempotent upserts by `tmdbId`
- ratings upserted by `(movieId, source)`
- evidence deduped/upserted by deterministic hash
- existing data is updated/merged, not reset

## 3) Sync newer movies only after restore

### Option A: explicit release-date cutoff

```bash
TMDB_UPDATE_RELEASE_DATE_GTE=2026-01-01 npm run sync:tmdb:update
```

### Option B: use cutoff from backup metadata

```bash
TMDB_UPDATE_FROM_BACKUP=backups/my-catalog-backup.json npm run sync:tmdb:update
```

`sync:tmdb:update` always scans newer TMDB IDs. With a date cutoff enabled, it additionally ignores results older than that date.
