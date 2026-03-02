# User Journey

## 1) Onboarding

- User is created.
- User answers onboarding/profile prompts.
- Experience state transitions from `ONBOARDING_NEEDED` to recommendation flow.

## 2) Recommendation bundle (5 films)

- Backend generates a batch of up to 5 recommendation cards.
- User sees title, context, and narrative hints for each pick.

## 3) Already seen / watched poll loop

- User marks each film as `WATCHED`, `ALREADY_SEEN`, `SKIPPED`, or `WANT_TO_WATCH`.
- For `WATCHED` / `ALREADY_SEEN`, rating is collected.
- If user marks `ALREADY_SEEN` on 3+ items in the current batch, backend immediately generates a replacement batch.

## 4) History

- User can review interaction history (`/api/history`) and high-level summary (`/api/history/summary`).
- This informs iterative tuning of future recommendations.
