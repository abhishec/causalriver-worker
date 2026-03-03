/**
 * Few-Shot Accumulator (ADR-029 Phase 5)
 * ========================================
 * Manages a growing library of high-quality input/output examples per agent corpus.
 * Examples are stored in agent_corpus.few_shot_examples (JSONB array).
 *
 * Lifecycle:
 *   recordApprovedExample() — appended on user approval or manual revision
 *   getRelevantExamples()   — retrieved on each agent turn, ranked by keyword overlap
 *
 * Quality gate:
 *   - Corpus is capped at 20 examples.
 *   - When the cap is hit, the lowest-quality example is evicted.
 *   - Approved examples get quality 1.0; revised examples get 0.8.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FewShotExample {
  input: string;
  output: string;
  /** Quality score: 0–1. 1.0 = directly approved; 0.8 = approved after revision. */
  quality: number;
  turnId: string;
  createdAt: string;
}

interface CorpusRow {
  few_shot_examples: unknown;
  total_examples: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum examples stored per corpus. */
const MAX_EXAMPLES = 20;

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Read the current few_shot_examples array from an agent_corpus row.
 * Returns an empty array when the corpus doesn't exist or has no examples.
 */
async function readExamples(
  supabase: SupabaseClient,
  corpusId: string
): Promise<{ examples: FewShotExample[]; totalExamples: number }> {
  const { data, error } = await supabase
    .from("agent_corpus")
    .select("few_shot_examples, total_examples")
    .eq("id", corpusId)
    .single();

  if (error || !data) {
    logger.warn("[few-shot-accumulator] Failed to read corpus", {
      corpusId,
      error: error?.message ?? "no data",
    });
    return { examples: [], totalExamples: 0 };
  }

  const row = data as CorpusRow;
  const raw = row.few_shot_examples;

  const examples: FewShotExample[] = Array.isArray(raw)
    ? (raw as unknown[]).filter((item): item is FewShotExample => {
        if (typeof item !== "object" || item === null) return false;
        const obj = item as Record<string, unknown>;
        return (
          typeof obj["input"] === "string" &&
          typeof obj["output"] === "string" &&
          typeof obj["quality"] === "number" &&
          typeof obj["turnId"] === "string" &&
          typeof obj["createdAt"] === "string"
        );
      })
    : [];

  return {
    examples,
    totalExamples: typeof row.total_examples === "number" ? row.total_examples : examples.length,
  };
}

/**
 * Simple TF-style keyword overlap between two strings.
 * Returns a 0–1 relevance score.
 *
 * Strategy:
 *   - Tokenise by whitespace, lowercase, strip punctuation
 *   - Count how many unique tokens in `query` appear in `candidate`
 *   - Normalise by the unique token count of `query`
 *
 * No external dependencies — intentionally simple for Lambda compatibility.
 */
function keywordOverlapScore(query: string, candidate: string): number {
  const tokenise = (text: string): Set<string> => {
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2); // skip very short tokens (a, is, to, …)
    return new Set(tokens);
  };

  const queryTokens = tokenise(query);
  if (queryTokens.size === 0) return 0;

  const candidateTokens = tokenise(candidate);
  let matches = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) matches++;
  }

  return matches / queryTokens.size;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Append a user-approved or user-revised example to the corpus.
 *
 * Rules:
 *   - If the corpus already has 20 examples, evict the one with the lowest quality score.
 *   - Update total_examples counter and updated_at timestamp.
 *   - Returns true on success, false on any DB error.
 */
export async function recordApprovedExample(
  supabase: SupabaseClient,
  params: {
    corpusId: string;
    sessionId: string;
    turnId: string;
    input: string;
    output: string;
    /** 1.0 for directly approved; 0.8 for revised-then-approved */
    quality: number;
  }
): Promise<boolean> {
  const { corpusId, turnId, input, output, quality } = params;

  // ── Read current examples ───────────────────────────────────────────────────
  const { examples, totalExamples } = await readExamples(supabase, corpusId);

  // ── Build the new example ───────────────────────────────────────────────────
  const newExample: FewShotExample = {
    input: input.slice(0, 2000),   // cap to avoid JSONB bloat
    output: output.slice(0, 4000),
    quality: Math.min(1, Math.max(0, quality)),
    turnId,
    createdAt: new Date().toISOString(),
  };

  // ── Enforce cap ─────────────────────────────────────────────────────────────
  let updatedExamples = [...examples, newExample];

  if (updatedExamples.length > MAX_EXAMPLES) {
    // Sort descending by quality, keep top MAX_EXAMPLES - 1, then append the new one
    // (This ensures the new example always makes it in, displacing the worst existing one)
    const sorted = examples
      .slice()
      .sort((a, b) => b.quality - a.quality)
      .slice(0, MAX_EXAMPLES - 1);
    updatedExamples = [...sorted, newExample];
  }

  // ── Persist ─────────────────────────────────────────────────────────────────
  const { error } = await supabase
    .from("agent_corpus")
    .update({
      few_shot_examples: updatedExamples,
      total_examples: totalExamples + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", corpusId);

  if (error) {
    logger.warn("[few-shot-accumulator] Failed to record example", {
      corpusId,
      turnId,
      error: error.message,
    });
    return false;
  }

  logger.warn("[few-shot-accumulator] Example recorded", {
    corpusId,
    turnId,
    quality,
    totalAfter: updatedExamples.length,
    cumulative: totalExamples + 1,
  });

  return true;
}

/**
 * Retrieve the most relevant few-shot examples for a given input.
 *
 * Scoring:
 *   combinedScore = quality * 0.4 + relevance * 0.6
 *
 * Returns up to `limit` examples (default 3), ordered by combined score descending.
 * Returns an empty array when no examples exist.
 */
export async function getRelevantExamples(
  supabase: SupabaseClient,
  corpusId: string,
  currentInput: string,
  limit = 3
): Promise<FewShotExample[]> {
  const { examples } = await readExamples(supabase, corpusId);

  if (examples.length === 0) {
    return [];
  }

  // Score each example
  type ScoredExample = { example: FewShotExample; score: number };
  const scored: ScoredExample[] = examples.map((ex) => {
    const relevance = keywordOverlapScore(currentInput, ex.input);
    const combinedScore = ex.quality * 0.4 + relevance * 0.6;
    return { example: ex, score: combinedScore };
  });

  // Sort descending by combined score
  scored.sort((a, b) => b.score - a.score);

  const topN = scored.slice(0, limit).map((s) => s.example);

  logger.warn("[few-shot-accumulator] Retrieved relevant examples", {
    corpusId,
    requested: limit,
    returned: topN.length,
    topScore: scored[0]?.score.toFixed(3) ?? "n/a",
  });

  return topN;
}
