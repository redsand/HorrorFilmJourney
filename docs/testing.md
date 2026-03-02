# Testing Strategy

## Test database strategy

- API unit tests mock Prisma in-memory with `vi.mock`.
- Prisma integration tests use SQLite test DB files in `prisma/` (for example `prisma/test.db`).
- Test setup creates schema with `prisma db push --skip-generate`.

## Reset helpers and cleanup

- Each Prisma integration suite clears tables in `beforeEach` to isolate tests.
- Cleanup order should delete dependent tables before parent tables.
- New recommendation-system tables (`RecommendationDiagnostics`, `EvidencePacket`, `MovieEmbedding`, `UserEmbeddingSnapshot`) should be included in cleanup where relevant.

## Recommended test commands

```bash
npm test
npm test -- tests/api/history-route.test.ts tests/api/history-summary-route.test.ts
```

If dependencies are unavailable in a constrained environment, run these in CI or a local dev setup with npm access.
