# Design Spec (Source of Truth)

This document is the single source of truth for product requirements.

## R1 — AI-driven narrative bundles (5)
**Requirement:** The system returns recommendation bundles of 5 narrative-rich cards when inventory allows.

**Acceptance criteria:**
- Batch endpoint returns up to 5 cards sorted by rank.
- Each card includes structured narrative fields.
- When fewer than 5 eligible movies exist, system returns fewer without error.

## R2 — Onboarding poll
**Requirement:** New users must complete onboarding/profile capture before normal recommendation flow.

**Acceptance criteria:**
- Users without profile resolve to onboarding state.
- Onboarding questions are returned by backend state endpoint.
- After profile creation, state transitions to recommendation flow.

## R3 — Watched / already-seen / skip flows
**Requirement:** Interaction statuses must support `WATCHED`, `ALREADY_SEEN`, `SKIPPED`, and `WANT_TO_WATCH` with status-specific validation.

**Acceptance criteria:**
- `WATCHED` and `ALREADY_SEEN` require rating.
- `ALREADY_SEEN` threshold rule can trigger immediate replacement batch.
- Interaction payloads persist user-scoped status and optional quick-poll metadata.

## R4 — History
**Requirement:** Users can view detailed history and summary-level aggregates.

**Acceptance criteria:**
- `/api/history` returns paginated user-scoped interaction feed.
- `/api/history/summary` returns counts, average rating, era buckets, and top tags.
- Responses never leak data across users.

## R5 — Posters always shown
**Requirement:** Recommendation cards must always include a non-empty poster URL.

**Acceptance criteria:**
- Movie model requires poster URL.
- Recommendation eligibility excludes poster-missing movies.
- Recommendation response `movie.posterUrl` is never null/empty.

## R6 — Ratings: IMDb + >=1 additional system
**Requirement:** Recommendation cards must include IMDb plus at least one additional rating source.

**Acceptance criteria:**
- Ratings data model supports source/value/scale/raw value.
- Eligibility requires IMDb and minimum 3 rating entries at movie level.
- Card payload includes normalized `ratings.imdb` and non-empty `ratings.additional`.

## R7 — Critics vs audience reception
**Requirement:** Narrative contract supports reception metadata that can represent critics vs audience signals.

**Acceptance criteria:**
- Narrative schema includes reception object with critics/audience fields.
- Recommendation narratives validate against schema.
- MovieCardVM always includes a `reception` object.
- If critics and audience aggregates are unavailable, fallback is `reception: { summary: "Reception data currently unavailable." }`.
- Contract documents critic/audience semantics for client rendering.

## R8 — Cast/director highlights
**Requirement:** Recommendation narratives surface cast/director context where available.

**Acceptance criteria:**
- Narrative schema supports cast highlights.
- Movie model supports director/cast storage.
- Card generation preserves highlight fields in response.

## R9 — Historical context + whyImportant + whatItTeaches + watchFor[3]
**Requirement:** Core narrative pedagogy fields are mandatory on each recommendation card.

**Acceptance criteria:**
- `whyImportant`, `whatItTeaches`, and `historicalContext` are required.
- `watchFor` must contain exactly 3 entries.
- Schema rejects invalid cardinality or missing required fields.

## R10 — Streaming offers (if possible) + caching
**Requirement:** Cards should include streaming offers when available, and retrieval should be cache-friendly.

**Acceptance criteria:**
- Narrative schema supports streaming offer list.
- Empty streaming lists are valid when unavailable.
- Design supports cached retrieval layers for provider data.

## R11 — Companion mode + spoiler policies
**Requirement:** Narrative output must support spoiler safety and companion-style consumption.

**Acceptance criteria:**
- Spoiler policy is explicit (`NO_SPOILERS`, `LIGHT`, `FULL`).
- Companion mode can consume the same structured narrative contract.
- API preserves spoiler policy in all recommendation cards.

## R12 — Evidence packets + citations (web support)
**Requirement:** System stores evidence packets for citation-capable narratives and future web retrieval.

**Acceptance criteria:**
- Evidence packet model stores source/url/snippet/retrieval metadata.
- Recommendation architecture includes evidence retriever seam.
- Narrative composition path can accept evidence packets for citations.
- Evidence snippets are sanitized and capped before prompt use.
- Prompt policy is evidence-first: unsupported facts should be marked `unknown`.
- Citation hints use bracket references (`[E1]`, `[E2]`) mapped by evidence order in the `evidence` list.

## R13 — Multi-user support
**Requirement:** All recommendation and interaction behavior is user-scoped.

**Acceptance criteria:**
- Requests require user context header and validation.
- Data model links interactions/batches/history to users.
- Tests verify no cross-user contamination in history and recommendations.

## R14 — TDD + documentation gates + cutting-edge seams
**Requirement:** Changes must be introduced with tests and updated docs, while preserving modernization seams.

**Acceptance criteria:**
- New behavior is covered by tests before/with implementation.
- Docs smoke checks enforce required design docs presence.
- Architecture exposes seams for embeddings, retrieval, reranking, bandits, and diagnostics.
