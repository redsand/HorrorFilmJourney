# Admin access and user impersonation (internal)

All API routes are admin-gated in this phase.

## Required headers

- `x-admin-token: <ADMIN_TOKEN>`

For user-scoped routes (for example `GET /api/health`), also include:

- `x-user-id: <existing user id>`

If `x-user-id` is missing or invalid for user-scoped routes, APIs return:

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "..."
  }
}
```

## Create users

### Request

`POST /api/users`

```json
{
  "displayName": "Ripley"
}
```

### Response

```json
{
  "data": {
    "id": "<cuid>",
    "displayName": "Ripley",
    "createdAt": "2025-01-01T00:00:00.000Z"
  },
  "error": null
}
```

## List users

`GET /api/users`

Returns users for internal admin management UI.

## Act as a user

1. Create/list users via admin routes.
2. Copy a user id.
3. Send `x-user-id` with that id on user-scoped requests.
