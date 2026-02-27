/**
 * CopilotExecutionContext — shared state for a single copilot chat request.
 *
 * This interface replaces the 10-15 IIFE-local variables that were scattered
 * throughout the chat/route.ts POST handler.  Pre-flight populates it; the core
 * execution path reads from it; post-flight consumes it for persistence.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Inline type definitions to avoid importing memory-stack at module load time ──
// memory-stack uses dynamic require("fs") internally which is bundler-unsafe in
// Turbopack.  Keep these as loose interfaces rather than importing the SDK types.

export interface CopilotBrainContext {
  fullPrompt: string;
  intent: string;
  domains: string[];
  confidence: number;
  sections: Array<{ title: string; content: string }>;
  [k: string]: unknown;
}

export interface CopilotExecutionContext {
  // ── Auth & workspace ──
  workspaceId: string;
  userId: string;
  /** Authenticated Supabase client (user-scoped, respects RLS) */
  supabase: SupabaseClient;
  /** Service-role Supabase client (bypasses RLS — for admin operations only) */
  service: SupabaseClient;

  // ── Request fields (parsed + normalized) ──
  message: string;
  conversationId: string | null;
  compressedSummary: string | null;

  // ── Service routing ──
  /** Service identifier — "seaas" | "aas" | "general" etc. */
  service_mode: string;

  // ── Brain context (may be null if brain loading failed) ──
  brainContext: CopilotBrainContext | null;

  // ── Memory stack module (loaded once per request) ──
  // Typed as `Record<string, any>` to avoid Turbopack bundling memory-stack at
  // module evaluation time.  Callers cast individual exports as needed.
  memStack: Record<string, any> | null;

  // ── Intent classification (from LLM interpreter or regex fallback) ──
  detectedIntent: string | null;

  // ── Model routing ──
  /** Final model string selected by DAAO for this request */
  v4SmartModel: string;

  // ── Streaming accumulator (populated during the SSE stream) ──
  streamedAssistantText: string;

  // ── Request metadata ──
  requestId: string;
  streamStartMs: number;
}
