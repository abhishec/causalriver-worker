/**
 * Competitor Intelligence Template (ADR-029 Phase 5)
 * ====================================================
 * Pre-configured agent chain that:
 *   1. Crawls competitor websites in parallel (one site at a time — Lambda-safe)
 *   2. Extracts product features from each crawled page using Haiku (cheap, fast)
 *   3. Builds a cross-competitor feature comparison matrix
 *   4. Generates a strategic summary using Sonnet (quality narrative)
 *   5. Records the full result as an agent session turn
 *
 * Cost strategy:
 *   - Per-page feature extraction → Haiku (high volume, simple extraction)
 *   - Final summary synthesis    → claude-sonnet-4-20250514 (strategic quality)
 *
 * Lambda safety:
 *   - Page processing is sequential within each site (rate-limited by web-crawler)
 *   - Extraction calls are sequential per page (avoids parallel Lambda exhaustion)
 *   - A 25s overall timeout guard prevents Lambda timeout overrun
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { createAgentSession, recordSessionTurn } from "@/lib/agents/session-manager";
import { crawlWebsitesToArray } from "@/lib/connectors/web-crawler";
import type { CrawledPage } from "@/lib/connectors/web-crawler";
import { createIngestionJob } from "@/lib/connectors/batch-ingestion-orchestrator";

// ── Env (static capture for Amplify Lambda) ───────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── Constants ─────────────────────────────────────────────────────────────────

/** Safety timeout to avoid Lambda overrun (ms). */
const EXECUTION_TIMEOUT_MS = 25_000;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CompetitorIntelConfig {
  organizationId: string;
  userId: string;
  aiWorkerId?: string;
  /** Seed URLs to crawl — one entry per competitor. */
  competitorUrls: string[];
  /** The user's own product name (used in comparison prompts). */
  productName: string;
  /** Max pages to crawl per competitor site. Default: 50. */
  maxPagesPerSite?: number;
  /** BFS link depth per site. Default: 2. */
  crawlDepth?: number;
}

export interface ProductFeature {
  name: string;
  description: string;
  category: string;
}

export interface CompetitorProfile {
  url: string;
  companyName: string;
  features: ProductFeature[];
  pagesScanned: number;
}

export interface CompetitorIntelResult {
  sessionId: string;
  competitors: CompetitorProfile[];
  /**
   * Feature name → { competitorUrl: true | description }
   * false means the competitor does NOT mention that feature.
   */
  comparisonMatrix: Record<string, Record<string, boolean | string>>;
  summary: string;
  totalPagesScanned: number;
}

// ── Anthropic helpers ─────────────────────────────────────────────────────────

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
}

async function callClaude(
  model: string,
  system: string,
  userContent: string,
  maxTokens: number
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as AnthropicResponse;
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("") || "";
}

// ── Feature extraction ─────────────────────────────────────────────────────────

/**
 * Extract product features from a single crawled page using Haiku.
 * Returns an empty array on parse failure — non-fatal, the page is just skipped.
 */
