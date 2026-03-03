import { readdirSync } from 'node:fs';
import { join } from 'node:path';

function main(): void {
  const clientDir = join(process.cwd(), 'node_modules', '.prisma', 'client');
  const files = readdirSync(clientDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  const hasNativeEngine = files.some((name) =>
    name.startsWith('query_engine-') && name.endsWith('.node'),
  );

  if (!hasNativeEngine) {
    console.error('Prisma client is missing native query engine.');
    console.error('Do not use `prisma generate --no-engine` in this repository.');
    console.error('Run `npm run prisma:generate` to regenerate with the native engine.');
    process.exit(1);
  }
}

main();

