# AI Evidence and Citation Policy

This project treats `EvidencePacket` as a first-class web support mechanism for generated explanations and recommendation context.

## LLM provider wiring

Narrative generation can use an LLM provider when configured:

- `LLM_PROVIDER=gemini` requires `GEMINI_API_KEY` (optional `GEMINI_MODEL`)
- `LLM_PROVIDER=ollama` requires `OLLAMA_MODEL` (optional `OLLAMA_HOST`)
- If `LLM_PROVIDER` is unset, deterministic template narratives are used.

Provider selection is resolved via `getLlmProviderFromEnv()` in the recommendation narrative composition path.

## JSON contract + fallback behavior

- The narrative composer requests **JSON-only** output from the provider (`generateJson`).
- Returned payloads are validated against `recommendationCardNarrativeSchema` (Zod).
- If provider output is invalid schema (`LLM_SCHEMA_ERROR`) or provider call fails, the system falls back to deterministic template narratives.
- Fallback is mandatory to keep recommendation generation non-breaking.
- Evidence is passed in a dedicated prompt section with ordered ids (`E1`, `E2`, ...).
- Citation hints in model narrative text should use bracket form (`[E1]`, `[E2]`) referencing that order.
- Invalid citation refs (for example `[E9]` when only `E1..E3` exist) are rejected and trigger deterministic fallback.

## Narrative caching and idempotency

- Narrative provenance is stored on `RecommendationItem`:
  - `narrativeVersion`
  - `narrativeModel`
  - `narrativeHash`
  - `narrativeGeneratedAt`
- `narrativeHash` is computed from:
  - movie facts (`tmdbId`, title, year, genres, ratings)
  - `journeyNode`
  - evidence hashes
  - profile summary signals (no identifiers)
  - `narrativeVersion`
- If a prior item for the same user/movie has matching `narrativeHash` + `narrativeVersion`, narrative content is reused and provider is not called.
- If any hash input changes (for example evidence/journey node), provider generation runs and cache metadata is updated on the new item.

### Narrative version strategy

- Current version: `narrative-v1`.
- Bump the version string when prompt contract or transformation behavior changes in a backward-incompatible way.
- Version bump forces regeneration even when other inputs match.

## Prompt data safety (PII guardrails)

- Prompts include only movie metadata, evidence snippets, and coarse preference signals.
- Prompts must not include user identifiers (`userId`, email, or similar identifiers).
- Internal DB ids are not included in prompts.

## Grounding policy

- The model is instructed to avoid unsupported factual claims.
- If evidence does not support a fact, narrative should explicitly say `unknown`.
- `NO_SPOILERS` is the default spoiler policy expectation in prompt instructions.

## EvidencePacket

`EvidencePacket` stores:

- `movieId`
- `sourceName`
- `url` (optional input)
- `snippet`
- `retrievedAt`
- `hash` (dedupe key)

## Dedupe policy

Evidence packets are deduped by `(movieId, sourceName, url, snippet-hash)`.

- Re-ingesting the same evidence should not create duplicates.
- When duplicate evidence is upserted again, `retrievedAt` may be refreshed.

## Citation policy for UI payloads

- Recommendation and companion payloads should expose evidence as structured packets.
- `evidence` must always exist as a key in card payloads.
- If no evidence exists for a movie, return `evidence: []`.

## Operational guidance

- Prefer concise snippets that can be shown in UI.
- Include URLs when available for traceability.
- Keep source names stable (e.g., `Wikipedia`, `IMDb Editorial`, `Studio Press Kit`) for consistent filtering and attribution.
