import Link from 'next/link';
import { CinematicDnaViz } from '@/components/profile/CinematicDnaViz';
import { Button, Card, Chip, PosterImage, RatingBadges } from '@/components/ui';

const demoCards = [
  {
    tmdbId: 117,
    title: 'The Exorcist',
    year: 1973,
    posterUrl: 'https://image.tmdb.org/t/p/w500/4ucLGcXVVSVnsfkGtbLY4XAius8.jpg',
    ratings: [
      { source: 'IMDB', value: 8.1, scale: '10', rawValue: '8.1/10' },
      { source: 'ROTTEN_TOMATOES', value: 78, scale: '100', rawValue: '78%' },
      { source: 'METACRITIC', value: 82, scale: '100', rawValue: '82/100' },
    ],
    whyImportant: 'A benchmark for possession horror and psychological dread.',
    whatItTeaches: 'How restraint and suggestion can build sustained fear.',
    watchFor: ['Sound design escalation', 'Religious symbolism', 'Performance intensity'],
    genres: ['Supernatural', 'Psychological'],
  },
  {
    tmdbId: 694,
    title: 'The Shining',
    year: 1980,
    posterUrl: 'https://image.tmdb.org/t/p/w500/xazWoLealQwEgqZ89MLZklLZD3k.jpg',
    ratings: [
      { source: 'IMDB', value: 8.4, scale: '10', rawValue: '8.4/10' },
      { source: 'ROTTEN_TOMATOES', value: 83, scale: '100', rawValue: '83%' },
      { source: 'METACRITIC', value: 66, scale: '100', rawValue: '66/100' },
    ],
    whyImportant: 'A masterclass in visual control and escalating paranoia.',
    whatItTeaches: 'How environment becomes an active character in horror.',
    watchFor: ['Symmetry and framing', 'Score dissonance', 'Character isolation'],
    genres: ['Psychological', 'Atmospheric'],
  },
  {
    tmdbId: 539,
    title: 'Psycho',
    year: 1960,
    posterUrl: 'https://image.tmdb.org/t/p/w500/yz4QVqPx3h1hD1DfqqQkCq3rmxW.jpg',
    ratings: [
      { source: 'IMDB', value: 8.5, scale: '10', rawValue: '8.5/10' },
      { source: 'ROTTEN_TOMATOES', value: 97, scale: '100', rawValue: '97%' },
      { source: 'METACRITIC', value: 97, scale: '100', rawValue: '97/100' },
    ],
    whyImportant: 'Defines modern suspense grammar and audience misdirection.',
    whatItTeaches: 'How editing rhythm can weaponize shock.',
    watchFor: ['Cut timing', 'Motif repetition', 'POV manipulation'],
    genres: ['Suspense', 'Classic Horror'],
  },
  {
    tmdbId: 578,
    title: 'Jaws',
    year: 1975,
    posterUrl: 'https://image.tmdb.org/t/p/w500/lxM6kqilAdpdhqUl2biYp5frUxE.jpg',
    ratings: [
      { source: 'IMDB', value: 8.1, scale: '10', rawValue: '8.1/10' },
      { source: 'ROTTEN_TOMATOES', value: 97, scale: '100', rawValue: '97%' },
      { source: 'METACRITIC', value: 87, scale: '100', rawValue: '87/100' },
    ],
    whyImportant: 'Established blockbuster suspense while preserving craft depth.',
    whatItTeaches: 'How withholding visuals increases fear and anticipation.',
    watchFor: ['Theme cue timing', 'Threat reveal pacing', 'Spatial tension'],
    genres: ['Creature Feature', 'Suspense'],
  },
  {
    tmdbId: 348,
    title: 'Alien',
    year: 1979,
    posterUrl: 'https://image.tmdb.org/t/p/w500/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg',
    ratings: [
      { source: 'IMDB', value: 8.5, scale: '10', rawValue: '8.5/10' },
      { source: 'ROTTEN_TOMATOES', value: 93, scale: '100', rawValue: '93%' },
      { source: 'METACRITIC', value: 89, scale: '100', rawValue: '89/100' },
    ],
    whyImportant: 'A foundational fusion of science fiction and pure horror.',
    whatItTeaches: 'How production design and pacing create immersive dread.',
    watchFor: ['Industrial worldbuilding', 'Silence before impact', 'Group dynamics'],
    genres: ['Sci-Fi Horror', 'Claustrophobic'],
  },
] as const;

