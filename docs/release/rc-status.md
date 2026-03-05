# RC Status

## validate:rc summary

- Date: 2026-03-05
- Command: `npm run validate:rc`
- Result: PASS

## Suite results

- Prisma validate: PASS
- Prisma generate + engine verify: PASS
- Test DB reset + seed: PASS
- Lint: PASS (warnings only: `@next/next/no-img-element` in `src/components/layout/CabinetFrame.tsx` and `src/components/ui/PosterImage.tsx`)
- Unit tests (`tests/unit`): PASS
- API + Prisma + acceptance suites: PASS
- E2E included through RC script path: PASS
- Retrieval baseline bootstrap (`npm run bootstrap:rag:value -- --runs 300`): PASS
- Retrieval quality gates (`npm run check:retrieval:gates`): PASS
- Retrieval tracker gate (`npm run check:retrieval:tracker`): PASS
- External links gate (`npm run check:external-links:gates`): PASS
- RAG completion enforce report (`npm run report:rag:completion -- --enforce`): PASS

## Skipped tests

- None

## Notes

- RC validation now enforces measurable retrieval + checklist completion in the same run:
  - retrieval run sample size >= 300
  - retrieval quality gates pass
  - retrieval tracker unchecked count = 0
  - external link gate coverage passes (Season 1)
- Season 1 curriculum integrity and curriculum-first recommendation behavior are covered by:
  - `tests/prisma/season-1-curriculum-integrity.test.ts`
  - `tests/prisma/recommendation-engine-modern.test.ts`
- Admin curriculum coverage endpoint is covered by:
  - `tests/api/admin-curriculum-route.test.ts`
