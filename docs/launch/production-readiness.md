# Production Readiness (cinemacodex.com)

## Verdict

- Current verdict: **GO (conditional)**
- Conditions before launch:
  - Apply latest Prisma migrations in production.
  - Set all required env vars from [env-vars.md](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/docs/launch/env-vars.md).
  - Confirm reCAPTCHA keys are valid for `cinemacodex.com`.

## Hard checklist

- [x] Session cookies are `HttpOnly`, configurable `SameSite`, and `Secure` in production.
  - Code: `src/lib/auth/session.ts`
- [x] CSRF protection exists for state-changing requests (origin/site validation).
  - Code: `src/lib/security/csrf.ts`, `middleware.ts`
  - Test: `tests/unit/csrf.test.ts`
- [x] Auth endpoints are rate-limited.
  - Code: `src/lib/security/rate-limit.ts`, auth routes
  - Test: `tests/api/auth-rate-limit-route.test.ts`
- [x] Security headers are set.
  - Code: `middleware.ts`
- [x] Admin route protection exists on API + UI.
  - API guards: `requireAdmin(...)` in `/api/admin/*`
  - UI guard: `middleware.ts` for `/admin/*`
  - Tests: existing admin route suites + `tests/api/admin-system-route.test.ts`
- [x] Last-admin safety remains enforced.
  - Code: `src/app/api/users/[id]/route.ts`
- [x] Audit events are recorded for sensitive admin actions.
  - Code: `src/lib/audit/audit.ts`, users/packs admin routes
  - Tables: `AuditEvent`
- [x] Error capture seam exists and stores recent errors for operations.
  - Code: `src/lib/observability/error.ts`
  - Table: `AppErrorLog`
- [x] Admin operational visibility page exists.
  - UI: `/admin/system`
  - API: `/api/admin/system`
- [x] Release-candidate validation is green.
  - Command: `npm run validate:rc`

## Test evidence

- Unit:
  - `tests/unit/csrf.test.ts`
  - `tests/unit/captcha.test.ts`
- API:
  - `tests/api/auth-rate-limit-route.test.ts`
  - `tests/api/auth-captcha-route.test.ts`
  - `tests/api/admin-system-route.test.ts`
  - existing admin access suites (`admin-packs`, `admin-feedback`, `users`)
- Full gate:
  - `npm run validate:rc`

## Remaining risks (non-blocking)

- In-memory rate limiter resets on process restart and is per-instance.
  - Mitigation: migrate limiter backend to Redis before high-traffic scale.
- CSP is pragmatic, not strict-minimal.
  - Mitigation: tighten directives after collecting violation logs.
