/**
 * Policy: Links only; do not scrape content.
 * This module is local-store-only (DB + bundled registry JSON) and must never perform HTTP requests.
 */
import { zExternalReading } from '@/lib/contracts/companion-contract';
import type { ExternalReading } from '@/lib/contracts/companion-contract';
import registryJson from './external-readings.registry.json';
import type { PrismaClient } from '@prisma/client';

export type ExternalReadingRegistryEntry = {
  filmId: string;
  seasonId: string;
  links: ExternalReading[];
};

export type SeasonAllowedSource = {
  sourceName: string;
  domains: string[];
};

type LoaderInput = {
  filmId: string;
  seasonId: string;
  registry?: ExternalReadingRegistryEntry[];
  allowlist?: Record<string, string[]>;
  prismaClient?: Pick<PrismaClient, 'externalReadingCuration'>;
};

const SEASON_ALLOWED_SOURCES: Record<string, SeasonAllowedSource[]> = {
  'season-1': [
    {
      sourceName: 'Bloody Disgusting',
      domains: ['bloody-disgusting.com', 'www.bloody-disgusting.com'],
    },
    {
      sourceName: 'RogerEbert.com',
      domains: ['rogerebert.com', 'www.rogerebert.com'],
    },
    {
      sourceName: 'Collider',
      domains: ['collider.com', 'www.collider.com'],
    },
    {
      sourceName: 'IndieWire',
      domains: ['indiewire.com', 'www.indiewire.com'],
    },
  ],
  'season-2': [
    {
      sourceName: 'The Guardian',
      domains: ['theguardian.com', 'www.theguardian.com'],
    },
    {
      sourceName: 'Criterion',
      domains: ['criterion.com', 'www.criterion.com'],
    },
    {
      sourceName: 'MUBI Notebook',
      domains: ['mubi.com', 'www.mubi.com'],
    },
  ],
};

export const SEASON_EXTERNAL_SOURCE_ALLOWLIST: Record<string, string[]> = Object.fromEntries(
  Object.entries(SEASON_ALLOWED_SOURCES).map(([seasonId, sources]) => [
    seasonId,
    [...new Set(sources.flatMap((source) => source.domains))],
  ]),
);

export function getAllowedExternalSourcesForSeason(seasonId: string): SeasonAllowedSource[] {
  return SEASON_ALLOWED_SOURCES[seasonId] ?? [];
}

const defaultRegistry = registryJson as ExternalReadingRegistryEntry[];

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function hostAllowed(url: string, allowedHosts: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const normalized = allowedHosts.map((item) => item.toLowerCase());
    return normalized.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

function validateAndFilterLinks(args: {
  links: ExternalReading[];
  seasonId: string;
  allowlist: Record<string, string[]>;
}): ExternalReading[] {
  const allowedHosts = args.allowlist[args.seasonId] ?? [];
  if (allowedHosts.length === 0) {
    return [];
  }

  return args.links
    .map((link) => zExternalReading.safeParse({ ...link, seasonId: args.seasonId }))
    .filter((parsed): parsed is { success: true; data: ExternalReading } => parsed.success)
    .map((parsed) => parsed.data)
    .filter((link) => isAbsoluteHttpUrl(link.url))
    .filter((link) => hostAllowed(link.url, allowedHosts));
}

export async function getExternalReadingsForFilm(input: LoaderInput): Promise<ExternalReading[]> {
  const registry = input.registry ?? defaultRegistry;
  const allowlist = input.allowlist ?? SEASON_EXTERNAL_SOURCE_ALLOWLIST;
  const seasonId = input.seasonId.trim();
  const filmId = input.filmId.trim();

  if (input.prismaClient) {
    const tmdbId = Number.parseInt(filmId, 10);
    if (Number.isInteger(tmdbId)) {
      const dbRows = await input.prismaClient.externalReadingCuration.findMany({
        where: {
          seasonId,
          movie: {
            tmdbId,
          },
        },
        orderBy: [{ createdAt: 'desc' }],
        select: {
          sourceName: true,
          articleTitle: true,
          url: true,
          seasonId: true,
          publicationDate: true,
          sourceType: true,
        },
      });
      const fromDb = dbRows.map((row) => ({
        sourceName: row.sourceName,
        articleTitle: row.articleTitle,
        url: row.url,
        seasonId: row.seasonId,
        ...(row.publicationDate ? { publicationDate: row.publicationDate.toISOString() } : {}),
        sourceType: row.sourceType.toLowerCase() as ExternalReading['sourceType'],
      }));
      const dbValidated = validateAndFilterLinks({
        links: fromDb,
        seasonId,
        allowlist,
      });
      if (dbValidated.length > 0) {
        return dbValidated;
      }
    }
  }

  const fromLocal = registry
    .filter((entry) => entry.seasonId === seasonId && entry.filmId === filmId)
    .flatMap((entry) => entry.links);

  const localValidated = validateAndFilterLinks({
    links: fromLocal,
    seasonId,
    allowlist,
  });
  return localValidated;
}
