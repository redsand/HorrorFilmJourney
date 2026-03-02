import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

type SeedMovie = {
  tmdbId: number;
  title: string;
  year: number;
  genres: string[];
  director: string;
  castTop: Array<{ name: string; role?: string }>;
  ratings: {
    imdb: string;
    rottenTomatoes: string;
    metacritic: string;
  };
};

function dedupeHash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

const posterUrlCache = new Map<number, string>();

function canUseRemotePosters(): boolean {
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  if (!process.env.TMDB_API_KEY) {
    return false;
  }
  if (process.env.SEED_DISABLE_REMOTE_POSTERS === 'true') {
    return false;
  }
  return true;
}

async function resolvePosterUrl(movie: SeedMovie): Promise<string> {
  const cached = posterUrlCache.get(movie.tmdbId);
  if (cached) {
    return cached;
  }

  const fallback = `/api/posters/${movie.tmdbId}`;
  if (!canUseRemotePosters()) {
    posterUrlCache.set(movie.tmdbId, fallback);
    return fallback;
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    posterUrlCache.set(movie.tmdbId, fallback);
    return fallback;
  }

  try {
    const tmdbResponse = await fetch(
      `https://api.themoviedb.org/3/movie/${movie.tmdbId}?api_key=${apiKey}`,
      { method: 'GET' },
    );

    if (!tmdbResponse.ok) {
      // Fall through to title/year search because local curriculum IDs are synthetic.
    } else {
      const payload = (await tmdbResponse.json()) as { poster_path?: string | null };
      if (typeof payload.poster_path === 'string' && payload.poster_path.trim().length > 0) {
        const resolved = `https://image.tmdb.org/t/p/w500${payload.poster_path}`;
        posterUrlCache.set(movie.tmdbId, resolved);
        return resolved;
      }
    }
  } catch {
    // Continue to search fallback.
  }

  try {
    const searchUrl = new URL('https://api.themoviedb.org/3/search/movie');
    searchUrl.searchParams.set('api_key', apiKey);
    searchUrl.searchParams.set('query', movie.title);
    searchUrl.searchParams.set('year', String(movie.year));
    searchUrl.searchParams.set('include_adult', 'false');

    const searchResponse = await fetch(searchUrl.toString(), { method: 'GET' });
    if (searchResponse.ok) {
      const searchPayload = (await searchResponse.json()) as {
        results?: Array<{ poster_path?: string | null; release_date?: string; title?: string }>;
      };
      const firstWithPoster = (searchPayload.results ?? []).find((item) =>
        typeof item.poster_path === 'string' && item.poster_path.trim().length > 0,
      );
      if (firstWithPoster?.poster_path) {
        const resolved = `https://image.tmdb.org/t/p/w500${firstWithPoster.poster_path}`;
        posterUrlCache.set(movie.tmdbId, resolved);
        return resolved;
      }
    }
  } catch {
    // Use fallback poster when search lookup fails.
  }

  posterUrlCache.set(movie.tmdbId, fallback);
  return fallback;
}

