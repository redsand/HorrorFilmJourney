'use client';

type Traits = {
  intensityPreference: number;
  pacingPreference: number;
  psychologicalVsSupernatural: number;
  goreTolerance: number;
  ambiguityTolerance: number;
  nostalgiaBias: number;
  auteurAffinity: number;
};

type CinematicDnaVizProps = {
  traits: Traits;
};

type TraitConfig = {
  key: keyof Traits;
  label: string;
};

const TRAIT_CONFIG: TraitConfig[] = [
  { key: 'intensityPreference', label: 'Intensity' },
  { key: 'pacingPreference', label: 'Pacing' },
  { key: 'psychologicalVsSupernatural', label: 'Psych vs Supernatural' },
  { key: 'goreTolerance', label: 'Gore Tolerance' },
  { key: 'ambiguityTolerance', label: 'Ambiguity' },
  { key: 'nostalgiaBias', label: 'Nostalgia' },
  { key: 'auteurAffinity', label: 'Auteur Affinity' },
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function toPoints(traits: Traits, size = 240, padding = 26): string {
  const center = size / 2;
  const maxRadius = center - padding;
  const step = (Math.PI * 2) / TRAIT_CONFIG.length;

  return TRAIT_CONFIG.map((trait, index) => {
    const value = clamp01(traits[trait.key]);
    const angle = -Math.PI / 2 + index * step;
    const radius = maxRadius * value;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function toAxes(size = 240, padding = 26): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const center = size / 2;
  const maxRadius = center - padding;
  const step = (Math.PI * 2) / TRAIT_CONFIG.length;

  return TRAIT_CONFIG.map((_, index) => {
    const angle = -Math.PI / 2 + index * step;
    return {
      x1: center,
      y1: center,
      x2: center + Math.cos(angle) * maxRadius,
      y2: center + Math.sin(angle) * maxRadius,
    };
  });
}

function toRingPoints(factor: number, size = 240, padding = 26): string {
  const center = size / 2;
  const maxRadius = (center - padding) * factor;
  const step = (Math.PI * 2) / TRAIT_CONFIG.length;

  return TRAIT_CONFIG.map((_, index) => {
    const angle = -Math.PI / 2 + index * step;
    const x = center + Math.cos(angle) * maxRadius;
    const y = center + Math.sin(angle) * maxRadius;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function scorePercent(value: number): number {
  return Math.round(clamp01(value) * 100);
}

export function CinematicDnaViz({ traits }: CinematicDnaVizProps) {
  const polygonPoints = toPoints(traits);
  const axes = toAxes();
  const ring30 = toRingPoints(0.3);
  const ring60 = toRingPoints(0.6);
  const ring100 = toRingPoints(1);

  return (
    <div className="space-y-4">
      <div className="mx-auto w-full max-w-[280px]">
        <svg className="h-auto w-full" role="img" viewBox="0 0 240 240">
          <polygon fill="none" points={ring100} stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
          <polygon fill="none" points={ring60} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          <polygon fill="none" points={ring30} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          {axes.map((axis) => (
            <line
              key={`${axis.x2}-${axis.y2}`}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
              x1={axis.x1}
              x2={axis.x2}
              y1={axis.y1}
              y2={axis.y2}
            />
          ))}
          <polygon
            className="transition-all duration-700 ease-out"
            fill="rgba(193,18,31,0.28)"
            points={polygonPoints}
            stroke="rgba(220,38,38,0.95)"
            strokeWidth="2"
          />
          <circle cx="120" cy="120" fill="rgba(193,18,31,0.88)" r="3" />
        </svg>
      </div>

      <div className="space-y-3">
        {TRAIT_CONFIG.map((trait) => {
          const percent = scorePercent(traits[trait.key]);
          return (
            <div key={trait.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">{trait.label}</span>
                <span className="text-[var(--text)]">{percent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,rgba(127,29,29,0.95),rgba(220,38,38,0.95))] transition-all duration-700 ease-out"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { Traits as CinematicDnaTraits };
