import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { loadSeasonIntegrityRegistry, type SeasonIntegritySpec } from '../src/lib/audit/season-integrity-registry.ts';

type CliOptions = {
  seasonSlug: string;
  packSlug: string;
  seasonName: string;
  packName: string;
  taxonomyVersion: string;
  nodeSlugs: string[];
  nodeSource: 'default-profile' | 'custom';
  provisionDb: boolean;
  seasonActive: boolean;
  packEnabled: boolean;
  primaryGenre: string;
  allowCustomNodeSlugs: boolean;
};

const REGISTRY_PATH = path.resolve('docs', 'season', 'season-integrity-registry.json');

const SCI_FI_COMPREHENSIVE_NODES = [
  'proto-science-fiction',
  'space-opera',
  'hard-science-fiction',
  'cyberpunk',
  'dystopian-science-fiction',
  'post-apocalyptic-science-fiction',
  'time-travel-science-fiction',
  'alternate-history-multiverse',
  'artificial-intelligence-robotics',
  'alien-contact-invasion',
  'biopunk-genetic-engineering',
  'military-science-fiction',
  'science-fiction-horror',
  'social-speculative-science-fiction',
  'new-weird-cosmic-science-fiction',
  'retrofuturism-steampunk-dieselpunk',
] as const;

function defaultNodeSlugsForPack(packSlug: string): string[] {
  if (packSlug === 'sci-fi') {
    return [...SCI_FI_COMPREHENSIVE_NODES];
  }
  return ['foundations', 'movements', 'modern', 'deep-cuts'];
}

