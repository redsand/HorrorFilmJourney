# Authentication

## Production policy

- Authentication is cookie-session based only.
- API clients must login via `POST /api/auth/login` or signup via `POST /api/auth/signup`.
- Route protection uses:
  - `401 UNAUTHORIZED` when no valid session is present.
  - `403 FORBIDDEN` when a valid session exists but role is insufficient (for admin routes).

## Session cookie

- Cookie name: `hfj_session`
- Issued by auth routes with `HttpOnly`, `SameSite=Lax`.
- Contains signed session payload (`userId`, `isAdmin`, expiration).

## Captcha protection (Google reCAPTCHA v3)

Login and signup can enforce captcha verification to reduce automated abuse.

- `CAPTCHA_ENABLED=true` enables enforcement on:
  - `POST /api/auth/login`
  - `POST /api/auth/signup`
- Required env vars when enabled:
  - `RECAPTCHA_SECRET_KEY` (server-side secret)
  - `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (client site key)
- Optional:
  - `RECAPTCHA_MIN_SCORE` (default `0.5`)

When enabled:
- missing token returns `400 CAPTCHA_REQUIRED`
- invalid/low-score token returns `400 CAPTCHA_INVALID`
- server misconfiguration returns `500 CAPTCHA_MISCONFIGURED`

## Role model

- User routes require any authenticated session.
- Admin routes require `isAdmin=true`.

## Password management

- Users can change their own password via `PATCH /api/profile/password`.
- This requires a valid session and the correct `currentPassword`.
- Admins can still reset user credentials from admin user management flows.

## Optional legacy header fallback (development only)

- Set `DEV_LEGACY_HEADERS=true` to enable temporary fallback:
  - `x-user-id` for user context
  - `x-admin-token` for admin context
- Keep this unset in production.
