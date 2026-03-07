import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';
import { getLlmProviderFromEnv } from '@/ai';
import { zExternalReading } from '@/lib/contracts/companion-contract';
import type { ExternalReading } from '@/lib/contracts/companion-contract';
import { getExternalReadingsForFilm } from '@/lib/companion/external-reading-registry';
import { resolveEffectivePackForUser } from '@/lib/packs/pack-resolver';
import { getPublishedNodesForMovie } from '@/lib/nodes/published-snapshot';
import { createConfiguredEvidenceRetriever } from '@/lib/evidence/retrieval';
import { buildFilmContextExplanation } from '@/lib/context/build-film-context-explanation';
import { buildSeasonReasonPanel } from '@/lib/context/build-season-reason-panel';
import {
  DEFAULT_GROUNDING_REFUSAL_TEMPLATE,
  enforceCitationCoverage,
  formatChunkCitation,
  type GroundingChunk,
} from '@/lib/rag/grounding';

type SpoilerPolicy = 'NO_SPOILERS' | 'LIGHT' | 'FULL';
const ALL_SPOILER_POLICIES: SpoilerPolicy[] = ['NO_SPOILERS', 'LIGHT', 'FULL'];
type CreditCast = { name: string; role?: string };
type RatingRow = { source: string; value: number; scale: string; rawValue: string | null };
type CompanionLlmOutput = {
  lightSummary: string;
  fullSummary: string;
  trivia: string[];
};
type CompanionResponsePayload = {
  movie: {
    tmdbId: number;
    title: string;
    year?: number;
    posterUrl: string;
  };
  metadata: {
    genres: string[];
    nodes: Array<{ slug: string; label: string; rationale: string }>;
    runtimeText: string;
    countries: string[];
    languages: string[];
    tagline?: string;
    overview?: string;
    popularity?: number;
    tmdbVoteAverage?: number;
    tmdbVoteCount?: number;
  };
  credits: {
    director?: string;
    cast: CreditCast[];
  };
  sections: {
    productionNotes: string[];
    historicalNotes: string[];
    receptionNotes: string[];
    techniqueBreakdown: string[];
    influenceMap: string[];
    afterWatchingReflection: string[];
    trivia: string[];
  };
  ratings: RatingRow[];
  streaming: {
    region: string;
    offers: Array<{
      provider: string;
      type: 'subscription' | 'rent' | 'buy' | 'free';
      url?: string;
      price?: string;
    }>;
  };
  spoilerPolicy: SpoilerPolicy;
  evidence: Array<{
    sourceName: string;
    url?: string;
    snippet: string;
    retrievedAt: string;
    provenance?: {
      retrievalMode: 'cache' | 'hybrid';
      sourceType: 'packet' | 'external_reading' | 'chunk';
      fallbackUsed?: boolean;
      fallbackReason?: 'hybrid-error' | 'empty-hybrid';
      chunkId?: string;
      rank?: number;
      lexicalScore?: number;
      semanticScore?: number;
      fusedScore?: number;
      rankLexical?: number;
      rankSemantic?: number;
    };
  }>;
  externalReadings?: ExternalReading[];
  codex?: {
    whyImportant: string;
    whatItTeaches: string;
    watchFor: [string, string, string];
  };
};
type TmdbCreditPerson = { name?: string; job?: string; character?: string };
type TmdbMoviePayload = {
  id: number;
  title?: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
  tagline?: string;
  runtime?: number | null;
  genres?: Array<{ id: number; name?: string }>;
  production_countries?: Array<{ iso_3166_1?: string; name?: string }>;
  spoken_languages?: Array<{ iso_639_1?: string; english_name?: string; name?: string }>;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  credits?: {
    cast?: TmdbCreditPerson[];
    crew?: TmdbCreditPerson[];
  };
};
type TmdbSearchPayload = {
  results?: Array<{ id?: number; title?: string; release_date?: string; poster_path?: string | null }>;
};
type TmdbCompanionFacts = {
  title: string;
  year?: number;
  posterUrl?: string;
  overview?: string;
  tagline?: string;
  runtimeMinutes?: number;
  genres: string[];
  countries: string[];
  languages: string[];
  voteAverage?: number;
  voteCount?: number;
  popularity?: number;
  director?: string;
  cast: CreditCast[];
};
const COMPANION_LLM_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lightSummary', 'fullSummary', 'trivia'],
  properties: {
    lightSummary: { type: 'string' },
    fullSummary: { type: 'string' },
    trivia: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: { type: 'string' },
    },
  },
} as const;

function companionMinGroundedChunks(): number {
  const parsed = Number.parseInt(process.env.COMPANION_MIN_GROUNDED_CHUNKS ?? '', 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 2;
  }
  return parsed;
}

function collectGroundingChunks(
  evidence: Array<{
    snippet: string;
    provenance?: {
      sourceType?: 'packet' | 'external_reading' | 'chunk';
      documentId?: string;
      chunkId?: string;
    };
  }>,
): GroundingChunk[] {
  return evidence
    .filter((item) => item.provenance?.sourceType === 'chunk' && item.provenance.documentId && item.provenance.chunkId)
    .map((item) => ({
      documentId: item.provenance!.documentId!,
      chunkId: item.provenance!.chunkId!,
      snippet: item.snippet,
    }));
}


function normalizeSpoilerPolicy(value: string | null): SpoilerPolicy | null {
  if (!value) {
    return 'NO_SPOILERS';
  }

  if (value === 'NO_SPOILERS' || value === 'LIGHT' || value === 'FULL') {
    return value;
  }

  return null;
}

function parseCast(value: unknown): CreditCast[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === 'string' && entry.trim().length > 0) {
        return { name: entry.trim() };
      }

      if (
        typeof entry === 'object'
        && entry !== null
        && typeof (entry as { name?: unknown }).name === 'string'
      ) {
        const castEntry = entry as { name: string; role?: unknown };
        return {
          name: castEntry.name.trim(),
          ...(typeof castEntry.role === 'string' && castEntry.role.trim().length > 0
            ? { role: castEntry.role.trim() }
            : {}),
        };
      }

      return null;
    })
    .filter((entry): entry is CreditCast => entry !== null);
}

