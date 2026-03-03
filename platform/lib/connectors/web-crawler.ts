/**
 * HTTP-based Web Crawler (ADR-029 Phase 2)
 * =========================================
 *
 * Pure fetch()-based crawler — no headless browser, no Puppeteer.
 * Lambda-compatible: only standard fetch() + regex-based HTML extraction.
 *
 * Features:
 *   - BFS traversal from seed URLs up to maxDepth hops
 *   - robots.txt compliance (fetches and parses before crawling)
 *   - Configurable allowed domains, max pages, max depth, URL exclusion patterns
 *   - HTML to plain text extraction using regex (no cheerio dependency)
 *   - 500ms rate limit delay between requests
 *   - Generator-based API for streaming progress without blocking
 *
 * Usage:
 *   const config: CrawlConfig = {
 *     seedUrls: ["https://docs.example.com"],
 *     maxDepth: 2,
 *     maxPages: 100,
 *     allowedDomains: ["docs.example.com"],
 *   };
 *   for await (const page of crawlWebsites(config)) {
 *     await ingestDocument(supabase, { content: page.textContent, ... });
 *   }
 */

import { logger } from "@/lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────

/** Milliseconds to wait between HTTP requests (rate limiting). */
const REQUEST_DELAY_MS = 500;

/** Maximum bytes to read from a single page (5 MB safety cap). */
const MAX_PAGE_BYTES = 5 * 1024 * 1024;

/** HTTP fetch timeout per page. */
const FETCH_TIMEOUT_MS = 15_000;

// ── Types ──────────────────────────────────────────────────────────────────

export interface CrawlConfig {
  /** Starting URLs for the BFS crawl. */
  seedUrls: string[];
  /**
   * Maximum link hops from a seed URL.
   * Depth 0 = only the seed pages themselves.
   * Depth 2 = seeds + pages they link to + one more hop.
   * Default: 2.
   */
  maxDepth?: number;
  /** Maximum total pages to crawl across all seeds. Default: 100. */
  maxPages?: number;
  /**
   * If provided, only follow links whose hostname is in this set.
   * Seed URL hostnames are implicitly allowed even if not listed.
   */
  allowedDomains?: string[];
  /**
   * URL patterns to skip. Tested as substring match against the full URL.
   * E.g. ["/api/", "?print=", ".pdf", "mailto:"]
   */
  excludePatterns?: string[];
  /** HTTP headers to include with every request (e.g. auth cookies). */
  requestHeaders?: Record<string, string>;
}

export interface CrawledPage {
  /** Absolute URL of the page. */
  url: string;
  /** Content of the <title> element, or the URL path if not found. */
  title: string;
  /** Plain text extracted from the page body (scripts/styles stripped). */
  textContent: string;
  /** HTTP status code. */
  statusCode: number;
  /** Depth at which this page was found (0 = seed URL). */
  depth: number;
}

export interface CrawlProgress {
  pagesVisited: number;
  pagesQueued: number;
  pagesSkipped: number;
}

// ── robots.txt parser ──────────────────────────────────────────────────────

interface RobotsTxt {
  disallowedPaths: string[];
  crawlDelay?: number;
}

async function fetchRobotsTxt(baseUrl: string): Promise<RobotsTxt> {
  try {
    const url = new URL("/robots.txt", baseUrl).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      headers: { "User-Agent": "BrainOS-Crawler/1.0 (knowledge indexer)" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      // No robots.txt or inaccessible — no restrictions
      return { disallowedPaths: [] };
    }

    const text = await response.text();
    return parseRobotsTxt(text);
  } catch {
    // Network error or timeout — assume no restrictions
    return { disallowedPaths: [] };
  }
}

/**
 * Parse robots.txt text. Extracts Disallow rules for the generic "*" user-agent
 * and the BrainOS user-agent (if present). Also reads Crawl-delay.
 */
