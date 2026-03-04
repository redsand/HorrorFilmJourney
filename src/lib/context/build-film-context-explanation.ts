import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NodeAssignmentTier, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { loadSeasonJourneyWorthinessConfig } from '@/config/seasons/journey-worthiness';

export type FilmContextSignal = {
  label: string;
  value: string;
};

export type FilmContextExplanation = {
  title: string;
  year: number | null;
  tier: 'Core' | 'Extended';
  nodeName: string;
  whyParagraph: string;
  signals: FilmContextSignal[];
  debug?: Record<string, unknown>;
};

type BuildFilmContextInput = {
  seasonSlug: string;
  packSlug: string;
  nodeSlug?: string | null;
  tmdbId: number;
};

type Season2ConfidenceRow = {
  title?: string;
  year?: number;
  node?: string;
  cultConfidenceScore?: number;
  confidenceTier?: string;
};

type Season2CanonRow = {
  title?: string;
  year?: number;
  tmdbId?: number;
  node?: string;
  tier?: string;
  canonScore?: number;
  rank?: number;
};

type Season2SourceVoteRow = {
  title?: string;
  year?: number;
  sourceCount?: number;
  inCurriculum?: boolean;
};

type SeasonIndexes = {
  confidenceByKey: Map<string, { score: number; tier?: string; node?: string }>;
  canonByKey: Map<string, { rank: number; canonScore?: number }>;
  sourceVotesByKey: Map<string, { sourceCount: number; inCurriculum?: boolean }>;
  sourceVoteThreshold: number | null;
};

const seasonIndexesCache = new Map<string, SeasonIndexes>();
const curriculumSubgenreCache = new Map<string, string[]>();

function toNodeTierLabel(tier: NodeAssignmentTier): 'Core' | 'Extended' {
  return tier === 'CORE' ? 'Core' : 'Extended';
}

function normalizeKey(input: { title: string; year?: number | null }): string {
  const normalizedTitle = input.title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const year = typeof input.year === 'number' ? String(input.year) : 'unknown';
  return `${normalizedTitle}|${year}`;
}

function parseWhatToNotice(value: Prisma.JsonValue | null): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim())
      .slice(0, 3);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const possibleKeys = ['items', 'points', 'highlights', 'bullets'];
    for (const key of possibleKeys) {
      const candidate = record[key];
      if (Array.isArray(candidate)) {
        return candidate
          .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
          .map((entry) => entry.trim())
          .slice(0, 3);
      }
    }
  }
  return [];
}

