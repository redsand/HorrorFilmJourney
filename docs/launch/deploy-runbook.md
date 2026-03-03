# Deploy Runbook (cinemacodex.com)

## 1) Pre-deploy checks

1. Confirm env is complete using:
   - [env-vars.md](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/docs/launch/env-vars.md)
2. Validate locally:
   - `npm run validate:rc`
3. Confirm release docs:
   - [production-readiness.md](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/docs/launch/production-readiness.md)

## 2) Deploy sequence

1. Build artifact:
   - `npm ci`
   - `npm run build`
2. Apply DB migrations:
   - `npx prisma migrate deploy`
3. Generate Prisma client:
   - `npm run prisma:generate`
4. Bootstrap admin (safe/idempotent):
   - `npm run bootstrap:admin`
5. Ensure catalog exists:
   - `npm run seed:catalog`
6. Start app:
   - `npm run dev` (local) or production process manager command

## 3) Post-deploy smoke

1. UI checks:
   - `/login`, `/signup`, `/journey`, `/admin/system`
2. API checks:
   - `GET /api/health` as admin
   - `GET /api/packs` as authenticated user
3. Scripted smoke:
   - `node --experimental-strip-types scripts/smoke-prod.ts`

## 4) Rollback

Application rollback:
1. Revert app release to previous build.
2. Keep DB at latest schema (preferred) and run app compatible with schema.

Feature rollback switches:
1. Set `SEASONS_PACKS_ENABLED=false` (pack gate off, fallback behavior).
2. Set `LLM_PROVIDER` unset and/or `USE_LLM=false`.
3. If needed, set `CAPTCHA_ENABLED=false` temporarily only for incident mitigation.

Database rollback strategy:
- Prisma down-migrations are not guaranteed for every change.
- Preferred mitigation:
  - restore database from backup snapshot
  - redeploy matching app version

## 5) Backup / restore smoke

Backup note:
- Take managed PostgreSQL snapshot before migration window.

Restore smoke procedure:
1. Restore snapshot to isolated restore DB.
2. Point `DATABASE_URL` to restored DB in staging shell.
3. Run:
   - `npx prisma migrate status`
   - `npm run prisma:generate`
   - `npm run seed:catalog` (idempotency check)
4. Open app and verify login + recommendation flow.
