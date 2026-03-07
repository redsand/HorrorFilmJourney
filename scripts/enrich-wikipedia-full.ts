import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type EvidenceDocument = {
  movieId: string;
  seasonSlug?: string;
  sourceName: string;
  url: string;
  title: string;
  content: string;
};

type Corpus = {
  generatedAt: string;
  season: string;
  pack: string;
  movieCount: number;
  documentCount: number;
  documents: EvidenceDocument[];
};

function parseCli() {
  const args = process.argv.slice(2);
  const seasonIndex = args.findIndex((arg) => arg === '--season');
  if (seasonIndex === -1 || !args[seasonIndex + 1]) {
    throw new Error('Missing required flag: --season <season-1|season-2>');
  }
  const season = args[seasonIndex + 1];
  if (!['season-1', 'season-2', 'season-3'].includes(season)) {
    throw new Error('Invalid season: ' + season);
  }
  return { season };
}

async function fetchFullWikipediaContent(pageTitle) {
  const url = 'https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=true&titles=' + encodeURIComponent(pageTitle) + '&format=json&redirects=true';
  try {
    const response = await fetch(url, { headers: { "User-Agent": "CinemaCodex/1.0" } });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.query?.pages) return null;
    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0];
    if (pageId === '-1') return null;
    const extract = pages[pageId].extract;
    if (!extract || extract.length < 100) return null;
    if (extract.includes('may refer to:')) return null;
    return { content: extract };
  } catch { return null; }
}

function extractPageTitleFromUrl(url) {
  const match = url.match(/[wW]iki\/([^/?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function main() {
  const { season } = parseCli();
  const packMap = { 'season-1': 'horror', 'season-2': 'cult-classics', 'season-3': 'sci-fi' };
  const corpusPath = resolve('docs/evidence/' + season + '-' + packMap[season] + '-corpus.json');
  console.log('Enriching:', corpusPath);
  const corpusData = await readFile(corpusPath, 'utf-8');
  const corpus = JSON.parse(corpusData);
  const wikipediaDocs = corpus.documents.filter(d => d.sourceName === 'wikipedia');
  console.log('Found', wikipediaDocs.length, 'Wikipedia documents');
  let updated = 0, failed = 0, skipped = 0, totalBefore = 0, totalAfter = 0;
  for (let i = 0; i < wikipediaDocs.length; i++) {
    const doc = wikipediaDocs[i];
    const pageTitle = extractPageTitleFromUrl(doc.url);
    if (!pageTitle) { failed++; continue; }
    totalBefore += doc.content.length;
    console.log('[' + (i+1) + '/' + wikipediaDocs.length + '] ' + pageTitle);
    const result = await fetchFullWikipediaContent(pageTitle);
    if (result && result.content.length > doc.content.length) {
      doc.content = result.content;
      totalAfter += result.content.length;
      updated++;
      console.log('  + Updated:', result.content.length, 'chars');
    } else if (result) {
      totalAfter += doc.content.length;
      skipped++;
    } else {
      totalAfter += doc.content.length;
      failed++;
    }
    await new Promise(r => setTimeout(r, 150));
  }
  corpus.generatedAt = new Date().toISOString();
  await writeFile(corpusPath, JSON.stringify(corpus, null, 2), 'utf-8');
  console.log('Updated:', updated, 'Skipped:', skipped, 'Failed:', failed);
  console.log('Avg before:', Math.round(totalBefore / wikipediaDocs.length), 'chars');
  console.log('Avg after:', Math.round(totalAfter / wikipediaDocs.length), 'chars');
}

main().catch(err => { console.error(err); process.exit(1); });
