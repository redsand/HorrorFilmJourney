import { FeedbackPriority, FeedbackStatus } from '@prisma/client';
import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';

const zPatchInput = z.object({
  status: z.nativeEnum(FeedbackStatus).optional(),
  priority: z.nativeEnum(FeedbackPriority).optional(),
}).refine((value) => value.status !== undefined || value.priority !== undefined, {
  message: 'At least one field is required',
});

type RouteContext = {
  params: { id: string };
};

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const body = await request.json().catch(() => null);
  const parsed = zPatchInput.safeParse(body);
  if (!parsed.success) {
    return fail({ code: 'VALIDATION_ERROR', message: 'Invalid feedback update payload' }, 400);
  }

  try {
    const updated = await prisma.feedback.update({
      where: { id: context.params.id },
      data: {
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
      },
      select: { id: true, status: true, priority: true },
    });
    return ok(updated);
  } catch {
    return fail({ code: 'NOT_FOUND', message: 'Feedback not found' }, 404);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  try {
    const deleted = await prisma.feedback.delete({
      where: { id: context.params.id },
      select: { id: true },
    });
    return ok({ id: deleted.id, deleted: true });
  } catch {
    return fail({ code: 'NOT_FOUND', message: 'Feedback not found' }, 404);
  }
}

