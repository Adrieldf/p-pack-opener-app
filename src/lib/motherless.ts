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
const fetchViaProxy = async (targetUrl: string): Promise<string | null> => {
  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = proxy.buildUrl(targetUrl);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(proxyUrl, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0"
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) continue;

      let html: string;
      try {
        const json = await response.clone().json() as Record<string, unknown>;
        html = proxy.extractBody(json);
      } catch {
        html = await response.text();
      }

      if (html && html.length > 100) {
        return html;
      }
    } catch {
      continue;
    }
  }

  console.warn("All CORS proxies failed for motherless.com");
  return null;
};

/**
 * Computes rarity based on the number of views.
 * Fewer views = Rarer.
 */
const getRarityByViews = (views: number): Rarity => {
  if (views < 50) return "Legendary";
  if (views < 100) return "Epic";
  if (views < 500) return "Rare";
  if (views < 1000) return "Uncommon";
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
    // Add a unique timestamp and random salt to ensure the proxy and server
    // treat each parallel request as a distinct event.
    const cacheBuster = `?t=${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const targetWithBuster = TARGET_URL + cacheBuster;
    
    const html = await fetchViaProxy(targetWithBuster);
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
    const viewsMatch =
      html.match(/<span[^>]*class="[^"]*count[^"]*"[^>]*>([\d,KkMm.]+)\s*Views/i) ||
      html.match(/([\d,KkMm.]+)\s*Views/i);
    if (viewsMatch) {
      views = parseCount(viewsMatch[1]);
    }

    // --- Parse favorites ---
    let favorites = 0;
    const favMatch =
      html.match(/<span[^>]*class="[^"]*count[^"]*"[^>]*>([\d,KkMm.]+)\s*Favorites?/i) ||
      html.match(/([\d,KkMm.]+)\s*Favorites?/i);
    if (favMatch) {
      favorites = parseCount(favMatch[1]);
    }

    return {
      id,
      rarity: getRarityByViews(views),
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetches `count` random images from motherless.com in parallel.
 * Images are sorted from lowest to highest rarity for the dramatic reveal.
 */
export const fetchRandomImages = async (count: number = 5): Promise<CardData[]> => {
  const fetchCardWithRetry = async (index: number): Promise<CardData | null> => {
    // Stagger the parallel requests (1000ms apart)
    // This ensures they hit the server at different times to get unique random results
    if (index > 0) await sleep(index * 1000);
    
    let card: CardData | null = null;
    // Up to 2 attempts per card
    for (let attempt = 0; attempt < 2 && !card; attempt++) {
      if (attempt > 0) await sleep(500);
      card = await fetchOneImage();
    }
    return card;
  };

  // Start all fetches with staggering
  const cardPromises = Array.from({ length: count }, (_, i) => fetchCardWithRetry(i));
  const results = await Promise.all(cardPromises);
  
  const cards = results.filter((c): c is CardData => c !== null);

  // Sort lowest → highest rarity for reveal order (Common first, Legendary last)
  return cards.sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);
};
