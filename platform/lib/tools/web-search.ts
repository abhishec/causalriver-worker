/**
 * Web Search Tool — Brave Search API
 * ===================================
 * GAIA-ready: searches the live web for real-time information.
 * Uses Brave Search API (already inlined in next.config.ts).
 * Returns structured results: title, url, description, publishedDate.
 */

import { logger } from "@/lib/logger";

const BRAVE_SEARCH_API_KEY = process.env.BRAVE_SEARCH_API_KEY;

export interface WebSearchResult {
  title: string;
  url: string;
  description: string;
  publishedDate?: string;
}

export interface WebSearchOutput {
  results: WebSearchResult[];
  answer?: string; // Direct answer if Brave returns one
  count: number;
  error?: string;
}

/**
 * Search the live web via Brave Search API.
 * Returns up to `maxResults` structured results.
 * Never throws — returns { results: [], error } on failure.
 */
export async function searchWeb(
  query: string,
  options: { maxResults?: number; searchDepth?: "basic" | "advanced" } = {},
): Promise<WebSearchOutput> {
  const { maxResults = 5 } = options;

  if (!BRAVE_SEARCH_API_KEY) {
    logger.warn("[tools/web-search] BRAVE_SEARCH_API_KEY not configured");
    return { results: [], count: 0, error: "BRAVE_SEARCH_API_KEY not configured" };
  }

  const q = String(query ?? "").trim();
  if (!q) return { results: [], count: 0, error: "query is required" };

  const count = Math.min(maxResults, 20);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

    let resp: Response;
    try {
      resp = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${count}`,
        {
          headers: {
            "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
            Accept: "application/json",
          },
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      logger.warn("[tools/web-search] Brave API error", { status: resp.status });
      return { results: [], count: 0, error: `Brave Search API error ${resp.status}` };
    }

    const data = await resp.json() as {
      web?: { results?: Array<{ title: string; url: string; description: string; age?: string }> };
      summarizer?: { summary?: string };
    };

    const results: WebSearchResult[] = (data.web?.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      description: r.description ?? "",
      publishedDate: r.age,
    }));

    return {
      results,
      count: results.length,
      answer: data.summarizer?.summary,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[tools/web-search] Fetch error", { error: msg });
    return { results: [], count: 0, error: msg };
  }
}
