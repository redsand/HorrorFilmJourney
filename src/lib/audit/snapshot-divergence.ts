/**
 * snapshot-divergence.ts
 *
 * Pure functions for computing divergence between curated authority artifacts
 * (mastered snapshots) and the DB state (NodeMovie assignments + SeasonNodeRelease).
 *
 * No side-effects, no DB calls — all inputs are plain data, making this fully testable.
 */

export type AuthorityTier = 'CORE' | 'EXTENDED';

/** A single title from the mastered authority artifact */
export type MasteredTitle = {
  title: string;
  year: number;
  /** Null for Season 1 curriculum (no tmdbId in that format) */
  tmdbId: number | null;
  nodeSlug: string;
  tier: AuthorityTier;
};

/** A DB NodeMovie assignment resolved to tmdbId */
export type DbAssignment = {
  tmdbId: number;
  nodeSlug: string;
  tier: AuthorityTier;
};

/** A DB SeasonNodeReleaseItem resolved to tmdbId */
export type ReleaseItem = {
  tmdbId: number;
  nodeSlug: string;
};

/** Lightweight catalog entry for title→tmdbId resolution */
export type CatalogEntry = {
  tmdbId: number;
  title: string;
  year: number | null;
};

export type DivergenceReason =
  | 'unresolved_tmdb'     // no tmdbId in mastered + no catalog match by title/year
  | 'not_in_catalog'      // tmdbId present in mastered but Movie row absent from DB
  | 'no_node_assignment'  // Movie exists in DB but no NodeMovie record
  | 'slug_mismatch'       // assigned to a different nodeSlug than mastered
  | 'tier_drift'          // tier mismatch between mastered and DB assignment
  | 'tier_extended_filtered' // expected in release but EXTENDED → only CORE goes to release
  | 'not_in_release_snapshot' // CORE-tier NodeMovie present but absent from published release
  | 'no_published_release';   // no published release exists at all

export type DivergenceCategory =
  | 'missing_in_db'        // title not resolvable or Movie row missing from DB
  | 'missing_assignment'   // Movie in DB but no NodeMovie
  | 'missing_in_release'   // NodeMovie exists but not in published SeasonNodeReleaseItem
  | 'tier_drift'           // tier mismatch
  | 'node_drift';          // node slug mismatch

export type DivergenceItem = {
  category: DivergenceCategory;
  reason: DivergenceReason;
  title: string;
  year: number;
  tmdbId: number | null;
  /** Expected node from mastered authority */
  nodeSlug: string;
  /** Actual node in DB (only for node_drift) */
  actualNodeSlug?: string;
  /** Expected tier from mastered authority */
  tier: AuthorityTier;
  /** Actual tier in DB (only for tier_drift) */
  actualTier?: AuthorityTier;
};

export type DivergenceResult = {
  season: string;
  masteredTotal: number;
  masteredCore: number;
  masteredExtended: number;
  /** Number of mastered titles that exist in DB as a Movie record */
  resolvedInDb: number;
  /** Number of mastered titles with a NodeMovie assignment */
  assignedInDb: number;
  /** Number of mastered CORE titles present in published release */
  presentInRelease: number;
  divergences: DivergenceItem[];
  /** missingInDb / masteredTotal */
  lossRate: number;
  /** (masteredCore - presentInRelease) / masteredCore — only CORE items go to release */
  releaseDropRate: number;
};

// ---------------------------------------------------------------------------
// Title normalisation (matches import-season2-mastered.ts)
// ---------------------------------------------------------------------------

export function normalizeTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitleNoArticle(value: string): string {
  return normalizeTitle(value).replace(/^(the|a|an)\s+/, '');
}

function toFilmKey(title: string, year: number | null): string {
  return `${normalizeTitle(title)}::${Number(year) || 0}`;
}

function toFilmKeyNoArticle(title: string, year: number | null): string {
  return `${normalizeTitleNoArticle(title)}::${Number(year) || 0}`;
}

// ---------------------------------------------------------------------------
// Catalog index builder
// ---------------------------------------------------------------------------

export type CatalogIndex = {
  byTmdb: Map<number, CatalogEntry>;
  byKey: Map<string, CatalogEntry>;
  byKeyNoArticle: Map<string, CatalogEntry>;
  byTitleNoArticle: Map<string, CatalogEntry[]>;
};

