import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { verifyPassword, hashPassword } from '@/lib/auth/password';
import { buildSessionCookie, createSessionToken } from '@/lib/auth/session';
import { verifyCaptchaToken } from '@/lib/security/captcha';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { logHttpRequest, resolveRequestId } from '@/lib/observability/http';
import { captureError } from '@/lib/observability/error';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  captchaToken: z.string().min(1).optional(),
});

function getAdminConfig(): { email: string; password: string; displayName: string } {
  return {
    email: (process.env.ADMIN_EMAIL ?? 'admin@local.test').toLowerCase(),
    password: process.env.ADMIN_PASSWORD ?? 'dev-admin-password',
    displayName: process.env.ADMIN_DISPLAY_NAME ?? 'Initial Admin',
  };
}

async function ensureAdminCredential(): Promise<void> {
  const admin = getAdminConfig();
  const existing = await prisma.userCredential.findUnique({ where: { email: admin.email } });
  if (existing) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { displayName: admin.displayName },
      select: { id: true },
    });

    await tx.userCredential.create({
      data: {
        userId: user.id,
        email: admin.email,
        passwordHash: hashPassword(admin.password),
        isAdmin: true,
      },
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const response = fail({ code: 'VALIDATION_ERROR', message: 'Invalid JSON body' }, 400);
    logHttpRequest({ request, route: '/api/auth/login', status: response.status, startedAt, requestId });
    return response;
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    const response = fail({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400);
    logHttpRequest({ request, route: '/api/auth/login', status: response.status, startedAt, requestId });
    return response;
  }

  const rateLimitWindowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? '60000');
  const rateLimitMax = Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS ?? '10');
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const email = parsed.data.email.trim().toLowerCase();
  const rateLimit = checkRateLimit(`auth:login:${ip}:${email}`, {
    windowMs: Number.isFinite(rateLimitWindowMs) ? rateLimitWindowMs : 60000,
    max: Number.isFinite(rateLimitMax) ? rateLimitMax : 10,
  });
  if (!rateLimit.allowed) {
    const response = fail({ code: 'RATE_LIMITED', message: 'Too many login attempts. Try again shortly.' }, 429);
    response.headers.set('retry-after', String(rateLimit.retryAfterSeconds));
    logHttpRequest({ request, route: '/api/auth/login', status: response.status, startedAt, requestId });
    return response;
  }

  const captchaCheck = await verifyCaptchaToken({
    token: parsed.data.captchaToken,
    request,
    expectedAction: 'login',
  });
  if (!captchaCheck.ok) {
    const response = fail(captchaCheck.error, captchaCheck.status);
    logHttpRequest({ request, route: '/api/auth/login', status: response.status, startedAt, requestId });
    return response;
  }

  try {
    await ensureAdminCredential();
  } catch (error) {
    await captureError(prisma, {
      route: '/api/auth/login',
      code: 'ADMIN_BOOTSTRAP_FAILED',
      message: error instanceof Error ? error.message : 'Admin bootstrap failed',
      stack: error instanceof Error ? error.stack : undefined,
      requestId,
    });
  }

  const credential = await prisma.userCredential.findUnique({
    where: { email },
    include: { user: { select: { id: true, displayName: true } } },
  });

  if (!credential || !verifyPassword(parsed.data.password, credential.passwordHash)) {
    const response = fail({ code: 'UNAUTHORIZED', message: 'Invalid credentials' }, 401);
    logHttpRequest({ request, route: '/api/auth/login', status: response.status, startedAt, requestId });
    return response;
  }

  const token = createSessionToken(credential.user.id, credential.isAdmin);
  const response = ok(
    {
      user: {
        id: credential.user.id,
        displayName: credential.user.displayName,
        email: credential.email,
        isAdmin: credential.isAdmin,
      },
    },
    {
      headers: {
        'set-cookie': buildSessionCookie(token),
      },
    },
  );
  logHttpRequest({ request, route: '/api/auth/login', status: response.status, startedAt, requestId, userId: credential.user.id });
  return response;
}
