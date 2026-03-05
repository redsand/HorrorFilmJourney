import fs from 'node:fs/promises';
import path from 'node:path';

type SeasonConfig = {
  seasonSlug: 'season-1' | 'season-2';
  packLabel: string;
  sourcePath: string;
};

type NodeMetric = {
  slug: string;
  name: string;
  years: number[];
  median: number | null;
  min: number | null;
  max: number | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor((sorted.length - 1) / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid] + sorted[mid + 1]) / 2;
}

async function loadSeasonNodes(config: SeasonConfig): Promise<NodeMetric[]> {
  const raw = await fs.readFile(config.sourcePath, 'utf8');
  const json = JSON.parse(raw);
  if (config.seasonSlug === 'season-1') {
    const nodes = json.nodes as Array<{ slug: string; name: string; titles: Array<{ year?: number }> }>;
    return nodes.map((node) => {
      const years = (node.titles ?? [])
        .map((title) => title.year)
        .filter((year): year is number => Number.isInteger(year));
      return {
        slug: node.slug,
        name: node.name,
        years,
        median: median(years),
        min: years.length ? Math.min(...years) : null,
        max: years.length ? Math.max(...years) : null,
      };
    });
  }

  const nodes = json.nodes as Array<{
    slug: string;
    core?: Array<{ year?: number }>;
    extended?: Array<{ year?: number }>;
  }>;
  return nodes.map((node) => {
    const coreYears = (node.core ?? [])
      .map((entry) => entry.year)
      .filter((year): year is number => Number.isInteger(year));
    const extendedYears = (node.extended ?? [])
      .map((entry) => entry.year)
      .filter((year): year is number => Number.isInteger(year));
    const years = [...coreYears, ...extendedYears];
    return {
      slug: node.slug,
      name: node.slug.replace(/-/g, ' '),
      years,
      median: median(years),
      min: years.length ? Math.min(...years) : null,
      max: years.length ? Math.max(...years) : null,
    };
  });
}

function detectAnomalies(metrics: NodeMetric[]) {
  const anomalies: Array<{ from: NodeMetric; to: NodeMetric; diff: number }> = [];
  for (let i = 1; i < metrics.length; i += 1) {
    const prev = metrics[i - 1];
    const current = metrics[i];
    if (prev.median !== null && current.median !== null) {
      const diff = current.median - prev.median;
      if (diff < 0 || Math.abs(diff) >= 20) {
        anomalies.push({ from: prev, to: current, diff });
      }
    }
  }
  return anomalies;
}

function formatNodeSummary(metrics: NodeMetric[]): string {
  const lines = ['slug | median | range | sample'];
  lines.push('--- | --- | --- | ---');
  for (const node of metrics) {
    const range = node.min === null ? 'n/a' : `${node.min}-${node.max}`;
    lines.push(`${node.slug} | ${node.median ?? 'n/a'} | ${range} | ${node.years.length}`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const configs: SeasonConfig[] = [
    {
      seasonSlug: 'season-1',
      packLabel: 'horror',
      sourcePath: path.resolve('docs', 'season', 'season-1-horror-subgenre-curriculum.json'),
    },
    {
      seasonSlug: 'season-2',
      packLabel: 'cult-classics',
      sourcePath: path.resolve('docs', 'season', 'season-2-cult-classics-mastered.json'),
    },
  ];

  for (const config of configs) {
    const metrics = await loadSeasonNodes(config);
    console.log(`\nSeason ${config.seasonSlug} (${config.packLabel}) node chronology:`);
    console.log(formatNodeSummary(metrics));
    const anomalies = detectAnomalies(metrics);
    if (anomalies.length === 0) {
      console.log('No major chronological jumps detected.');
    } else {
      console.log('\nDetected chronological jumps:');
      for (const anomaly of anomalies) {
        const direction = anomaly.diff < 0 ? 'backstep' : 'leap';
        console.log(
          `${direction.toUpperCase()}: ${anomaly.from.slug} (median ${anomaly.from.median}) -> ${anomaly.to.slug} ` +
            `(median ${anomaly.to.median}) diff ${anomaly.diff.toFixed(1)}`,
        );
      }
      const suggested = [...metrics].sort((a, b) => {
        if (a.median === null) return 1;
        if (b.median === null) return -1;
        return a.median - b.median;
      });
      console.log('\nSuggested chronology-by-median order:');
      console.log(suggested.map((node) => node.slug).join(' → '));
    }
  }
}

main().catch((error) => {
  console.error('[analyze-journey-progression] failed', error);
  process.exit(1);
});
