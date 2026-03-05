import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { computeFallbackSnapshot, FallbackSnapshot } from '@/lib/recommendation/fallback-snapshot';
import { getReleaseContracts } from '@/lib/nodes/governance/release-contract';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('fallback snapshot generation', () => {
  it('docs/season fallback order matches the release order', async () => {
    for (const contract of getReleaseContracts()) {
      const expected = await computeFallbackSnapshot(prisma, contract);
      const filePath = path.resolve('docs', 'season', `${contract.seasonSlug}-fallback-candidates.json`);
      const diskSnapshot = JSON.parse(await readFile(filePath, 'utf8')) as FallbackSnapshot;
      expect(diskSnapshot).toEqual(expected);
    }
  });
});
