/**
 * Universal Learning Capture (ADR-021)
 * ======================================
 *
 * Wraps any Claude API call with automatic learning capture.
 * Extracts the key insight from the response and stores it in federated_knowledge.
 *
 * Design principles:
 * - Fire-and-forget: NEVER blocks the main call
 * - Additive: zero risk of breaking any existing flow
 * - Lightweight: simple heuristic quality scoring — no extra Claude calls
 * - Universal: works with streaming, non-streaming, and pre-computed results
 *
 * Usage:
 *   const { result } = await withLearningCapture(
 *     () => anthropic.messages.create({...}),
 *     {
 *       supabase,
 *       organizationId,
 *       domain: "copilot.chat",
 *       inputSummary: userMessage.slice(0, 200),
 *     }
 *   );
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LearningCaptureOptions {
  supabase: SupabaseClient;
  organizationId: string;
  /** Dot-namespaced domain string. e.g. "copilot.chat", "cognitive-planner.schedule", "se-aas.pod-match" */
  domain: string;
  aiWorkerId?: string;
  /** Brief summary of what was asked (max 500 chars for storage efficiency) */
  inputSummary?: string;
  /** Minimum quality threshold to save (0.0–1.0, default 0.4 — captures most substantive responses) */
  qualityThreshold?: number;
}

