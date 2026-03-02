# UX flow (mobile-first, minimal taps)

This app uses a backend-driven experience state machine per user.

## States

- `ONBOARDING_NEEDED`
- `SHOW_RECOMMENDATION_BUNDLE`
- `SHOW_QUICK_POLL`
- `SHOW_HISTORY`

## State rules

1. If user has no profile: `ONBOARDING_NEEDED`
2. If profile exists and no active recommendation batch: `SHOW_RECOMMENDATION_BUNDLE`
3. If latest interaction is `WATCHED` or `ALREADY_SEEN`: `SHOW_RECOMMENDATION_BUNDLE`

## API

### GET /api/experience

Required headers:

- `x-admin-token: <ADMIN_TOKEN>`
- `x-user-id: <existing user id>`

Returns a stable envelope with the current state and payload required by the frontend.

### Mobile-first intent

- Keep each step to one decision per screen.
- Show quick poll prompts only when needed.
- Prioritize immediate next action from state payload.

## Interaction rule: rapid already-seen recovery

- When a user marks `ALREADY_SEEN` on recommendation items in the current batch, the backend tracks a count for that batch.
- On the **3rd** `ALREADY_SEEN` mark (or later) for that same batch, the API immediately generates and returns a replacement recommendation batch.
- `POST /api/interactions` response shape:

```json
{
  "data": {
    "interaction": { "id": "...", "status": "ALREADY_SEEN" },
    "nextBatch": {
      "batchId": "...",
      "cards": []
    }
  },
  "error": null
}
```

- `nextBatch` is omitted when the threshold has not been reached.


## Companion Mode (during-movie mobile flow)

### API

- `GET /api/companion?tmdbId=<id>&spoilerPolicy=NO_SPOILERS|LIGHT|FULL`

### UX intent

- Provide quick, glanceable context while a user is actively watching.
- Keep output sectioned for short-scroll consumption (`productionNotes`, `historicalNotes`, `receptionNotes`, `trivia`).
- Let users choose spoiler strictness per session:
  - `NO_SPOILERS`: safe companion notes.
  - `LIGHT`: mild craft/thematic hints.
  - `FULL`: spoiler-rich analysis.
