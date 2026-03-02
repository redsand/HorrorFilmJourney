# RC Test Plan

## Scope

This plan validates the core narrative loop for initial real-user testing with deterministic, local-only test execution.

## API Inventory (Product Loop)

- `GET /api/health`
- `POST /api/users` (admin)
- `GET /api/users` (admin)
- `GET /api/users/[id]` (admin)
- `POST /api/onboarding`
- `GET /api/experience`
- `POST /api/recommendations/next`
- `POST /api/interactions`
- `GET /api/history`
- `GET /api/history/summary`
- `GET /api/companion`
- `POST /api/evidence/upsert` (admin)
- `GET /api/recommendations/[batchId]/diagnostics` (admin)

## Auth Requirements

- `x-admin-token` required on all routes.
- `x-user-id` required on user-scoped routes:
  - `/api/onboarding`
  - `/api/experience`
  - `/api/recommendations/next`
  - `/api/interactions`
  - `/api/history`
  - `/api/history/summary`
  - `/api/companion`
  - `/api/evidence/upsert`
  - `/api/movies/upsert`
- Exempt from `x-user-id`:
  - `/api/health`
  - `/api/users`
  - `/api/users/[id]`
  - `/api/recommendations/[batchId]/diagnostics`

## Contract Verification

- `MovieCardVM` strict schema is defined in `/src/contracts/movieCardVM.ts`.
- Route assembly validates cards through `zMovieCardVMArray` in `/src/adapters/toMovieCardVM.ts`.
- Contract tests:
  - `/tests/acceptance/recommendations.contract.test.ts`
  - `/tests/e2e/narrative-loop.e2e.test.ts`

## Determinism Rules

- No external network calls in tests (global fetch guard in `/tests/setup/no-network.ts`).
- Streaming data uses deterministic stub provider in recommendation engines.
- E2E disables LLM provider (`USE_LLM=false`, `LLM_PROVIDER` unset).
- Test DB uses isolated schema URLs.

## Environment

Required for full RC validation:

- `ADMIN_TOKEN`
- `DATABASE_URL`
- `DATABASE_URL_TEST` (recommended) or `TEST_DATABASE_URL`

Example `.env.test` template:

```env
ADMIN_TOKEN=rc-admin-token
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/horror_film_journey?schema=public
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/postgres?schema=rc_validation_test
USE_LLM=false
```

Optional provider/runtime vars:

- `REC_ENGINE_MODE` (`v1` or `modern`)
- `LLM_PROVIDER` (`gemini` or `ollama`)
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `OLLAMA_MODEL`
- `OLLAMA_HOST`

## Commands and Expected Output

1. Validate Prisma schema + client generation

```bash
npx prisma validate
npm run prisma:generate
```

Expected:
- Prisma schema is valid.
- Prisma client generation succeeds.

2. Reset schema + seed deterministic catalog

```bash
npm run reset:test-db
```

Expected:
- Prisma `db push` succeeds.
- Seed summary prints counts (`movies>=30`, `ratings>=90`, `evidence>=10`).

3. Run full release-candidate validation

```bash
npm run validate:rc
```

Expected:
- Lint passes.
- Unit suite passes.
- API + Prisma + acceptance suites pass.
- E2E suite passes.
- Final message: `RC validation passed.`

4. Run only E2E readiness suites

```bash
npm run test:e2e
```

Expected:
- `tests/e2e/seed-catalog.e2e.test.ts` passes.
- `tests/e2e/narrative-loop.e2e.test.ts` passes.
- `tests/e2e/first-user-readiness.e2e.test.ts` passes.
