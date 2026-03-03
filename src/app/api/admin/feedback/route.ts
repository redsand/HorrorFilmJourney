import { FeedbackPriority, FeedbackStatus, FeedbackType } from '@prisma/client';
import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';

const zFilters = z.object({
  status: z.nativeEnum(FeedbackStatus).optional(),
  type: z.nativeEnum(FeedbackType).optional(),
  priority: z.nativeEnum(FeedbackPriority).optional(),
  search: z.string().trim().min(1).optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const url = new URL(request.url);
  const parsed = zFilters.safeParse({
    status: url.searchParams.get('status') ?? undefined,
    type: url.searchParams.get('type') ?? undefined,
    priority: url.searchParams.get('priority') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    cursor: url.searchParams.get('cursor') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });

  if (!parsed.success) {
    return fail({ code: 'VALIDATION_ERROR', message: 'Invalid feedback filters' }, 400);
  }

  const { status, type, priority, search, cursor, limit = 25 } = parsed.data;
  const where = {
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(priority ? { priority } : {}),
    ...(search
      ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
          { category: { contains: search, mode: 'insensitive' as const } },
        ],
      }
      : {}),
  };

  const records = await prisma.feedback.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      type: true,
      category: true,
      title: true,
      description: true,
      route: true,
      userAgent: true,
      appVersion: true,
      status: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          displayName: true,
          credentials: {
            select: { email: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      },
    },
  });

  const hasNext = records.length > limit;
  const items = (hasNext ? records.slice(0, limit) : records).map((item) => ({
    id: item.id,
    type: item.type,
    category: item.category,
    title: item.title,
    description: item.description,
    route: item.route,
    userAgent: item.userAgent,
    appVersion: item.appVersion,
    status: item.status,
    priority: item.priority,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    user: {
      id: item.user.id,
      displayName: item.user.displayName,
      email: item.user.credentials[0]?.email ?? null,
    },
  }));

  return ok({
    items,
    nextCursor: hasNext ? items[items.length - 1]?.id ?? null : null,
  });
}

