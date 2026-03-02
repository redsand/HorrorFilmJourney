import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { buildSessionCookie, createSessionToken } from '@/lib/auth/session';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail({ code: 'VALIDATION_ERROR', message: 'Invalid JSON body' }, 400);
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return fail({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400);
  }

  const email = parsed.data.email.trim().toLowerCase();
  const passwordHash = hashPassword(parsed.data.password);

  const existing = await prisma.userCredential.findUnique({ where: { email } });
  if (existing) {
    return fail({ code: 'CONFLICT', message: 'Email already in use' }, 409);
  }

  const created = await prisma.$transaction(async (tx) => {
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

  const token = createSessionToken(created.id, false);
  return ok(
    { user: created },
    {
      headers: {
        'set-cookie': buildSessionCookie(token),
      },
    },
  );
}
