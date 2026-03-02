# LLM Configuration Audit

## Summary

Current repository does **not** appear to have an active external LLM provider integration wired into runtime recommendation generation.

## Provider usage found

Search terms audited:

- provider names: `openai`, `anthropic`, `gemini`, `google generative`, `ollama`, `llama`, `groq`, `mistral`, `cohere`
- env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `OLLAMA_HOST`, etc.
- model name patterns: `gpt-*`, `claude-*`, `gemini-*`, `llama*`, `mistral*`

Result:

- No active usage found in runtime code paths before this scaffold.
- One non-LLM model string appears in tests for embeddings (`text-embedding-3-large`) in `tests/prisma/modern-recsys-models.test.ts`.

## Dependencies

From `package.json`:

- No OpenAI/Anthropic/Google/Ollama-specific SDK dependencies are present.
- Existing stack is primarily Next.js + Prisma + Zod.

## Narrative and recommendation paths inspected

- `src/lib/recommendation/recommendation-engine.ts`
- `src/lib/recommendation/recommendation-engine-v1.ts`
- `src/adapters/toMovieCardVM.ts`

Findings:

- Narrative generation currently uses deterministic template composition and stored evidence.
- No networked LLM call path found in recommendation runtime.

## New scaffold introduced in this change

To enable future provider integration without changing current behavior:

- `src/ai/llmProvider.ts`
  - `LlmProvider` interface
  - `GeminiProvider` (fetch-based)
  - `OllamaProvider` (fetch-based)
- `src/ai/index.ts`
  - `getLlmProviderFromEnv()` with strict env validation.

## Config expectations for new scaffold

- `LLM_PROVIDER=gemini` requires:
  - `GEMINI_API_KEY`
  - optional `GEMINI_MODEL` (default used if missing)
- `LLM_PROVIDER=ollama` requires:
  - `OLLAMA_MODEL`
  - optional `OLLAMA_HOST` (defaults to `http://localhost:11434`)

## Request transport

- Both provider implementations are HTTP `fetch`-based.
- No SDK dependency required.

## Dead code / missing config observations

- Prior to scaffold, no dead provider code found because no provider code existed.
- After scaffold, providers are intentionally not wired into RecommendationEngine/NarrativeComposer yet (scaffold-only).
