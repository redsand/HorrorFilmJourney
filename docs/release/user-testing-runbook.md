# User Testing Runbook

## Purpose

Run a structured first-pass user test on the narrative recommendation loop and capture actionable feedback.

## Setup

1. Configure environment variables:
   - `ADMIN_TOKEN`
   - `DATABASE_URL`
   - `USE_LLM=false` for deterministic testing
2. Initialize database schema and seed starter catalog:

```bash
npx prisma db push --skip-generate
npm run seed:catalog
```

3. Start app:

```bash
npm run dev
```

## Tester Flow (API-backed)

1. Create test user:
   - `POST /api/users` with `x-admin-token`
   - Save returned `user.id`
2. Impersonate tester:
   - Include `x-user-id: <user.id>` on user-scoped calls.
3. Confirm onboarding gate:
   - `GET /api/experience`
   - Expected: `ONBOARDING_NEEDED`
4. Submit onboarding:
   - `POST /api/onboarding` with `{ tolerance, pacePreference, horrorDNA }`
5. Generate recommendations:
   - `POST /api/recommendations/next`
   - Expected: exactly 5 cards, each with `streaming` and `evidence` keys
6. Mark one recommendation `ALREADY_SEEN` with rating:
   - `POST /api/interactions` with status + rating + optional quick-poll fields
7. Mark one recommendation `WATCHED` with rating:
   - `POST /api/interactions`
8. Verify history:
   - `GET /api/history`
   - `GET /api/history/summary`
9. Open companion mode while watching:
   - `GET /api/companion?tmdbId=<id>&spoilerPolicy=NO_SPOILERS`
10. Verify streaming section appears on cards:
   - `streaming.region` exists
   - `streaming.offers` exists (can be empty)

## What to Record During User Testing

- Confusion points:
  - unclear wording in onboarding questions
  - unclear status actions (`ALREADY_SEEN` vs `WATCHED`)
- Missing information:
  - missing rationale, weak context, absent cast/director expectations
- Spoiler safety:
  - whether `NO_SPOILERS` content feels safe
- Narrative quality:
  - usefulness of `whyImportant`, `whatItTeaches`, and `watchFor`
- Perceived latency:
  - recommendation generation feels slow or acceptable
- Trust signals:
  - usefulness of evidence snippets and citation hints

## Quick Recovery Commands

```bash
npm run reset:test-db
npm run validate:rc
```

