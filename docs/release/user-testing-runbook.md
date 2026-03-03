# User Testing Runbook

## Purpose

Run a structured first-pass user test on the narrative recommendation loop and capture actionable feedback.

## Setup

1. Configure environment variables:
   - `DATABASE_URL`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`
   - `SEASONS_PACKS_ENABLED=true` (packs launch mode)
   - `USE_LLM=false` for deterministic testing
2. Initialize schema, bootstrap admin, and seed starter catalog:

```bash
npm run setup:dev
```

3. Start app:

```bash
npm run dev
```

## Tester Flow (API-backed)

1. Login with admin account:
   - Open `/login`
   - Use `ADMIN_EMAIL` + `ADMIN_PASSWORD`
2. Create a test user:
   - Open `/signup`
   - Create a non-admin tester account and login as that user
3. Run the journey loop in UI:
   - Confirm pack selection appears first (`PACK_SELECTION_NEEDED`)
   - Select `Horror` pack
   - Confirm Season 1 framing appears in the pack selection copy
   - Confirm onboarding appears (`ONBOARDING_NEEDED` behavior)
   - Submit onboarding (tolerance + pace)
   - Generate recommendation bundle (5 cards)
   - Mark one card `ALREADY_SEEN` with rating
   - Mark one card `WATCHED` with rating
   - Open `/history` and verify interactions + summary
   - Open companion mode from a card with `NO_SPOILERS`
4. Verify contract cues in UI:
   - cards have poster + ratings + codex sections
   - streaming section exists (offers may be empty)
   - evidence section exists (may be empty)
5. Verify account security flow:
   - Open `/profile`
   - Open `Change Password`
   - Submit current password + new password
   - Log out and confirm login works with the new password

## What to Record During User Testing

- Confusion points:
  - unclear wording in onboarding questions
  - unclear status actions (`ALREADY_SEEN` vs `WATCHED`)
- Missing information:
  - missing rationale, weak context, absent cast/director expectations
- Spoiler safety:
  - whether `NO_SPOILERS` content feels safe
- Narrative quality:
  - usefulness of `whyImportant`, `whatItTeaches`, and `watchFor`
- Perceived latency:
  - recommendation generation feels slow or acceptable
- Trust signals:
  - usefulness of evidence snippets and citation hints
- Curriculum feel:
  - whether recommendations feel like a guided sequence instead of random picks
  - whether node-to-node progression is understandable

## Quick Recovery Commands

```bash
npm run reset:test-db
npm run validate:rc
```

## UI Manual QA Checklist

- [ ] `/login` loads and authenticates with session cookie
- [ ] `/signup` creates a user and lands on Journey
- [ ] Journey page loads without manual auth headers
- [ ] Onboarding submit works and transitions to recommendations
- [ ] Pack selection screen appears first when packs are enabled
- [ ] Card actions (`Watch`, `Already seen`, `Skip`) succeed while authenticated
- [ ] `/history` loads user-scoped interactions
- [ ] `/profile` shows display name, email, role badge, and logout
- [ ] `/profile/password` updates password and new login succeeds
- [ ] Admin account sees `/admin/users` entry in profile
- [ ] Non-admin account does not see `/admin/users` entry
- [ ] `/admin/users` supports search, create, and edit flows
- [ ] Admin demotion of the last admin is blocked with visible safety message
- [ ] `/admin/packs` lists seasons/packs and blocks disabling the last enabled pack
- [ ] `/admin/curriculum` shows node coverage and missing metadata warnings

## Season 1 references

- Curriculum definition: `docs/season/season-1-horror.md`
- Engine behavior: node-curated titles are preferred before pack-level fallback
