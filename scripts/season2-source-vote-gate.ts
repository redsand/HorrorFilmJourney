import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Entry = {
  title: string;
  year?: number;
  suggestedNode?: string;
};

type SourceBucket = {
  id: string;
  name: string;
  entries: Entry[];
};

type ManualVote = {
  title: string;
  year?: number;
  sourceIds: string[];
  suggestedNode?: string;
};

type InputPayload = {
  sources: SourceBucket[];
  manualVotes?: ManualVote[];
};

type CurriculumNode = {
  slug: string;
  name: string;
  subgenres?: string[];
  titles: Array<{ title: string; year: number; altTitle?: string }>;
};

type Curriculum = {
  nodes: CurriculumNode[];
};

type VoteRow = {
  title: string;
  year: number | null;
  normalizedKey: string;
  sourceCount: number;
  sources: string[];
  suggestedNode?: string;
  inCurriculum: boolean;
};

const INPUT_PATH = resolve('docs/season/season-2-source-vote-input.json');
const CURRICULUM_PATH = resolve('docs/season/season-2-cult-classics-curriculum.json');
const OUTPUT_VOTES = resolve('docs/season/season-2-source-votes.json');
const OUTPUT_MISSING = resolve('docs/season/season-2-source-vote-missing.json');

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keyFor(input: { title: string; year?: number | null }): string {
  return `${normalizeTitle(input.title)}|${input.year ?? 'na'}`;
}

function parseArgs(): { apply: boolean; threshold: number } {
  const args = process.argv.slice(2);
  const thresholdRaw = process.env.SEASON2_SOURCE_VOTE_THRESHOLD ?? '3';
  const thresholdParsed = Number.parseInt(thresholdRaw, 10);
  return {
    apply: args.includes('--apply'),
    threshold: Number.isFinite(thresholdParsed) && thresholdParsed > 0 ? thresholdParsed : 3,
  };
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function main(): Promise<void> {
  const { apply, threshold } = parseArgs();
  const input = await loadJson<InputPayload>(INPUT_PATH);
  const curriculum = await loadJson<Curriculum>(CURRICULUM_PATH);

  const curriculumKeys = new Set<string>();
  for (const node of curriculum.nodes) {
    for (const title of node.titles) {
      curriculumKeys.add(keyFor({ title: title.altTitle ?? title.title, year: title.year }));
      curriculumKeys.add(keyFor({ title: title.title, year: title.year }));
    }
  }

  const sourceNameById = new Map(input.sources.map((source) => [source.id, source.name] as const));
  const voteMap = new Map<string, {
    title: string;
    year: number | null;
    sources: Set<string>;
    suggestedNode?: string;
  }>();

  for (const source of input.sources) {
    for (const entry of source.entries ?? []) {
      if (!entry.title || typeof entry.title !== 'string') {
        continue;
      }
      const year = Number.isInteger(entry.year) ? entry.year as number : null;
      const normalizedKey = keyFor({ title: entry.title, year });
      const current = voteMap.get(normalizedKey) ?? {
        title: entry.title.trim(),
        year,
        sources: new Set<string>(),
        suggestedNode: entry.suggestedNode,
      };
      current.sources.add(source.id);
      if (!current.suggestedNode && entry.suggestedNode) {
        current.suggestedNode = entry.suggestedNode;
      }
      voteMap.set(normalizedKey, current);
    }
  }

  for (const vote of input.manualVotes ?? []) {
    if (!vote.title || typeof vote.title !== 'string' || !Array.isArray(vote.sourceIds)) {
      continue;
    }
    const year = Number.isInteger(vote.year) ? vote.year as number : null;
    const normalizedKey = keyFor({ title: vote.title, year });
    const current = voteMap.get(normalizedKey) ?? {
      title: vote.title.trim(),
      year,
      sources: new Set<string>(),
      suggestedNode: vote.suggestedNode,
    };
    for (const sourceId of vote.sourceIds) {
      if (typeof sourceId === 'string' && sourceId.trim().length > 0) {
        current.sources.add(sourceId.trim());
      }
    }
    if (!current.suggestedNode && vote.suggestedNode) {
      current.suggestedNode = vote.suggestedNode;
    }
    voteMap.set(normalizedKey, current);
  }

  const rows: VoteRow[] = [...voteMap.entries()]
    .map(([normalizedKey, value]) => {
      const sources = [...value.sources].sort();
      return {
        title: value.title,
        year: value.year,
        normalizedKey,
        sourceCount: sources.length,
        sources,
        suggestedNode: value.suggestedNode,
        inCurriculum: curriculumKeys.has(normalizedKey),
      };
    })
    .sort((a, b) => {
      if (b.sourceCount !== a.sourceCount) {
        return b.sourceCount - a.sourceCount;
      }
      const ay = a.year ?? 0;
      const by = b.year ?? 0;
      if (ay !== by) {
        return ay - by;
      }
      return a.title.localeCompare(b.title);
    });

  const missing = rows.filter((row) => row.sourceCount >= threshold && !row.inCurriculum);

  if (apply && missing.length > 0) {
    const nodeBySlug = new Map(curriculum.nodes.map((node) => [node.slug, node] as const));
    for (const row of missing) {
      if (!Number.isInteger(row.year)) {
        continue;
      }
      const targetNode = row.suggestedNode && nodeBySlug.has(row.suggestedNode)
        ? nodeBySlug.get(row.suggestedNode)!
        : nodeBySlug.get('modern-cult-phenomena');
      if (!targetNode) {
        continue;
      }
      const titleExists = targetNode.titles.some((entry) => keyFor({ title: entry.title, year: entry.year }) === row.normalizedKey);
      if (!titleExists) {
        targetNode.titles.push({
          title: row.title,
          year: row.year as number,
        });
      }
    }
    for (const node of curriculum.nodes) {
      node.titles.sort((a, b) => (a.year - b.year) || a.title.localeCompare(b.title));
    }
    await writeFile(CURRICULUM_PATH, `${JSON.stringify(curriculum, null, 2)}\n`, 'utf8');
  }

  const votesOut = {
    generatedAt: new Date().toISOString(),
    threshold,
    sourceRegistry: input.sources.map((source) => ({ id: source.id, name: source.name })),
    totals: {
      candidates: rows.length,
      inCurriculum: rows.filter((row) => row.inCurriculum).length,
      missingAtOrAboveThreshold: missing.length,
    },
    rows: rows.map((row) => ({
      ...row,
      sourceLabels: row.sources.map((id) => sourceNameById.get(id) ?? id),
    })),
  };

  const missingOut = {
    generatedAt: new Date().toISOString(),
    threshold,
    count: missing.length,
    candidates: missing.map((row) => ({
      title: row.title,
      year: row.year,
      sourceCount: row.sourceCount,
      sources: row.sources,
      sourceLabels: row.sources.map((id) => sourceNameById.get(id) ?? id),
      suggestedNode: row.suggestedNode ?? null,
    })),
  };

  await writeFile(OUTPUT_VOTES, `${JSON.stringify(votesOut, null, 2)}\n`, 'utf8');
  await writeFile(OUTPUT_MISSING, `${JSON.stringify(missingOut, null, 2)}\n`, 'utf8');

  console.log(
    `Season 2 source-vote gate complete: candidates=${rows.length} threshold=${threshold} missing=${missing.length} apply=${apply}`,
  );
  console.log(`Output: ${OUTPUT_VOTES}`);
  console.log(`Output: ${OUTPUT_MISSING}`);
}

main().catch((error) => {
  console.error('Season 2 source-vote gate failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

