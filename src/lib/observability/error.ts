import type { Prisma, PrismaClient } from '@prisma/client';

export type ErrorReportInput = {
  route: string;
  message: string;
  code?: string;
  requestId?: string | null;
  userId?: string | null;
  stack?: string;
  metadata?: Prisma.InputJsonValue;
};

export interface ErrorReporter {
  report(input: ErrorReportInput): Promise<void>;
}

class ConsoleErrorReporter implements ErrorReporter {
  async report(input: ErrorReportInput): Promise<void> {
    console.error(JSON.stringify({
      type: 'app_error',
      route: input.route,
      code: input.code ?? null,
      message: input.message,
      requestId: input.requestId ?? null,
      userId: input.userId ?? null,
      metadata: input.metadata ?? null,
    }));
  }
}

export function getErrorReporterFromEnv(): ErrorReporter {
  return new ConsoleErrorReporter();
}

export async function captureError(
  prisma: PrismaClient | null,
  input: ErrorReportInput,
): Promise<void> {
  try {
    await getErrorReporterFromEnv().report(input);
    if (prisma) {
      await prisma.appErrorLog.create({
        data: {
          route: input.route,
          code: input.code,
          message: input.message,
          stack: input.stack,
          requestId: input.requestId ?? undefined,
          userId: input.userId ?? undefined,
          metadata: input.metadata ?? undefined,
        },
      });
    }
  } catch {
    // never throw from observability.
  }
}