export function buildCatalogIndex(entries: CatalogEntry[]): CatalogIndex {
  const byTmdb = new Map<number, CatalogEntry>();
  const byKey = new Map<string, CatalogEntry>();
  const byKeyNoArticle = new Map<string, CatalogEntry>();
  const byTitleNoArticle = new Map<string, CatalogEntry[]>();

  for (const entry of entries) {
    if (!byTmdb.has(entry.tmdbId)) byTmdb.set(entry.tmdbId, entry);
    const key = toFilmKey(entry.title, entry.year);
    const keyNoArticle = toFilmKeyNoArticle(entry.title, entry.year);
    if (!byKey.has(key)) byKey.set(key, entry);
    if (!byKeyNoArticle.has(keyNoArticle)) byKeyNoArticle.set(keyNoArticle, entry);
    const titleKey = normalizeTitleNoArticle(entry.title);
    const list = byTitleNoArticle.get(titleKey) ?? [];
    list.push(entry);
    byTitleNoArticle.set(titleKey, list);
  }

  return { byTmdb, byKey, byKeyNoArticle, byTitleNoArticle };
}

/** Resolve a mastered title to a tmdbId using the catalog index. Returns null if unresolvable. */
export function resolveTmdbId(
  title: string,
  year: number,
  tmdbIdHint: number | null,
  catalog: CatalogIndex,
): number | null {
  if (tmdbIdHint !== null && catalog.byTmdb.has(tmdbIdHint)) {
    return tmdbIdHint;
  }
  // Try exact key match
  const byExact = catalog.byKey.get(toFilmKey(title, year))
    ?? catalog.byKeyNoArticle.get(toFilmKeyNoArticle(title, year))
    ?? null;
  if (byExact) return byExact.tmdbId;

  // Try fuzzy: same normalised title (no article), year within ±2
  const candidates = catalog.byTitleNoArticle.get(normalizeTitleNoArticle(title)) ?? [];
  const close = candidates.filter(
    (c) => typeof c.year === 'number' && Math.abs(c.year - year) <= 2,
  );
  if (close.length === 1) return close[0]!.tmdbId;

  return null;
}

// ---------------------------------------------------------------------------
// Core divergence computation
// ---------------------------------------------------------------------------

