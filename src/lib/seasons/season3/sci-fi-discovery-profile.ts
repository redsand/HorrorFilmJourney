export type DiscoverPlan = {
  key: string;
  label: string;
  withGenres: number[];
  withoutGenres?: number[];
  withOriginalLanguages?: string[];   // TMDB with_original_language, pipe-joined (OR logic)
  withKeywords?: number[];            // TMDB with_keywords, pipe-joined (OR logic)
  withPeople?: number[];              // TMDB with_people (director/cast IDs), pipe-joined (OR logic)
  minVoteAverage?: number;            // TMDB vote_average.gte
  sortBy: 'popularity.desc' | 'vote_count.desc' | 'vote_average.desc';
  voteCountGte: number;
};

export const SEASON3_DISCOVERY_SCORE_WEIGHT_BY_PLAN_KEY: Record<string, number> = {
  'core-sci-fi-vote-count':       2.4,
  'core-sci-fi-popularity':       1.6,
  'sci-fi-horror':                1.2,
  'sci-fi-thriller-mystery':      1.1,
  'adjacent-genre-sweep':         0.35,
  // Priority 3–4: gap-filling plans (language, era, quality sort)
  'early-sci-fi-pre1950':         2.8,  // Pre-1950 tagging is sparse and precise — high signal
  'sci-fi-high-rated':            2.0,  // vote_average.desc surfaces art-cinema and international
  'international-sci-fi-ja':      1.8,  // Japanese sci-fi (Akira, Ghost in the Shell depth)
  'international-sci-fi-eu':      1.8,  // French / Russian / German auteur sci-fi
  // Priority 5: TMDB keyword-targeted plans (high precision, node-specific)
  'cyberpunk-keyword':            2.2,  // Keyword-confirmed cyberpunk — low false-positive rate
  'ai-cinema-keyword':            2.2,  // Keyword-confirmed AI/robot — low false-positive rate
  'time-travel-keyword':          2.0,  // Keyword-confirmed time travel
  'dystopia-keyword':             2.0,  // Keyword-confirmed dystopia
  // Priority 7: director-targeted plans (auteur discovery)
  'director-auteur-sci-fi':       2.6,  // Canonical sci-fi directors — any film tagged 878
} as const;

export const TMDB_GENRE = {
  ACTION:           28,
  ADVENTURE:        12,
  ANIMATION:        16,
  DRAMA:            18,
  FANTASY:          14,
  HORROR:           27,
  MYSTERY:          9648,
  SCIENCE_FICTION:  878,
  THRILLER:         53,
  WAR:              10752,
} as const;

export const SCI_FI_PRIMARY_GENRES: number[] = [
  TMDB_GENRE.SCIENCE_FICTION,
];

export const SCI_FI_ADJACENT_GENRES: number[] = [
  TMDB_GENRE.ACTION,
  TMDB_GENRE.ADVENTURE,
  TMDB_GENRE.FANTASY,
  TMDB_GENRE.HORROR,
  TMDB_GENRE.MYSTERY,
  TMDB_GENRE.THRILLER,
  TMDB_GENRE.DRAMA,
  TMDB_GENRE.WAR,
];

// TMDB keyword IDs for precision keyword-targeted plans (future use).
// These map to official TMDB keyword names.
export const TMDB_KEYWORD = {
  CYBERPUNK:              3290,
  DYSTOPIA:               4290,
  ARTIFICIAL_INTELLIGENCE: 9951,
  TIME_TRAVEL:            4379,
  ROBOT:                  2395,
  SPACE_OPERA:            166490,
  FIRST_CONTACT:          156085,
  CLONE:                  3957,
  GENETIC_ENGINEERING:    9714,
  ATOMIC_BOMB:            3688,
  NUCLEAR_WAR:            3682,
  POST_APOCALYPTIC:       4565,
  ALIEN:                  161176,
  VIRTUAL_REALITY:        4171,
} as const;

