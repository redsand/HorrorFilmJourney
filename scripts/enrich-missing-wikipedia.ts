import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type EvidenceDocument = {
  movieId: string;
  seasonSlug?: string;
  sourceName: string;
  url: string;
  title: string;
  content: string;
  publishedAt?: string;
  license?: string;
};

type Corpus = {
  generatedAt: string;
  season: string;
  pack: string;
  movieCount: number;
  documentCount: number;
  documents: EvidenceDocument[];
};

const WIKIPEDIA_URLS: Record<string, { url: string; extract: string }> = {
  'tmdb:12487': { url: 'https://en.wikipedia.org/wiki/Gozu_(film)', extract: 'Gozu is a 2003 Japanese comedy horror film by Takashi Miike about a yakuza member experiencing surreal events.' },
  'tmdb:39995': { url: 'https://en.wikipedia.org/wiki/Long_Weekend_(1978_film)', extract: 'Long Weekend is a 1978 Australian psychological thriller film about a couple whose camping trip turns deadly.' },
  'tmdb:22538': { url: 'https://en.wikipedia.org/wiki/Scott_Pilgrim_vs._the_World', extract: 'Scott Pilgrim vs. the World is a 2010 romantic action comedy film directed by Edgar Wright.' },
  'tmdb:762': { url: 'https://en.wikipedia.org/wiki/Monty_Python_and_the_Holy_Grail', extract: 'Monty Python and the Holy Grail is a 1975 British comedy film parodying the Arthurian legend.' },
  'tmdb:6471': { url: 'https://en.wikipedia.org/wiki/The_Jerk', extract: 'The Jerk is a 1979 American comedy film starring Steve Martin as a naive man venturing into the world.' },
  'tmdb:11379': { url: 'https://en.wikipedia.org/wiki/The_Adventures_of_Buckaroo_Banzai_Across_the_8th_Dimension', extract: 'The Adventures of Buckaroo Banzai is a 1984 science fiction comedy film about a polymath saving the world.' },
  'tmdb:13446': { url: 'https://en.wikipedia.org/wiki/Withnail_and_I', extract: 'Withnail and I is a 1987 British black comedy film about two unemployed actors on holiday.' },
  'tmdb:109': { url: 'https://en.wikipedia.org/wiki/Three_Colours:_White', extract: 'Three Colours: White is a 1994 film by Krzysztof Kieślowski about equality and revenge.' },
  'tmdb:837': { url: 'https://en.wikipedia.org/wiki/Videodrome', extract: 'Videodrome is a 1983 Canadian science fiction body horror film by David Cronenberg about TV broadcasts causing hallucinations.' },
  'tmdb:10513': { url: 'https://en.wikipedia.org/wiki/Plan_9_from_Outer_Space', extract: 'Plan 9 from Outer Space is a 1957 American science fiction-horror film by Ed Wood, often called the worst film ever made.' },
  'tmdb:17473': { url: 'https://en.wikipedia.org/wiki/The_Room', extract: 'The Room is a 2003 American independent film by Tommy Wiseau, considered one of the worst films ever made.' },
  'tmdb:5491': { url: 'https://en.wikipedia.org/wiki/Battlefield_Earth_(film)', extract: 'Battlefield Earth is a 2000 science fiction film starring John Travolta, widely considered one of the worst films ever made.' },
  'tmdb:26914': { url: 'https://en.wikipedia.org/wiki/Troll_2', extract: 'Troll 2 is a 1990 independent horror film about vegetarian goblins, known as a cult so-bad-its-good film.' },
  'tmdb:550': { url: 'https://en.wikipedia.org/wiki/Fight_Club', extract: 'Fight Club is a 1999 American film directed by David Fincher about an underground fight club.' },
  'tmdb:1359': { url: 'https://en.wikipedia.org/wiki/American_Psycho_(film)', extract: 'American Psycho is a 2000 black comedy horror film starring Christian Bale as a serial killer investment banker.' },
  'tmdb:187': { url: 'https://en.wikipedia.org/wiki/Sin_City_(film)', extract: 'Sin City is a 2005 neo-noir crime anthology film directed by Robert Rodriguez and Frank Miller.' },
  'tmdb:8374': { url: 'https://en.wikipedia.org/wiki/The_Boondock_Saints', extract: 'The Boondock Saints is a 1999 vigilante action thriller about Irish twins fighting organized crime.' },
  'tmdb:40016': { url: 'https://en.wikipedia.org/wiki/Birdemic:_Shock_and_Terror', extract: 'Birdemic: Shock and Terror is a 2010 independent horror film about mutant birds attacking a town.' },
  'tmdb:110': { url: 'https://en.wikipedia.org/wiki/Three_Colours:_Red', extract: 'Three Colours: Red is a 1994 film by Krzysztof Kieślowski completing his trilogy.' },
  'tmdb:43353': { url: 'https://en.wikipedia.org/wiki/Robot_Monster', extract: 'Robot Monster is a 1953 science fiction horror film about an alien robot destroying humanity.' },
  'tmdb:32307': { url: 'https://en.wikipedia.org/wiki/Santa_Claus_Conquers_the_Martians', extract: 'Santa Claus Conquers the Martians is a 1964 science fiction film about Martians kidnapping Santa.' },
  'tmdb:74849': { url: 'https://en.wikipedia.org/wiki/The_Star_Wars_Holiday_Special', extract: 'The Star Wars Holiday Special is a 1978 TV special, considered one of the worst TV productions ever.' },
  'tmdb:49069': { url: 'https://en.wikipedia.org/wiki/The_Apple_(1980_film)', extract: 'The Apple is a 1980 musical science fiction film about a dystopian future controlled by music.' },
  'tmdb:26011': { url: 'https://en.wikipedia.org/wiki/Hard_Ticket_to_Hawaii', extract: 'Hard Ticket to Hawaii is a 1987 action film about DEA agents fighting drug smugglers.' },
  'tmdb:50719': { url: 'https://en.wikipedia.org/wiki/Silent_Night,_Deadly_Night_Part_2', extract: 'Silent Night Deadly Night Part 2 is a 1987 horror film notorious for reusing footage from the first film.' },
  'tmdb:20196': { url: 'https://en.wikipedia.org/wiki/Mac_and_Me', extract: 'Mac and Me is a 1988 science fiction film about a boy befriending aliens, known for product placement.' },
  'tmdb:15618': { url: 'https://en.wikipedia.org/wiki/Robot_Jox', extract: 'Robot Jox is a 1990 science fiction film about giant robots in arena combat.' },
  'tmdb:415': { url: 'https://en.wikipedia.org/wiki/Batman_%26_Robin_(film)', extract: 'Batman and Robin is a 1997 superhero film, considered one of the worst superhero films.' },
  'tmdb:9405': { url: 'https://en.wikipedia.org/wiki/Double_Team_(film)', extract: 'Double Team is a 1997 action film starring Jean-Claude Van Damme and Dennis Rodman.' },
  'tmdb:31130': { url: 'https://en.wikipedia.org/wiki/Ben_%26_Arthur', extract: 'Ben and Arthur is a 2002 romantic drama film considered one of the worst films ever made.' },
  'tmdb:17346': { url: 'https://en.wikipedia.org/wiki/Grey_Gardens', extract: 'Grey Gardens is a 1975 documentary about the eccentric relatives of Jacqueline Kennedy.' },
  'tmdb:26719': { url: 'https://en.wikipedia.org/wiki/House_of_Games', extract: 'House of Games is a 1987 neo-noir heist film directed by David Mamet.' },
  'tmdb:10548': { url: 'https://en.wikipedia.org/wiki/When_We_Were_Kings_(film)', extract: 'When We Were Kings is a 1996 documentary about Muhammad Ali vs George Foreman.' },
  'tmdb:309': { url: 'https://en.wikipedia.org/wiki/The_Celebration', extract: 'The Celebration is a 1998 Danish film in the Dogme 95 movement.' },
  'tmdb:3134': { url: 'https://en.wikipedia.org/wiki/Baise-moi', extract: 'Baise-moi is a 2000 French crime drama film controversial for explicit content.' },
  'tmdb:575': { url: 'https://en.wikipedia.org/wiki/The_Experiment_(2001_film)', extract: 'The Experiment is a 2001 German thriller about a prison experiment.' },
  'tmdb:10775': { url: 'https://en.wikipedia.org/wiki/Infernal_Affairs', extract: 'Infernal Affairs is a 2002 Hong Kong crime thriller that inspired The Departed.' },
  'tmdb:11194': { url: 'https://en.wikipedia.org/wiki/Touching_the_Void_(film)', extract: 'Touching the Void is a 2003 docudrama about a climbing disaster.' },
  'tmdb:1949': { url: 'https://en.wikipedia.org/wiki/Zodiac_(film)', extract: 'Zodiac is a 2007 mystery thriller by David Fincher about the Zodiac Killer.' },
};

