# Internal Testing Guide

Use the UI login flow. Do not use legacy auth headers.

## 1) Start app

```bash
npm run dev
```

Open `http://localhost:3000`.

## 2) Create account

- Open `http://localhost:3000/signup`
- Enter display name, email, password.
- Submit and confirm you land on Journey (`/`).

## 3) Login existing account

- Open `http://localhost:3000/login`
- Enter email + password.
- Submit and confirm Journey loads.

## 4) Exercise core loop in UI

1. Complete onboarding.
2. Generate recommendation bundle.
3. Mark one movie `WATCHED` with rating.
4. Mark one movie `ALREADY_SEEN` with rating.
5. Open `/history` and confirm both interactions.
6. Open companion from a card and test spoiler policy toggle.

## 5) Admin-only routes

Admin routes require an admin session cookie (`isAdmin=true`), not headers.

## Optional API seed example

```bash
curl -X POST "http://localhost:3000/api/movies/upsert" \
  -H "Content-Type: application/json" \
  -d '{
    "tmdbId": 9999,
    "title": "Internal Seed Title",
    "posterUrl": "https://image.tmdb.org/t/p/w500/example.jpg",
    "year": 1999,
    "genres": ["horror"]
  }'
```