async function extractFeaturesFromPage(
  page: CrawledPage,
  productName: string
): Promise<ProductFeature[]> {
  // Skip pages with very little content
  if (page.textContent.length < 100) return [];

  const system = `You are a competitive intelligence analyst.
Extract product features, capabilities, and differentiators from web page text.
Respond ONLY with valid JSON — no markdown fences, no prose.`;

  const userContent = `We are analyzing competitors of "${productName}".
Extract all product features, capabilities, and notable characteristics from this page.

Page URL: ${page.url}
Page Title: ${page.title}

Page content:
---
${page.textContent.slice(0, 4000)}
---

Return this exact JSON shape:
{
  "features": [
    { "name": "<short feature name>", "description": "<1-2 sentence description>", "category": "<e.g. Security, Analytics, Integration, Pricing, UX>" }
  ]
}

If there are no product features on this page, return: { "features": [] }`;

  try {
    const raw = await callClaude("claude-3-5-haiku-20241022", system, userContent, 1024);

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      return [];
    }

    const rawFeatures = Array.isArray(parsed["features"]) ? parsed["features"] : [];
    return (rawFeatures as unknown[]).filter((f): f is ProductFeature => {
      if (typeof f !== "object" || f === null) return false;
      const obj = f as Record<string, unknown>;
      return (
        typeof obj["name"] === "string" &&
        typeof obj["description"] === "string" &&
        typeof obj["category"] === "string"
      );
    });
  } catch (err) {
    logger.warn("[competitor-intel] Feature extraction failed for page (non-fatal)", {
      url: page.url,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Extract the company name from the first crawled page using Haiku.
 * Falls back to the hostname when extraction fails.
 */
async function extractCompanyName(page: CrawledPage, fallbackUrl: string): Promise<string> {
  const system = `You are a web analyst. Extract the company name from the page.
Respond with ONLY the company name — no punctuation, no explanation.`;

  const userContent = `Page title: ${page.title}
Page URL: ${page.url}
First 500 chars: ${page.textContent.slice(0, 500)}

What is the company name?`;

  try {
    const name = await callClaude("claude-3-5-haiku-20241022", system, userContent, 64);
    const cleaned = name.trim().replace(/[^a-zA-Z0-9 &.,'-]/g, "").slice(0, 60);
    return cleaned || new URL(fallbackUrl).hostname;
  } catch {
    try {
      return new URL(fallbackUrl).hostname;
    } catch {
      return fallbackUrl;
    }
  }
}

// ── Comparison matrix ─────────────────────────────────────────────────────────

/**
 * Build a feature comparison matrix from per-competitor feature arrays.
 *
 * Matrix shape: { featureName: { competitorUrl: true | description | false } }
 *
 * A competitor "has" a feature when it was explicitly extracted from their pages.
 * Missing features are marked false (not "unknown") to keep the matrix actionable.
 */
function buildComparisonMatrix(
  competitors: CompetitorProfile[]
): Record<string, Record<string, boolean | string>> {
  // Collect all unique feature names across all competitors
  const allFeatureNames = new Set<string>();
  for (const competitor of competitors) {
    for (const feature of competitor.features) {
      allFeatureNames.add(feature.name.toLowerCase());
    }
  }

  const matrix: Record<string, Record<string, boolean | string>> = {};

  for (const featureName of allFeatureNames) {
    matrix[featureName] = {};
    for (const competitor of competitors) {
      const match = competitor.features.find(
        (f) => f.name.toLowerCase() === featureName
      );
      if (match) {
        // Store the description when available; fall back to true
        matrix[featureName][competitor.url] = match.description || true;
      } else {
        matrix[featureName][competitor.url] = false;
      }
    }
  }

  return matrix;
}

// ── Summary generation ────────────────────────────────────────────────────────

async function generateSummary(
  productName: string,
  competitors: CompetitorProfile[],
  matrix: Record<string, Record<string, boolean | string>>
): Promise<string> {
  const competitorSummaries = competitors
    .map((c) => {
      const featureNames = c.features.map((f) => f.name).join(", ") || "none detected";
      const categories = [...new Set(c.features.map((f) => f.category))].join(", ");
      return `**${c.companyName}** (${c.url})\n- Features: ${featureNames}\n- Categories: ${categories || "n/a"}\n- Pages scanned: ${c.pagesScanned}`;
    })
    .join("\n\n");

  const featureCount = Object.keys(matrix).length;
  const exclusiveFeatures = Object.entries(matrix)
    .filter(([, byCompetitor]) => {
      const havers = Object.values(byCompetitor).filter(Boolean);
      return havers.length === 1;
    })
    .map(([name]) => name)
    .slice(0, 10);

  const ubiquitousFeatures = Object.entries(matrix)
    .filter(([, byCompetitor]) => {
      const havers = Object.values(byCompetitor).filter(Boolean);
      return havers.length === competitors.length && competitors.length > 1;
    })
    .map(([name]) => name)
    .slice(0, 10);

  const system = `You are a senior product strategist and competitive intelligence expert.
Write a concise, insightful competitive analysis based on the structured data provided.
Be specific, actionable, and strategic. Avoid generic filler.`;

  const userContent = `Product being analyzed: **${productName}**

## Competitors Analyzed (${competitors.length})
${competitorSummaries}

## Feature Landscape
- Total unique features detected: ${featureCount}
- Features unique to one competitor: ${exclusiveFeatures.join(", ") || "none"}
- Features present across all competitors: ${ubiquitousFeatures.join(", ") || "none"}

Write a 3–5 paragraph competitive analysis covering:
1. Key differentiators per competitor
2. Feature gaps and opportunities for ${productName}
3. Table-stakes features (present everywhere) vs. differentiators
4. Strategic recommendations for ${productName}`;

  try {
    return await callClaude("claude-sonnet-4-20250514", system, userContent, 2048);
  } catch (err) {
    logger.warn("[competitor-intel] Summary generation failed — using fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
    return `Competitive analysis for ${productName}: ${competitors.length} competitors analyzed across ${featureCount} unique features. Full summary generation failed — raw data is available in the comparison matrix.`;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run a full competitor intelligence analysis.
 *
 * Creates an agent session, crawls each competitor URL, extracts features page-by-page,
 * builds a comparison matrix, generates a Sonnet summary, and records the result.
 */
export async function runCompetitorIntelligence(
  supabase: SupabaseClient,
  config: CompetitorIntelConfig
): Promise<CompetitorIntelResult> {
  const {
    organizationId,
    userId,
    aiWorkerId,
    competitorUrls,
    productName,
    maxPagesPerSite = 50,
    crawlDepth = 2,
  } = config;

  const startTime = Date.now();

  // ── 1. Create agent session ──────────────────────────────────────────────────
  const sessionResult = await createAgentSession(supabase, {
    organizationId,
    aiWorkerId,
    agentType: "competitor-intel",
    sessionName: `Competitor Intel — ${productName} — ${new Date().toLocaleDateString()}`,
  });

  if (!sessionResult) {
    throw new Error("Failed to create competitor-intel agent session");
  }

  const sessionId = sessionResult.sessionId;

  logger.warn("[competitor-intel] Session created", {
    sessionId,
    organizationId,
    competitorCount: competitorUrls.length,
    productName,
  });

  // ── 2. Process each competitor URL ──────────────────────────────────────────
  const competitors: CompetitorProfile[] = [];
  let totalPagesScanned = 0;

  for (const seedUrl of competitorUrls) {
    // Lambda timeout guard: stop processing more competitors if close to limit
    if (Date.now() - startTime > EXECUTION_TIMEOUT_MS) {
      logger.warn("[competitor-intel] Lambda timeout guard — stopping before all URLs processed", {
        processed: competitors.length,
        remaining: competitorUrls.length - competitors.length,
      });
      break;
    }

    logger.warn("[competitor-intel] Crawling competitor", { seedUrl, productName });

    // ── 2a. Create ingestion job record (for progress tracking) ────────────────
    const ingestionJobId = await createIngestionJob(supabase, {
      organizationId,
      aiWorkerId,
      connectorType: "web-crawler",
      sourceConfig: { seedUrl, maxPages: maxPagesPerSite, maxDepth: crawlDepth },
      createdBy: userId,
    });

    if (ingestionJobId) {
      logger.warn("[competitor-intel] Ingestion job created", { ingestionJobId, seedUrl });
    }

    // ── 2b. Crawl the site ─────────────────────────────────────────────────────
    let pages: CrawledPage[] = [];
    try {
      pages = await crawlWebsitesToArray({
        seedUrls: [seedUrl],
        maxDepth: crawlDepth,
        maxPages: maxPagesPerSite,
        excludePatterns: ["/blog/", "/news/", "/press/", "/legal/", "/privacy", "/terms", "/careers", "/jobs"],
      });
    } catch (err) {
      logger.warn("[competitor-intel] Crawl failed for site (skipping)", {
        seedUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (pages.length === 0) {
      logger.warn("[competitor-intel] No pages crawled for site", { seedUrl });
      continue;
    }

    logger.warn("[competitor-intel] Pages crawled", { seedUrl, count: pages.length });
    totalPagesScanned += pages.length;

    // ── 2c. Extract company name from landing page ─────────────────────────────
    const companyName = await extractCompanyName(pages[0], seedUrl);

    // ── 2d. Extract features page-by-page (Haiku) ─────────────────────────────
    const allFeatures: ProductFeature[] = [];
    const seenFeatureNames = new Set<string>();

    for (const page of pages) {
      // Respect Lambda timeout within per-page loop too
      if (Date.now() - startTime > EXECUTION_TIMEOUT_MS) {
        logger.warn("[competitor-intel] Lambda timeout guard — stopping page extraction", {
          seedUrl,
          pagesProcessed: allFeatures.length,
        });
        break;
      }

      const pageFeatures = await extractFeaturesFromPage(page, productName);

      // Deduplicate by lowercase feature name
      for (const feature of pageFeatures) {
        const key = feature.name.toLowerCase();
        if (!seenFeatureNames.has(key)) {
          seenFeatureNames.add(key);
          allFeatures.push(feature);
        }
      }
    }

    competitors.push({
      url: seedUrl,
      companyName,
      features: allFeatures,
      pagesScanned: pages.length,
    });

    logger.warn("[competitor-intel] Competitor processed", {
      seedUrl,
      companyName,
      featuresFound: allFeatures.length,
      pagesScanned: pages.length,
    });
  }

  // ── 3. Build comparison matrix ───────────────────────────────────────────────
  const comparisonMatrix = buildComparisonMatrix(competitors);

  // ── 4. Generate summary with Sonnet ─────────────────────────────────────────
  const summary = await generateSummary(productName, competitors, comparisonMatrix);

  // ── 5. Record session turn ───────────────────────────────────────────────────
  const result: CompetitorIntelResult = {
    sessionId,
    competitors,
    comparisonMatrix,
    summary,
    totalPagesScanned,
  };

  await recordSessionTurn(supabase, sessionId, {
    userInput: `Competitor intelligence analysis for "${productName}". URLs: ${competitorUrls.join(", ")}`,
    agentOutput: JSON.stringify(result),
  });

  logger.warn("[competitor-intel] Analysis complete", {
    sessionId,
    competitorsAnalyzed: competitors.length,
    totalPagesScanned,
    featuresInMatrix: Object.keys(comparisonMatrix).length,
    elapsedMs: Date.now() - startTime,
  });

  return result;
}
