/**
 * Browser Tool — Browserless.io Cloud Browser
 * =============================================
 * GAIA-ready: navigates real web pages, extracts text, takes screenshots.
 * Uses Browserless.io (already in .env as BROWSERLESS_API_KEY and next.config.ts).
 * Lambda-safe: HTTP-based, no local Chromium binary required.
 *
 * Why cloud browser > search API for GAIA:
 * - JS-rendered pages (React SPAs, dashboards)
 * - Dynamic tables, expandable content
 * - PDF downloads via link clicks
 * - Visual questions requiring screenshots
 *
 * Based on existing executeBrowser() in primitive-registry.ts.
 */

import { logger } from "@/lib/logger";

const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;
const BROWSERLESS_BASE_URL = "https://chrome.browserless.io";

export interface BrowserNavigateResult {
  url: string;
  title?: string;
  textContent: string;   // First 20000 chars of page text (with table structure preserved)
  links: Array<{ text: string; href: string }>;
  error?: string;
}

export interface BrowserScreenshotResult {
  base64: string;        // base64-encoded PNG
  width: number;
  height: number;
  error?: string;
}

/**
 * Navigate to a URL and extract full page text + links.
 * Falls back gracefully if Browserless is not configured.
 */
export async function browserNavigate(url: string, waitFor = 3000): Promise<BrowserNavigateResult> {
  if (!BROWSERLESS_API_KEY) {
    logger.warn("[tools/browser] BROWSERLESS_API_KEY not configured");
    return { url, textContent: "", links: [], error: "BROWSERLESS_API_KEY not configured" };
  }

  const urlStr = String(url ?? "").trim();
  if (!urlStr.startsWith("http")) {
    return { url: urlStr, textContent: "", links: [], error: "URL must start with http/https" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18_000); // 18s total

    let resp: Response;
    try {
      resp = await fetch(
        `${BROWSERLESS_BASE_URL}/content?token=${BROWSERLESS_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlStr, waitFor }),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      return { url: urlStr, textContent: "", links: [], error: `Browserless API error ${resp.status}` };
    }

    const html = await resp.text();

    // Preserve table structure before stripping all tags
    let processedHtml = html
      .replace(/<tr[^>]*>/gi, "\n")
      .replace(/<\/tr>/gi, "")
      .replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, " | $1")
      .replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, " | $1");

    // Extract text content (strip HTML tags)
    let textContent = processedHtml
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 20000);

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim();

    // Extract links (first 50)
    const linkRe = /<a\s[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
    const links: Array<{ text: string; href: string }> = [];
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkRe.exec(html)) !== null && links.length < 50) {
      const href = linkMatch[1]?.trim() ?? "";
      const text = linkMatch[2]?.trim() ?? "";
      if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
        links.push({ text, href });
      }
    }

    // PDF detection: if we got very little text but URL looks like a PDF, give helpful message
    if (textContent.trim().length < 50 && urlStr.toLowerCase().includes(".pdf")) {
      textContent = "[PDF document detected — content could not be extracted via browser. Try searching for an HTML version or key facts about this document.]";
    }

    // Empty page detection: not a PDF but still almost no content
    if (textContent.trim().length < 50 && !urlStr.toLowerCase().includes(".pdf")) {
      textContent = "[Page returned very little content — possible CAPTCHA, login wall, or JavaScript-only page. URL: " + urlStr + "]";
    }

    return { url: urlStr, title, textContent, links };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[tools/browser] Navigate error", { url: urlStr, error: msg });
    return { url: urlStr, textContent: "", links: [], error: msg };
  }
}

/**
 * Take a screenshot of a web page.
 * Returns base64-encoded PNG.
 */
export async function browserScreenshot(url: string, fullPage = false): Promise<BrowserScreenshotResult> {
  if (!BROWSERLESS_API_KEY) {
    return { base64: "", width: 0, height: 0, error: "BROWSERLESS_API_KEY not configured" };
  }

  const urlStr = String(url ?? "").trim();
  if (!urlStr.startsWith("http")) {
    return { base64: "", width: 0, height: 0, error: "URL must start with http/https" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    let resp: Response;
    try {
      resp = await fetch(
        `${BROWSERLESS_BASE_URL}/screenshot?token=${BROWSERLESS_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: urlStr,
            options: { type: "png", fullPage },
            viewport: { width: 1280, height: 720 },
          }),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      return { base64: "", width: 0, height: 0, error: `Browserless API error ${resp.status}` };
    }

    const buffer = await resp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return { base64, width: 1280, height: 720 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[tools/browser] Screenshot error", { url: urlStr, error: msg });
    return { base64: "", width: 0, height: 0, error: msg };
  }
}
