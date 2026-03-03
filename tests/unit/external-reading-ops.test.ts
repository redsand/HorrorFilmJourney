import { describe, expect, it } from 'vitest';
import { buildExternalLinkCoverageReport } from '@/lib/companion/external-reading-ops';

describe('external reading ops coverage report', () => {
  it('computes per-node coverage and target status', async () => {
    const prisma = {
      season: {
        findUnique: async () => ({
          id: 'season_1',
          slug: 'season-1',
          packs: [
            {
              id: 'pack_1',
              nodes: [
                {
                  id: 'node_1',
                  slug: 'foundations',
                  name: 'Foundations',
                  movies: [{ movieId: 'm1' }, { movieId: 'm2' }, { movieId: 'm3' }],
                },
              ],
            },
          ],
        }),
      },
      externalReadingCuration: {
        findMany: async () => [{ movieId: 'm1' }, { movieId: 'm2' }],
      },
    } as unknown as Parameters<typeof buildExternalLinkCoverageReport>[0];

    const report = await buildExternalLinkCoverageReport(prisma, { seasonSlug: 'season-1', targetPct: 60 });
    expect(report.nodeReports).toHaveLength(1);
    expect(report.nodeReports[0]).toMatchObject({
      nodeSlug: 'foundations',
      totalTitles: 3,
      titlesWithExternalLinks: 2,
      coveragePct: 66.67,
      meetsTarget: true,
    });
    expect(report.meetsTarget).toBe(true);
  });
});

