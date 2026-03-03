import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { buildSessionCookie, createSessionToken } from '@/lib/auth/session';
import { verifyCaptchaToken } from '@/lib/security/captcha';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { logHttpRequest, resolveRequestId } from '@/lib/observability/http';
import { captureError } from '@/lib/observability/error';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  captchaToken: z.string().min(1).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const response = fail({ code: 'VALIDATION_ERROR', message: 'Invalid JSON body' }, 400);
    logHttpRequest({ request, route: '/api/auth/signup', status: response.status, startedAt, requestId });
    return response;
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    const response = fail({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400);
    logHttpRequest({ request, route: '/api/auth/signup', status: response.status, startedAt, requestId });
    return response;
  }

  const rateLimitWindowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? '60000');
  const rateLimitMax = Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS ?? '10');
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rateLimit = checkRateLimit(`auth:signup:${ip}:${parsed.data.email.trim().toLowerCase()}`, {
    windowMs: Number.isFinite(rateLimitWindowMs) ? rateLimitWindowMs : 60000,
    max: Number.isFinite(rateLimitMax) ? rateLimitMax : 10,
  });
  if (!rateLimit.allowed) {
    const response = fail({ code: 'RATE_LIMITED', message: 'Too many signup attempts. Try again shortly.' }, 429);
    response.headers.set('retry-after', String(rateLimit.retryAfterSeconds));
    logHttpRequest({ request, route: '/api/auth/signup', status: response.status, startedAt, requestId });
    return response;
  }

  const captchaCheck = await verifyCaptchaToken({
    token: parsed.data.captchaToken,
    request,
    expectedAction: 'signup',
  });
  if (!captchaCheck.ok) {
    const response = fail(captchaCheck.error, captchaCheck.status);
    logHttpRequest({ request, route: '/api/auth/signup', status: response.status, startedAt, requestId });
    return response;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const passwordHash = hashPassword(parsed.data.password);

  const existing = await prisma.userCredential.findUnique({ where: { email } });
  if (existing) {
    const response = fail({ code: 'CONFLICT', message: 'Email already in use' }, 409);
    logHttpRequest({ request, route: '/api/auth/signup', status: response.status, startedAt, requestId });
    return response;
  }

  let created: { id: string; displayName: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { displayName: parsed.data.displayName },
        select: { id: true, displayName: true },
      });

      await tx.userCredential.create({
        data: {
          userId: user.id,
          email,
          passwordHash,
          isAdmin: false,
        },
      });

      return user;
    });
  } catch (error) {
    await captureError(prisma, {
      route: '/api/auth/signup',
      code: 'SIGNUP_FAILED',
      message: error instanceof Error ? error.message : 'Signup failed',
      stack: error instanceof Error ? error.stack : undefined,
      requestId,
      metadata: { emailDomain: email.split('@')[1] ?? null },
    });
    const response = fail({ code: 'INTERNAL_ERROR', message: 'Unable to create account' }, 500);
    logHttpRequest({ request, route: '/api/auth/signup', status: response.status, startedAt, requestId });
    return response;
  }

  const token = createSessionToken(created.id, false);
  const response = ok(
    { user: created },
    {
      headers: {
        'set-cookie': buildSessionCookie(token),
      },
    },
  );
  logHttpRequest({ request, route: '/api/auth/signup', status: response.status, startedAt, requestId, userId: created.id });
  return response;
}