function safeReadJson(filePath: string | null): unknown {
  if (!filePath) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function findCurriculumPath(seasonSlug: string, packSlug: string): string | null {
  const cacheKey = `${seasonSlug}|${packSlug}`;
  if (curriculumSubgenreCache.has(cacheKey)) {
    return null;
  }

  const docsSeasonDir = resolve(process.cwd(), 'docs', 'season');
  if (!existsSync(docsSeasonDir)) {
    return null;
  }

  const prefix = `${seasonSlug}-${packSlug}`.toLowerCase();
  const candidates = readdirSync(docsSeasonDir)
    .filter((fileName) =>
      fileName.toLowerCase().startsWith(prefix)
      && fileName.toLowerCase().includes('curriculum')
      && fileName.toLowerCase().endsWith('.json'));

  if (candidates.length === 0) {
    return null;
  }

  return resolve(docsSeasonDir, candidates.sort()[0] as string);
}

function extractStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function parseSubgenresFromCurriculumNode(nodeRecord: Record<string, unknown>): string[] {
  const candidates = [
    extractStringArray(nodeRecord.subgenres),
    extractStringArray(nodeRecord.subGenres),
    extractStringArray(nodeRecord.subgenreFocus),
    extractStringArray(nodeRecord.focusSubgenres),
    extractStringArray(nodeRecord.tags),
  ];
  return candidates.find((entry) => entry.length > 0) ?? [];
}

function loadCurriculumSubgenres(seasonSlug: string, packSlug: string, nodeSlug: string): string[] {
  const cacheKey = `${seasonSlug}|${packSlug}|${nodeSlug}`;
  const existing = curriculumSubgenreCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const curriculumPath = findCurriculumPath(seasonSlug, packSlug);
  if (!curriculumPath) {
    curriculumSubgenreCache.set(cacheKey, []);
    return [];
  }

  const payload = safeReadJson(curriculumPath);
  if (!payload || typeof payload !== 'object') {
    curriculumSubgenreCache.set(cacheKey, []);
    return [];
  }

  const nodes = (payload as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) {
    curriculumSubgenreCache.set(cacheKey, []);
    return [];
  }

  const node = nodes.find((entry) =>
    typeof entry === 'object'
    && entry !== null
    && typeof (entry as { slug?: unknown }).slug === 'string'
    && String((entry as { slug: string }).slug) === nodeSlug) as Record<string, unknown> | undefined;
  if (!node) {
    curriculumSubgenreCache.set(cacheKey, []);
    return [];
  }

  const parsed = parseSubgenresFromCurriculumNode(node);
  curriculumSubgenreCache.set(cacheKey, parsed);
  return parsed;
}

function findSeasonDataFile(seasonSlug: string, includesText: string): string | null {
  const seasonDir = resolve(process.cwd(), 'docs', 'season');
  if (!existsSync(seasonDir)) {
    return null;
  }

  const matching = readdirSync(seasonDir)
    .filter((fileName) =>
      fileName.toLowerCase().startsWith(seasonSlug.toLowerCase())
      && fileName.toLowerCase().includes(includesText.toLowerCase())
      && fileName.toLowerCase().endsWith('.json'))
    .sort();
  if (matching.length === 0) {
    return null;
  }
  return resolve(seasonDir, matching[0] as string);
}

function loadSeasonIndexes(seasonSlug: string): SeasonIndexes {
  const cached = seasonIndexesCache.get(seasonSlug);
  if (cached) {
    return cached;
  }

  const confidenceByKey = new Map<string, { score: number; tier?: string; node?: string }>();
  const canonByKey = new Map<string, { rank: number; canonScore?: number }>();
  const sourceVotesByKey = new Map<string, { sourceCount: number; inCurriculum?: boolean }>();
  let sourceVoteThreshold: number | null = null;

  const confidencePath = findSeasonDataFile(seasonSlug, 'confidence');
  const canonPath = findSeasonDataFile(seasonSlug, 'canon');
  const sourceVotesPath = findSeasonDataFile(seasonSlug, 'source-votes');

  const confidencePayload = safeReadJson(confidencePath) as { films?: Season2ConfidenceRow[] } | null;
  for (const row of confidencePayload?.films ?? []) {
    if (typeof row.title !== 'string' || typeof row.cultConfidenceScore !== 'number') {
      continue;
    }
    confidenceByKey.set(normalizeKey({ title: row.title, year: row.year }), {
      score: row.cultConfidenceScore,
      tier: row.confidenceTier,
      node: row.node,
    });
  }

  const canonPayload = safeReadJson(canonPath) as {
    top50?: Season2CanonRow[];
    top100?: Season2CanonRow[];
    top250?: Season2CanonRow[];
  } | null;
  const canonRows = [
    ...(canonPayload?.top50 ?? []),
    ...(canonPayload?.top100 ?? []),
    ...(canonPayload?.top250 ?? []),
  ];
  for (const row of canonRows) {
    if (typeof row.title !== 'string' || typeof row.rank !== 'number') {
      continue;
    }
    canonByKey.set(normalizeKey({ title: row.title, year: row.year }), {
      rank: row.rank,
      canonScore: row.canonScore,
    });
  }

  const sourceVotesPayload = safeReadJson(sourceVotesPath) as {
    threshold?: number;
    rows?: Season2SourceVoteRow[];
  } | null;
  sourceVoteThreshold = typeof sourceVotesPayload?.threshold === 'number' ? sourceVotesPayload.threshold : null;
  for (const row of sourceVotesPayload?.rows ?? []) {
    if (typeof row.title !== 'string' || typeof row.sourceCount !== 'number') {
      continue;
    }
    sourceVotesByKey.set(normalizeKey({ title: row.title, year: row.year }), {
      sourceCount: row.sourceCount,
      inCurriculum: row.inCurriculum,
    });
  }

  const indexes = { confidenceByKey, canonByKey, sourceVotesByKey, sourceVoteThreshold };
  seasonIndexesCache.set(seasonSlug, indexes);
  return indexes;
}

function parsePrototypeSignal(evidence: Prisma.JsonValue | null): { score?: number; topMatch?: string } {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return {};
  }
  const record = evidence as Record<string, unknown>;
  const prototype = (record.prototype && typeof record.prototype === 'object')
    ? record.prototype as Record<string, unknown>
    : null;
  const score = [
    prototype?.similarity,
    prototype?.score,
    prototype?.prototypeScore,
    record.prototypeScore,
    record.prototypeSimilarity,
  ].find((value) => typeof value === 'number') as number | undefined;
  const topMatch = [
    prototype?.topMatchTitle,
    prototype?.topPrototypeTitle,
    prototype?.title,
    record.prototypeTopMatch,
  ].find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined;
  return { score, topMatch };
}

