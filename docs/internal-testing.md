# Internal Testing Guide

## Create test users

Use `POST /api/users` with the admin token.

```bash
curl -s -X POST http://localhost:3000/api/users \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"displayName":"Test User"}'
```

Response includes `data.id` (the user id).

## Select a user via `X-User-Id`

Most user-scoped endpoints require:

- `x-admin-token: <ADMIN_TOKEN>`
- `x-user-id: <existing user id>`

Example:

```bash
curl -s http://localhost:3000/api/experience \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H "x-user-id: $USER_ID"
```

## Common curl flows

### Upsert movie

```bash
curl -s -X POST http://localhost:3000/api/movies/upsert \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"tmdbId":603,"title":"The Matrix","year":1999}'
```

### Create interaction

```bash
curl -s -X POST http://localhost:3000/api/interactions \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H "x-user-id: $USER_ID" \
  -H "content-type: application/json" \
  -d '{"tmdbId":603,"status":"WATCHED","rating":5}'
```

### Get history and summary

```bash
curl -s "http://localhost:3000/api/history?limit=20" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H "x-user-id: $USER_ID"

curl -s http://localhost:3000/api/history/summary \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H "x-user-id: $USER_ID"
```
