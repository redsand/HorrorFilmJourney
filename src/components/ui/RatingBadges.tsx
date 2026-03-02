type RatingItem = {
  source: string;
  value: number;
  scale: '10' | '100' | string;
  rawValue?: string;
};

type RatingBadgesProps = {
  ratings: RatingItem[];
  className?: string;
};

function sourceLabel(source: string): string {
  if (source === 'IMDB') return 'IMDb';
  if (source === 'ROTTEN_TOMATOES') return 'Rotten Tomatoes';
  if (source === 'METACRITIC') return 'Metacritic';
  return source.replaceAll('_', ' ');
}

function sourceShort(source: string): string {
  if (source === 'IMDB') return 'IMDb';
  if (source === 'ROTTEN_TOMATOES') return 'RT';
  if (source === 'METACRITIC') return 'MC';
  return source.slice(0, 2).toUpperCase();
}

function sourceStyle(source: string): string {
  if (source === 'IMDB') return 'bg-[#F5C518] text-[#151515]';
  if (source === 'ROTTEN_TOMATOES') return 'bg-[#FA320A] text-white';
  if (source === 'METACRITIC') return 'bg-[#1D4ED8] text-white';
  return 'bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)]';
}

function formatValue(item: RatingItem): string {
  if (item.rawValue && item.rawValue.trim().length > 0) {
    return item.rawValue;
  }
  return `${item.value}/${item.scale}`;
}

export function RatingBadges({ ratings, className = '' }: RatingBadgesProps) {
  if (ratings.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`.trim()}>
      {ratings.map((rating) => (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[rgba(10,10,12,0.8)] px-2 py-1" key={`${rating.source}-${rating.scale}-${rating.value}`}>
          <span
            aria-label={sourceLabel(rating.source)}
            className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[10px] font-bold ${sourceStyle(rating.source)}`}
            title={sourceLabel(rating.source)}
          >
            {sourceShort(rating.source)}
          </span>
          <span className="text-xs text-[var(--text)]">{formatValue(rating)}</span>
        </div>
      ))}
    </div>
  );
}
