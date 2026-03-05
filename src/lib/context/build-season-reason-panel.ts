import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { SEASON1_MUST_INCLUDE_ANCHORS } from '@/config/seasons/season1-must-include';
import { resolveWatchReasonForFilm } from '@/lib/journey/watch-reason';

export type ReasonPanelScoreBlock = {
  label: string;
  value: string;
  detail?: string;
};

export type ReasonPanelLink = {
  label: string;
  href: string;
};

export type SeasonReasonPanel = {
  seasonSlug: string;
  reasonTitle: string;
  bullets: string[];
  badges: string[];
  scoreBlock?: ReasonPanelScoreBlock;
  links?: ReasonPanelLink[];
};

type BuildSeasonReasonPanelInput = {
  seasonSlug: string;
  packSlug: string;
  nodeSlug?: string | null;
  tmdbId: number;
};

type BaseContext = {
  seasonSlug: string;
  packSlug: string;
  tmdbId: number;
  watchReason: string | null;
  movie: {
    title: string;
    year: number | null;
    director: string | null;
    castTop: Prisma.JsonValue | null;
  };
  assignment: {
    tier: 'CORE' | 'EXTENDED';
    source: string;
    score: number | null;
    finalScore: number;
    journeyScore: number;
    evidence: Prisma.JsonValue | null;
    node: {
      slug: string;
      name: string;
      whatToNotice: Prisma.JsonValue | null;
      eraSubgenreFocus: string;
    };
  };
};

type SeasonReasonBuilder = (context: BaseContext) => SeasonReasonPanel;

type ConfidenceRow = {
  title?: string;
  year?: number;
  cultConfidenceScore?: number;
  confidenceTier?: string;
};

type CanonRow = {
  title?: string;
  year?: number;
  rank?: number;
};

type SourceVoteRow = {
  title?: string;
  year?: number;
  sourceCount?: number;
};

type MissingClusterFile = {
  clusters?: Array<{
    cluster?: string;
    films?: Array<{ title?: string; year?: number }>;
  }>;
};

type SeasonArtifacts = {
  confidenceByKey: Map<string, { score: number; tier?: string }>;
  canonByKey: Map<string, { rank: number }>;
  sourceVotesByKey: Map<string, { sourceCount: number }>;
  sourceVoteThreshold: number | null;
  clusterTagsByKey: Map<string, string[]>;
};

const seasonArtifactsCache = new Map<string, SeasonArtifacts>();

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
    const list = ['items', 'points', 'bullets']
      .map((key) => record[key])
      .find((candidate) => Array.isArray(candidate));
    if (Array.isArray(list)) {
      return list
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim())
        .slice(0, 3);
    }
  }
  return [];
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
  ].find((value) => typeof value === 'number') as number | undefined;
  const topMatch = [
    prototype?.topMatchTitle,
    prototype?.topPrototypeTitle,
    record.prototypeTopMatch,
  ].find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined;
  return { score, topMatch };
}

function scanMustIncludeReason(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized.includes('must include') || normalized.includes('guardrail') || normalized.includes('anchor')) {
      return value.trim();
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = scanMustIncludeReason(entry);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('must') || lowerKey.includes('guardrail') || lowerKey.includes('anchor')) {
        const direct = scanMustIncludeReason(nested);
        if (direct) {
          return direct;
        }
        if (nested === true) {
          return 'Must-include guardrail applied.';
        }
      }
      const found = scanMustIncludeReason(nested);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function normalizeClusterTag(clusterName: string): string {
  const normalized = clusterName.toLowerCase();
  if (normalized.includes('hong kong')) return 'HK Category III';
  if (normalized.includes('japanese pinku')) return 'Pinku';
  if (normalized.includes('italian')) return 'Italian Exploitation';
  if (normalized.includes('vhs-era sword-and-sorcery')) return 'VHS Fantasy';
  if (normalized.includes('cult animation')) return 'Cult Animation';
  if (normalized.includes('mexican gothic')) return 'Mexican Gothic/Lucha';
  return clusterName;
}