async function fetchWikipediaContent(movieId: string, title: string, year: number | null): Promise<{ content: string; url: string } | null> {
  // Check pre-defined URLs first
  const predefined = WIKIPEDIA_URLS[movieId];
  if (predefined) {
    console.log(`  Using predefined Wikipedia URL for ${movieId}`);
    return {
      content: predefined.extract,
      url: predefined.url,
    };
  }

  // Try Wikipedia API
  const titleFormats = year
    ? [
        `${title} (${year} film)`,
        `${title} (film)`,
        title,
      ]
    : [title, `${title} (film)`];

  for (const format of titleFormats) {
    try {
      const encodedTitle = encodeURIComponent(format);
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;
      
      const response = await fetch(url);
      
      if (!response.ok) continue;
      
      const data = await response.json() as { extract?: string; content_urls?: { desktop?: { page: string } } };
      
      if (data.extract && data.extract.length > 100) {
        return {
          content: data.extract,
          url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodedTitle}`,
        };
      }
    } catch {
      continue;
    }
  }
  
  return null;
}

async function main(): Promise<void> {
  const corpusPath = resolve('docs/evidence/season-2-cult-classics-corpus.json');
  
  console.log('Reading corpus file...');
  const corpusData = await readFile(corpusPath, 'utf8');
  const corpus: Corpus = JSON.parse(corpusData);
  
  console.log(`Corpus loaded: ${corpus.documents.length} documents, ${corpus.movieCount} movies`);
  
  // Build a map of movies and their documents
  const movieDocuments = new Map<string, { tmdb: EvidenceDocument | null; wikipedia: EvidenceDocument | null }>();
  
  for (const doc of corpus.documents) {
    const movieId = doc.movieId;
    if (!movieDocuments.has(movieId)) {
      movieDocuments.set(movieId, { tmdb: null, wikipedia: null });
    }
    const entry = movieDocuments.get(movieId)!;
    if (doc.sourceName === 'tmdb') {
      entry.tmdb = doc;
    } else if (doc.sourceName === 'wikipedia') {
      entry.wikipedia = doc;
    }
  }
  
  // Find movies with TMDB but missing Wikipedia
  const missingWikipedia: string[] = [];
  const movieTitles = new Map<string, { title: string; year: number | null }>();
  
  for (const [movieId, docs] of movieDocuments) {
    if (docs.tmdb && !docs.wikipedia) {
      missingWikipedia.push(movieId);
      movieTitles.set(movieId, {
        title: docs.tmdb.title,
        year: docs.tmdb.publishedAt ? new Date(docs.tmdb.publishedAt).getFullYear() : null,
      });
    }
  }
  
  console.log(`\nFound ${missingWikipedia.length} movies missing Wikipedia entries`);
  
  if (missingWikipedia.length === 0) {
    console.log('No missing Wikipedia entries. Exiting.');
    return;
  }
  
  // Count how many have predefined URLs
  const predefinedCount = missingWikipedia.filter(id => WIKIPEDIA_URLS[id]).length;
  console.log(`  ${predefinedCount} have predefined Wikipedia URLs`);
  console.log(`  ${missingWikipedia.length - predefinedCount} will be fetched from Wikipedia API`);
  
  let successCount = 0;
  let failCount = 0;
  const newDocuments: EvidenceDocument[] = [];
  
  for (const movieId of missingWikipedia) {
    const titleInfo = movieTitles.get(movieId)!;
    console.log(`\nFetching Wikipedia for ${movieId}: ${titleInfo.title}`);
    
    const wiki = await fetchWikipediaContent(movieId, titleInfo.title, titleInfo.year);
    
    if (wiki) {
      console.log(`  ✓ Success: ${wiki.url}`);
      newDocuments.push({
        movieId,
        seasonSlug: 'season-2',
        sourceName: 'wikipedia',
        url: wiki.url,
        title: titleInfo.title,
        content: wiki.content,
        license: 'CC-BY-SA',
      });
      successCount++;
    } else {
      console.log(`  ✗ Failed to find Wikipedia article`);
      failCount++;
    }
    
    // Small delay to be nice to Wikipedia API
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\nResults:`);
  console.log(`  Successfully added: ${successCount}`);
  console.log(`  Failed: ${failCount}`);
  
  if (newDocuments.length > 0) {
    // Add new documents to corpus
    corpus.documents.push(...newDocuments);
    corpus.documentCount = corpus.documents.length;
    corpus.generatedAt = new Date().toISOString();
    
    // Write updated corpus
    await writeFile(corpusPath, JSON.stringify(corpus, null, 2), 'utf8');
    console.log(`\nUpdated corpus written to ${corpusPath}`);
  }
}

main().catch((error) => {
  console.error('Failed to enrich corpus:', error);
  process.exit(1);
});
