# Incident Runbook

## Severity levels

- Sev 1: complete outage, auth broken, or data integrity issue.
- Sev 2: major feature degraded (recommendations, onboarding, admin ops).
- Sev 3: minor degradation or isolated route failures.

## First 10 minutes

1. Acknowledge incident and assign incident owner.
2. Capture:
   - timestamp
   - affected routes
   - user impact scope
3. Check `/admin/system` for recent errors and audit activity.
4. Collect logs by `requestId` when available.

## Quick mitigations

- Recommendation instability:
  - set `USE_LLM=false`
  - unset `LLM_PROVIDER`
- Pack-flow incident:
  - set `SEASONS_PACKS_ENABLED=false`
- Captcha provider outage:
  - temporary `CAPTCHA_ENABLED=false` (document as temporary)
- Elevated auth abuse:
  - reduce `AUTH_RATE_LIMIT_MAX_ATTEMPTS`
  - increase `AUTH_RATE_LIMIT_WINDOW_MS`

## Common failure playbooks

### Auth failures (login/signup)

1. Verify reCAPTCHA keys and site domain config.
2. Verify `SESSION_SECRET` is set and consistent across app instances.
3. Inspect rate-limit behavior and retry-after headers.

### Recommendation failures

1. Check `/api/recommendations/next` error logs in `/admin/system`.
2. Disable LLM provider to force deterministic narratives.
3. Confirm DB availability and migration status.

### Admin operation failures

1. Validate admin session and role.
2. Confirm audit events are being recorded.
3. Check last-admin constraints if role updates fail.

## Recovery verification

After mitigation/fix:
1. Execute smoke flow:
   - login
   - pack selection
   - onboarding
   - recommendations
   - interaction
   - history
2. Confirm no new Sev 1/2 errors in `/admin/system`.
3. Close incident with postmortem TODOs.

## Post-incident notes template

- Incident id:
- Start/end times:
- Root cause:
- Mitigation:
- Permanent fix:
- Follow-up owner/date:
