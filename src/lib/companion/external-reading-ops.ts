import type { PrismaClient } from '@prisma/client';

export type ExternalLinkCoverageNode = {
  nodeId: string;
  nodeSlug: string;
  nodeName: string;
  totalTitles: number;
  titlesWithExternalLinks: number;
  coveragePct: number;
  meetsTarget: boolean;
};

export type ExternalLinkCoverageReport = {
  seasonSlug: string;
  targetPct: number;
  nodeReports: ExternalLinkCoverageNode[];
  overallCoveragePct: number;
  meetsTarget: boolean;
};

function toPct(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 10000) / 100;
}

export async function buildExternalLinkCoverageReport(
  prisma: PrismaClient,
  args?: { seasonSlug?: string; targetPct?: number },
): Promise<ExternalLinkCoverageReport> {
  const seasonSlug = args?.seasonSlug ?? 'season-1';
  const targetPct = args?.targetPct ?? 80;

  const seasonModel = (prisma as unknown as {
    season?: {
      findUnique?: (args: {
        where: { slug: string };
        select: {
          id: true;
          slug: true;
          packs: {
            select: {
              id: true;
              nodes: {
                orderBy: { orderIndex: 'asc' };
                select: {
                  id: true;
                  slug: true;
                  name: true;
                  movies: { select: { movieId: true } };
                };
              };
            };
          };
        };
      }) => Promise<{
        id: string;
        slug: string;
        packs: Array<{
          id: string;
          nodes: Array<{
            id: string;
            slug: string;
            name: string;
            movies: Array<{ movieId: string }>;
          }>;
        }>;
      } | null>;
    };
  }).season;
  if (!seasonModel?.findUnique) {
    return {
      seasonSlug,
      targetPct,
      nodeReports: [],
      overallCoveragePct: 0,
      meetsTarget: false,
    };
  }

  const season = await seasonModel.findUnique({
    where: { slug: seasonSlug },
    select: {
      id: true,
      slug: true,
      packs: {
        select: {
          id: true,
          nodes: {
            orderBy: { orderIndex: 'asc' },
            select: {
              id: true,
              slug: true,
              name: true,
              movies: {
                select: {
                  movieId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!season) {
    return {
      seasonSlug,
      targetPct,
      nodeReports: [],
      overallCoveragePct: 0,
      meetsTarget: false,
    };
  }

  const movieIds = new Set<string>();
  season.packs.forEach((pack) => {
    pack.nodes.forEach((node) => {
      node.movies.forEach((entry) => movieIds.add(entry.movieId));
    });
  });

  const externalReadingModel = (prisma as unknown as {
    externalReadingCuration?: {
      findMany?: (args: {
        where: { seasonId: string; movieId: { in: string[] } };
        select: { movieId: true };
      }) => Promise<Array<{ movieId: string }>>;
    };
  }).externalReadingCuration;

  const links = movieIds.size > 0 && externalReadingModel?.findMany
    ? await externalReadingModel.findMany({
      where: {
        seasonId: season.id,
        movieId: { in: [...movieIds] },
      },
      select: {
        movieId: true,
      },
    })
    : [];
  const linkedMovieIds = new Set(links.map((row) => row.movieId));

  const nodeReports: ExternalLinkCoverageNode[] = [];
  let overallTotal = 0;
  let overallLinked = 0;
  season.packs.forEach((pack) => {
    pack.nodes.forEach((node) => {
      const nodeMovieIds = node.movies.map((entry) => entry.movieId);
      const linkedCount = nodeMovieIds.filter((movieId) => linkedMovieIds.has(movieId)).length;
      const coveragePct = toPct(linkedCount, nodeMovieIds.length);
      nodeReports.push({
        nodeId: node.id,
        nodeSlug: node.slug,
        nodeName: node.name,
        totalTitles: nodeMovieIds.length,
        titlesWithExternalLinks: linkedCount,
        coveragePct,
        meetsTarget: coveragePct >= targetPct,
      });
      overallTotal += nodeMovieIds.length;
      overallLinked += linkedCount;
    });
  });

  const overallCoveragePct = toPct(overallLinked, overallTotal);
  return {
    seasonSlug: season.slug,
    targetPct,
    nodeReports,
    overallCoveragePct,
    meetsTarget: overallCoveragePct >= targetPct,
  };
}
