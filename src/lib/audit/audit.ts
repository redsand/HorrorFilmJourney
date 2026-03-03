import type { PrismaClient } from '@prisma/client';

export type AuditAction =
  | 'ADMIN_USER_CREATE'
  | 'ADMIN_USER_EDIT'
  | 'ADMIN_USER_DELETE'
  | 'ADMIN_PASSWORD_RESET'
  | 'ADMIN_PACK_ENABLE'
  | 'ADMIN_PACK_DISABLE'
  | 'ADMIN_SEASON_ACTIVATE'
  | 'ADMIN_CURRICULUM_RESEED';

export async function logAuditEvent(
  prisma: PrismaClient,
  input: {
    adminUserId: string;
    action: AuditAction;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      userId: input.adminUserId,
      action: input.action,
      targetId: input.targetId ?? undefined,
      metadata: input.metadata,
    },
  });
}