export interface LearningCaptureResult<T> {
  result: T;
  captured: boolean;
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Wraps any Claude API call (or any async producer of a Claude-shaped response)
 * with automatic learning capture to federated_knowledge.
 *
 * Fire-and-forget — the capture never blocks the caller.
 *
 * @param claudeCall  A zero-argument async function that returns the response
 * @param options     Metadata for learning capture (supabase, orgId, domain, etc.)
 * @returns           The original result + a boolean indicating if capture was triggered
 */
export async function withLearningCapture<T>(
  claudeCall: () => Promise<T>,
  options: LearningCaptureOptions
): Promise<LearningCaptureResult<T>> {
  const startMs = Date.now();
  const result = await claudeCall();
  const durationMs = Date.now() - startMs;

  // Fire-and-forget: capture asynchronously without blocking the caller
  captureFromResponse(result, durationMs, options).catch((err) =>
    logger.warn("[LearningCapture] capture failed (non-fatal)", {
      domain: options.domain,
      error: String(err),
    })
  );

  return { result, captured: true };
}

/**
 * Lightweight variant for when you already have the response text (e.g., after streaming).
 * Call this after streaming completes to capture what the model said.
 *
 * Fire-and-forget — never throws, never blocks.
 */
export function captureStreamedResponse(
  responseText: string,
  durationMs: number,
  options: LearningCaptureOptions
): void {
  const { qualityThreshold = 0.4 } = options;
  const trimmed = responseText.trim();

  if (!trimmed || trimmed.length < 20) return;

  const quality = computeQualityHeuristic(trimmed, durationMs);
  if (quality < qualityThreshold) return;

  storeLearningCapture(trimmed, quality, durationMs, options).catch((err) =>
    logger.warn("[LearningCapture] streamed capture failed (non-fatal)", {
      domain: options.domain,
      error: String(err),
    })
  );
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

async function captureFromResponse<T>(
  response: T,
  durationMs: number,
  options: LearningCaptureOptions
): Promise<void> {
  const { qualityThreshold = 0.4 } = options;

  const outputText = extractTextFromResponse(response);
  if (!outputText || outputText.length < 20) return;

  const quality = computeQualityHeuristic(outputText, durationMs);
  if (quality < qualityThreshold) return;

  await storeLearningCapture(outputText, quality, durationMs, options);
}

/**
 * Extracts text content from various Claude response shapes.
 * Handles:
 * - Raw string
 * - Anthropic SDK MessageResponse (content blocks)
 * - Objects with .text or .result string fields
 * - Arrays of content blocks
 */
function extractTextFromResponse<T>(response: T): string {
  if (typeof response === "string") {
    return response.slice(0, 1000);
  }

  if (!response || typeof response !== "object") return "";

  const r = response as Record<string, unknown>;

  // Anthropic SDK MessageResponse shape: { content: [{ type: "text", text: "..." }] }
  if (Array.isArray(r.content)) {
    const blocks = r.content as Array<{ type: string; text?: string }>;
    return blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .slice(0, 1000);
  }

  // Simple string fields
  if (typeof r.text === "string") return r.text.slice(0, 1000);
  if (typeof r.result === "string") return r.result.slice(0, 1000);
  if (typeof r.output === "string") return r.output.slice(0, 1000);
  if (typeof r.content === "string") return r.content.slice(0, 1000);

  return "";
}

/**
 * Lightweight quality heuristic that does NOT call Claude.
 *
 * Improved scoring (audit C6):
 * - Refusal/error detection: hard cap 0.30 for error responses
 * - Data density: numbers, measurements, proper nouns = substantive
 * - Length bonus: moderate reward (responses can be short but good)
 * - Structure bonus: JSON, lists, tables indicate structured thinking
 * - Short-but-valid: don't penalize terse but complete answers
 *
 * Range: 0.25–0.90 (never hits 1.0 — reserved for user-validated signals)
 */
function computeQualityHeuristic(outputText: string, durationMs: number): number {
  const text = outputText.trim();

  // ── Refusal / error detection (hard cap 0.30) ──────────────────────────
  // These patterns indicate the model couldn't answer or produced an error
  const REFUSAL_PATTERNS = /\b(i cannot|i can't|i don't have access|unable to|no data available|no results found|error occurred|failed to|i'm unable|i am unable|cannot access|don't have information about)\b/i;
  const ERROR_PATTERNS = /^(error|failed|exception|timeout|undefined|null|nan)\b/i;
  if (REFUSAL_PATTERNS.test(text) || ERROR_PATTERNS.test(text.slice(0, 50))) {
    // Could be partial refusal (some data + some caveat) — softer cap
    return text.length > 200 ? 0.40 : 0.25;
  }

  let quality = 0.45; // slightly higher base than before

  // ── Length bonus (capped at 0.25) ──────────────────────────────────────
  // Moderate reward: long doesn't always mean good, but ≥500 chars is substantive
  quality += Math.min(0.25, (text.length / 1500) * 0.25);

  // ── Data density bonus ────────────────────────────────────────────────
  // Numeric data (metrics, counts, percentages) = substantive content
  const numberMatches = text.match(/\b\d+([.,]\d+)?(%|ms|s|k|M|B|GB|KB|px|h|min|days?)?\b/g);
  if (numberMatches && numberMatches.length >= 3) quality += 0.08;

  // ── Structure bonus ────────────────────────────────────────────────────
  if (/\{[\s\S]*\}|\[[\s\S]*\]/.test(text)) quality += 0.07; // JSON
  if (/^\d+\.\s/m.test(text) || /^\s*[-*]\s/m.test(text)) quality += 0.04; // lists
  if (/\|.+\|.+\|/.test(text)) quality += 0.03; // markdown tables

  // ── Speed bonus ────────────────────────────────────────────────────────
  if (durationMs < 5000) quality += 0.03;

  // ── Very short response penalty (< 30 chars) ──────────────────────────
  // Only penalize truly empty/useless responses
  if (text.length < 30) quality -= 0.20;

  return Math.min(0.90, Math.max(0.0, quality));
}

async function storeLearningCapture(
  outputText: string,
  quality: number,
  durationMs: number,
  options: LearningCaptureOptions
): Promise<void> {
  const { supabase, organizationId, domain, aiWorkerId, inputSummary } = options;

  const insight = outputText.slice(0, 500);
  const metadata: Record<string, unknown> = {
    domain,
    durationMs,
    source: "claude-learning-capture",
    capturedAt: new Date().toISOString(),
  };

  if (inputSummary) metadata.inputSummary = inputSummary.slice(0, 200);
  if (aiWorkerId) metadata.aiWorkerId = aiWorkerId;

  const { error } = await supabase.from("federated_knowledge").insert({
    organization_id: organizationId,
    domain,
    content: insight,
    confidence: quality,
    metadata,
  });

  if (error) {
    logger.warn("[LearningCapture] insert failed (non-fatal)", {
      domain,
      error: error.message,
    });
  } else {
    logger.info("[LearningCapture] insight stored", {
      domain,
      quality: Math.round(quality * 100) / 100,
      length: outputText.length,
      orgId: organizationId,
    });
  }
}