function parseGenreList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim();
      }
      if (entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string') {
        return (entry as { name: string }).name.trim();
      }
      return '';
    })
    .filter((name) => name.length > 0)
    .slice(0, 8);
}

function formatRatingLine(rating: RatingRow): string {
  if (rating.rawValue && rating.rawValue.trim().length > 0) {
    return `${rating.source.replaceAll('_', ' ')}: ${rating.rawValue}`;
  }
  return `${rating.source.replaceAll('_', ' ')}: ${rating.value}/${rating.scale}`;
}

function formatRuntime(runtimeMinutes?: number): string {
  if (!runtimeMinutes || runtimeMinutes <= 0) {
    return 'Runtime unavailable';
  }
  const h = Math.floor(runtimeMinutes / 60);
  const m = runtimeMinutes % 60;
  if (h === 0) {
    return `${m}m`;
  }
  return `${h}h ${m}m`;
}

function stripCitationTokens(text: string): string {
    return text.replace(/\s*\[doc:[^\]\s]+\s+chunk:[^\]\s]+\]/g, '').trim();
}


function parseYear(value?: string): number | undefined {
  if (!value || value.length < 4) {
    return undefined;
  }
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isInteger(year) ? year : undefined;
}

function firstLine(value: string, max = 180): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1).trimEnd()}...`;
}

function overviewSentences(value?: string, maxSentences = 2): string[] {
  if (!value) {
    return [];
  }
  return value
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, maxSentences)
    .map((line) => firstLine(line, 170));
}

function sanitizeTriviaLines(lines: unknown): string[] {
  if (!Array.isArray(lines)) {
    return [];
  }
  return lines
    .filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
    .map((line) => firstLine(line, 180))
    .filter((line) => line.length > 0)
    .slice(0, 5);
}

function resolveLlmProviderName(): string {
  if (process.env.USE_LLM === 'false') {
    return 'disabled';
  }
  const provider = process.env.LLM_PROVIDER;
  if (provider === 'gemini' || provider === 'ollama') {
    return provider;
  }
  return 'disabled';
}

function resolveLlmModelName(): string {
  if (process.env.LLM_PROVIDER === 'gemini') {
    return process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  }
  if (process.env.LLM_PROVIDER === 'ollama') {
    return process.env.OLLAMA_MODEL ?? 'ollama';
  }
  return 'disabled';
}

function companionCacheTtlMs(): number {
  const parsed = Number.parseInt(process.env.COMPANION_CACHE_TTL_MS ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  return parsed;
}

function isCompanionFullyPopulated(input: {
  usedTmdbFacts: boolean;
  llmOutput: CompanionLlmOutput | null;
  resolvedDirector: string | null;
  resolvedCastCount: number;
  ratingsCount: number;
  sections: {
    productionNotes: string[];
    historicalNotes: string[];
    receptionNotes: string[];
    techniqueBreakdown: string[];
    influenceMap: string[];
    afterWatchingReflection: string[];
    trivia: string[];
  };
}): boolean {
  return input.usedTmdbFacts
    && input.llmOutput !== null
    && input.sections.trivia.length === 5
    && input.sections.productionNotes.length > 0
    && input.sections.historicalNotes.length > 0
    && input.sections.receptionNotes.length > 0
    && input.sections.techniqueBreakdown.length > 0
    && input.sections.influenceMap.length > 0
    && input.sections.afterWatchingReflection.length > 0
    && input.ratingsCount >= 2
    && (Boolean(input.resolvedDirector) || input.resolvedCastCount > 0);
}

function normalizeCachedCompanionPayload(value: unknown): CompanionResponsePayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!record.movie || !record.sections || !record.spoilerPolicy || !record.credits || !record.ratings || !record.evidence) {
    return null;
  }
  if (!record.metadata || typeof record.metadata !== 'object') {
    record.metadata = {
      genres: [],
      nodes: [],
      runtimeText: 'Runtime unavailable',
      countries: [],
      languages: [],
    };
  } else {
    const metadata = record.metadata as Record<string, unknown>;
    if (!Array.isArray(metadata.nodes)) {
      metadata.nodes = [];
    }
  }
  // Backward compatibility for older cache rows before streaming was added.
  if (!record.streaming || typeof record.streaming !== 'object') {
    record.streaming = { region: 'US', offers: [] };
  }
  if (!Array.isArray(record.externalReadings)) {
    record.externalReadings = [];
  } else {
    const normalizedReadings = (record.externalReadings as unknown[])
      .map((entry) => zExternalReading.safeParse(entry))
      .filter((entry): entry is { success: true; data: ExternalReading } => entry.success)
      .map((entry) => entry.data);
    record.externalReadings = normalizedReadings;
  }
  if (record.sections && typeof record.sections === 'object') {
    const sections = record.sections as Record<string, unknown>;
    if (!Array.isArray(sections.techniqueBreakdown)) {
      sections.techniqueBreakdown = [];
    }
    if (!Array.isArray(sections.influenceMap)) {
      sections.influenceMap = [];
    }
    if (!Array.isArray(sections.afterWatchingReflection)) {
      sections.afterWatchingReflection = [];
    }
  }
  return record as unknown as CompanionResponsePayload;
}

type UserTasteProfileShape = {
  intensityPreference: number;
  pacingPreference: number;
  psychologicalVsSupernatural: number;
  goreTolerance: number;
  ambiguityTolerance: number;
  nostalgiaBias: number;
  auteurAffinity: number;
} | null;

function buildReflectionPrompts(input: {
  title: string;
  taste: UserTasteProfileShape;
  spoilerPolicy: SpoilerPolicy;
}): string[] {
  const taste = input.taste;
  const policyPrompt = input.spoilerPolicy === 'FULL'
    ? 'In full context, did the ending payoff feel earned by earlier setup?'
    : input.spoilerPolicy === 'LIGHT'
      ? 'Based on the first two acts, what ending direction do you predict?'
      : 'Without spoilers, what unresolved thread are you most curious about?';
  if (!taste) {
    return [
      `What scene from ${input.title} stayed with you the longest, and why?`,
      'Which technical choice changed your tension level the most?',
      policyPrompt,
    ];
  }

  const prompts: string[] = [];
  if (taste.pacingPreference <= 0.4) {
    prompts.push('Did the slow-burn setup feel rewarding by the midpoint?');
  } else if (taste.pacingPreference >= 0.65) {
    prompts.push('Which high-intensity sequence felt most effective and why?');
  } else {
    prompts.push('Which pacing shift (quiet to intense) worked best for you?');
  }

  if (taste.psychologicalVsSupernatural >= 0.55) {
    prompts.push('Which psychological theme felt most convincing or unsettling?');
  } else {
    prompts.push('Which supernatural or lore element felt most coherent?');
  }

  prompts.push(policyPrompt);

  return prompts.slice(0, 3);
}

function parseStreamingOffers(value: unknown): Array<{
  provider: string;
  type: 'subscription' | 'rent' | 'buy' | 'free';
  url?: string;
  price?: string;
}> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const provider = typeof record.provider === 'string' ? record.provider.trim() : '';
      const type = typeof record.type === 'string' ? record.type : '';
      if (!provider || (type !== 'subscription' && type !== 'rent' && type !== 'buy' && type !== 'free')) {
        return null;
      }
      const url = typeof record.url === 'string' && record.url.trim().length > 0 ? record.url.trim() : undefined;
      const price = typeof record.price === 'string' && record.price.trim().length > 0 ? record.price.trim() : undefined;
      return {
        provider,
        type,
        ...(url ? { url } : {}),
        ...(price ? { price } : {}),
      };
    })
    .filter((offer): offer is {
      provider: string;
      type: 'subscription' | 'rent' | 'buy' | 'free';
      url?: string;
      price?: string;
    } => offer !== null);
}

function normalizeCompanionLlmOutput(value: unknown): CompanionLlmOutput | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.lightSummary !== 'string' || typeof record.fullSummary !== 'string') {
    return null;
  }
  const trivia = sanitizeTriviaLines(record.trivia);
  if (trivia.length < 1) {
    return null;
  }
  return {
    lightSummary: firstLine(record.lightSummary, 900),
    fullSummary: firstLine(record.fullSummary, 1800),
    trivia,
  };
}

function isCompanionLlmEnabled(): boolean {
  if (process.env.USE_LLM === 'false') {
    return false;
  }
  return typeof process.env.LLM_PROVIDER === 'string' && process.env.LLM_PROVIDER.length > 0;
}


function companionLlmMaxRetries(): number {
  const parsed = Number.parseInt(process.env.COMPANION_LLM_MAX_RETRIES ?? '', 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 2;
  }
  return Math.min(parsed, 5);
}

function companionLlmRetryDelayMs(): number {
  const parsed = Number.parseInt(process.env.COMPANION_LLM_RETRY_DELAY_MS ?? '', 10);
  if (!Number.isInteger(parsed) || parsed < 50) {
    return 350;
  }
  return Math.min(parsed, 5000);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateCompanionLlmOutput(input: {
  title: string;
  year: number | null;
  facts: TmdbCompanionFacts | null;
  evidence: Array<{ sourceName: string; snippet: string; citationId?: string }>;
  cinematicContext?: {
    nodeName?: string;
    tier?: string;
    whyParagraph?: string;
    reasonTitle?: string;
    reasonBullets?: string[];
  };
}): Promise<{ output: CompanionLlmOutput | null; reason: string }> {
  if (!isCompanionLlmEnabled()) {
    return { output: null, reason: 'DISABLED_BY_ENV' };
  }

  const maxRetries = companionLlmMaxRetries();
  const baseDelay = companionLlmRetryDelayMs();
  const provider = getLlmProviderFromEnv();
  const standardMaxTokens = 16_000;

  let lastErrorMessage = 'unknown';
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const maxTokens = standardMaxTokens;
    const temperature = attempt === 0 ? 0.2 : 0.1;
    try {
      const response = await provider.generateJson<unknown>({
        schemaName: 'CompanionSpoilerAndTrivia',
        jsonSchema: COMPANION_LLM_JSON_SCHEMA,
        system: [
          'Generate movie companion notes.',
          'Return strict JSON only.',
          'Do not include analysis, reasoning, markdown, or code fences.',
          'lightSummary must summarize beginning and middle only (no ending). Inform with provided evidence.',
          'fullSummary must include full plot arc including ending. Inform with provided evidence.',
          'trivia must include exactly 5 concise questions about the film\'s production history, cultural impact, or notable craft decisions, each with the answer in parentheses. Use provided evidence as your primary source.',
          'Avoid invented details. If uncertain, explicitly say unknown.',
          'For all fields (lightSummary, fullSummary, and trivia items drawn from evidence), include at least one citation token from the provided evidence IDs, formatted exactly like [doc:... chunk:...].',
        ].join(' '),
        user: JSON.stringify({
          movie: {
            title: input.title,
            year: input.year,
            genres: input.facts?.genres ?? [],
            overview: input.facts?.overview ?? 'unknown',
            tagline: input.facts?.tagline ?? 'unknown',
            runtimeMinutes: input.facts?.runtimeMinutes ?? null,
          },
          cinematicContext: input.cinematicContext ?? null,
          evidence: input.evidence.slice(0, 5).map((item) => ({
            ...(item.citationId ? { id: item.citationId } : {}),
            sourceName: item.sourceName,
            snippet: firstLine(item.snippet, 220),
          })),
          spoilerPolicies: ALL_SPOILER_POLICIES,
        }),
        temperature,
        maxTokens,
      });
      const normalized = normalizeCompanionLlmOutput(response);
      if (!normalized) {
        return { output: null, reason: 'SCHEMA_INVALID' };
      }
      if (attempt > 0) {
        console.info('[companion] llm retry success', { attempt, maxRetries });
      }
      return { output: normalized, reason: attempt > 0 ? `OK_AFTER_RETRY_${attempt}` : 'OK' };
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : 'unknown';
      if (attempt >= maxRetries) {
        break;
      }
      const delay = baseDelay * (attempt + 1);
      console.warn('[companion] llm retrying', {
        attempt: attempt + 1,
        maxRetries,
        delayMs: delay,
        error: lastErrorMessage,
        nextMaxTokens: standardMaxTokens,
      });
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay);
    }
  }
  return { output: null, reason: `PROVIDER_ERROR:${lastErrorMessage}` };
}

function enforceGroundedCompanionOutput(
  llmOutput: CompanionLlmOutput | null,
  groundingChunks: GroundingChunk[],
): CompanionLlmOutput | null {
  if (!llmOutput) {
    return null;
  }
  if (groundingChunks.length === 0) {
    return {
      lightSummary: llmOutput.lightSummary.trim(),
      fullSummary: llmOutput.fullSummary.trim(),
      trivia: llmOutput.trivia.map((t) => t.trim()).filter((t) => t.length > 0).slice(0, 5),
    };
  }

  const [lightSummary] = enforceCitationCoverage([llmOutput.lightSummary], groundingChunks);
  const [fullSummary] = enforceCitationCoverage([llmOutput.fullSummary], groundingChunks);
  const trivia = enforceCitationCoverage(llmOutput.trivia, groundingChunks).map(stripCitationTokens).slice(0, 5);

  return {
    lightSummary: lightSummary ?? llmOutput.lightSummary,
    fullSummary: fullSummary ?? llmOutput.fullSummary,
    trivia: trivia.length > 0 ? trivia : llmOutput.trivia.map((t) => t.trim()).filter((t) => t.length > 0).slice(0, 5),
  };
}


function hasTmdbApi(): boolean {
  return typeof process.env.TMDB_API_KEY === 'string' && process.env.TMDB_API_KEY.length > 0;
}

async function fetchTmdbJson<T>(url: URL): Promise<{
  ok: boolean;
  status: number | null;
  data: T | null;
  error?: string;
}> {
  try {
    const response = await fetch(url.toString(), { method: 'GET' });
    if (!response.ok) {
      return { ok: false, status: response.status, data: null, error: `HTTP_${response.status}` };
    }
    return { ok: true, status: response.status, data: await response.json() as T };
  } catch {
    return { ok: false, status: null, data: null, error: 'NETWORK_ERROR' };
  }
}

function toCompanionFacts(payload: TmdbMoviePayload): TmdbCompanionFacts | null {
  const title = payload.title?.trim();
  if (!title) {
    return null;
  }

  const director = payload.credits?.crew
    ?.find((person) => typeof person.job === 'string' && person.job.toLowerCase() === 'director')
    ?.name
    ?.trim();

  const cast: CreditCast[] = (payload.credits?.cast ?? [])
    .map((person) => {
      if (!person.name || person.name.trim().length === 0) {
        return null;
      }
      const role = typeof person.character === 'string' && person.character.trim().length > 0
        ? person.character.trim()
        : undefined;
      return { name: person.name.trim(), ...(role ? { role } : {}) };
    })
    .filter((person): person is CreditCast => Boolean(person))
    .slice(0, 8);

  return {
    title,
    year: parseYear(payload.release_date),
    posterUrl: typeof payload.poster_path === 'string' && payload.poster_path.trim().length > 0
      ? `https://image.tmdb.org/t/p/w500${payload.poster_path}`
      : undefined,
    overview: typeof payload.overview === 'string' && payload.overview.trim().length > 0
      ? payload.overview.trim()
      : undefined,
    tagline: typeof payload.tagline === 'string' && payload.tagline.trim().length > 0
      ? payload.tagline.trim()
      : undefined,
    runtimeMinutes: typeof payload.runtime === 'number' && Number.isFinite(payload.runtime) ? payload.runtime : undefined,
    genres: (payload.genres ?? [])
      .map((genre) => genre.name?.trim())
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
      .slice(0, 4),
    countries: (payload.production_countries ?? [])
      .map((country) => country.name?.trim())
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
      .slice(0, 3),
    languages: (payload.spoken_languages ?? [])
      .map((language) => (language.english_name ?? language.name ?? '').trim())
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
      .slice(0, 3),
    voteAverage: typeof payload.vote_average === 'number' && Number.isFinite(payload.vote_average)
      ? Number(payload.vote_average.toFixed(1))
      : undefined,
    voteCount: typeof payload.vote_count === 'number' && Number.isFinite(payload.vote_count)
      ? Math.round(payload.vote_count)
      : undefined,
    popularity: typeof payload.popularity === 'number' && Number.isFinite(payload.popularity)
      ? Number(payload.popularity.toFixed(1))
      : undefined,
    director,
    cast,
  };
}

