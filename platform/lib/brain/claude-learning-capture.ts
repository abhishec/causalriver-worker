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
 * Scoring rationale:
 * - Base: 0.4 (pass the minimum threshold for any response)
 * - Length bonus: up to +0.35 for longer, more detailed responses (caps at 2000 chars)
 * - Structure bonus: +0.10 if the response contains JSON or numbered content
 * - Speed bonus: +0.05 if latency < 5000ms (fast confident responses)
 * - Penalty: -0.15 for very short responses that look like refusals or errors
 *
 * Range: 0.25–0.90 (never hits 1.0 — that's reserved for user-validated signals)
 */
function computeQualityHeuristic(outputText: string, durationMs: number): number {
  let quality = 0.4;

  // Length bonus: longer responses tend to be more substantive
  quality += Math.min(0.35, (outputText.length / 2000) * 0.35);

  // Structure bonus: JSON or numbered lists indicate structured thinking
  if (/\{[\s\S]*\}|\[[\s\S]*\]/.test(outputText)) quality += 0.08;
  if (/^\d+\.\s/m.test(outputText)) quality += 0.04;

  // Speed bonus: fast responses suggest confident, low-entropy answers
  if (durationMs < 5000) quality += 0.05;

  // Penalty: very short responses (< 50 chars) are likely refusals or errors
  if (outputText.length < 50) quality -= 0.15;

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
