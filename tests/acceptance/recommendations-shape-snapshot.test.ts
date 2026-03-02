import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  createAcceptancePrisma,
  resetAcceptanceDatabase,
  seedRecommendationAcceptance,
  setupAcceptanceDatabase,
} from './utils/recommendations-seed';
import { makeSessionCookie } from '../helpers/session-cookie';

const acceptanceSchemaName = 'recommendations_shape_snapshot_test';
const acceptancePrisma = createAcceptancePrisma(acceptanceSchemaName);

vi.mock('@/lib/prisma', () => ({
  prisma: acceptancePrisma,
}));

const { POST } = await import('@/app/api/recommendations/next/route');

describe('recommendations next response shape snapshot', () => {
  beforeAll(() => {
    setupAcceptanceDatabase(acceptanceSchemaName);
  });

  beforeEach(async () => {
    delete process.env.REC_ENGINE_MODE;
    await resetAcceptanceDatabase(acceptancePrisma);
  });

  it('captures a deterministic specimen JSON for docs', async () => {
    const { userAId } = await seedRecommendationAcceptance(acceptancePrisma);

    const response = await POST(
      new Request('http://localhost/api/recommendations/next', {
        method: 'POST',
        headers: {
          cookie: makeSessionCookie(userAId),
        },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    mkdirSync('docs/snapshots', { recursive: true });
    writeFileSync('docs/snapshots/recommendations-next.sample.json', `${JSON.stringify(body, null, 2)}\n`, 'utf-8');

    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('error', null);
    expect(Array.isArray(body.data.cards)).toBe(true);
    expect(body.data.cards).toHaveLength(5);
  });
});