async function loadTmdbCompanionFacts(input: { tmdbId: number; title: string; year: number | null }): Promise<{
  facts: TmdbCompanionFacts | null;
  reason:
    | 'OK_DIRECT'
    | 'OK_SEARCH_FALLBACK'
    | 'KEY_MISSING'
    | 'DIRECT_NOT_FOUND'
    | 'DIRECT_PARSE_FAILED'
    | 'SEARCH_NOT_FOUND'
    | 'SEARCH_RESOLVE_FAILED';
  details?: Record<string, unknown>;
}> {
  if (!hasTmdbApi()) {
    return { facts: null, reason: 'KEY_MISSING' };
  }

  const apiKey = process.env.TMDB_API_KEY as string;
  const detailsUrl = new URL(`https://api.themoviedb.org/3/movie/${input.tmdbId}`);
  detailsUrl.searchParams.set('api_key', apiKey);
  detailsUrl.searchParams.set('append_to_response', 'credits');
  detailsUrl.searchParams.set('language', 'en-US');

  const direct = await fetchTmdbJson<TmdbMoviePayload>(detailsUrl);
  const directFacts = direct.data ? toCompanionFacts(direct.data) : null;
  if (directFacts) {
    return { facts: directFacts, reason: 'OK_DIRECT', details: { directStatus: direct.status } };
  }
  if (!direct.ok) {
    if (direct.status === 404) {
      return { facts: null, reason: 'DIRECT_NOT_FOUND', details: { directStatus: direct.status, directError: direct.error } };
    }
    return { facts: null, reason: 'SEARCH_RESOLVE_FAILED', details: { directStatus: direct.status, directError: direct.error } };
  }

  const searchUrl = new URL('https://api.themoviedb.org/3/search/movie');
  searchUrl.searchParams.set('api_key', apiKey);
  searchUrl.searchParams.set('language', 'en-US');
  searchUrl.searchParams.set('include_adult', 'false');
  searchUrl.searchParams.set('query', input.title);
  if (typeof input.year === 'number') {
    searchUrl.searchParams.set('year', String(input.year));
  }

  const search = await fetchTmdbJson<TmdbSearchPayload>(searchUrl);
  const candidateId = (search.data?.results ?? [])
    .find((entry) => Number.isInteger(entry.id))
    ?.id;
  if (!candidateId || !Number.isInteger(candidateId)) {
    return {
      facts: null,
      reason: direct.ok ? 'DIRECT_PARSE_FAILED' : 'SEARCH_NOT_FOUND',
      details: {
        directStatus: direct.status,
        searchStatus: search.status,
        searchError: search.error,
      },
    };
  }

  const resolvedDetailsUrl = new URL(`https://api.themoviedb.org/3/movie/${candidateId}`);
  resolvedDetailsUrl.searchParams.set('api_key', apiKey);
  resolvedDetailsUrl.searchParams.set('append_to_response', 'credits');
  resolvedDetailsUrl.searchParams.set('language', 'en-US');

  const resolved = await fetchTmdbJson<TmdbMoviePayload>(resolvedDetailsUrl);
  const resolvedFacts = resolved.data ? toCompanionFacts(resolved.data) : null;
  if (resolvedFacts) {
    return {
      facts: resolvedFacts,
      reason: 'OK_SEARCH_FALLBACK',
      details: {
        directStatus: direct.status,
        searchStatus: search.status,
        resolvedStatus: resolved.status,
        candidateId,
      },
    };
  }
  return {
    facts: null,
    reason: 'SEARCH_RESOLVE_FAILED',
    details: {
      directStatus: direct.status,
      searchStatus: search.status,
      resolvedStatus: resolved.status,
      resolvedError: resolved.error,
      candidateId,
    },
  };
}

