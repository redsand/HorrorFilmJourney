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

## Role model

- User routes require any authenticated session.
- Admin routes require `isAdmin=true`.

## Optional legacy header fallback (development only)

- Set `DEV_LEGACY_HEADERS=true` to enable temporary fallback:
  - `x-user-id` for user context
  - `x-admin-token` for admin context
- Keep this unset in production.
