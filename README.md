# HorrorFilmJourney

Next.js App Router + TypeScript scaffold with Prisma (PostgreSQL), admin-token route gating, and request-scoped user resolution.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables:

   ```bash
   cp .env.example .env
   ```

   Ensure PostgreSQL is running locally with credentials `postgres/postgres`, and create database `horror_film_journey` if it does not already exist.

   Minimum required vars:

   - `DATABASE_URL`
   - `ADMIN_TOKEN`

   Additional supported vars:

   - `REC_ENGINE_MODE` (`v1` or `modern`)
   - `DATABASE_URL_TEST` (dedicated test DB/schema URL)
   - `TEST_DATABASE_URL` (alternate test DB URL used by helpers/scripts)
   - `LLM_PROVIDER` (`gemini` or `ollama`)
   - `GEMINI_API_KEY` (required for `LLM_PROVIDER=gemini`)
   - `GEMINI_MODEL` (optional override; default `gemini-1.5-flash`)
   - `OLLAMA_MODEL` (required for `LLM_PROVIDER=ollama`)
   - `OLLAMA_HOST` (optional; default `http://localhost:11434`)
   - `USE_LLM` (test determinism toggle; commonly `false` in test/E2E)

3. Generate Prisma client and apply migration:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

## Test commands

```bash
npm test
npm run test:watch
```

## Run locally

Start the development server:

```bash
npm run dev
```

Then open `http://localhost:3000`.

Health check endpoint:

- `GET /api/health`
- Required headers:
  - `x-admin-token: <ADMIN_TOKEN>`
- Success response: `{ "data": { "ok": true }, "error": null }`


## Docs

- Multi-user data model: `docs/data-model.md`
- Admin access and acting as a user: `docs/admin-access.md`
- API examples and required headers: `docs/api.md`
- Narrative and quick-poll contracts: `docs/narrative-contracts.md`
- UX flow and experience state machine: `docs/ux-flow.md`
- Recommendation engine v1 pipeline and seams: `docs/recommendation-engine.md`
