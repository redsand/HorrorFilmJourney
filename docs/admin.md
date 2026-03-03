# Admin Operations

## Feedback Triage

The internal feedback system stores user-reported bugs, ideas, and confusion points for review.

### Feedback lifecycle

- `OPEN`: newly submitted
- `IN_REVIEW`: actively triaged
- `FIXED`: resolved in implementation
- `ARCHIVED`: closed without active work

### Priority levels

- `LOW`
- `MEDIUM`
- `HIGH`
- `CRITICAL`

### API workflow

1. `GET /api/admin/feedback` to list/filter feedback queue.
2. `PATCH /api/admin/feedback/:id` to update `status` and/or `priority`.
3. `DELETE /api/admin/feedback/:id` only when removal is intentional.

All admin feedback routes require an admin session cookie.