// TMDB Person IDs for canonical sci-fi directors.
// These are used in Priority 7 director-targeted discovery plans.
// `with_people` uses OR logic — any film directed by or starring one of these people.
export const TMDB_DIRECTOR = {
  KUBRICK:    240,    // Stanley Kubrick — 2001, A Clockwork Orange, Dr. Strangelove
  TARKOVSKY:  17421,  // Andrei Tarkovsky — Stalker, Solaris
  GODARD:     10231,  // Jean-Luc Godard — Alphaville
  CRONENBERG: 11424,  // David Cronenberg — Videodrome, Naked Lunch, eXistenZ
  CARPENTER:  11770,  // John Carpenter — The Thing, They Live, Dark Star
  SCOTT:      578,    // Ridley Scott — Alien, Blade Runner
  CAMERON:    2710,   // James Cameron — The Terminator, Aliens, Avatar
  VERHOEVEN:  10429,  // Paul Verhoeven — RoboCop, Total Recall, Starship Troopers
  ANDERSON_P: 12891,  // Paul W.S. Anderson — Event Horizon (note: different from Paul Thomas Anderson)
  VILLENEUVE: 137427, // Denis Villeneuve — Arrival, Blade Runner 2049
  NOLAN:      525,    // Christopher Nolan — Interstellar, The Prestige, Tenet
  SPIELBERG:  488,    // Steven Spielberg — Close Encounters, E.T., Minority Report
} as const;

