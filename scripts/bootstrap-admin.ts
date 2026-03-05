import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth/password';

function resolveDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL ?? process.env.DATABASE_URL_TEST ?? process.env.TEST_DATABASE_URL;
}

function getRequired(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

async function main(): Promise<void> {
  const email = getRequired('ADMIN_EMAIL').toLowerCase();
  const password = getRequired('ADMIN_PASSWORD');
  const displayName = process.env.ADMIN_DISPLAY_NAME?.trim() || 'Admin';

  const databaseUrl = resolveDatabaseUrl();
  const prisma = databaseUrl
    ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    : new PrismaClient();

  try {
    const existing = await prisma.userCredential.findUnique({
      where: { email },
      select: { id: true, isAdmin: true, user: { select: { id: true, displayName: true } } },
    });

    if (existing) {
      if (!existing.isAdmin) {
        await prisma.userCredential.update({
          where: { email },
          data: { isAdmin: true },
        });
        console.log(`Bootstrap admin promoted existing credential to ADMIN for ${email}`);
      } else {
        console.log(`Bootstrap admin verified existing ADMIN credential for ${email}`);
      }
      return;
    }

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { displayName },
        select: { id: true, displayName: true },
      });

      const credential = await tx.userCredential.create({
        data: {
          userId: user.id,
          email,
          passwordHash: hashPassword(password),
          isAdmin: true,
        },
        select: { id: true },
      });

      return { user, credential };
    });

    console.log(`Bootstrap admin created ADMIN credential for ${email} (user=${created.user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('bootstrap-admin failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
