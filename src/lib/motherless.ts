type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";

export interface CardData {
  id: string;
  rarity: Rarity;
  name: string;
  imageUrl: string;
  sourceUrl: string;
  views: number;
  favorites: number;
}

/**
 * CORS proxy configuration.
 * Each proxy has a different URL format. We try them in order until one works.
 */
const CORS_PROXIES: Array<{
  buildUrl: (target: string) => string;
  extractBody: (json: Record<string, unknown>) => string;
}> = [
  {
    // corsproxy.io — free tier, 10k req/month, simple prefix
    buildUrl: (target) => `https://corsproxy.io/?${encodeURIComponent(target)}`,
    // corsproxy.io returns the raw response, not a JSON wrapper
    extractBody: () => { throw new Error("raw"); },
  },
  {
    // allorigins.win — wraps response in JSON { contents: "..." }
    buildUrl: (target) =>
      `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
    extractBody: (json) => (json as { contents?: string }).contents ?? "",
  },
  {
    // cors.lol — simple prefix, returns raw body
    buildUrl: (target) => `https://api.cors.lol/?url=${encodeURIComponent(target)}`,
    extractBody: () => { throw new Error("raw"); },
  },
];

const TARGET_URL = "https://motherless.com/random/image";

/**
 * Tries each CORS proxy in sequence, returning the HTML body on the first
 * successful response. Returns null if all proxies fail.
 */
const fetchViaProxy = async (): Promise<string | null> => {
  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = proxy.buildUrl(TARGET_URL);
      const response = await fetch(proxyUrl, {
        // Avoid caching so we always get a fresh random image
        cache: "no-store",
      });

      if (!response.ok) continue;

      let html: string;
      // Some proxies return raw HTML directly; others wrap in JSON
      try {
        const json = await response.clone().json() as Record<string, unknown>;
        html = proxy.extractBody(json);
      } catch {
        // Proxy returns raw HTML (not JSON-wrapped)
        html = await response.text();
      }

      if (html && html.length > 100) {
        return html;
      }
    } catch {
      // This proxy failed; try the next one
      continue;
    }
  }

  console.warn("All CORS proxies failed for motherless.com");
  return null;
};

/**
 * Computes rarity based on favorites-to-views ratio.
 * The fewer views and the more favorites → the rarer.
 */
const getRarityByScore = (views: number, favorites: number): Rarity => {
  const score = favorites / Math.max(views, 1);
  if (score >= 0.05) return "Legendary";
  if (score >= 0.02) return "Epic";
  if (score >= 0.01) return "Rare";
  if (score >= 0.005) return "Uncommon";
  return "Common";
};

/**
 * Parses a number string like "1,234" or "12K" into a plain number.
 */
const parseCount = (str: string): number => {
  if (!str) return 0;
  const clean = str.trim().replace(/,/g, "");
  if (clean.toUpperCase().endsWith("K")) {
    return Math.round(parseFloat(clean) * 1000);
  }
  if (clean.toUpperCase().endsWith("M")) {
    return Math.round(parseFloat(clean) * 1_000_000);
  }
  const n = parseInt(clean, 10);
  return isNaN(n) ? 0 : n;
};

/**
 * Fetches a single random image from motherless.com via CORS proxy fallback chain.
 * Returns null if all proxies fail or parsing fails.
 */
const fetchOneImage = async (): Promise<CardData | null> => {
  try {
    const html = await fetchViaProxy();
    if (!html) return null;

    // --- Parse canonical URL (the actual image page URL after redirect) ---
    const canonicalMatch =
      html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i) ||
      html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i);
    const sourceUrl = canonicalMatch ? canonicalMatch[1] : TARGET_URL;

    // Extract the image ID from the canonical URL for a stable ID
    const idMatch = sourceUrl.match(/motherless\.com\/([A-Z0-9]+)/i);
    const id = idMatch ? idMatch[1] : `ml_${Date.now()}_${Math.random()}`;

    // --- Parse image URL ---
    const ogImageMatch = html.match(
      /<meta\s+property="og:image"\s+content="([^"]+)"/i
    );
    const imageUrl = ogImageMatch ? ogImageMatch[1] : "";
    if (!imageUrl) return null;

    // --- Parse title ---
    const ogTitleMatch = html.match(
      /<meta\s+property="og:title"\s+content="([^"]+)"/i
    );
    const h1Match = html.match(
      /<h1[^>]*class="[^"]*media-title[^"]*"[^>]*>([^<]+)<\/h1>/i
    );
    const titleTagMatch = html.match(/<title>([^<]+)<\/title>/i);
    let name = ogTitleMatch
      ? ogTitleMatch[1]
      : h1Match
      ? h1Match[1]
      : titleTagMatch
      ? titleTagMatch[1].replace(/\s*\|\s*MOTHERLESS\.COM.*$/i, "").trim()
      : "Untitled";
    // Clean HTML entities
    name = name
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

    // --- Parse views ---
    let views = 0;
    const viewsBlockMatch =
      html.match(
        /views[^<]*<[^>]+class="[^"]*count[^"]*"[^>]*>([\d,KkMm.]+)</i
      ) ||
      html.match(
        /<span[^>]*>Views<\/span>[^<]*<span[^>]*>([\d,KkMm.]+)<\/span>/i
      ) ||
      html.match(/class="[^"]*views[^"]*"[^>]*>\s*([\d,KkMm.]+)/i);
    if (viewsBlockMatch) {
      views = parseCount(viewsBlockMatch[1]);
    }

    // --- Parse favorites ---
    let favorites = 0;
    const favBlockMatch =
      html.match(
        /favorited[^<]*<[^>]+class="[^"]*count[^"]*"[^>]*>([\d,KkMm.]+)</i
      ) ||
      html.match(
        /<span[^>]*>Favorites<\/span>[^<]*<span[^>]*>([\d,KkMm.]+)<\/span>/i
      ) ||
      html.match(/class="[^"]*favorites[^"]*"[^>]*>\s*([\d,KkMm.]+)/i) ||
      html.match(/id="[^"]*favorite[^"]*-count[^"]*"[^>]*>\s*([\d,KkMm.]+)/i);
    if (favBlockMatch) {
      favorites = parseCount(favBlockMatch[1]);
    }

    return {
      id,
      rarity: getRarityByScore(views, favorites),
      name,
      imageUrl,
      sourceUrl,
      views,
      favorites,
    };
  } catch (e) {
    console.error("Error fetching motherless image:", e);
    return null;
  }
};

const rarityOrder: Record<Rarity, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  Epic: 3,
  Legendary: 4,
};

/**
 * Fetches `count` random images from motherless.com, in parallel.
 * Images are sorted from lowest to highest rarity for the dramatic reveal.
 */
export const fetchRandomImages = async (count: number = 5): Promise<CardData[]> => {
  // Fetch in parallel but stagger slightly so that different random pages load
  const results = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      new Promise<CardData | null>((resolve) =>
        setTimeout(() => fetchOneImage().then(resolve), i * 150)
      )
    )
  );

  const cards = results.filter((c): c is CardData => c !== null);

  // Sort lowest → highest rarity for reveal order (Common first, Legendary last)
  return cards.sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);
};
