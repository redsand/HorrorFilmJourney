import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { verifyPassword, hashPassword } from '@/lib/auth/password';
import { buildSessionCookie, createSessionToken } from '@/lib/auth/session';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail({ code: 'VALIDATION_ERROR', message: 'Invalid JSON body' }, 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return fail({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400);
  }

  await ensureAdminCredential();

  const email = parsed.data.email.trim().toLowerCase();
  const credential = await prisma.userCredential.findUnique({
    where: { email },
    include: { user: { select: { id: true, displayName: true } } },
  });

  if (!credential || !verifyPassword(parsed.data.password, credential.passwordHash)) {
    return fail({ code: 'UNAUTHORIZED', message: 'Invalid credentials' }, 401);
  }

  const token = createSessionToken(credential.user.id, credential.isAdmin);
  return ok(
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
}