function parseGovernanceNotes(input: {
  evidence: Prisma.JsonValue | null;
  director: string | null;
  castTop: Prisma.JsonValue | null;
}): string | null {
  if (input.evidence && typeof input.evidence === 'object' && !Array.isArray(input.evidence)) {
    const record = input.evidence as Record<string, unknown>;
    const gates = record.gates;
    if (gates && typeof gates === 'object' && !Array.isArray(gates)) {
      const gateRecord = gates as Record<string, unknown>;
      const passed = Object.entries(gateRecord)
        .filter(([, value]) => value === true)
        .map(([key]) => key);
      if (passed.length > 0) {
        return `Passed gates: ${passed.slice(0, 3).join(', ')}`;
      }
    }
  }

  const castSize = Array.isArray(input.castTop) ? input.castTop.length : 0;
  if (input.director && castSize > 0) {
    return 'Credits coverage available (director and principal cast).';
  }
  if (input.director) {
    return 'Director metadata available.';
  }
  return null;
}

function buildWhyParagraph(input: {
  nodeName: string;
  tierLabel: 'Core' | 'Extended';
  seasonSlug: string;
  packSlug: string;
  nodeWhatToNotice: string[];
  nodeSubgenres: string[];
  assignmentSource: string;
  journeyScore: number;
  journeyThreshold: number;
  prototypeSignal: { score?: number; topMatch?: string };
  season2Signals?: { confidenceScore?: number; sourceVotes?: number };
}): string {
  const parts: string[] = [];
  parts.push(
    `Placed in ${input.nodeName} (${input.tierLabel}) for ${input.seasonSlug}/${input.packSlug}.`,
  );
  if (input.nodeWhatToNotice.length > 0) {
    parts.push(`What to notice: ${input.nodeWhatToNotice.join('; ')}.`);
  }
  if (input.nodeSubgenres.length > 0) {
    parts.push(`Subgenre context: ${input.nodeSubgenres.slice(0, 4).join(', ')}.`);
  }
  if (input.assignmentSource === 'curated') {
    parts.push('Selected through curated editorial inclusion for this movement.');
  } else if (input.assignmentSource === 'weak_supervision' || input.assignmentSource === 'ml') {
    parts.push('Selected through reproducible scoring signals and model-assisted assignment.');
  } else if (input.assignmentSource === 'override') {
    parts.push('Kept via governance override in the published snapshot.');
  }
  if (input.prototypeSignal.score !== undefined) {
    parts.push(
      input.prototypeSignal.topMatch
        ? `Prototype affinity is ${input.prototypeSignal.score.toFixed(2)} against "${input.prototypeSignal.topMatch}".`
        : `Prototype affinity is ${input.prototypeSignal.score.toFixed(2)}.`,
    );
  }
  if (input.journeyScore > 0) {
    parts.push(`Journey-worthiness ${input.journeyScore.toFixed(2)} vs threshold ${input.journeyThreshold.toFixed(2)}.`);
  }
  if (input.season2Signals?.confidenceScore !== undefined) {
    const sourceVotesText = typeof input.season2Signals.sourceVotes === 'number'
      ? ` with ${input.season2Signals.sourceVotes} supporting source votes`
      : '';
    parts.push(`Curated cult confidence is ${input.season2Signals.confidenceScore}${sourceVotesText}.`);
  }
  return parts.join(' ');
}

