# Testing Strategy

## Test database strategy

- API unit tests mock Prisma in-memory with `vi.mock`.
- Prisma integration tests use PostgreSQL with suite-specific schemas.
- Test setup creates schema with `prisma db push --skip-generate` through `tests/helpers/test-db.ts`.

## Vitest mock hoisting rule

- Use `vi.hoisted(() => ({ ... }))` for mock fns consumed by `vi.mock` factories.
- Do not reference plain top-level `const mock = vi.fn()` inside `vi.mock` factories because `vi.mock` is hoisted and can throw `ReferenceError`.

## Reset helpers and cleanup

- Each Prisma integration suite clears tables in `beforeEach` to isolate tests.
- Cleanup order should delete dependent tables before parent tables.
- New recommendation-system tables (`RecommendationDiagnostics`, `EvidencePacket`, `MovieEmbedding`, `UserEmbeddingSnapshot`) should be included in cleanup where relevant.

## Recommended test commands

```bash
npm test
npm test -- tests/api/history-route.test.ts tests/api/history-summary-route.test.ts
npm test -- tests/acceptance/narrative-experience.test.ts
npm run test:e2e
npm run validate:rc
```

If dependencies are unavailable in a constrained environment, run these in CI or a local dev setup with npm access.

## Narrative experience acceptance suite

- `tests/acceptance/narrative-experience.test.ts` enforces end-to-end UX behavior, not only schema plumbing.
- Covered path:
  - user creation
  - onboarding required state
  - onboarding submission simulation (profile persisted)
  - recommendation generation (exactly 5 cards)
  - interaction validation (`WATCHED`/`ALREADY_SEEN` require rating)
  - history and history summary user scoping
  - companion endpoint with `NO_SPOILERS`
- Card-level assertions enforce required experience keys:
  - poster URL
  - IMDb + additional ratings
  - reception key
  - credits cast highlights array (empty allowed when unavailable)
  - `watchFor` length exactly 3
  - evidence key
  - streaming key with region + offers

## Release-candidate validation

- Release docs:
  - `docs/release/test-plan.md`
  - `docs/release/rc-checklist.md`
  - `docs/release/user-testing-runbook.md`
- One-command validation:
  - `npm run validate:rc`