function parseRobotsTxt(text: string): RobotsTxt {
  const lines = text.split("\n").map((l) => l.trim());
  const disallowedPaths: string[] = [];
  let crawlDelay: number | undefined;
  let applicableSection = false;

  for (const line of lines) {
    // Strip comments
    const cleanLine = line.split("#")[0].trim();
    if (!cleanLine) continue;

    if (cleanLine.toLowerCase().startsWith("user-agent:")) {
      const agent = cleanLine.slice("user-agent:".length).trim().toLowerCase();
      applicableSection = agent === "*" || agent.includes("brainos");
    } else if (applicableSection && cleanLine.toLowerCase().startsWith("disallow:")) {
      const path = cleanLine.slice("disallow:".length).trim();
      if (path) {
        disallowedPaths.push(path);
      }
    } else if (applicableSection && cleanLine.toLowerCase().startsWith("crawl-delay:")) {
      const delay = parseFloat(cleanLine.slice("crawl-delay:".length).trim());
      if (!isNaN(delay)) {
        crawlDelay = delay * 1000; // Convert seconds to ms
      }
    }
  }

  return { disallowedPaths, crawlDelay };
}

function isAllowedByRobots(urlPath: string, robots: RobotsTxt): boolean {
  for (const disallowed of robots.disallowedPaths) {
    if (urlPath.startsWith(disallowed)) {
      return false;
    }
  }
  return true;
}

// ── HTML extraction ────────────────────────────────────────────────────────

/**
 * Extract the <title> text from HTML.
 * Returns the URL pathname as fallback when no title is present.
 */
function extractTitle(html: string, fallbackUrl: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    return decodeHtmlEntities(titleMatch[1].trim()).slice(0, 200);
  }
  try {
    return new URL(fallbackUrl).pathname.split("/").filter(Boolean).join(" / ") || fallbackUrl;
  } catch {
    return fallbackUrl;
  }
}

/**
 * Extract plain text from HTML without any external dependencies.
 *
 * Strategy:
 *   1. Remove <script>, <style>, <head>, <nav>, <footer> blocks entirely
 *   2. Replace block-level closing tags with newlines to preserve paragraph structure
 *   3. Replace <br> with newline
 *   4. Strip all remaining tags
 *   5. Decode HTML entities
 *   6. Collapse whitespace
 */
function extractTextContent(html: string): string {
  // 1. Remove entire blocks we don't want
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // 2. Add newlines before block-level elements to separate content
  text = text
    .replace(/<\/(p|div|section|article|li|tr|blockquote|h[1-6])>/gi, "\n")
    .replace(/<(p|div|section|article|li|tr|blockquote|h[1-6])[^>]*>/gi, "\n");

  // 3. Replace <br> variants with newline
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // 4. Replace table cells/headers with space separator
  text = text.replace(/<\/(td|th)>/gi, " | ");

  // 5. Strip all remaining tags
  text = text.replace(/<[^>]+>/g, " ");

  // 6. Decode HTML entities
  text = decodeHtmlEntities(text);

  // 7. Normalize whitespace: collapse multiple spaces, preserve paragraph breaks
  text = text
    .replace(/[ \t]+/g, " ")         // collapse horizontal whitespace
    .replace(/\n{3,}/g, "\n\n")      // max 2 consecutive newlines
    .replace(/^\s+|\s+$/gm, "")      // trim each line
    .trim();

  return text;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Extract all absolute href links from an HTML document.
 * Resolves relative URLs against baseUrl.
 * Returns only http/https links.
 */
function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const hrefRegex = /href=["']([^"'#?][^"']*?)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1].trim();
    if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) {
      continue;
    }
    try {
      const resolved = new URL(href, baseUrl).toString();
      // Only http/https — skip ftp, data URIs, etc.
      if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
        // Strip fragment identifiers (same-page anchors)
        links.push(resolved.split("#")[0]);
      }
    } catch {
      // Malformed URL — skip
    }
  }

  // Deduplicate
  return [...new Set(links)];
}

