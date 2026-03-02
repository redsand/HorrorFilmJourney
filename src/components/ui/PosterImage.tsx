'use client';

import { useMemo, useState } from 'react';

type PosterImageProps = {
  src: string | null | undefined;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  className?: string;
  fallbackSrc?: string;
};

const DEFAULT_FALLBACK_SRC = '/images/poster-fallback.svg';

export function PosterImage({
  src,
  alt,
  fill = false,
  width,
  height,
  sizes,
  className,
  fallbackSrc = DEFAULT_FALLBACK_SRC,
}: PosterImageProps) {
  const [failed, setFailed] = useState(false);
  const isLocalGeneratedPoster = typeof src === 'string' && src.startsWith('/api/posters/');

  const resolvedSrc = useMemo(() => {
    if ((!isLocalGeneratedPoster && failed) || !src || src.trim().length === 0) {
      return fallbackSrc;
    }
    return src;
  }, [failed, src, fallbackSrc, isLocalGeneratedPoster]);

  return (
    <img
      alt={alt}
      className={className}
      height={fill ? undefined : height}
      onError={() => {
        if (!isLocalGeneratedPoster) {
          setFailed(true);
        }
      }}
      sizes={sizes}
      src={resolvedSrc}
      style={fill ? { inset: 0, position: 'absolute', width: '100%', height: '100%' } : undefined}
      width={fill ? undefined : width}
    />
  );
}
