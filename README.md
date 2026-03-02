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
