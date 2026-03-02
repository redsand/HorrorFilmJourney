import { beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';

const testDbUrl = buildTestDatabaseUrl('prisma_client_smoke_test');
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

beforeAll(() => {
  prismaDbPush(testDbUrl);
});

describe('prisma client smoke', () => {
  it('connects and executes a simple query', async () => {
    const result = await prisma.$queryRaw<Array<{ value: number }>>`SELECT 1::int AS value`;
    expect(result[0]?.value).toBe(1);
  });
});
