type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";

export interface CardData {
  id: string;
  rarity: Rarity;
  name: string;
  description: string;
  poster: string;
  rating: number;
  trailer?: string;
  imdb_link?: string;
  year?: number;
}

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

const getRarityByRating = (rating: number): Rarity => {
  if (rating >= 8.5) return "Legendary";
  if (rating >= 7.5) return "Epic";
  if (rating >= 6.5) return "Rare";
  if (rating >= 5.5) return "Uncommon";
  return "Common";
};

export const fetchRandomMovies = async (count: number = 5): Promise<CardData[]> => {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey) {
    console.error("TMDB API Key missing. Please set NEXT_PUBLIC_TMDB_API_KEY in .env.local");
    return []; // Return empty if no key
  }

  try {
    // 1. Determine how many pages we need (TMDB returns 20 per page)
    const pagesNeeded = Math.ceil(count / 20);
    const movieResults: any[] = [];
    
    // Fetch unique random pages
    const usedPages = new Set<number>();
    while (usedPages.size < pagesNeeded) {
      const randomPage = Math.floor(Math.random() * 100) + 1; 
      usedPages.add(randomPage);
    }

    const pageResponses = await Promise.all(
      Array.from(usedPages).map(page => 
        fetch(`${TMDB_BASE_URL}/movie/popular?api_key=${apiKey}&language=en-US&page=${page}`)
          .then(res => res.ok ? res.json() : { results: [] })
      )
    );

    pageResponses.forEach(data => {
      if (data.results) {
        movieResults.push(...data.results);
      }
    });

    if (movieResults.length === 0) return [];

    // 2. Shuffle and pick exactly `count` movies
    const shuffled = movieResults.sort(() => 0.5 - Math.random());
    const selectedMovies = shuffled.slice(0, count);

    // 3. Enhance with extra details in parallel
    const enrichedMovies: CardData[] = await Promise.all(
      selectedMovies.map(async (movie: any): Promise<CardData> => {
        let trailerUrl = "";
        let imdbId = "";

        // Fetch videos
        try {
          const videoRes = await fetch(`${TMDB_BASE_URL}/movie/${movie.id}/videos?api_key=${apiKey}&language=en-US`);
          if (videoRes.ok) {
            const videoData = await videoRes.json();
            const trailer = videoData.results.find((vid: any) => vid.type === "Trailer" && vid.site === "YouTube");
            if (trailer) {
              trailerUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
            }
          }
        } catch (e) { console.error(e) }

        // Fetch external IDs
        try {
          const extRes = await fetch(`${TMDB_BASE_URL}/movie/${movie.id}/external_ids?api_key=${apiKey}`);
          if (extRes.ok) {
            const extData = await extRes.json();
            if (extData.imdb_id) {
              imdbId = `https://www.imdb.com/title/${extData.imdb_id}`;
            }
          }
        } catch (e) { console.error(e) }

        let movieYear: number | undefined;
        if (movie.release_date) {
            movieYear = parseInt(movie.release_date.split('-')[0], 10);
        }

        return {
          id: movie.id.toString(),
          rarity: getRarityByRating(movie.vote_average),
          name: movie.original_title || movie.title,
          description: movie.overview,
          poster: movie.poster_path ? `${TMDB_IMAGE_BASE_URL}${movie.poster_path}` : "", // Fallback if null
          rating: movie.vote_average,
          trailer: trailerUrl,
          imdb_link: imdbId,
          year: movieYear,
        };
      })
    );

    // 4. Sort by rarity to maintain the dramatic reveal order (Common -> Legendary)
    const rarityOrder: Record<Rarity, number> = {
      Common: 0,
      Uncommon: 1,
      Rare: 2,
      Epic: 3,
      Legendary: 4,
    };

    return enrichedMovies.sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);

  } catch (error) {
    console.error("Error fetching TMDB movies:", error);
    return [];
  }
};
