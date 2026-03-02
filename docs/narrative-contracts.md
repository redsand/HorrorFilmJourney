# Narrative and poll contracts

This project defines strict Zod contracts for narrative cards and quick polls.

## RecommendationCardNarrative

Schema fields:

- `whyImportant: string`
- `whatItTeaches: string`
- `watchFor: [string, string, string]` (exactly 3)
- `historicalContext: string`
- `reception: { critics?: number, audience?: number, summary?: string }`
- `castHighlights: Array<{ name: string, role?: string }>` (max 6)
- `streaming: Array<{ provider: string, type: "subscription"|"rent"|"buy"|"free", url?: string, price?: string }>`
- `spoilerPolicy: "NO_SPOILERS" | "LIGHT" | "FULL"`
- `journeyNode: string`
- `nextStepHint: string`
- `ratings` (**required**)
  - `imdb: { value: number, scale: string, rawValue?: string }`
  - `additional: Array<{ source: string, value: number, scale: string, rawValue?: string }>`
    - min 1
    - max 3

### Ratings validation rules

- IMDb is required.
- At least one additional rating source is required.
- Total sources shown is 2–4 (`imdb` + `additional`).

## QuickPoll

Base fields:

- `rating?: 1..5`
- `intensity?: 1..5`
- `emotions?: string[]` (capped to 5)
- `workedBest?: string[]` (capped to 3)
- `agedWell?: string`
- `recommend?: boolean`

Status rule:

- For `WATCHED` and `ALREADY_SEEN`, `rating` is required.
- For `SKIPPED` and `WANT_TO_WATCH`, `rating` is optional.

## Source

- `src/lib/contracts/narrative-contracts.ts`