const demoDna = {
  intensityPreference: 0.61,
  pacingPreference: 0.44,
  psychologicalVsSupernatural: 0.78,
  goreTolerance: 0.39,
  ambiguityTolerance: 0.73,
  nostalgiaBias: 0.68,
  auteurAffinity: 0.71,
};

export default function DemoPage() {
  return (
    <main className="flex flex-1 flex-col gap-4 pb-10 pt-4">
      <Card className="border-[rgba(193,18,31,0.55)] bg-[rgba(110,10,18,0.2)]">
        <p className="text-sm font-semibold text-[var(--text)]">Demo Experience - Sign up to personalize</p>
      </Card>

      <Card className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Demo Onboarding</p>
        <h1 className="text-2xl font-semibold">Your Journey Starts With Two Signals</h1>
        <div className="space-y-3 text-sm">
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">Intensity</p>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <span
                  className={`rounded-lg border px-0 py-2 text-center ${value === 3 ? 'border-[rgba(193,18,31,0.7)] bg-[rgba(155,17,30,0.22)]' : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}
                  key={value}
                >
                  {value}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">Pace</p>
            <div className="grid grid-cols-3 gap-2">
              {['Slowburn', 'Balanced', 'Shock'].map((label) => (
                <span
                  className={`rounded-lg border px-2 py-2 text-center ${label === 'Balanced' ? 'border-[rgba(193,18,31,0.7)] bg-[rgba(155,17,30,0.22)]' : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}
                  key={label}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Example 5-Film Bundle</p>
        <div className="space-y-3">
          {demoCards.map((card) => (
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[rgba(10,10,12,0.9)]" key={card.tmdbId}>
              <div className="relative aspect-[2/3] w-full bg-[#111116]">
                <PosterImage
                  alt={`${card.title} poster`}
                  className="object-cover"
                  fill
                  sizes="(max-width: 420px) 100vw, 420px"
                  src={card.posterUrl}
                />
              </div>
              <div className="space-y-2 p-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-lg font-semibold">{card.title}</h2>
                  <span className="text-xs text-[var(--text-muted)]">{card.year}</span>
                </div>
                <RatingBadges ratings={[...card.ratings]} />
                <div className="flex flex-wrap gap-2">
                  {card.genres.map((genre) => <Chip key={genre}>{genre}</Chip>)}
                </div>
                <p className="text-sm text-[var(--text-muted)]"><span className="text-[var(--text)]">Why it matters:</span> {card.whyImportant}</p>
                <p className="text-sm text-[var(--text-muted)]"><span className="text-[var(--text)]">What it teaches:</span> {card.whatItTeaches}</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-muted)]">
                  {card.watchFor.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Example Cinematic DNA</p>
        <CinematicDnaViz traits={demoDna} />
        <p className="text-sm leading-6 text-[var(--text-muted)]">
          Your taste profile leans psychological, ambiguity-tolerant, and auteur-oriented with moderate intensity.
        </p>
      </Card>

      <Card className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Example Companion Mode</p>
        <h2 className="text-xl font-semibold">The Shining (1980)</h2>
        <div className="grid grid-cols-3 gap-2">
          <span className="rounded-lg border border-[rgba(193,18,31,0.72)] bg-[rgba(155,17,30,0.24)] px-2 py-2 text-center text-xs">No Spoilers!</span>
          <span className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-2 text-center text-xs text-[var(--text-muted)]">Light Spoilers</span>
          <span className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-2 text-center text-xs text-[var(--text-muted)]">Full Spoilers</span>
        </div>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--text-muted)]">
          <li>Technique Breakdown: Observe symmetrical framing and corridor geometry as dread scaffolding.</li>
          <li>Influence Map: Connect to gothic isolation motifs and psychological descent narratives.</li>
          <li>After Watching Reflection: Which visual repetition shifted your emotional state most?</li>
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link href="/signup"><Button className="w-full">Create Account</Button></Link>
        <Link href="/login"><Button className="w-full" variant="secondary">Login</Button></Link>
      </div>
    </main>
  );
}