function buildSections(
  input: {
    title: string;
    year: number | null;
    facts: TmdbCompanionFacts | null;
  },
  spoilerPolicy: SpoilerPolicy,
  userTasteProfile: UserTasteProfileShape,
  hasCredits: boolean,
  ratings: RatingRow[],
  evidenceCount: number,
  llmOutput: CompanionLlmOutput | null,
  grounding: {
    insufficientEvidence: boolean;
    groundingChunks: GroundingChunk[];
  },
  cinematicContext?: {
    whyParagraph?: string;
    reasonBullets?: string[];
  },
) {
  if (grounding.insufficientEvidence) {
    const uncertainty = DEFAULT_GROUNDING_REFUSAL_TEMPLATE;
    return {
      productionNotes: [uncertainty],
      historicalNotes: [uncertainty],
      receptionNotes: [uncertainty],
      techniqueBreakdown: [uncertainty],
      influenceMap: [uncertainty],
      afterWatchingReflection: [
        'What missing context would help you evaluate this film more confidently?',
        'Which aspect of the film would you like evidence for first?',
        'Would you like a spoiler-safe summary from verified sources once evidence is available?',
      ],
      trivia: [uncertainty, uncertainty, uncertainty, uncertainty, uncertainty],
    };
  }

  const title = input.facts?.title ?? input.title;
  const year = input.facts?.year ?? input.year;
  const yearText = year ? ` (${year})` : '';
  const genresText = input.facts?.genres.length ? input.facts.genres.join(', ') : 'horror';
  const regionsText = input.facts?.countries.length ? input.facts.countries.join(', ') : 'Unknown production region';
  const languageText = input.facts?.languages.length ? input.facts.languages.join(', ') : 'Unknown language profile';
  const tmdbScoreText = typeof input.facts?.voteAverage === 'number'
    ? `TMDB score ${input.facts.voteAverage}/10${typeof input.facts.voteCount === 'number' ? ` from ${input.facts.voteCount.toLocaleString()} votes` : ''}.`
    : 'TMDB score currently unavailable.';
  const overviewText = input.facts?.overview
    ? firstLine(input.facts.overview, 220)
    : `${title}${yearText}: notable craft choices and production context without plot specifics.`;

  const spoilerSafeSummary = input.facts?.overview
    ? `Spoiler-safe summary: ${firstLine(input.facts.overview, 210)}`
    : `Spoiler-safe summary: ${title}${yearText} builds tone and setup without plot reveals.`;
  const overviewBits = overviewSentences(input.facts?.overview, 2);
  const lightSummary = llmOutput?.lightSummary
    ?? (overviewBits.length > 0
      ? `${overviewBits.join(' ')} (Act I-II emphasis; ending omitted.)`
      : `${title}${yearText}: setup and rising conflict through the midpoint (ending intentionally omitted).`);
  const fullSummary = llmOutput?.fullSummary
    ?? (overviewBits.length > 0
      ? `${overviewBits.join(' ')} Ending details are not in local metadata; full resolution is unknown.`
      : `${title}${yearText}: full-plot summary including ending is unknown from local metadata.`);

  const productionNotes = [
    spoilerPolicy === 'NO_SPOILERS'
      ? spoilerSafeSummary
      : spoilerPolicy === 'LIGHT'
        ? `Act I-II summary: ${lightSummary}`
        : `Full plot summary (includes ending): ${fullSummary}`,
    `Craft lens: track camera distance, edit rhythm, and sound dynamics as tension tools in ${title}${yearText}.`,
    `Pacing lens: compare setup vs escalation beats and note where the film intentionally withholds release.`,
    input.facts?.tagline
      ? `Tone signal: ${firstLine(input.facts.tagline, 120)}`
      : `Tone signal: use color, silence, and framing to infer intended emotional temperature.`,
  ];
  const historicalNotes = [
    `Released in ${year ?? 'an unknown year'}, this title sits in ${genresText} traditions.`,
    `Production context: ${regionsText}.`,
    'Use this as a lens for how horror language evolves across decades and subgenres.',
    ...(cinematicContext?.whyParagraph ? [firstLine(cinematicContext.whyParagraph, 220)] : []),
  ];
  const receptionNotes = ratings.length > 0
    ? [...ratings.slice(0, 3).map(formatRatingLine), tmdbScoreText]
    : [tmdbScoreText, 'Reception scores are currently unavailable for this title.'];
  const techniqueBreakdown = [
    'Cinematography: track framing distance, lens choice feel, and shadow composition scene-to-scene.',
    'Score: note when music drives dread versus when silence is used as pressure.',
    'Editing rhythm: compare average shot length in setup versus escalation beats.',
    ...(Array.isArray(cinematicContext?.reasonBullets) && cinematicContext.reasonBullets.length > 0
      ? [firstLine(cinematicContext.reasonBullets[0]!, 200)]
      : []),
  ];
  const influenceMap = [
    `Predecessor films: compare ${title}${yearText} with earlier horror mood-builders from adjacent subgenres.`,
    input.facts?.director
      ? `Director lineage: map recurring signatures from ${input.facts.director}'s prior work into this film.`
      : 'Director lineage: unavailable; compare visual grammar with genre contemporaries instead.',
    `Genre lineage: connect this title's ${genresText} patterns to modern horror techniques.`,
  ];
  const topCast = input.facts?.cast.slice(0, 3).map((item) => item.name).join(', ');

  const genericTriviaPrompts = [
    `What specific camera technique or lighting choice in ${title} creates its most memorable shot?`,
    `Which scene in ${title} required the most takes, and what made it difficult to capture?`,
    `How did the production design of ${title} reflect or contrast with its genre conventions?`,
    `What behind-the-scenes story from ${title} became industry legend?`,
    `Which practical effect in ${title} was more challenging than expected?`,
    `What alternate ending was considered for ${title}?`,
    `How did the sound design in ${title} enhance its emotional impact?`,
    `Which actor in ${title} improvised a line that made the final cut?`,
    `What location challenge nearly disrupted the ${title} shoot?`,
    `Which visual motif in ${title} was added during post-production?`,
  ];

    const trivia = [...(llmOutput?.trivia ?? [])];
    const fallbackTrivia: string[] = [];
    for (let i = 0; i < 5 && fallbackTrivia.length < 5; i++) {
      const prompt = genericTriviaPrompts[i % genericTriviaPrompts.length];
      if (!trivia.includes(prompt)) {
        fallbackTrivia.push(prompt);
      }
    }


  if (spoilerPolicy === 'LIGHT') {
    productionNotes.push('Light hint: watch how early setup choices escalate through the midpoint.');
    historicalNotes.push('Light hint: thematic framing may echo period-specific social anxieties.');
  }

  if (spoilerPolicy === 'FULL') {
    productionNotes.push('Full mode: includes ending and late-film structural payoffs.');
    historicalNotes.push('Full mode: compares ending construction with genre conventions directly.');
  }

  if (!hasCredits) {
    productionNotes.push('Credits metadata is currently limited for this title.');
    receptionNotes.push('Credits metadata is currently limited for this title.');
  }

  return {
    productionNotes,
    historicalNotes,
    receptionNotes,
    techniqueBreakdown,
    influenceMap,
    afterWatchingReflection: buildReflectionPrompts({
      title,
      taste: userTasteProfile,
      spoilerPolicy,
    }),
    trivia: trivia.slice(0, 5),
  };
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const url = new URL(request.url);
  const tmdbIdParam = url.searchParams.get('tmdbId');
  const spoilerPolicy = normalizeSpoilerPolicy(url.searchParams.get('spoilerPolicy'));
  const forceRefresh = url.searchParams.get('forceRefresh') === 'true' || url.searchParams.get('forceRefresh') === '1';

  const tmdbId = tmdbIdParam ? Number.parseInt(tmdbIdParam, 10) : NaN;
  if (!Number.isInteger(tmdbId)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'tmdbId is required and must be an integer' }, 400);
  }

  if (!spoilerPolicy) {
    return fail({ code: 'VALIDATION_ERROR', message: 'spoilerPolicy must be NO_SPOILERS, LIGHT, or FULL' }, 400);
  }
  if (forceRefresh && !auth.isAdmin) {
    return fail({ code: 'FORBIDDEN', message: 'Admin access required for forced refresh' }, 403);
  }

  const movie = await prisma.movie.findUnique({
    where: { tmdbId },
    select: {
      id: true,
      tmdbId: true,
      title: true,
      year: true,
      posterUrl: true,
      genres: true,
      director: true,
      castTop: true,
      ratings: {
        select: {
          source: true,
          value: true,
          scale: true,
          rawValue: true,
        },
        orderBy: { source: 'asc' },
      },
    },
  });

  if (!movie) {
    return fail({ code: 'NOT_FOUND', message: 'Movie not found' }, 404);
  }
  const userTasteProfile = await prisma.userTasteProfile.findUnique({
    where: { userId: auth.userId },
    select: {
      intensityPreference: true,
      pacingPreference: true,
      psychologicalVsSupernatural: true,
      goreTolerance: true,
      ambiguityTolerance: true,
      nostalgiaBias: true,
      auteurAffinity: true,
    },
  });

  const effectivePack = await resolveEffectivePackForUser(prisma, auth.userId);
  const evidenceRetriever = createConfiguredEvidenceRetriever(prisma);
  const evidence = await evidenceRetriever.getEvidenceForMovie(movie.id, {
    region: 'US',
    seasonSlug: effectivePack.seasonSlug,
    packSlug: effectivePack.packSlug,
    packId: effectivePack.packId,
    query: `${movie.title} behind the scenes production trivia filming anecdotes director interview cast preparation`,
    includeExternalReadings: true,
    requireSeasonContext: true,
    callerId: 'api:companion',
    topK: 8,
  });
  const groundingChunks = collectGroundingChunks(evidence);
  const minGroundedChunks = companionMinGroundedChunks();
  const insufficientGroundingEvidence = groundingChunks.length < minGroundedChunks;

  const cast = parseCast(movie.castTop);
  const tmdbFetch = await loadTmdbCompanionFacts({
    tmdbId: movie.tmdbId,
    title: movie.title,
    year: movie.year,
  });
  const publishedNodes = effectivePack.packId
    ? await getPublishedNodesForMovie(prisma, {
      packId: effectivePack.packId,
      seasonSlug: effectivePack.seasonSlug,
      movieId: movie.id,
    })
    : [];
  const primaryNodeSlug = publishedNodes[0]?.nodeSlug ?? null;
  let filmContext: Awaited<ReturnType<typeof buildFilmContextExplanation>> = null;
  let reasonPanel: Awaited<ReturnType<typeof buildSeasonReasonPanel>> = null;
  try {
    [filmContext, reasonPanel] = await Promise.all([
      buildFilmContextExplanation({
        seasonSlug: effectivePack.seasonSlug,
        packSlug: effectivePack.packSlug,
        nodeSlug: primaryNodeSlug,
        tmdbId: movie.tmdbId,
      }),
      buildSeasonReasonPanel({
        seasonSlug: effectivePack.seasonSlug,
        packSlug: effectivePack.packSlug,
        nodeSlug: primaryNodeSlug,
        tmdbId: movie.tmdbId,
      }),
    ]);
  } catch (error) {
    console.warn('[companion] context enrichment unavailable', {
      tmdbId: movie.tmdbId,
      seasonSlug: effectivePack.seasonSlug,
      packSlug: effectivePack.packSlug,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const externalReadings = await getExternalReadingsForFilm({
    filmId: String(movie.tmdbId),
    seasonId: effectivePack.seasonSlug,
    prismaClient: prisma,
  });
  const streamingCache = await prisma.movieStreamingCache.findUnique({
    where: {
      movieId_region: {
        movieId: movie.id,
        region: 'US',
      },
    },
    select: {
      offers: true,
      region: true,
    },
  });

  const now = new Date();
  const cached = await prisma.companionCache.findUnique({
    where: {
      movieId_spoilerPolicy: {
        movieId: movie.id,
        spoilerPolicy,
      },
    },
  });
  if (!forceRefresh && cached && cached.isFullyPopulated && cached.expiresAt > now) {
    const cachedPayload = normalizeCachedCompanionPayload(cached.payload);
    if (cachedPayload) {
      console.info('[companion] cache hit', {
        tmdbId: movie.tmdbId,
        spoilerPolicy,
        cacheExpiresAt: cached.expiresAt.toISOString(),
        llmProvider: cached.llmProvider ?? 'unknown',
        llmModel: cached.llmModel ?? 'unknown',
      });
      return ok(cachedPayload);
    }
  }
  if (forceRefresh) {
    await prisma.companionCache.deleteMany({
      where: {
        movieId: movie.id,
      },
    });
    console.info('[companion] force refresh requested', {
      tmdbId: movie.tmdbId,
      spoilerPolicy,
      byUserId: auth.userId,
    });
  }
  console.info('[companion] cache miss', {
    tmdbId: movie.tmdbId,
    spoilerPolicy,
    reason: forceRefresh
      ? 'FORCE_REFRESH'
      : !cached
        ? 'NOT_FOUND'
        : cached.expiresAt <= now
          ? 'EXPIRED'
          : 'NOT_FULLY_POPULATED',
  });
  const tmdbFacts = tmdbFetch.facts;
  const fallbackGenres = parseGenreList(movie.genres);

  const resolvedCast = tmdbFacts?.cast.length ? tmdbFacts.cast : cast;
  const resolvedDirector = tmdbFacts?.director ?? movie.director ?? null;
  const movieRatings = Array.isArray(movie.ratings) ? movie.ratings : [];
  const hasTmdbRatingAlready = movieRatings.some((rating) => rating.source === 'TMDB');
  const responseRatings = (!hasTmdbRatingAlready && typeof tmdbFacts?.voteAverage === 'number')
    ? [
      ...movieRatings,
      {
        source: 'TMDB',
        value: tmdbFacts.voteAverage,
        scale: '10',
        rawValue: `${tmdbFacts.voteAverage}/10`,
      },
    ]
    : movieRatings;

  const llmResult = insufficientGroundingEvidence
    ? { output: null, reason: 'INSUFFICIENT_EVIDENCE' as const }
    : await generateCompanionLlmOutput({
      title: tmdbFacts?.title ?? movie.title,
      year: tmdbFacts?.year ?? movie.year,
      facts: tmdbFacts,
      evidence: evidence.map((item) => ({
        sourceName: item.sourceName,
        snippet: item.snippet,
        ...(item.provenance?.documentId && item.provenance?.chunkId
          ? { citationId: formatChunkCitation({ documentId: item.provenance.documentId, chunkId: item.provenance.chunkId, snippet: item.snippet }) }
          : {}),
      })),
      cinematicContext: {
        ...(filmContext
          ? {
            nodeName: filmContext.nodeName,
            tier: filmContext.tier,
            whyParagraph: filmContext.whyParagraph,
          }
          : {}),
        ...(reasonPanel
          ? {
            reasonTitle: reasonPanel.reasonTitle,
            reasonBullets: reasonPanel.bullets.slice(0, 3),
          }
          : {}),
      },
    });
  const llmOutput = enforceGroundedCompanionOutput(llmResult.output, groundingChunks);

  // Fetch the most recent narrative data for this movie
  const latestRecommendationItem = await prisma.recommendationItem.findFirst({
    where: {
      movieId: movie.id,
      narrativeHash: {
        not: null,
      },
    },
    orderBy: {
      narrativeGeneratedAt: 'desc',
    },
  });
  function buildCodexWatchFor(values: unknown): [string, string, string] {
    const array = Array.isArray(values) ? values : [];
    const normalized = array.filter((item): item is string => typeof item === 'string');
    return [
      normalized[0] ?? 'Key visual motif',
      normalized[1] ?? 'Atmosphere and pacing',
      normalized[2] ?? 'Character performance beat',
    ];
  }

  const codex = latestRecommendationItem ? {
    whyImportant: latestRecommendationItem.whyImportant,
    whatItTeaches: latestRecommendationItem.whatItTeaches,
    watchFor: buildCodexWatchFor(latestRecommendationItem.watchFor),
  } : undefined;

  const payloadsByPolicy = new Map<SpoilerPolicy, CompanionResponsePayload>();
  let fullyPopulatedAny = false;
  for (const policy of ALL_SPOILER_POLICIES) {
    const sections = buildSections(
      {
        title: movie.title,
        year: movie.year,
        facts: tmdbFacts,
      },
      policy,
      userTasteProfile,
      Boolean(resolvedDirector) || resolvedCast.length > 0,
      responseRatings,
      evidence.length,
      llmOutput,
      {
        insufficientEvidence: insufficientGroundingEvidence,
        groundingChunks,
      },
      {
        ...(filmContext ? { whyParagraph: filmContext.whyParagraph } : {}),
        ...(reasonPanel ? { reasonBullets: reasonPanel.bullets.slice(0, 2) } : {}),
      },
    );
    const payload: CompanionResponsePayload = {
      movie: {
        tmdbId: movie.tmdbId,
        title: tmdbFacts?.title ?? movie.title,
        ...((typeof tmdbFacts?.year === 'number' || typeof movie.year === 'number')
          ? { year: (tmdbFacts?.year ?? movie.year ?? undefined) as number | undefined }
          : {}),
        posterUrl: tmdbFacts?.posterUrl ?? movie.posterUrl,
      },
      metadata: {
        genres: tmdbFacts?.genres.length ? tmdbFacts.genres : fallbackGenres,
        nodes: publishedNodes.map((node) => ({
          slug: node.nodeSlug,
          label: node.nodeName,
          rationale: node.rationale,
        })),
        runtimeText: formatRuntime(tmdbFacts?.runtimeMinutes),
        countries: tmdbFacts?.countries ?? [],
        languages: tmdbFacts?.languages ?? [],
        ...(tmdbFacts?.tagline ? { tagline: firstLine(tmdbFacts.tagline, 200) } : {}),
        ...(tmdbFacts?.overview ? { overview: firstLine(tmdbFacts.overview, 320) } : {}),
        ...(typeof tmdbFacts?.popularity === 'number' ? { popularity: tmdbFacts.popularity } : {}),
        ...(typeof tmdbFacts?.voteAverage === 'number' ? { tmdbVoteAverage: tmdbFacts.voteAverage } : {}),
        ...(typeof tmdbFacts?.voteCount === 'number' ? { tmdbVoteCount: tmdbFacts.voteCount } : {}),
      },
      credits: {
        ...(resolvedDirector ? { director: resolvedDirector } : {}),
        cast: resolvedCast,
      },
      sections,
      ratings: responseRatings,
      streaming: {
        region: streamingCache?.region ?? 'US',
        offers: parseStreamingOffers(streamingCache?.offers).slice(0, 10),
      },
      spoilerPolicy: policy,
      evidence,
      externalReadings,
      ...(codex ? { codex } : {}),
    };
    const fullyPopulated = isCompanionFullyPopulated({
      usedTmdbFacts: Boolean(tmdbFacts),
      llmOutput,
      resolvedDirector,
      resolvedCastCount: resolvedCast.length,
      ratingsCount: responseRatings.length,
      sections,
    });
    if (fullyPopulated) {
      fullyPopulatedAny = true;
    }
    payloadsByPolicy.set(policy, payload);
  }

  if (fullyPopulatedAny) {
    const expiresAt = new Date(Date.now() + companionCacheTtlMs());
    for (const policy of ALL_SPOILER_POLICIES) {
      const policyPayload = payloadsByPolicy.get(policy);
      if (!policyPayload) {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await prisma.companionCache.upsert({
        where: {
          movieId_spoilerPolicy: {
            movieId: movie.id,
            spoilerPolicy: policy,
          },
        },
        create: {
          movieId: movie.id,
          spoilerPolicy: policy,
          payload: policyPayload,
          isFullyPopulated: true,
          llmProvider: resolveLlmProviderName(),
          llmModel: resolveLlmModelName(),
          generatedAt: now,
          expiresAt,
        },
        update: {
          payload: policyPayload,
          isFullyPopulated: true,
          llmProvider: resolveLlmProviderName(),
          llmModel: resolveLlmModelName(),
          generatedAt: now,
          expiresAt,
        },
      });
    }
    console.info('[companion] cache write all policies', {
      tmdbId: movie.tmdbId,
      llmProvider: resolveLlmProviderName(),
      llmModel: resolveLlmModelName(),
      expiresAt: expiresAt.toISOString(),
      policies: ALL_SPOILER_POLICIES,
    });
  }
  const payload = payloadsByPolicy.get(spoilerPolicy);
  if (!payload) {
    return fail({ code: 'INTERNAL_ERROR', message: 'Unable to resolve companion payload' }, 500);
  }
  console.info('[companion] resolved', {
    tmdbId: movie.tmdbId,
    spoilerPolicy,
    tmdbKeyConfigured: hasTmdbApi(),
    usedTmdbFacts: Boolean(tmdbFacts),
    tmdbReason: tmdbFetch.reason,
    tmdbDetails: tmdbFetch.details ?? null,
    llmUsed: Boolean(llmOutput),
    llmReason: llmResult.reason,
    fullyPopulated: fullyPopulatedAny,
    usedRatingsCount: responseRatings.length,
    evidenceCount: evidence.length,
  });
  return ok(payload);
}