export async function buildFilmContextExplanation(input: BuildFilmContextInput): Promise<FilmContextExplanation | null> {
  const normalizedNodeSlug = input.nodeSlug?.trim().toLowerCase() || null;
  const movie = await prisma.movie.findUnique({
    where: { tmdbId: input.tmdbId },
    select: {
      id: true,
      title: true,
      year: true,
      director: true,
      castTop: true,
    },
  });
  if (!movie) {
    return null;
  }

  const pack = await prisma.genrePack.findFirst({
    where: {
      slug: input.packSlug,
      season: { slug: input.seasonSlug },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      season: { select: { slug: true, name: true } },
    },
  });
  if (!pack) {
    return null;
  }

  const assignment = await prisma.nodeMovie.findFirst({
    where: {
      movieId: movie.id,
      node: {
        packId: pack.id,
        ...(normalizedNodeSlug ? { slug: normalizedNodeSlug } : {}),
      },
    },
    orderBy: [{ tier: 'asc' }, { coreRank: 'asc' }, { rank: 'asc' }],
    select: {
      tier: true,
      source: true,
      score: true,
      finalScore: true,
      journeyScore: true,
      evidence: true,
      node: {
        select: {
          slug: true,
          name: true,
          whatToNotice: true,
          eraSubgenreFocus: true,
        },
      },
    },
  });
  if (!assignment) {
    return null;
  }

  const tierLabel = toNodeTierLabel(assignment.tier);
  const parsedWhatToNotice = parseWhatToNotice(assignment.node.whatToNotice);
  const curriculumSubgenres = loadCurriculumSubgenres(pack.season.slug, pack.slug, assignment.node.slug);
  const dbSubgenres = assignment.node.eraSubgenreFocus
    .split(/[;,]/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const nodeSubgenres = (curriculumSubgenres.length > 0 ? curriculumSubgenres : dbSubgenres).slice(0, 5);
  const prototypeSignal = parsePrototypeSignal(assignment.evidence);
  const governanceNote = parseGovernanceNotes({
    evidence: assignment.evidence,
    director: movie.director ?? null,
    castTop: movie.castTop,
  });
  const journeyConfig = loadSeasonJourneyWorthinessConfig(pack.season.slug);
  const journeyThreshold = assignment.tier === 'CORE'
    ? (journeyConfig.gates?.journeyMinCore ?? 0.6)
    : (journeyConfig.gates?.journeyMinExtended ?? 0.5);

  const signals: FilmContextSignal[] = [];
  if (governanceNote) {
    signals.push({ label: 'Governance', value: governanceNote });
  }
  if (prototypeSignal.score !== undefined) {
    signals.push({
      label: 'Prototype Similarity',
      value: prototypeSignal.topMatch
        ? `${prototypeSignal.score.toFixed(2)} (${prototypeSignal.topMatch})`
        : prototypeSignal.score.toFixed(2),
    });
  }
  if (typeof assignment.score === 'number') {
    signals.push({ label: 'Assignment Score', value: assignment.score.toFixed(2) });
  }
  if (typeof assignment.finalScore === 'number' && assignment.finalScore > 0) {
    signals.push({ label: 'Final Score', value: assignment.finalScore.toFixed(2) });
  }
  if (typeof assignment.journeyScore === 'number' && assignment.journeyScore > 0) {
    signals.push({
      label: 'Journey Worthiness',
      value: `${assignment.journeyScore.toFixed(2)} (min ${journeyThreshold.toFixed(2)})`,
    });
  }

  let season2Signals: { confidenceScore?: number; sourceVotes?: number } | undefined;
  const indexes = loadSeasonIndexes(pack.season.slug);
  const filmKey = normalizeKey({ title: movie.title, year: movie.year });
  const confidence = indexes.confidenceByKey.get(filmKey);
  const canon = indexes.canonByKey.get(filmKey);
  const sourceVotes = indexes.sourceVotesByKey.get(filmKey);

  if (confidence?.score !== undefined) {
    season2Signals = { ...(season2Signals ?? {}), confidenceScore: confidence.score };
    signals.push({ label: 'Confidence Score', value: String(confidence.score) });
  }
  if (canon?.rank !== undefined) {
    signals.push({
      label: 'Canon Rank',
      value: canon.canonScore !== undefined
        ? `#${canon.rank} (score ${canon.canonScore})`
        : `#${canon.rank}`,
    });
  }
  if (sourceVotes?.sourceCount !== undefined) {
    season2Signals = { ...(season2Signals ?? {}), sourceVotes: sourceVotes.sourceCount };
    signals.push({
      label: 'Source Votes',
      value: indexes.sourceVoteThreshold !== null
        ? `${sourceVotes.sourceCount} (threshold ${indexes.sourceVoteThreshold})`
        : String(sourceVotes.sourceCount),
    });
  }

  const whyParagraph = buildWhyParagraph({
    nodeName: assignment.node.name,
    tierLabel,
    seasonSlug: pack.season.slug,
    packSlug: pack.slug,
    nodeWhatToNotice: parsedWhatToNotice,
    nodeSubgenres,
    assignmentSource: assignment.source,
    journeyScore: assignment.journeyScore,
    journeyThreshold,
    prototypeSignal,
    season2Signals,
  });

  const debug = process.env.NODE_ENV !== 'production'
    ? {
      assignmentSource: assignment.source,
      packId: pack.id,
      nodeSlug: assignment.node.slug,
      journeyThreshold,
      parsedWhatToNotice,
      nodeSubgenres,
    }
    : undefined;

  return {
    title: movie.title,
    year: movie.year,
    tier: tierLabel,
    nodeName: assignment.node.name,
    whyParagraph,
    signals,
    ...(debug ? { debug } : {}),
  };
}
