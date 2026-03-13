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
  name: string;
  buildUrl: (target: string) => string;
  extractBody: (json: Record<string, unknown>) => string;
}> = [
  {
    name: "corsproxy.io",
    // corsproxy.io — simple prefix, very reliable usually
    buildUrl: (target) => `https://corsproxy.io/?${encodeURIComponent(target)}`,
    extractBody: () => { throw new Error("raw"); },
  },
  {
    name: "allorigins",
    // allorigins.win — wraps response in JSON { contents: "..." }
    buildUrl: (target) =>
      `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
    extractBody: (json) => (json as { contents?: string }).contents ?? "",
  },
  {
    name: "codetabs",
    // codetabs.com/cors-proxy/ — another alternative
    buildUrl: (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    extractBody: () => { throw new Error("raw"); },
  },
  {
    name: "corsproxy.org",
    // corsproxy.org — simple prefix
    buildUrl: (target) => `https://corsproxy.org/?url=${encodeURIComponent(target)}`,
    extractBody: () => { throw new Error("raw"); },
  },
  {
    name: "yacdn",
    // yacdn.org — simple prefix
    buildUrl: (target) => `https://yacdn.org/proxy/${target}`,
    extractBody: () => { throw new Error("raw"); },
  }
];

const TARGET_URL = "https://motherless.com/random/image";

/**
 * Tries each CORS proxy in sequence, returning the HTML body on the first
 * successful response. Returns null if all proxies fail.
 */
const fetchViaProxy = async (targetUrl: string): Promise<string | null> => {
  // Shuffle proxies every time to avoid hitting the same one for all parallel requests
  const proxies = [...CORS_PROXIES].sort(() => Math.random() - 0.5);
  
  for (const proxy of proxies) {
    try {
      const proxyUrl = proxy.buildUrl(targetUrl);
      const controller = new AbortController();
      // Increase timeout slightly for distant proxies
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(proxyUrl, {
        cache: "no-store",
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`Proxy ${proxy.name} returned status ${response.status}`);
        continue;
      }

      let html: string;
      try {
        // Some proxies (allorigins) return JSON
        const responseClone = response.clone();
        const text = await responseClone.text();
        if (text.trim().startsWith('{')) {
          const json = JSON.parse(text) as Record<string, unknown>;
          html = proxy.extractBody(json);
        } else {
          html = text;
        }
      } catch {
        html = await response.text();
      }

      // Check if we actually got motherless content, not a "too many requests" or "block" page
      if (html && html.length > 500 && html.toLowerCase().includes("motherless")) {
        return html;
      } else {
        console.warn(`Proxy ${proxy.name} returned invalid or short HTML (${html?.length ?? 0} chars)`);
      }
    } catch (err) {
      console.warn(`Proxy ${proxy.name} failed:`, err);
      continue;
    }
  }

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
    const cacheBuster = `?t=${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const targetWithBuster = TARGET_URL + cacheBuster;
    
    const html = await fetchViaProxy(targetWithBuster);
    if (!html) return null;

    // --- Parse canonical URL ---
    const canonicalMatch =
      html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i) ||
      html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i);
    const sourceUrl = canonicalMatch ? canonicalMatch[1] : TARGET_URL;

    // Extract image ID
    const idMatch = sourceUrl.match(/motherless\.com\/([A-Z0-9]+)/i);
    const id = idMatch ? idMatch[1] : `ml_${Date.now()}_${Math.random()}`;

    // --- Parse image URL ---
    const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    const imageUrl = ogImageMatch ? ogImageMatch[1] : "";
    if (!imageUrl) {
      console.warn("Failed to find imageUrl in HTML for ID:", id);
      return null;
    }

    // --- Parse title ---
    const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    const h1Match = html.match(/<h1[^>]*class="[^"]*media-title[^"]*"[^>]*>([^<]+)<\/h1>/i);
    const titleTagMatch = html.match(/<title>([^<]+)<\/title>/i);
    let name = ogTitleMatch
      ? ogTitleMatch[1]
      : h1Match
      ? h1Match[1]
      : titleTagMatch
      ? titleTagMatch[1].replace(/\s*\|\s*MOTHERLESS\.COM.*$/i, "").trim()
      : "Untitled";
    
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
 * Ensures that all returned cards in the batch have unique IDs.
 */
export const fetchRandomImages = async (count: number = 5): Promise<CardData[]> => {
  const uniqueIds = new Set<string>();
  const cards: CardData[] = [];
  
  // We'll attempt to fill the batch until we have 'count' cards or hit a hard limit
  const maxTotalAttempts = count * 5;
  let attempts = 0;

  const fetchCardWithRetry = async (index: number): Promise<CardData | null> => {
    // Staggering keeps requests distinct for the CDN/Proxy
    // Increased to 400ms for better reliability on GitHub Pages
    if (index > 0) await sleep(index * 400);
    
    // Up to 3 attempts for this specific slot
    for (let slotAttempt = 0; slotAttempt < 3; slotAttempt++) {
      if (slotAttempt > 0) await sleep(600);
      
      const card = await fetchOneImage();
      if (card && !uniqueIds.has(card.id)) {
        uniqueIds.add(card.id);
        return card;
      }
      if (card) console.log(`Discarded duplicate ID: ${card.id}`);
    }
    return null;
  };

  // We fetch sequentially or in small chunks to properly handle the uniqueId set
  // This is slightly slower than pure parallel but prevents the "parallel race" where 
  // two requests get the same ID at the same time and both "passed" the check.
  for (let i = 0; i < count && attempts < maxTotalAttempts; i++) {
    const card = await fetchCardWithRetry(i);
    if (card) {
      cards.push(card);
    }
    attempts++;
  }

  if (cards.length === 0) {
    console.error("Failed to fetch any unique cards.");
  }

  return cards.sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);
};