function safeReadJson(path: string | null): unknown {
  if (!path) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function findSeasonFile(seasonSlug: string, marker: string): string | null {
  const base = resolve(process.cwd(), 'docs', 'season');
  if (!existsSync(base)) {
    return null;
  }
  const file = readdirSync(base)
    .filter((name) =>
      name.toLowerCase().startsWith(seasonSlug.toLowerCase())
      && name.toLowerCase().includes(marker.toLowerCase())
      && name.toLowerCase().endsWith('.json'))
    .sort()[0];
  return file ? resolve(base, file) : null;
}

function loadSeasonArtifacts(seasonSlug: string): SeasonArtifacts {
  const cached = seasonArtifactsCache.get(seasonSlug);
  if (cached) {
    return cached;
  }

  const confidenceByKey = new Map<string, { score: number; tier?: string }>();
  const canonByKey = new Map<string, { rank: number }>();
  const sourceVotesByKey = new Map<string, { sourceCount: number }>();
  const clusterTagsByKey = new Map<string, string[]>();
  let sourceVoteThreshold: number | null = null;

  const confidencePayload = safeReadJson(findSeasonFile(seasonSlug, 'confidence')) as { films?: ConfidenceRow[] } | null;
  for (const row of confidencePayload?.films ?? []) {
    if (typeof row.title !== 'string' || typeof row.cultConfidenceScore !== 'number') {
      continue;
    }
    confidenceByKey.set(normalizeKey({ title: row.title, year: row.year }), {
      score: row.cultConfidenceScore,
      tier: row.confidenceTier,
    });
  }

  const canonPayload = safeReadJson(findSeasonFile(seasonSlug, 'canon')) as {
    top50?: CanonRow[];
    top100?: CanonRow[];
    top250?: CanonRow[];
  } | null;
  for (const row of [...(canonPayload?.top50 ?? []), ...(canonPayload?.top100 ?? []), ...(canonPayload?.top250 ?? [])]) {
    if (typeof row.title !== 'string' || typeof row.rank !== 'number') {
      continue;
    }
    canonByKey.set(normalizeKey({ title: row.title, year: row.year }), { rank: row.rank });
  }

  const sourceVotesPayload = safeReadJson(findSeasonFile(seasonSlug, 'source-votes')) as {
    threshold?: number;
    rows?: SourceVoteRow[];
  } | null;
  if (typeof sourceVotesPayload?.threshold === 'number') {
    sourceVoteThreshold = sourceVotesPayload.threshold;
  }
  for (const row of sourceVotesPayload?.rows ?? []) {
    if (typeof row.title !== 'string' || typeof row.sourceCount !== 'number') {
      continue;
    }
    sourceVotesByKey.set(normalizeKey({ title: row.title, year: row.year }), { sourceCount: row.sourceCount });
  }

  const clusterPayload = safeReadJson(findSeasonFile(seasonSlug, 'missing-clusters')) as MissingClusterFile | null;
  for (const cluster of clusterPayload?.clusters ?? []) {
    if (typeof cluster.cluster !== 'string') {
      continue;
    }
    const tag = normalizeClusterTag(cluster.cluster);
    for (const film of cluster.films ?? []) {
      if (typeof film.title !== 'string') {
        continue;
      }
      const key = normalizeKey({ title: film.title, year: film.year });
      const current = clusterTagsByKey.get(key) ?? [];
      if (!current.includes(tag)) {
        current.push(tag);
      }
      clusterTagsByKey.set(key, current);
    }
  }

  const artifacts: SeasonArtifacts = {
    confidenceByKey,
    canonByKey,
    sourceVotesByKey,
    sourceVoteThreshold,
    clusterTagsByKey,
  };
  seasonArtifactsCache.set(seasonSlug, artifacts);
  return artifacts;
}

function confidenceBucket(score: number, confidenceTier?: string): string {
  const normalized = (confidenceTier ?? '').toLowerCase();
  if (score >= 90 || normalized.includes('canonical')) return 'Canonical';
  if (score >= 75 || normalized.includes('strong')) return 'Strong';
  if (score >= 60 || normalized.includes('recognized')) return 'Recognized';
  return 'Borderline';
}

const season1Builder: SeasonReasonBuilder = (context) => {
  const tierLabel = context.assignment.tier === 'CORE' ? 'Core' : 'Extended';
  const subgenres = context.assignment.node.eraSubgenreFocus
    .split(/[;,]/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 4);
  const prototype = parsePrototypeSignal(context.assignment.evidence);
  const mustIncludeFromEvidence = scanMustIncludeReason(context.assignment.evidence);
  const mustIncludeAnchor = SEASON1_MUST_INCLUDE_ANCHORS.find((anchor) =>
    anchor.nodeSlug === context.assignment.node.slug
    && anchor.year === context.movie.year
    && normalizeKey({ title: anchor.altTitle ?? anchor.title, year: anchor.year }) === normalizeKey({
      title: context.movie.title,
      year: context.movie.year,
    }));
  const bullets: string[] = [
    `Placed in ${context.assignment.node.name} (${tierLabel}) as part of the Season 1 horror taxonomy.`,
  ];
  if (context.watchReason) {
    bullets.push(`Film-specific rationale: ${context.watchReason}`);
  }
  const notice = parseWhatToNotice(context.assignment.node.whatToNotice);
  if (!context.watchReason && notice.length > 0) {
    bullets.push(`Curriculum focus: ${notice.join('; ')}.`);
  }
  if (subgenres.length > 0) {
    bullets.push(`Subgenre fit: ${subgenres.join(', ')}.`);
  }
  if (mustIncludeFromEvidence) {
    bullets.push(`Guardrail reason: ${mustIncludeFromEvidence}`);
  } else if (mustIncludeAnchor) {
    bullets.push('Guardrail reason: this title is in the Season 1 must-include anchor set for this movement.');
  }
  if (prototype.score !== undefined) {
    bullets.push(
      prototype.topMatch
        ? `Prototype match: ${prototype.topMatch} (${prototype.score.toFixed(2)} similarity).`
        : `Prototype similarity signal: ${prototype.score.toFixed(2)}.`,
    );
  }

  return {
    seasonSlug: context.seasonSlug,
    reasonTitle: "Why it's Horror (in this curriculum)",
    bullets,
    badges: [context.assignment.node.name, tierLabel, ...subgenres].slice(0, 6),
    ...(context.assignment.finalScore > 0
      ? {
        scoreBlock: {
          label: 'Curriculum Fit',
          value: `${context.assignment.finalScore.toFixed(2)} ontology / ${context.assignment.journeyScore.toFixed(2)} journey`,
        },
      }
      : {}),
  };
};

const season2Builder: SeasonReasonBuilder = (context) => {
  const artifacts = loadSeasonArtifacts(context.seasonSlug);
  const key = normalizeKey({ title: context.movie.title, year: context.movie.year });
  const confidence = artifacts.confidenceByKey.get(key);
  const canon = artifacts.canonByKey.get(key);
  const sourceVotes = artifacts.sourceVotesByKey.get(key);
  const clusters = artifacts.clusterTagsByKey.get(key) ?? [];

  const confidenceValue = confidence?.score;
  const bucket = typeof confidenceValue === 'number'
    ? confidenceBucket(confidenceValue, confidence?.tier)
    : 'Recognized';
  const tierLabel = context.assignment.tier === 'CORE' ? 'Core' : 'Extended';
  const bullets: string[] = [
    `Placed in ${context.assignment.node.name} (${tierLabel}) as part of curated Cult Classics canon.`,
  ];
  if (context.watchReason) {
    bullets.push(`Film-specific rationale: ${context.watchReason}`);
  }
  const notice = parseWhatToNotice(context.assignment.node.whatToNotice);
  if (!context.watchReason && notice.length > 0) {
    bullets.push(`Cult movement cues: ${notice.join('; ')}.`);
  }
  if (typeof confidenceValue === 'number') {
    bullets.push(`Cult confidence: ${confidenceValue} (${bucket}).`);
  }
  if (typeof canon?.rank === 'number') {
    bullets.push(`Canon rank: #${canon.rank}.`);
  }
  if (typeof sourceVotes?.sourceCount === 'number') {
    bullets.push(
      artifacts.sourceVoteThreshold !== null
        ? `Source votes: ${sourceVotes.sourceCount} (threshold ${artifacts.sourceVoteThreshold}).`
        : `Source votes: ${sourceVotes.sourceCount}.`,
    );
  }
  if (clusters.length > 0) {
    bullets.push(`Cluster context: ${clusters.join(', ')}.`);
  }

  return {
    seasonSlug: context.seasonSlug,
    reasonTitle: "Why it's Cult",
    bullets,
    badges: [context.assignment.node.name, tierLabel, ...clusters].slice(0, 6),
    ...(typeof confidenceValue === 'number'
      ? {
        scoreBlock: {
          label: 'Cult Confidence',
          value: `${confidenceValue} (${bucket})`,
          ...(typeof canon?.rank === 'number' ? { detail: `Canon #${canon.rank}` } : {}),
        },
      }
      : {}),
  };
};

const seasonReasonBuilders: Record<string, SeasonReasonBuilder> = {
  'season-1': season1Builder,
  'season-2': season2Builder,
};

function buildFallbackPanel(context: BaseContext): SeasonReasonPanel {
  const tierLabel = context.assignment.tier === 'CORE' ? 'Core' : 'Extended';
  const notice = parseWhatToNotice(context.assignment.node.whatToNotice);
  const bullets = [
    `Placed in ${context.assignment.node.name} (${tierLabel}) for ${context.seasonSlug}/${context.packSlug}.`,
    ...(notice.length > 0 ? [`What to notice: ${notice.join('; ')}.`] : []),
  ];
  return {
    seasonSlug: context.seasonSlug,
    reasonTitle: 'Why this film belongs',
    bullets,
    badges: [context.assignment.node.name, tierLabel],
  };
}

async function loadBaseContext(input: BuildSeasonReasonPanelInput): Promise<BaseContext | null> {
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
      slug: true,
      season: { select: { slug: true } },
    },
  });
  if (!pack) {
    return null;
  }

  const assignment = await prisma.nodeMovie.findFirst({
    where: {
      movieId: movie.id,
      node: {
        pack: {
          slug: pack.slug,
          season: { slug: pack.season.slug },
        },
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

  return {
    seasonSlug: pack.season.slug,
    packSlug: pack.slug,
    tmdbId: input.tmdbId,
    watchReason: await resolveWatchReasonForFilm({
      seasonSlug: pack.season.slug,
      packSlug: pack.slug,
      nodeSlug: assignment.node.slug,
      tmdbId: input.tmdbId,
    }),
    movie: {
      title: movie.title,
      year: movie.year,
      director: movie.director,
      castTop: movie.castTop,
    },
    assignment: {
      tier: assignment.tier,
      source: assignment.source,
      score: assignment.score,
      finalScore: assignment.finalScore,
      journeyScore: assignment.journeyScore,
      evidence: assignment.evidence,
      node: {
        slug: assignment.node.slug,
        name: assignment.node.name,
        whatToNotice: assignment.node.whatToNotice,
        eraSubgenreFocus: assignment.node.eraSubgenreFocus,
      },
    },
  };
}

export async function buildSeasonReasonPanel(input: BuildSeasonReasonPanelInput): Promise<SeasonReasonPanel | null> {
  const base = await loadBaseContext(input);
  if (!base) {
    return null;
  }
  const builder = seasonReasonBuilders[base.seasonSlug];
  return builder ? builder(base) : buildFallbackPanel(base);
}
