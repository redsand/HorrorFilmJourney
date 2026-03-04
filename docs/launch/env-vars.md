# Production Environment Variables

This file is the source of truth for `cinemacodex.com` runtime configuration.

## Required (production)

- `DATABASE_URL`
  - PostgreSQL connection string for production database.
- `SESSION_SECRET`
  - Strong random secret used to sign session cookies.
- `SESSION_COOKIE_SECURE=true`
  - Enforce `Secure` cookies in production.
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_DISPLAY_NAME`
- `SEASONS_PACKS_ENABLED=true`
  - Launch mode for Season 1 pack flow.
- `CAPTCHA_ENABLED=true`
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`
- `RECAPTCHA_SECRET_KEY`

## Strongly recommended

- `RECAPTCHA_MIN_SCORE=0.5`
- `CAPTCHA_SMOKE_BYPASS_KEY`
  - Optional dedicated key for production smoke tests to bypass CAPTCHA.
  - Sent via `x-cinemacodex-smoke-key` header.
  - Keep secret, rotate periodically, and only use in automated smoke contexts.
- `AUTH_RATE_LIMIT_WINDOW_MS=60000`
- `AUTH_RATE_LIMIT_MAX_ATTEMPTS=10`
- `CSRF_ENABLED=true`
- `DEV_LEGACY_HEADERS=false`
- `REC_ENGINE_MODE=modern`
- `USE_LLM=false` (safe default kill switch)

## Optional LLM provider config

- `LLM_PROVIDER=gemini|ollama`
- Gemini:
  - `GEMINI_API_KEY`
  - `GEMINI_MODEL` (default: `gemini-1.5-flash`)
- Ollama:
  - `OLLAMA_HOST`
  - `OLLAMA_MODEL`
- Common:
  - `LLM_TIMEOUT_MS=90000`

Kill switch:
- unset `LLM_PROVIDER` or set `USE_LLM=false` to immediately force deterministic fallback.

## Optional TMDB/catalog config

- `TMDB_API_KEY`
- `SEED_DISABLE_REMOTE_POSTERS=false`
- `TMDB_FULL_SYNC_*` variables for bulk sync workflows
- `TMDB_UPDATE_*` variables for incremental updates

## Test-only (must not point to prod DB)

- `DATABASE_URL_TEST`
- `TEST_DATABASE_URL`

## Example production block

```env
DATABASE_URL="postgresql://app_user:***@db-host:5432/cinemacodex?schema=public"
SESSION_SECRET="replace-with-64-byte-random"
SESSION_COOKIE_SECURE="true"
SESSION_COOKIE_SAMESITE="Lax"
ADMIN_EMAIL="ops@cinemacodex.com"
ADMIN_PASSWORD="replace"
ADMIN_DISPLAY_NAME="CinemaCodex Admin"
SEASONS_PACKS_ENABLED="true"
CAPTCHA_ENABLED="true"
NEXT_PUBLIC_RECAPTCHA_SITE_KEY="replace"
RECAPTCHA_SECRET_KEY="replace"
RECAPTCHA_MIN_SCORE="0.5"
CAPTCHA_SMOKE_BYPASS_KEY="replace-with-random-smoke-key"
CSRF_ENABLED="true"
AUTH_RATE_LIMIT_WINDOW_MS="60000"
AUTH_RATE_LIMIT_MAX_ATTEMPTS="10"
REC_ENGINE_MODE="modern"
DEV_LEGACY_HEADERS="false"
```