export function computeSnapshotDivergence(input: {
  season: string;
  masteredTitles: MasteredTitle[];
  /** All Movie.tmdbId rows present in the DB */
  dbMovieTmdbIds: Set<number>;
  /** All NodeMovie assignments for the relevant pack, keyed by tmdbId */
  dbAssignments: DbAssignment[];
  /** Published SeasonNodeReleaseItems (null = no published release) */
  releaseItems: ReleaseItem[] | null;
  /** Catalog index for title→tmdbId resolution (required for Season 1 without tmdbIds) */
  catalog: CatalogIndex;
}): DivergenceResult {
  const { season, masteredTitles, dbMovieTmdbIds, dbAssignments, releaseItems, catalog } = input;

  const assignmentByTmdb = new Map<number, DbAssignment>(
    dbAssignments.map((a) => [a.tmdbId, a]),
  );
  const releaseByTmdb = releaseItems
    ? new Map<number, ReleaseItem>(releaseItems.map((r) => [r.tmdbId, r]))
    : null;

  const masteredCore = masteredTitles.filter((t) => t.tier === 'CORE').length;
  const masteredExtended = masteredTitles.filter((t) => t.tier === 'EXTENDED').length;

  const divergences: DivergenceItem[] = [];
  let resolvedInDb = 0;
  let assignedInDb = 0;
  let presentInRelease = 0;

  for (const item of masteredTitles) {
    const resolvedTmdb = resolveTmdbId(item.title, item.year, item.tmdbId, catalog);

    // ── 1. Missing in DB ────────────────────────────────────────────────────
    if (resolvedTmdb === null) {
      divergences.push({
        category: 'missing_in_db',
        reason: 'unresolved_tmdb',
        title: item.title,
        year: item.year,
        tmdbId: null,
        nodeSlug: item.nodeSlug,
        tier: item.tier,
      });
      continue;
    }

    if (!dbMovieTmdbIds.has(resolvedTmdb)) {
      divergences.push({
        category: 'missing_in_db',
        reason: 'not_in_catalog',
        title: item.title,
        year: item.year,
        tmdbId: resolvedTmdb,
        nodeSlug: item.nodeSlug,
        tier: item.tier,
      });
      continue;
    }

    resolvedInDb += 1;
    const dbAssignment = assignmentByTmdb.get(resolvedTmdb);

    // ── 2. Missing assignment ───────────────────────────────────────────────
    if (!dbAssignment) {
      divergences.push({
        category: 'missing_assignment',
        reason: 'no_node_assignment',
        title: item.title,
        year: item.year,
        tmdbId: resolvedTmdb,
        nodeSlug: item.nodeSlug,
        tier: item.tier,
      });
      continue;
    }

    assignedInDb += 1;

    // ── 3. Node drift ───────────────────────────────────────────────────────
    if (dbAssignment.nodeSlug !== item.nodeSlug) {
      divergences.push({
        category: 'node_drift',
        reason: 'slug_mismatch',
        title: item.title,
        year: item.year,
        tmdbId: resolvedTmdb,
        nodeSlug: item.nodeSlug,
        actualNodeSlug: dbAssignment.nodeSlug,
        tier: item.tier,
        actualTier: dbAssignment.tier,
      });
      // Continue to also check release presence even if node drifted
    }

    // ── 4. Tier drift ───────────────────────────────────────────────────────
    if (dbAssignment.tier !== item.tier && dbAssignment.nodeSlug === item.nodeSlug) {
      divergences.push({
        category: 'tier_drift',
        reason: 'tier_drift',
        title: item.title,
        year: item.year,
        tmdbId: resolvedTmdb,
        nodeSlug: item.nodeSlug,
        tier: item.tier,
        actualTier: dbAssignment.tier,
      });
    }

    // ── 5. Missing in release (only CORE items are published) ───────────────
    if (item.tier === 'CORE') {
      if (releaseByTmdb === null) {
        // No published release at all
        divergences.push({
          category: 'missing_in_release',
          reason: 'no_published_release',
          title: item.title,
          year: item.year,
          tmdbId: resolvedTmdb,
          nodeSlug: item.nodeSlug,
          tier: item.tier,
        });
      } else if (!releaseByTmdb.has(resolvedTmdb)) {
        divergences.push({
          category: 'missing_in_release',
          reason: 'not_in_release_snapshot',
          title: item.title,
          year: item.year,
          tmdbId: resolvedTmdb,
          nodeSlug: item.nodeSlug,
          tier: item.tier,
        });
      } else {
        presentInRelease += 1;
      }
    } else {
      // EXTENDED titles don't go to release — not a divergence
    }
  }

  const missingInDbCount = divergences.filter((d) => d.category === 'missing_in_db').length;
  const lossRate = masteredTitles.length > 0 ? missingInDbCount / masteredTitles.length : 0;
  const releaseDropRate = masteredCore > 0 ? (masteredCore - presentInRelease) / masteredCore : 0;

  return {
    season,
    masteredTotal: masteredTitles.length,
    masteredCore,
    masteredExtended,
    resolvedInDb,
    assignedInDb,
    presentInRelease,
    divergences,
    lossRate,
    releaseDropRate,
  };
}

// ---------------------------------------------------------------------------
// Mastered-file parsing helpers
// ---------------------------------------------------------------------------

/** Parse Season 2 mastered JSON (`docs/season/season-2-cult-classics-mastered.json`) into MasteredTitle[] */
export function parseSeason2MasteredTitles(raw: {
  nodes: Array<{
    slug: string;
    core: Array<{ title: string; year: number; tmdbId?: number | null }>;
    extended: Array<{ title: string; year: number; tmdbId?: number | null }>;
  }>;
}): MasteredTitle[] {
  const result: MasteredTitle[] = [];
  for (const node of raw.nodes) {
    for (const film of node.core) {
      result.push({
        title: film.title,
        year: film.year,
        tmdbId: typeof film.tmdbId === 'number' ? film.tmdbId : null,
        nodeSlug: node.slug,
        tier: 'CORE',
      });
    }
    for (const film of node.extended) {
      result.push({
        title: film.title,
        year: film.year,
        tmdbId: typeof film.tmdbId === 'number' ? film.tmdbId : null,
        nodeSlug: node.slug,
        tier: 'EXTENDED',
      });
    }
  }
  return result;
}

/** Parse Season 1 curriculum JSON (`docs/season/season-1-horror-subgenre-curriculum.json`) into MasteredTitle[] */
export function parseSeason1CurriculumTitles(raw: {
  nodes: Array<{
    slug: string;
    titles: Array<{ title: string; year: number }>;
  }>;
}): MasteredTitle[] {
  const result: MasteredTitle[] = [];
  for (const node of raw.nodes) {
    for (const film of node.titles) {
      result.push({
        title: film.title,
        year: film.year,
        tmdbId: null, // S1 curriculum has no tmdbId
        nodeSlug: node.slug,
        tier: 'CORE', // S1 curriculum treats all titles as core essentials
      });
    }
  }
  return result;
}