const CURRICULUM: SeedMovie[] = [
  { tmdbId: 7001, title: 'Nosferatu', year: 1922, genres: ['horror', 'gothic'], director: 'F. W. Murnau', castTop: [{ name: 'Max Schreck', role: 'Count Orlok' }], ratings: { imdb: '7.8/10', rottenTomatoes: '97%', metacritic: '89/100' } },
  { tmdbId: 7002, title: 'Psycho', year: 1960, genres: ['horror', 'psychological'], director: 'Alfred Hitchcock', castTop: [{ name: 'Anthony Perkins', role: 'Norman Bates' }], ratings: { imdb: '8.5/10', rottenTomatoes: '96%', metacritic: '97/100' } },
  { tmdbId: 7003, title: 'Night of the Living Dead', year: 1968, genres: ['horror', 'zombie'], director: 'George A. Romero', castTop: [{ name: 'Duane Jones', role: 'Ben' }], ratings: { imdb: '7.8/10', rottenTomatoes: '96%', metacritic: '89/100' } },
  { tmdbId: 7004, title: 'The Exorcist', year: 1973, genres: ['horror', 'supernatural'], director: 'William Friedkin', castTop: [{ name: 'Ellen Burstyn', role: 'Chris MacNeil' }], ratings: { imdb: '8.1/10', rottenTomatoes: '78%', metacritic: '83/100' } },
  { tmdbId: 7005, title: 'Halloween', year: 1978, genres: ['horror', 'slasher'], director: 'John Carpenter', castTop: [{ name: 'Jamie Lee Curtis', role: 'Laurie Strode' }], ratings: { imdb: '7.7/10', rottenTomatoes: '96%', metacritic: '87/100' } },
  { tmdbId: 7006, title: 'Alien', year: 1979, genres: ['horror', 'sci-fi'], director: 'Ridley Scott', castTop: [{ name: 'Sigourney Weaver', role: 'Ripley' }], ratings: { imdb: '8.5/10', rottenTomatoes: '93%', metacritic: '89/100' } },
  { tmdbId: 7007, title: 'The Shining', year: 1980, genres: ['horror', 'psychological'], director: 'Stanley Kubrick', castTop: [{ name: 'Jack Nicholson', role: 'Jack Torrance' }], ratings: { imdb: '8.4/10', rottenTomatoes: '83%', metacritic: '66/100' } },
  { tmdbId: 7008, title: 'An American Werewolf in London', year: 1981, genres: ['horror', 'comedy'], director: 'John Landis', castTop: [{ name: 'David Naughton', role: 'David' }], ratings: { imdb: '7.5/10', rottenTomatoes: '89%', metacritic: '61/100' } },
  { tmdbId: 7009, title: 'The Thing', year: 1982, genres: ['horror', 'sci-fi'], director: 'John Carpenter', castTop: [{ name: 'Kurt Russell', role: 'MacReady' }], ratings: { imdb: '8.2/10', rottenTomatoes: '84%', metacritic: '57/100' } },
  { tmdbId: 7010, title: 'A Nightmare on Elm Street', year: 1984, genres: ['horror', 'slasher'], director: 'Wes Craven', castTop: [{ name: 'Heather Langenkamp', role: 'Nancy' }], ratings: { imdb: '7.4/10', rottenTomatoes: '95%', metacritic: '76/100' } },
  { tmdbId: 7011, title: 'The Fly', year: 1986, genres: ['horror', 'body-horror'], director: 'David Cronenberg', castTop: [{ name: 'Jeff Goldblum', role: 'Seth Brundle' }], ratings: { imdb: '7.6/10', rottenTomatoes: '93%', metacritic: '79/100' } },
  { tmdbId: 7012, title: 'Hellraiser', year: 1987, genres: ['horror', 'supernatural'], director: 'Clive Barker', castTop: [{ name: 'Ashley Laurence', role: 'Kirsty' }], ratings: { imdb: '6.9/10', rottenTomatoes: '70%', metacritic: '56/100' } },
  { tmdbId: 7013, title: 'Candyman', year: 1992, genres: ['horror', 'urban-legend'], director: 'Bernard Rose', castTop: [{ name: 'Tony Todd', role: 'Candyman' }], ratings: { imdb: '6.7/10', rottenTomatoes: '78%', metacritic: '61/100' } },
  { tmdbId: 7014, title: 'Scream', year: 1996, genres: ['horror', 'slasher'], director: 'Wes Craven', castTop: [{ name: 'Neve Campbell', role: 'Sidney Prescott' }], ratings: { imdb: '7.4/10', rottenTomatoes: '80%', metacritic: '66/100' } },
  { tmdbId: 7015, title: 'Ringu', year: 1998, genres: ['horror', 'supernatural'], director: 'Hideo Nakata', castTop: [{ name: 'Nanako Matsushima', role: 'Reiko Asakawa' }], ratings: { imdb: '7.2/10', rottenTomatoes: '98%', metacritic: '66/100' } },
  { tmdbId: 7016, title: 'The Blair Witch Project', year: 1999, genres: ['horror', 'found-footage'], director: 'Daniel Myrick', castTop: [{ name: 'Heather Donahue', role: 'Heather' }], ratings: { imdb: '6.5/10', rottenTomatoes: '86%', metacritic: '81/100' } },
  { tmdbId: 7017, title: 'The Others', year: 2001, genres: ['horror', 'gothic'], director: 'Alejandro Amenabar', castTop: [{ name: 'Nicole Kidman', role: 'Grace' }], ratings: { imdb: '7.6/10', rottenTomatoes: '84%', metacritic: '74/100' } },
  { tmdbId: 7018, title: '28 Days Later', year: 2002, genres: ['horror', 'zombie'], director: 'Danny Boyle', castTop: [{ name: 'Cillian Murphy', role: 'Jim' }], ratings: { imdb: '7.5/10', rottenTomatoes: '87%', metacritic: '73/100' } },
  { tmdbId: 7019, title: 'The Descent', year: 2005, genres: ['horror', 'survival'], director: 'Neil Marshall', castTop: [{ name: 'Shauna Macdonald', role: 'Sarah' }], ratings: { imdb: '7.2/10', rottenTomatoes: '87%', metacritic: '71/100' } },
  { tmdbId: 7020, title: 'REC', year: 2007, genres: ['horror', 'found-footage'], director: 'Jaume Balaguero', castTop: [{ name: 'Manuela Velasco', role: 'Angela Vidal' }], ratings: { imdb: '7.4/10', rottenTomatoes: '90%', metacritic: '71/100' } },
  { tmdbId: 7021, title: 'Let the Right One In', year: 2008, genres: ['horror', 'vampire'], director: 'Tomas Alfredson', castTop: [{ name: 'Kare Hedebrant', role: 'Oskar' }], ratings: { imdb: '7.8/10', rottenTomatoes: '98%', metacritic: '82/100' } },
  { tmdbId: 7022, title: 'Insidious', year: 2010, genres: ['horror', 'supernatural'], director: 'James Wan', castTop: [{ name: 'Patrick Wilson', role: 'Josh Lambert' }], ratings: { imdb: '6.8/10', rottenTomatoes: '66%', metacritic: '52/100' } },
  { tmdbId: 7023, title: 'The Cabin in the Woods', year: 2011, genres: ['horror', 'meta'], director: 'Drew Goddard', castTop: [{ name: 'Kristen Connolly', role: 'Dana' }], ratings: { imdb: '7.0/10', rottenTomatoes: '92%', metacritic: '72/100' } },
  { tmdbId: 7024, title: 'The Conjuring', year: 2013, genres: ['horror', 'supernatural'], director: 'James Wan', castTop: [{ name: 'Vera Farmiga', role: 'Lorraine Warren' }], ratings: { imdb: '7.5/10', rottenTomatoes: '86%', metacritic: '68/100' } },
  { tmdbId: 7025, title: 'It Follows', year: 2014, genres: ['horror', 'psychological'], director: 'David Robert Mitchell', castTop: [{ name: 'Maika Monroe', role: 'Jay' }], ratings: { imdb: '6.8/10', rottenTomatoes: '95%', metacritic: '83/100' } },
  { tmdbId: 7026, title: 'The Witch', year: 2015, genres: ['horror', 'folk'], director: 'Robert Eggers', castTop: [{ name: 'Anya Taylor-Joy', role: 'Thomasin' }], ratings: { imdb: '6.9/10', rottenTomatoes: '90%', metacritic: '84/100' } },
  { tmdbId: 7027, title: 'Train to Busan', year: 2016, genres: ['horror', 'zombie'], director: 'Yeon Sang-ho', castTop: [{ name: 'Gong Yoo', role: 'Seok-woo' }], ratings: { imdb: '7.6/10', rottenTomatoes: '95%', metacritic: '73/100' } },
  { tmdbId: 7028, title: 'Get Out', year: 2017, genres: ['horror', 'social-thriller'], director: 'Jordan Peele', castTop: [{ name: 'Daniel Kaluuya', role: 'Chris Washington' }], ratings: { imdb: '7.8/10', rottenTomatoes: '98%', metacritic: '84/100' } },
  { tmdbId: 7029, title: 'Hereditary', year: 2018, genres: ['horror', 'family-trauma'], director: 'Ari Aster', castTop: [{ name: 'Toni Collette', role: 'Annie Graham' }], ratings: { imdb: '7.3/10', rottenTomatoes: '90%', metacritic: '87/100' } },
  { tmdbId: 7030, title: 'Talk to Me', year: 2022, genres: ['horror', 'supernatural'], director: 'Danny Philippou', castTop: [{ name: 'Sophie Wilde', role: 'Mia' }], ratings: { imdb: '7.1/10', rottenTomatoes: '94%', metacritic: '76/100' } },
];

