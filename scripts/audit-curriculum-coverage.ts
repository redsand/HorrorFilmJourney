import { readFile } from 'node:fs/promises';

type CurriculumNode = {
  slug: string;
  name: string;
  titles: Array<{ title: string; year: number }>;
  eraSubgenreFocus?: string;
};

type CurriculumSpec = {
  seasonSlug: string;
  packSlug: string;
  nodes: CurriculumNode[];
};

function categorizeDecade(year: number): string {
  if (!Number.isFinite(year) || year <= 1900) {
    return 'pre-1900';
  }
  const decadeStart = Math.floor(year / 10) * 10;
  return `${decadeStart}s`;
}

function analyzeNode(node: CurriculumNode): { dominantDecade: string; dominantShare: number; decadeBreakdown: Array<[string, number]> } {
  const total = node.titles.length;
  const decadeCounts = new Map<string, number>();
  for (const title of node.titles) {
    const decade = categorizeDecade(title.year);
    decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
  }
  const decadeBreakdown = [...decadeCounts.entries()].sort((a, b) => b[1] - a[1]);
  const dominant = decadeBreakdown[0] ?? ['unknown', 0];
  return {
    dominantDecade: dominant[0],
    dominantShare: total > 0 ? (dominant[1] / total) * 100 : 0,
    decadeBreakdown,
  };
}

async function auditSeason(seasonFile: string): Promise<void> {
  const raw = await readFile(seasonFile, 'utf8');
  const spec = JSON.parse(raw) as CurriculumSpec;
  console.log(`\nSeason ${spec.seasonSlug} (${spec.packSlug}) detection:`);
  for (const node of spec.nodes) {
    const { dominantDecade, dominantShare, decadeBreakdown } = analyzeNode(node);
    console.log(`- ${node.slug} (${node.name}):`);
    console.log(`  titles: ${node.titles.length}`);
    console.log(`  dominant decade: ${dominantDecade} (${dominantShare.toFixed(1)}%)`);
    console.log(`  decade spread: ${decadeBreakdown.map(([decade, count]) => `${decade}:${count}`).join(', ')}`);
  }
}

async function main(): Promise<void> {
  await auditSeason('docs/season/season-1-horror-subgenre-curriculum.json');
  await auditSeason('docs/season/season-2-cult-classics-curriculum.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
