# HorrorFilmJourney

Mobile-first horror recommendation app with:

- personalized 5-film bundles
- Seasons + Packs foundation (Season 1: Horror)
- evidence-grounded narratives (RAG-style, citation hints)
- companion mode with spoiler policies
- quick feedback loop that adapts future picks

Built with Next.js App Router + TypeScript + Prisma + PostgreSQL.

## Why It Is Valuable

- Most movie apps optimize for browsing. HorrorFilmJourney optimizes for learning and progression.
- Users get a curated path (not an endless feed), then shape it with fast feedback.
- Companion mode supports active viewing with context controls (`NO_SPOILERS`, `LIGHT`, `FULL`).

## What Is Innovative

1. Evidence-first narrative generation
- Narrative prompts include structured evidence packets when available.
- Model outputs are validated against strict Zod contracts.
- Invalid schema/citation output falls back to deterministic templates so UX does not break.

2. Recommendation proof gates
- Determinism and personalization are tested explicitly.
- Offline evaluation metrics are available (`precision@5`, `nDCG@5`, coverage, novelty).

3. Closed-loop ratings + interaction feedback
- `WATCHED` and `ALREADY_SEEN` require rating.
- Quick Poll captures intensity/emotions/what worked.
- Signals feed reranking (including negative emotion penalties such as `bored`, `slow`, `dull`).

## RAG / Evidence System

Narratives are grounded through `EvidencePacket` records:

- `sourceName`
- optional `url`
- `snippet`
- `retrievedAt`
- dedupe hash

Generation behavior:

- requests JSON-only responses
- validates with Zod schema
- supports citation hints like `[E1]`, `[E2]`
- rejects invalid refs and falls back safely

See: [docs/ai.md](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/docs/ai.md)

## Rating and Feedback System

- Rating is required for:
  - `WATCHED`
  - `ALREADY_SEEN`
- `SKIPPED` does not require rating.
- Quick Poll collects:
  - star rating (1-5)
  - intensity (1-5)
  - emotions (max 5)
  - worked best (max 3)
  - aged well
  - recommend yes/no

These interactions are persisted and used by modern reranking.

See: [docs/recommendation-engine.md](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/docs/recommendation-engine.md)

## Authentication

Production auth is cookie-session based.

- login: `POST /api/auth/login`
- signup: `POST /api/auth/signup`
- protected routes require session cookie
- admin routes require admin role

See: [docs/auth.md](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/docs/auth.md)

## Seasons + Packs (Current Status)

The codebase now includes a pack-aware foundation:

- `Season` and `GenrePack` data models
- `UserProfile.selectedPackId`
- `RecommendationBatch.packId`
- `JourneyProgress.packId` (write path attached)
- `GET /api/packs` endpoint
- onboarding/profile support for `selectedPackSlug`
- recommendation candidate filtering by pack primary genre

Current launch scope:

- Season 1 only
- single enabled pack: `horror`

Feature flag:

- `SEASONS_PACKS_ENABLED=false` by default
- when enabled, runtime resolves user effective pack and persists pack references

See:
- [docs/audit/seasons-packs-discovery.md](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/docs/audit/seasons-packs-discovery.md)
- [docs/plan/seasons-packs-implementation.md](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/docs/plan/seasons-packs-implementation.md)

## Quick Start

1. Install:

```bash
npm install
```

2. Configure env:

```bash
cp .env.example .env
```

3. Ensure PostgreSQL is running and set:

- `DATABASE_URL`
- `DATABASE_URL_TEST` (recommended for tests)
- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD`
- `SEASONS_PACKS_ENABLED` (`false` for legacy behavior, `true` for pack-aware mode)

4. Setup dev data:

```bash
npm run setup:dev
```

5. Start app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Deploying Packs

Use this rollout sequence for environments:

1. Apply migrations:

```bash
npx prisma migrate deploy
```

2. Generate Prisma client:

```bash
npm run prisma:generate
```

3. Enable packs in env:

```env
SEASONS_PACKS_ENABLED=true
```

4. Deploy app and verify:
- `GET /api/packs` returns active season + packs
- onboarding accepts and persists `selectedPackSlug`
- new recommendation batches include `packId`

5. Backward compatibility behavior:
- users without `selectedPackId` default to Horror pack
- if packs are disabled, app continues using the same Season 1 Horror response seam

Notes:
- admin CRUD for seasons/packs is not in this phase yet (planned later).
- current multi-pack contamination controls are partial; recommendation filtering is pack-scoped, with additional read-scope hardening planned.

## Useful Scripts

- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run bootstrap:admin`
- `npm run seed:catalog`
- `npm run sync:tmdb:catalog`
- `npm run sync:tmdb:update`
- `npm run test`
- `npm run test:e2e`
- `npm run validate:rc`

## Key Docs

- [docs/api.md](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/docs/api.md)
- [docs/testing.md](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/docs/testing.md)
- [docs/release/test-plan.md](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/docs/release/test-plan.md)
- [docs/release/user-testing-runbook.md](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/docs/release/user-testing-runbook.md)
