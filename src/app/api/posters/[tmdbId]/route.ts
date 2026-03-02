import { prisma } from '@/lib/prisma';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function normalizeTmdbId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function wrapTitle(title: string, maxLineLength = 18): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length <= maxLineLength) {
      current = candidate;
      continue;
    }
    if (current.length > 0) {
      lines.push(current);
    }
    current = word;
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines.slice(0, 3);
}

function posterSvg(input: { title: string; year?: number | null; tmdbId: number }): string {
  const titleLines = wrapTitle(input.title);
  const titleYStart = 470;
  const lineHeight = 46;
  const titleBlocks = titleLines
    .map((line, index) => `<text x="300" y="${titleYStart + index * lineHeight}" text-anchor="middle" fill="#f4ece8" font-family="Georgia, serif" font-size="42" font-weight="700">${escapeXml(line)}</text>`)
    .join('');

  const yearText = typeof input.year === 'number' ? String(input.year) : 'Unknown Year';
  const idText = `HFJ-${input.tmdbId}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900" role="img" aria-label="${escapeXml(input.title)} poster">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0b0d"/>
      <stop offset="60%" stop-color="#09090b"/>
      <stop offset="100%" stop-color="#15090e"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="35%" r="45%">
      <stop offset="0%" stop-color="#5f0f1a" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#5f0f1a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="600" height="900" fill="url(#bg)"/>
  <rect width="600" height="900" fill="url(#glow)"/>
  <rect x="28" y="28" width="544" height="844" rx="24" fill="none" stroke="#3f1b23" stroke-width="2"/>
  <text x="300" y="112" text-anchor="middle" fill="#d8ced0" font-family="system-ui, sans-serif" font-size="20" letter-spacing="6">HORROR CODEX</text>
  ${titleBlocks}
  <text x="300" y="640" text-anchor="middle" fill="#beacaf" font-family="system-ui, sans-serif" font-size="24">${escapeXml(yearText)}</text>
  <text x="300" y="700" text-anchor="middle" fill="#8e7a7f" font-family="system-ui, sans-serif" font-size="16">${escapeXml(idText)}</text>
</svg>`;
}

export async function GET(
  _request: Request,
  context: { params: { tmdbId: string } },
): Promise<Response> {
  const tmdbId = normalizeTmdbId(context.params.tmdbId);
  if (!tmdbId) {
    return new Response('Invalid tmdbId', { status: 400 });
  }

  const movie = await prisma.movie.findUnique({
    where: { tmdbId },
    select: { title: true, year: true },
  });

  const svg = posterSvg({
    title: movie?.title ?? `Movie ${tmdbId}`,
    year: movie?.year,
    tmdbId,
  });

  return new Response(svg, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