// ── URL filtering ──────────────────────────────────────────────────────────

function shouldExcludeUrl(url: string, excludePatterns: string[]): boolean {
  // Skip common non-content resources
  const staticExtensions = [
    ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico",
    ".mp4", ".mp3", ".wav", ".zip", ".tar", ".gz",
    ".woff", ".woff2", ".ttf", ".eot",
    ".css",
  ];
  const lowerUrl = url.toLowerCase();
  if (staticExtensions.some((ext) => lowerUrl.endsWith(ext))) {
    return true;
  }

  // User-defined exclusion patterns (substring match)
  for (const pattern of excludePatterns) {
    if (url.includes(pattern)) {
      return true;
    }
  }

  return false;
}

function isAllowedDomain(url: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true;
  try {
    const hostname = new URL(url).hostname;
    return allowedDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

// ── Core crawler ───────────────────────────────────────────────────────────

/**
 * Crawl websites starting from seed URLs using BFS.
 *
 * This is an async generator: yield each crawled page so the caller can
 * process/ingest pages incrementally without waiting for the entire crawl.
 *
 * The optional onProgress callback is called after each page is processed.
 *
 * @example
 * for await (const page of crawlWebsites(config, onProgress)) {
 *   await ingestDocument(supabase, { content: page.textContent, ... });
 * }
 */
export async function* crawlWebsites(
  config: CrawlConfig,
  onProgress?: (progress: CrawlProgress) => void,
): AsyncGenerator<CrawledPage> {
  const {
    seedUrls,
    maxDepth = 2,
    maxPages = 100,
    allowedDomains = [],
    excludePatterns = [],
    requestHeaders = {},
  } = config;

  if (seedUrls.length === 0) {
    logger.warn("[web-crawler] No seed URLs provided — nothing to crawl");
    return;
  }

  // Build effective allowed domains from seed URLs + explicit config
  const effectiveAllowedDomains = [...allowedDomains];
  for (const url of seedUrls) {
    try {
      const hostname = new URL(url).hostname;
      if (!effectiveAllowedDomains.includes(hostname)) {
        effectiveAllowedDomains.push(hostname);
      }
    } catch {
      // Ignore malformed seed URLs
    }
  }

  // Robots.txt cache: one per origin
  const robotsCache = new Map<string, RobotsTxt>();

  // Visited set: deduplicate across the entire crawl
  const visited = new Set<string>();

  // BFS queue: [url, depth]
  const queue: Array<[string, number]> = seedUrls.map((url) => [url, 0]);

  let pagesVisited = 0;
  let pagesSkipped = 0;

  logger.warn("[web-crawler] Starting crawl", {
    seeds: seedUrls.length,
    maxDepth,
    maxPages,
    allowedDomains: effectiveAllowedDomains,
  });

  while (queue.length > 0 && pagesVisited < maxPages) {
    const next = queue.shift();
    if (!next) break;
    const [url, depth] = next;

    // Normalise URL (remove fragment, trailing slash normalisation)
    const normalizedUrl = url.split("#")[0].replace(/\/$/, "") || url;

    if (visited.has(normalizedUrl)) {
      pagesSkipped++;
      continue;
    }
    visited.add(normalizedUrl);

    // Domain check
    if (!isAllowedDomain(normalizedUrl, effectiveAllowedDomains)) {
      pagesSkipped++;
      continue;
    }

    // Exclusion pattern check
    if (shouldExcludeUrl(normalizedUrl, excludePatterns)) {
      pagesSkipped++;
      continue;
    }

    // Robots.txt check (cached per origin)
    let robots: RobotsTxt;
    try {
      const origin = new URL(normalizedUrl).origin;
      if (!robotsCache.has(origin)) {
        robotsCache.set(origin, await fetchRobotsTxt(origin));
        // Brief pause after fetching robots.txt
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      robots = robotsCache.get(origin)!;
    } catch {
      robots = { disallowedPaths: [] };
    }

    const urlPath = new URL(normalizedUrl).pathname;
    if (!isAllowedByRobots(urlPath, robots)) {
      logger.warn("[web-crawler] Skipped by robots.txt", { url: normalizedUrl });
      pagesSkipped++;
      continue;
    }

    // ── Fetch the page ───────────────────────────────────────────────────
    let html: string;
    let statusCode: number;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(normalizedUrl, {
        headers: {
          "User-Agent": "BrainOS-Crawler/1.0 (knowledge indexer)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en",
          ...requestHeaders,
        },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);

      statusCode = response.status;

      // Skip non-HTML content types
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
        pagesSkipped++;
        continue;
      }

      // Size guard
      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > MAX_PAGE_BYTES) {
        logger.warn("[web-crawler] Page too large, skipping", {
          url: normalizedUrl,
          size: contentLength,
        });
        pagesSkipped++;
        continue;
      }

      if (!response.ok) {
        logger.warn("[web-crawler] Non-OK response", { url: normalizedUrl, status: statusCode });
        pagesSkipped++;
        continue;
      }

      html = await response.text();

      // Enforce size cap after reading
      if (html.length > MAX_PAGE_BYTES) {
        html = html.slice(0, MAX_PAGE_BYTES);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[web-crawler] Fetch failed", { url: normalizedUrl, error: msg });
      pagesSkipped++;
      continue;
    }

    // ── Extract content ──────────────────────────────────────────────────
    const title = extractTitle(html, normalizedUrl);
    const textContent = extractTextContent(html);

    // Skip pages with trivially short content (e.g. error pages, redirects)
    if (textContent.length < 50) {
      pagesSkipped++;
      continue;
    }

    pagesVisited++;

    const page: CrawledPage = {
      url: normalizedUrl,
      title,
      textContent,
      statusCode,
      depth,
    };

    // Report progress
    if (onProgress) {
      onProgress({
        pagesVisited,
        pagesQueued: queue.length,
        pagesSkipped,
      });
    }

    // Yield page to the caller for processing
    yield page;

    // ── Enqueue linked pages ─────────────────────────────────────────────
    if (depth < maxDepth && pagesVisited < maxPages) {
      const links = extractLinks(html, normalizedUrl);
      let enqueuedFromPage = 0;

      for (const link of links) {
        const normalizedLink = link.replace(/\/$/, "") || link;
        if (
          !visited.has(normalizedLink) &&
          isAllowedDomain(normalizedLink, effectiveAllowedDomains) &&
          !shouldExcludeUrl(normalizedLink, excludePatterns) &&
          pagesVisited + queue.length + enqueuedFromPage < maxPages * 2 // prevent runaway queuing
        ) {
          queue.push([normalizedLink, depth + 1]);
          enqueuedFromPage++;
        }
      }
    }

    // ── Rate limit delay ─────────────────────────────────────────────────
    const delay = robots.crawlDelay ?? REQUEST_DELAY_MS;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  logger.warn("[web-crawler] Crawl complete", {
    pagesVisited,
    pagesSkipped,
    queueRemaining: queue.length,
  });
}

/**
 * Crawl websites and collect all pages into a flat array.
 *
 * Convenience wrapper around the generator for callers that don't
 * need streaming (e.g. batch ingestion where we buffer everything first).
 *
 * NOTE: For large crawls, prefer the generator form to avoid buffering
 * all pages in memory simultaneously.
 */
export async function crawlWebsitesToArray(
  config: CrawlConfig,
  onProgress?: (progress: CrawlProgress) => void,
): Promise<CrawledPage[]> {
  const pages: CrawledPage[] = [];
  for await (const page of crawlWebsites(config, onProgress)) {
    pages.push(page);
  }
  return pages;
}
