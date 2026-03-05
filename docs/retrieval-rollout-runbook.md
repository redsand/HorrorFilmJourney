# Retrieval Rollout Runbook

## Goal
Roll out hybrid retrieval safely and keep a one-command rollback to cache mode.

## Pre-check
1. `npm run measure:rag:value -- --enforce`
2. Confirm `pass: true` and no failed goals.

## Progressive rollout
1. 10% canary:
   - Route 10% traffic to app instances using:
   - `EVIDENCE_RETRIEVAL_MODE=hybrid`
   - `EVIDENCE_RETRIEVAL_REQUIRE_INDEX=false`
   - Validate readiness:
   - `npm run assess:retrieval:rollout -- --take 500`
2. 50% ramp:
   - Hold canary for one observation window.
   - Re-run:
   - `npm run check:retrieval:gates`
   - `npm run assess:retrieval:rollout -- --take 500`
   - `npm run measure:rag:value -- --enforce`
3. 100% rollout:
   - Promote all instances once metrics remain green.

## Rollback
1. Dry-run env change:
```bash
npm run retrieval:rollout -- --mode cache --requireIndex false --env .env.production --dryRun
```
2. Apply rollback:
```bash
npm run retrieval:rollout -- --mode cache --requireIndex false --env .env.production
```
3. Restart app processes and verify:
```bash
npm run check:retrieval:gates
```

## Promote hybrid mode
```bash
npm run retrieval:rollout -- --mode hybrid --requireIndex false --env .env.production
```
