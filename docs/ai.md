# AI Evidence and Citation Policy

This project treats `EvidencePacket` as a first-class web support mechanism for generated explanations and recommendation context.

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
