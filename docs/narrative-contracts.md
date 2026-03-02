# Narrative and poll contracts

This project defines strict Zod contracts for narrative cards and quick polls.

## RecommendationCardNarrative

Schema fields:

- `whyImportant: string`
- `whatItTeaches: string`
- `watchFor: [string, string, string]` (exactly 3)
- `historicalContext: string`
- `reception: { critics?: number, audience?: number, summary?: string }`
  - If critics/audience are missing, use fallback summary: `"Reception data currently unavailable."`.
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

## MovieCardVM (canonical recommendation card view model)

The canonical UI-facing recommendation card contract is `MovieCardVM` in `src/contracts/movieCardVM.ts`.

### Purpose

`MovieCardVM` is the normalized payload consumed by recommendation card rendering. It guarantees all top-level card sections are present so UI components can render deterministically without defensive shape-checking.

### Schema (required top-level keys)

- `movie: { tmdbId:number, title:string, year?:number, posterUrl:string }`
- `ratings`
  - `imdb: { value:number, scale:"10"|"100", rawValue?:string }` (**required**)
  - `additional: Array<{ source:string, value:number, scale:"10"|"100", rawValue?:string }>` (**required**, min 1, max 3)
- `reception: { critics?, audience?, summary? }`
  - `reception` must always be present on `MovieCardVM`.
  - When both critics and audience aggregates are missing, use `reception: { summary: "Reception data currently unavailable." }`.
  - `critics?: { source:string, value:number, scale:"100", rawValue?:string }`
  - `audience?: { source:string, value:number, scale:"100", rawValue?:string }`
  - `summary?: string`
- `credits`
  - `director?: string`
  - `castHighlights: Array<{ name:string, role?:string }>` (**required**, max 6)
- `streaming`
  - `region: string`
  - `offers: Array<{ provider:string, type:"subscription"|"rent"|"buy"|"free", url?:string, price?:string }>` (**required**, empty allowed)
- `codex`
  - `whyImportant: string`
  - `whatItTeaches: string`
  - `watchFor: [string, string, string]` (**exactly 3**)
  - `historicalContext: string`
  - `spoilerPolicy: "NO_SPOILERS" | "LIGHT" | "FULL"`
  - `journeyNode: string`
  - `nextStepHint: string`
- `evidence: Array<{ sourceName:string, url?:string, snippet:string, retrievedAt:string }>` (**required**, empty allowed)

### Strict validation behavior

- Objects are validated in strict mode; unknown keys are rejected.
- `streaming.offers` and `evidence` must exist, even when there are no entries.
- `ratings.imdb` must exist.
- `codex.watchFor` must have exactly three entries.

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
- `src/contracts/movieCardVM.ts`
