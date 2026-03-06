// ─── FRANCHISE DEDUPLICATION ─────────────────────────────────────────────────
//
// Applied at curriculum selection time (not harvest time, not calibration time).
//
// Problem: The candidate pool contains multiple entries from the same franchise
// (e.g. all three Back to the Future films, three Star Wars films, three Alien
// films). A curriculum of 40–60 films should not allocate 3 slots to one
// franchise unless each entry is educationally distinct.
//
// Strategy:
//   1. Films are pre-sorted by strength (descending) before deduplication.
//   2. For each franchise group, keep the top `maxFromGroup` films by strength.
//   3. All lower-ranked franchise members are removed from the output.
//   4. Films not in any defined group pass through unchanged.
//
// Franchise membership is determined first by explicit TMDB ID lookup
// (reliable), then by normalized title-prefix heuristic (fallback for sequels
// not yet enumerated).
//
// The title-prefix heuristic: a film whose normalized title begins with the
// same ≥4-word prefix as an already-selected film is treated as a sequel.
// This handles "Return of the Jedi" → "Return of the" matching "Return of the
// Jedi" but avoids false collisions between short titles.
// ─────────────────────────────────────────────────────────────────────────────

export type FranchiseGroup = {
  name: string;
  // Explicit TMDB IDs belonging to this franchise. The first entry should be
  // the canonical film (original or best-regarded). The remainder are sequels
  // or spin-offs to suppress.
  tmdbIds: number[];
  // Maximum number of films from this group to include in the curriculum.
  // Default 1 — only the strongest entry survives.
  maxFromGroup?: number;
};