function toTitleCase(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseOptions(): CliOptions {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const idx = args.findIndex((arg) => arg === name);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const seasonSlug = (getArg('--season-slug') ?? '').trim().toLowerCase();
  const packSlug = (getArg('--pack-slug') ?? '').trim().toLowerCase();
  if (!seasonSlug || !packSlug) {
    throw new Error('Usage: node --experimental-strip-types scripts/create-season-template.ts --season-slug <season-x> --pack-slug <pack-y>');
  }

  const seasonName = (getArg('--season-name') ?? toTitleCase(seasonSlug)).trim();
  const packName = (getArg('--pack-name') ?? toTitleCase(packSlug)).trim();
  const taxonomyVersion = (getArg('--taxonomy-version') ?? `${seasonSlug}-${packSlug}-v1`).trim();
  const rawNodeSlugs = (getArg('--node-slugs') ?? '').trim();
  const allowCustomNodeSlugs = args.includes('--allow-custom-node-slugs');
  const hasCustomNodeSlugs = rawNodeSlugs.length > 0;
  const nodeSlugs = hasCustomNodeSlugs
    ? rawNodeSlugs.split(',').map((item) => item.trim()).filter(Boolean)
    : defaultNodeSlugsForPack(packSlug);
  const nodeSource: 'default-profile' | 'custom' = hasCustomNodeSlugs ? 'custom' : 'default-profile';
  const provisionDb = args.includes('--provision-db');
  const seasonActive = args.includes('--season-active');
  const packEnabled = args.includes('--pack-enabled');
  const primaryGenre = (getArg('--primary-genre') ?? packSlug.replace(/-/g, ' ')).trim();
  if (nodeSlugs.length === 0) {
    throw new Error('At least one node slug is required.');
  }
  if (packSlug === 'sci-fi' && hasCustomNodeSlugs && nodeSlugs.length < SCI_FI_COMPREHENSIVE_NODES.length && !allowCustomNodeSlugs) {
    throw new Error(
      `Custom sci-fi node list is too narrow (${nodeSlugs.length}). Expected at least ${SCI_FI_COMPREHENSIVE_NODES.length}. Re-run without --node-slugs for the comprehensive profile, or pass --allow-custom-node-slugs to override.`,
    );
  }

  return {
    seasonSlug,
    packSlug,
    seasonName,
    packName,
    taxonomyVersion,
    nodeSlugs,
    nodeSource,
    provisionDb,
    seasonActive,
    packEnabled,
    primaryGenre,
    allowCustomNodeSlugs,
  };
}

async function writeJson(targetPath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function updateRegistry(spec: SeasonIntegritySpec): Promise<void> {
  const existing = await loadSeasonIntegrityRegistry();
  const filtered = existing.filter((item) => !(item.seasonSlug === spec.seasonSlug && item.packSlug === spec.packSlug));
  filtered.push(spec);
  filtered.sort((a, b) => a.seasonSlug.localeCompare(b.seasonSlug) || a.packSlug.localeCompare(b.packSlug));
  await writeJson(REGISTRY_PATH, { seasons: filtered });
}

function buildConfig(options: CliOptions) {
  return {
    seasonSlug: options.seasonSlug,
    seasonName: options.seasonName,
    packSlug: options.packSlug,
    packName: options.packName,
    taxonomyVersion: options.taxonomyVersion,
    nodeTemplateProfile: options.packSlug === 'sci-fi' ? 'sci-fi-comprehensive' : 'generic',
    nodeSource: options.nodeSource,
    status: 'template',
  };
}

function buildGovernance(options: CliOptions) {
  const nodeDefaults = Object.fromEntries(
    options.nodeSlugs.map((slug) => [slug, { threshold: 0.65, targetSize: 48, minEligible: 24 }]),
  );
  return {
    seasonSlug: options.seasonSlug,
    packSlug: options.packSlug,
    taxonomyVersion: options.taxonomyVersion,
    defaults: {
      threshold: 0.65,
      targetSize: 48,
      minEligible: 24,
      maxNodesPerMovie: 2,
    },
    nodes: nodeDefaults,
    overlapConstraints: {
      disallowedPairs: [],
      penalizedPairs: [],
    },
  };
}

function buildSnapshotTemplate(options: CliOptions) {
  return {
    season: options.packSlug,
    taxonomyVersion: options.taxonomyVersion,
    summary: {
      coreCount: 0,
      extendedCount: 0,
      totalUnique: 0,
    },
    nodes: options.nodeSlugs.map((slug) => ({
      slug,
      core: [],
      extended: [],
    })),
    status: 'template',
    finalizedAt: null,
  };
}

function buildFallback(options: CliOptions) {
  return {
    seasonSlug: options.seasonSlug,
    packSlug: options.packSlug,
    tmdbIds: [],
  };
}

function buildAnchors(options: CliOptions) {
  return {
    seasonSlug: options.seasonSlug,
    packSlug: options.packSlug,
    anchors: [],
  };
}

async function provisionSeasonAndPack(options: CliOptions): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const season = await prisma.season.upsert({
      where: { slug: options.seasonSlug },
      update: {
        name: options.seasonName,
        isActive: options.seasonActive,
      },
      create: {
        slug: options.seasonSlug,
        name: options.seasonName,
        isActive: options.seasonActive,
      },
      select: { id: true, slug: true },
    });

    const pack = await prisma.genrePack.upsert({
      where: { slug: options.packSlug },
      update: {
        name: options.packName,
        seasonId: season.id,
        isEnabled: options.packEnabled,
        primaryGenre: options.primaryGenre,
      },
      create: {
        slug: options.packSlug,
        name: options.packName,
        seasonId: season.id,
        isEnabled: options.packEnabled,
        primaryGenre: options.primaryGenre,
      },
      select: { id: true, slug: true, seasonId: true },
    });

    console.log('[create-season-template] db provisioned');
    console.log(`- season: ${season.slug} (${season.id})`);
    console.log(`- pack: ${pack.slug} (${pack.id}) seasonId=${pack.seasonId}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const options = parseOptions();
  const seasonPackPrefix = `${options.seasonSlug}-${options.packSlug}`;
  const configPath = path.resolve('docs', 'season', `${seasonPackPrefix}-config.json`);
  const governancePath = path.resolve('docs', 'season', `${seasonPackPrefix}-node-governance.json`);
  const snapshotPath = path.resolve('docs', 'season', `${seasonPackPrefix}-mastered.template.json`);
  const fallbackPath = path.resolve('docs', 'season', `${seasonPackPrefix}-fallback-candidates.json`);
  const anchorPath = path.resolve('docs', 'season', `${seasonPackPrefix}-anchors.json`);

  await Promise.all([
    writeJson(configPath, buildConfig(options)),
    writeJson(governancePath, buildGovernance(options)),
    writeJson(snapshotPath, buildSnapshotTemplate(options)),
    writeJson(fallbackPath, buildFallback(options)),
    writeJson(anchorPath, buildAnchors(options)),
  ]);

  await updateRegistry({
    seasonSlug: options.seasonSlug,
    packSlug: options.packSlug,
    seasonName: options.seasonName,
    packName: options.packName,
    taxonomyVersion: options.taxonomyVersion,
    snapshotFormat: 'mastered-nodes',
    snapshotPath: path.relative(process.cwd(), snapshotPath).replace(/\\/g, '/'),
    anchorPath: path.relative(process.cwd(), anchorPath).replace(/\\/g, '/'),
    fallbackPath: path.relative(process.cwd(), fallbackPath).replace(/\\/g, '/'),
    governancePath: path.relative(process.cwd(), governancePath).replace(/\\/g, '/'),
    configPath: path.relative(process.cwd(), configPath).replace(/\\/g, '/'),
  });

  console.log('[create-season-template] scaffold created');
  console.log(`- ${configPath}`);
  console.log(`- ${governancePath}`);
  console.log(`- ${snapshotPath}`);
  console.log(`- ${fallbackPath}`);
  console.log(`- ${anchorPath}`);
  console.log(`- ${REGISTRY_PATH} (updated)`);
  console.log(`[create-season-template] nodes=${options.nodeSlugs.length} source=${options.nodeSource}`);

  if (options.provisionDb) {
    await provisionSeasonAndPack(options);
  } else {
    console.log('[create-season-template] db provisioning skipped (use --provision-db)');
  }
}

void main().catch((error) => {
  console.error('[create-season-template] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