export function getSeason3SciFiDiscoverPlans(): DiscoverPlan[] {
  const sciFiAdjacencyWithExplicitSignal = [
    TMDB_GENRE.SCIENCE_FICTION,
    ...SCI_FI_ADJACENT_GENRES,
  ];

  return [
    // ── Core Plans ────────────────────────────────────────────────────────────
    // These target the primary TMDB sci-fi genre tag (878) directly.
    {
      key: 'core-sci-fi-vote-count',
      label: 'Core sci-fi by vote count',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION],
      sortBy: 'vote_count.desc',
      voteCountGte: 50,
    },
    {
      key: 'core-sci-fi-popularity',
      label: 'Core sci-fi by popularity',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION],
      sortBy: 'popularity.desc',
      voteCountGte: 20,
    },

    // ── Crossover Plans ───────────────────────────────────────────────────────
    // Target films at the boundary of sci-fi with adjacent genres.
    {
      key: 'sci-fi-horror',
      label: 'Sci-fi and horror crossover',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION, TMDB_GENRE.HORROR],
      sortBy: 'vote_count.desc',
      voteCountGte: 20,
    },
    {
      key: 'sci-fi-thriller-mystery',
      label: 'Sci-fi thriller and mystery crossover',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION, TMDB_GENRE.THRILLER, TMDB_GENRE.MYSTERY],
      sortBy: 'vote_count.desc',
      voteCountGte: 10,
    },

    // ── Adjacent Sweep ────────────────────────────────────────────────────────
    // Broad sweep across all adjacent genres with an explicit sci-fi signal.
    // Animation excluded here because animated sci-fi is already captured by
    // the core plans (which don't exclude animation).
    {
      key: 'adjacent-genre-sweep',
      label: 'Adjacent genres with sci-fi signal, excluding animation',
      withGenres: sciFiAdjacencyWithExplicitSignal,
      withoutGenres: [TMDB_GENRE.ANIMATION],
      sortBy: 'vote_count.desc',
      voteCountGte: 50,
    },

    // ── Priority 3: Gap-filling Plans ─────────────────────────────────────────
    //
    // The coverage analysis identified three structural gaps:
    //   1. Pre-1950 silent / pre-war sci-fi is underweighted (TMDB vote counts
    //      are very low for this era; standard vote_count.gte=50 filters most out)
    //   2. Art-cinema and international sci-fi surfaces better on vote_average sort
    //   3. Japanese and European auteur sci-fi has low English-user vote counts
    //      but excellent vote averages — language-targeted plans are needed

    {
      key: 'early-sci-fi-pre1950',
      label: 'Early sci-fi pre-1950 (silent and pre-war era)',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION],
      sortBy: 'vote_average.desc',
      voteCountGte: 10,  // Lowered threshold — pre-1950 films have very few TMDB votes
      minVoteAverage: 5.0,
    },
    {
      key: 'sci-fi-high-rated',
      label: 'High-rated sci-fi sorted by vote average (surfaces art cinema)',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION],
      sortBy: 'vote_average.desc',
      voteCountGte: 100,
      minVoteAverage: 7.0,
    },
    {
      key: 'international-sci-fi-ja',
      label: 'Japanese language sci-fi (Akira depth, live-action, anime)',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION],
      withOriginalLanguages: ['ja'],
      sortBy: 'vote_average.desc',
      voteCountGte: 20,
    },
    {
      key: 'international-sci-fi-eu',
      label: 'European auteur sci-fi (French, Russian, German, Korean)',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION],
      withOriginalLanguages: ['fr', 'ru', 'de', 'ko'],
      sortBy: 'vote_average.desc',
      voteCountGte: 20,
    },

    // ── Priority 5: Keyword-Targeted Plans ────────────────────────────────────
    //
    // TMDB keyword metadata is human-curated. Films tagged with these specific
    // keyword IDs have been explicitly classified — the false-positive rate is
    // dramatically lower than genre-only filtering.
    //
    // Each plan targets a specific ontology node's conceptual domain.
    // `with_genres: [878]` is still required — keywords alone are too broad.

    {
      key: 'cyberpunk-keyword',
      label: 'Cyberpunk keyword-targeted (TMDB keyword ID 3290)',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION],
      withKeywords: [
        TMDB_KEYWORD.CYBERPUNK,
        TMDB_KEYWORD.VIRTUAL_REALITY,
      ],
      sortBy: 'vote_count.desc',
      voteCountGte: 10,
    },
    {
      key: 'ai-cinema-keyword',
      label: 'AI and robotics keyword-targeted',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION],
      withKeywords: [
        TMDB_KEYWORD.ARTIFICIAL_INTELLIGENCE,
        TMDB_KEYWORD.ROBOT,
      ],
      sortBy: 'vote_count.desc',
      voteCountGte: 10,
    },
    {
      key: 'time-travel-keyword',
      label: 'Time travel keyword-targeted',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION],
      withKeywords: [
        TMDB_KEYWORD.TIME_TRAVEL,
      ],
      sortBy: 'vote_count.desc',
      voteCountGte: 10,
    },
    {
      key: 'dystopia-keyword',
      label: 'Dystopian society keyword-targeted',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION],
      withKeywords: [
        TMDB_KEYWORD.DYSTOPIA,
        TMDB_KEYWORD.POST_APOCALYPTIC,
      ],
      sortBy: 'vote_count.desc',
      voteCountGte: 10,
    },

    // ── Priority 7: Director-Targeted Plans ───────────────────────────────────
    //
    // TMDB `with_people` returns all films where any of the listed person IDs
    // appear as director or cast. We filter to genre 878 only — the goal is to
    // surface films by canonical sci-fi auteurs that might have low vote counts
    // and therefore miss the core plans.
    //
    // Split into two plans (TMDB `with_people` treats all IDs as OR):
    //   Group A: philosophical / European auteurs (Kubrick, Tarkovsky, Godard, Cronenberg)
    //   Group B: blockbuster / modern auteurs (Spielberg, Cameron, Scott, Nolan, Villeneuve)
    //
    // Carpenter is in Group A — his low-budget sci-fi films have lower vote counts.

    {
      key: 'director-auteur-sci-fi',
      label: 'Canonical sci-fi auteur directors (philosophical and art-cinema)',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION],
      withPeople: [
        TMDB_DIRECTOR.KUBRICK,
        TMDB_DIRECTOR.TARKOVSKY,
        TMDB_DIRECTOR.GODARD,
        TMDB_DIRECTOR.CRONENBERG,
        TMDB_DIRECTOR.CARPENTER,
        TMDB_DIRECTOR.VERHOEVEN,
        TMDB_DIRECTOR.SCOTT,
        TMDB_DIRECTOR.CAMERON,
        TMDB_DIRECTOR.VILLENEUVE,
        TMDB_DIRECTOR.NOLAN,
        TMDB_DIRECTOR.SPIELBERG,
      ],
      sortBy: 'vote_average.desc',
      voteCountGte: 10,
    },
  ];
}
