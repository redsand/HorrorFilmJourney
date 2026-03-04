import { execSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

export function parseFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

export function parseOption(argv: string[], name: string): string | null {
  const exact = `${name}=`;
  for (const arg of argv) {
    if (arg.startsWith(exact)) {
      const value = arg.slice(exact.length).trim();
      return value.length > 0 ? value : null;
    }
  }
  const idx = argv.findIndex((arg) => arg === name);
  if (idx === -1) {
    return null;
  }
  const value = argv[idx + 1]?.trim();
  return value && value.length > 0 ? value : null;
}

export function isLikelyLocalPostgresUrl(url: string | undefined | null): boolean {
  if (!url) {
    return true;
  }
  const normalized = url.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }
  if (normalized.includes('localhost') || normalized.includes('127.0.0.1') || normalized.includes('host.docker.internal')) {
    return true;
  }
  return normalized.includes('@db:') || normalized.includes('@postgres:');
}

export function ensureLocalDatabaseOrThrow(databaseUrl: string | undefined | null): void {
  if (!isLikelyLocalPostgresUrl(databaseUrl)) {
    throw new Error('This command is local-only. DATABASE_URL must point to localhost/127.0.0.1.');
  }
}

export function runCommand(command: string, env: NodeJS.ProcessEnv = process.env): void {
  execSync(command, {
    stdio: 'inherit',
    env,
  });
}

export type VerificationStamp = {
  schemaVersion: 1;
  generatedAt: string;
  taxonomyVersion: string;
  runId: string;
  checks: Array<{ name: string; pass: boolean; details: string }>;
  signature: string;
};

export const VERIFICATION_STAMP_PATH = resolve('artifacts/verification/season1-catalog-verification.json');

export async function writeVerificationStamp(stampWithoutSignature: Omit<VerificationStamp, 'signature'>): Promise<string> {
  const canonical = JSON.stringify(stampWithoutSignature);
  const signature = createHash('sha256').update(canonical).digest('hex');
  const stamp: VerificationStamp = { ...stampWithoutSignature, signature };
  await mkdir(dirname(VERIFICATION_STAMP_PATH), { recursive: true });
  await writeFile(VERIFICATION_STAMP_PATH, `${JSON.stringify(stamp, null, 2)}\n`, 'utf8');
  return VERIFICATION_STAMP_PATH;
}

export async function readVerificationStamp(): Promise<VerificationStamp> {
  const raw = await readFile(VERIFICATION_STAMP_PATH, 'utf8');
  return JSON.parse(raw) as VerificationStamp;
}