export type DeduplicatedCandidate = {
  tmdbId: number;
  title: string;
  strength: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Franchise Group Registry
//
// Ordered by franchise: the first TMDB ID in each group is the canonical film
// that SHOULD survive deduplication (highest curriculum priority). Subsequent
// IDs are sequels/prequels/spin-offs.
//
// maxFromGroup: films that have sequels worth keeping independently (e.g.,
// Alien vs Aliens are distinct enough to include both) can set this to 2.
// ─────────────────────────────────────────────────────────────────────────────

export const SCI_FI_FRANCHISE_GROUPS: readonly FranchiseGroup[] = [
  // Time travel
  {
    name: 'Back to the Future',
    tmdbIds: [105, 165, 196],  // Part I, II, III
    maxFromGroup: 1,
  },

  // Space opera — original trilogy only (prequels/sequels are separate decisions)
  {
    name: 'Star Wars Original Trilogy',
    tmdbIds: [11, 1891, 1892],  // A New Hope, Empire, Jedi
    maxFromGroup: 2,  // Empire and A New Hope are both curriculum-grade; Jedi is optional
  },
  {
    name: 'Star Wars Prequel Trilogy',
    tmdbIds: [1893, 1894, 140607],  // Phantom Menace, Attack of the Clones, Revenge of the Sith
    maxFromGroup: 1,
  },

  // Alien franchise — Alien (1979) and Aliens (1986) are both canonical
  {
    name: 'Alien Franchise',
    tmdbIds: [348, 679, 8077, 8078, 126264, 253291],  // Alien, Aliens, Alien 3, Resurrection, Prometheus, Covenant
    maxFromGroup: 2,  // Alien and Aliens are educationally distinct (horror vs action)
  },

  // Terminator
  {
    name: 'Terminator',
    tmdbIds: [218, 280, 516, 534558, 87101],  // T1, T2, T3, Salvation, Genisys
    maxFromGroup: 2,  // T1 (time travel) and T2 (AI/action) are both curriculum-grade
  },

  // Matrix
  {
    name: 'The Matrix',
    tmdbIds: [603, 604, 605, 624860],  // Matrix, Reloaded, Revolutions, Resurrections
    maxFromGroup: 1,
  },

  // Planet of the Apes (original series)
  {
    name: 'Planet of the Apes (Original)',
    tmdbIds: [871, 9291, 10202, 10203, 10204],  // Original + 4 sequels
    maxFromGroup: 1,
  },

  // Jurassic Park
  {
    name: 'Jurassic Park',
    tmdbIds: [329, 330, 331, 135397, 351286, 507086],
    maxFromGroup: 1,
  },

  // Star Trek (original cast films)
  {
    name: 'Star Trek Original Cast',
    tmdbIds: [152, 154, 157, 168, 172, 200],  // TMP through Undiscovered Country
    maxFromGroup: 2,  // Wrath of Khan + one more
  },
  {
    name: 'Star Trek Next Generation Films',
    tmdbIds: [193, 199, 201, 202],
    maxFromGroup: 1,
  },
  {
    name: 'Star Trek Kelvin Timeline',
    tmdbIds: [13475, 77338, 188927],
    maxFromGroup: 1,
  },

  // RoboCop
  {
    name: 'RoboCop',
    tmdbIds: [5548, 5550, 5551],
    maxFromGroup: 1,
  },

  // Predator
  {
    name: 'Predator',
    tmdbIds: [106, 1271, 24488],
    maxFromGroup: 1,
  },

  // Mad Max
  {
    name: 'Mad Max',
    tmdbIds: [11865, 7431, 68726, 76341],  // Mad Max, Road Warrior, Beyond Thunderdome, Fury Road
    maxFromGroup: 2,  // Road Warrior and Fury Road are both curriculum-grade
  },

  // Dune
  {
    name: 'Dune',
    tmdbIds: [841, 438631, 693134],  // Lynch 1984, Villeneuve Part 1, Part 2
    maxFromGroup: 1,  // Villeneuve version is the curriculum entry
  },

  // Planet of the Apes reboot
  {
    name: 'Planet of the Apes (Reboot)',
    tmdbIds: [73675, 152601, 286217, 653346],
    maxFromGroup: 1,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Build Lookup Index
// ─────────────────────────────────────────────────────────────────────────────

type FranchiseMembership = {
  groupName: string;
  maxFromGroup: number;
};

function buildFranchiseIndex(
  groups: readonly FranchiseGroup[],
): Map<number, FranchiseMembership> {
  const index = new Map<number, FranchiseMembership>();
  for (const group of groups) {
    const maxFromGroup = group.maxFromGroup ?? 1;
    for (const tmdbId of group.tmdbIds) {
      index.set(tmdbId, { groupName: group.name, maxFromGroup });
    }
  }
  return index;
}

// ─────────────────────────────────────────────────────────────────────────────
// Title-Prefix Heuristic
//
// Fallback for sequels whose TMDB IDs are not yet enumerated.
// Extracts the first N meaningful words from a normalized title for comparison.
// N = 3 (balances specificity against false positives).
// ─────────────────────────────────────────────────────────────────────────────

const TITLE_PREFIX_WORDS = 3;

// Stop words that should not anchor a prefix (too generic to be discriminative)
const PREFIX_STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'at', 'to', 'and', 'or',
]);

function normTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function titlePrefix(title: string): string | null {
  const words = normTitle(title)
    .split(' ')
    .filter((w) => w.length >= 2 && !PREFIX_STOP_WORDS.has(w));
  if (words.length < 2) return null;
  return words.slice(0, TITLE_PREFIX_WORDS).join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main: deduplicateFranchiseSequels
//
// Input must be pre-sorted by strength descending (best first).
// The function processes films in order, tracking:
//   - How many films from each explicit franchise group have been selected
//   - Title prefixes of selected films (for heuristic sequel detection)
//
// A film is REMOVED if:
//   a) Its TMDB ID belongs to a franchise group AND that group has already
//      contributed maxFromGroup films to the output, OR
//   b) Its title prefix matches a prefix already seen AND it is not the first
//      film encountered with that prefix (heuristic sequel detection).
//
// Removal is recorded in the `removed` output array for auditability.
// ─────────────────────────────────────────────────────────────────────────────

export type DeduplicationResult<T extends DeduplicatedCandidate> = {
  kept: T[];
  removed: Array<{ tmdbId: number; title: string; reason: string }>;
};

export function deduplicateFranchiseSequels<T extends DeduplicatedCandidate>(
  candidates: T[],
  options: {
    franchiseGroups?: readonly FranchiseGroup[];
    useTitlePrefixHeuristic?: boolean;
  } = {},
): DeduplicationResult<T> {
  const groups = options.franchiseGroups ?? SCI_FI_FRANCHISE_GROUPS;
  const usePrefixHeuristic = options.useTitlePrefixHeuristic ?? true;

  const franchiseIndex = buildFranchiseIndex(groups);
  const groupCountSeen = new Map<string, number>();
  const prefixesSeen = new Set<string>();

  const kept: T[] = [];
  const removed: Array<{ tmdbId: number; title: string; reason: string }> = [];

  for (const candidate of candidates) {
    // Check explicit franchise membership
    const membership = franchiseIndex.get(candidate.tmdbId);
    if (membership) {
      const seen = groupCountSeen.get(membership.groupName) ?? 0;
      if (seen >= membership.maxFromGroup) {
        removed.push({
          tmdbId: candidate.tmdbId,
          title: candidate.title,
          reason: `franchise-group:${membership.groupName} (already has ${seen}/${membership.maxFromGroup} entries)`,
        });
        continue;
      }
      groupCountSeen.set(membership.groupName, seen + 1);
    }

    // Heuristic title-prefix check (only for films not in explicit groups)
    if (usePrefixHeuristic && !membership) {
      const prefix = titlePrefix(candidate.title);
      if (prefix !== null) {
        if (prefixesSeen.has(prefix)) {
          removed.push({
            tmdbId: candidate.tmdbId,
            title: candidate.title,
            reason: `title-prefix-heuristic:${prefix}`,
          });
          continue;
        }
        prefixesSeen.add(prefix);
      }
    } else if (membership) {
      // Track prefix for explicit-group films too (to catch un-enumerated members)
      const prefix = titlePrefix(candidate.title);
      if (prefix !== null) prefixesSeen.add(prefix);
    }

    kept.push(candidate);
  }

  return { kept, removed };
}