export type SeedSummary = {
  movieCount: number;
  ratingCount: number;
  evidenceCount: number;
};

export async function seedStarterHorrorCatalog(prisma: PrismaClient): Promise<SeedSummary> {
  let ratingCount = 0;
  let evidenceCount = 0;

  for (const movie of CURRICULUM) {
    const posterUrl = await resolvePosterUrl(movie);
    const persisted = await prisma.movie.upsert({
      where: { tmdbId: movie.tmdbId },
      create: {
        tmdbId: movie.tmdbId,
        title: movie.title,
        year: movie.year,
        posterUrl,
        genres: movie.genres,
        director: movie.director,
        castTop: movie.castTop.slice(0, 6),
      },
      update: {
        title: movie.title,
        year: movie.year,
        posterUrl,
        genres: movie.genres,
        director: movie.director,
        castTop: movie.castTop.slice(0, 6),
      },
    });

    const ratings = [
      { source: 'IMDB', rawValue: movie.ratings.imdb, scale: '10' as const },
      { source: 'ROTTEN_TOMATOES', rawValue: movie.ratings.rottenTomatoes, scale: '100' as const },
      { source: 'METACRITIC', rawValue: movie.ratings.metacritic, scale: '100' as const },
    ];

    for (const rating of ratings) {
      const value = Number.parseFloat(rating.rawValue);
      await prisma.movieRating.upsert({
        where: {
          movieId_source: {
            movieId: persisted.id,
            source: rating.source,
          },
        },
        create: {
          movieId: persisted.id,
          source: rating.source,
          value,
          scale: rating.scale,
          rawValue: rating.rawValue,
        },
        update: {
          value,
          scale: rating.scale,
          rawValue: rating.rawValue,
        },
      });
      ratingCount += 1;
    }

    if (movie.tmdbId <= 7012) {
      const snippet = `${movie.title} is widely cited for practical craft and genre influence.`;
      const hash = dedupeHash(`${persisted.id}|Release Notes|${snippet}`);
      await prisma.evidencePacket.upsert({
        where: { hash },
        create: {
          movieId: persisted.id,
          sourceName: 'Release Notes',
          url: `https://example.org/horror/${movie.tmdbId}`,
          snippet,
          retrievedAt: new Date('2026-01-01T00:00:00.000Z'),
          hash,
        },
        update: {
          snippet,
          retrievedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
      evidenceCount += 1;
    }
  }

  const movieCount = await prisma.movie.count();
  const totalRatings = await prisma.movieRating.count();
  const totalEvidence = await prisma.evidencePacket.count();

  return {
    movieCount,
    ratingCount: totalRatings || ratingCount,
    evidenceCount: totalEvidence || evidenceCount,
  };
}
