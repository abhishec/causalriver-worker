/**
 * RL Primer (ADR-022)
 * ===================
 *
 * Reads from federated_knowledge to inject past success/failure patterns into
 * the copilot system prompt BEFORE the LLM call. Closes the read-back loop that
 * was missing: federated_knowledge was written to but never consulted at inference.
 *
 * Design principles:
 * - Fire-and-forget safe: wrapped in try/catch, never throws
 * - Fast: 5-second total budget via Promise.race
 * - Additive: returns "" on any failure — caller always gets a valid string
 * - Keyword-scored: ranks entries by relevance to the user's message
 */

import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FederatedKnowledgeRow {
  domain: string;
  content: string;
  confidence: number;
  created_at: string;
}

interface ScoredEntry {
  row: FederatedKnowledgeRow;
  score: number;
}

// ── Stop Words ────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can", "need", "dare",
  "it", "its", "this", "that", "these", "those", "i", "me", "my", "we",
  "our", "you", "your", "he", "she", "they", "them", "their", "what",
  "which", "who", "whom", "how", "when", "where", "why", "all", "each",
  "both", "few", "more", "most", "other", "some", "such", "no", "not",
  "only", "same", "so", "than", "too", "very", "just", "about", "up",
  "out", "get", "me", "give", "show", "tell", "make", "let", "any",
]);

// ── Keyword Extraction ────────────────────────────────────────────────────────

function extractKeywords(message: string): Set<string> {
  return new Set(
    message
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  );
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Score a federated_knowledge row by keyword overlap with the user's message.
 * Returns a value 0..N where N is the number of matched keywords.
 * Domain matches count double to bias toward topically relevant entries.
 */
function scoreEntry(
  row: FederatedKnowledgeRow,
  keywords: Set<string>
): number {
  if (keywords.size === 0) return 0;

  const contentTokens = new Set(
    row.content
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3)
  );

  const domainTokens = new Set(
    row.domain.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/)
  );

  let score = 0;
  for (const kw of keywords) {
    if (contentTokens.has(kw)) score += 1;
    if (domainTokens.has(kw)) score += 1; // domain match bonus
  }

  return score;
}

// ── Format ────────────────────────────────────────────────────────────────────

function formatPrimerBlock(entries: FederatedKnowledgeRow[]): string {
  if (entries.length === 0) return "";

  const lines: string[] = [
    "## PAST PATTERNS (from your learning history)",
    "These patterns from similar past interactions should guide your response:",
    "",
  ];

  entries.forEach((entry, idx) => {
    const qualityPct = Math.round(entry.confidence * 100) / 100;
    lines.push(`**Pattern ${idx + 1}** [domain: ${entry.domain}, quality: ${qualityPct}]`);
    lines.push(entry.content.trim());
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

// ── Timeout Helper ────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`rl-primer: timeout after ${ms}ms`)), ms)
    ),
  ]);
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Builds a system-prompt block from federated_knowledge entries that are
 * relevant to the user's message. Returns an empty string on any failure.
 *
 * @param userMessage  The raw user message — used for keyword matching
 * @param workspaceId  The organization_id to scope the query
 * @param aiWorkerId   Optional — currently unused in query but reserved for
 *                     future per-worker knowledge filtering
 */
export async function buildRLPrimer(
  userMessage: string,
  workspaceId: string,
  aiWorkerId?: string
): Promise<string> {
  try {
    return await withTimeout(fetchAndScore(userMessage, workspaceId, aiWorkerId), 5_000);
  } catch (err) {
    logger.warn("[rl-primer] failed to build primer (non-fatal)", {
      workspaceId,
      aiWorkerId,
      error: String(err),
    });
    return "";
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function fetchAndScore(
  userMessage: string,
  workspaceId: string,
  _aiWorkerId?: string
): Promise<string> {
  const admin = getAdminClient();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("federated_knowledge")
    .select("domain, content, confidence, created_at")
    .or(`organization_id.eq.${workspaceId},organization_id.is.null`)
    .gte("confidence", 0.65)
    .gte("created_at", thirtyDaysAgo)
    .order("confidence", { ascending: false })
    .limit(50); // fetch top 50 by confidence, then re-rank by keyword overlap

  if (error) {
    logger.warn("[rl-primer] query failed (non-fatal)", {
      workspaceId,
      error: error.message,
    });
    return "";
  }

  const rows = (data ?? []) as FederatedKnowledgeRow[];
  if (rows.length === 0) return "";

  const keywords = extractKeywords(userMessage);

  // Score and sort — entries with zero keyword overlap are still eligible
  // (quality alone may make them worth surfacing) but keyword matches win
  const scored: ScoredEntry[] = rows
    .map((row) => ({ row, score: scoreEntry(row, keywords) }))
    .sort((a, b) => {
      // Primary: keyword overlap (desc)
      if (b.score !== a.score) return b.score - a.score;
      // Secondary: confidence (desc)
      return b.row.confidence - a.row.confidence;
    });

  // Only surface entries where at least one keyword matched, unless the corpus
  // is small — in that case fall back to top-3 by confidence
  const hasAnyMatch = scored.some((e) => e.score > 0);
  const candidates = hasAnyMatch
    ? scored.filter((e) => e.score > 0)
    : scored;

  const top3 = candidates.slice(0, 3).map((e) => e.row);
  if (top3.length === 0) return "";

  return formatPrimerBlock(top3);
}
