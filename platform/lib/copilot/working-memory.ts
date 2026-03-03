/**
 * Copilot Working Memory (Tier 1) — ADR-027
 * ==========================================
 *
 * Tier 1 in the 3-tier memory hierarchy:
 *   Tier 1: Working Memory (this file) — ephemeral, per-request context
 *   Tier 2: Worker Episodic Memory — ai_memory rows per AI Worker
 *   Tier 3: Brain Semantic Memory — federated_knowledge, stable patterns
 *
 * Previously, working memory was scattered across 6+ `_rc*` variables in
 * chat/route.ts.  This module formalizes them into a typed structure with
 * three phases: GATHER (kick off parallel fetches), AWAIT (resolve all),
 * INJECT (append to system prompt).
 *
 * Why it matters:
 *   - Three controllers (orchestrator, cognitive planner, self-reflection)
 *     need a shared vocabulary for per-request context
 *   - Post-flight needs to know which memory pieces were injected (for RL)
 *   - Future: working memory can be persisted to agent_checkpoints for
 *     multi-turn agent resumability
 *
 * Fire-and-forget safe — individual fetches never throw.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

/** Resolved working memory for a single copilot request. */
export interface CopilotWorkingMemory {
  // ── RL Learning Context ──
  /** Formatted RL primer block (success/failure patterns from federated_knowledge) */
  rlPrimerBlock: string;
  /** Pattern IDs injected — tracked for feedback loop (ADR-027) */
  rlPrimerPatternIds: string[];

  // ── Session Memory ──
  /** Past routing decisions and user preferences (from ai_memory routing.* patterns) */
  copilotMemoryBlock: string;

  // ── Entity Context ──
  /** Known entities from recent conversations (names, projects, etc.) */
  entityContextBlock: string;

  // ── Schema Drift ──
  /** Warning block if brain context may be stale */
  driftSuffixBlock: string;

  // ── Capabilities ──
  /** Synthesised capability descriptions for detected tool gaps */
  capabilitiesBlock: string;

  // ── Tool Library (ADR-028) ──
  /** Synthesized tools from capability_library, retrieved by vector similarity */
  toolLibraryBlock: string;
  /** Tool IDs injected — tracked for RL feedback (ADR-028) */
  toolLibraryIds: string[];

  // ── Planner Strategy ──
  /** Cognitive planner's latest scheduled domains (so orchestrator sees what was planned) */
  plannerStrategyBlock: string;

  // ── Brain Context Cache ──
  /** Pre-fetched brain context (warms 30s cache so domain executors hit cache, not DB) */
  brainContextData: Record<string, unknown> | null;

  // ── Format ──
  /** Format directive if user's message implies structured output */
  formatDirectiveBlock: string;

  // ── Metadata ──
  /** Timestamp when GATHER phase started */
  gatherStartMs: number;
  /** Timestamp when AWAIT phase completed */
  resolvedAtMs: number;
  /** Which memory pieces were non-empty (for RL tracking) */
  injectedPieces: string[];
}

/** Handles to in-flight promises (returned by gatherWorkingMemory). */
export interface WorkingMemoryPromises {
  rlPrimerPromise: Promise<unknown>;
  entityCtxPromise: Promise<string>;
  driftStatusPromise: Promise<unknown>;
  capsPromise: Promise<unknown>;
  toolLibraryPromise: Promise<{ block: string; ids: string[] }>;
  copilotMemPromise: Promise<string>;
  plannerStrategyPromise: Promise<string>;
  brainContextPromise: Promise<Record<string, unknown> | null>;
  gatherStartMs: number;
}

// ── Phase 1: GATHER — kick off all parallel fetches ──────────────────────────

/**
 * Start all working memory fetches in parallel.
 * Call this immediately after workspaceId is known — the promises run
 * concurrently with all other setup (brain context, routing, etc.).
 *
 * @returns Promise handles to await later via `resolveWorkingMemory()`
 */
export function gatherWorkingMemory(
  message: string,
  workspaceId: string,
  workerId: string | undefined,
  service: SupabaseClient,
  anthropicApiKey: string,
): WorkingMemoryPromises {
  const gatherStartMs = Date.now();

  // All imports are dynamic to avoid Turbopack bundling issues.
  // Each catches its own errors — a failure in one never blocks the others.

  const rlPrimerPromise = import("@/lib/brain/rl-primer")
    .then(({ buildRLPrimerWithIds }) => buildRLPrimerWithIds(message, workspaceId, workerId))
    .catch((err) => {
      logger.warn("[working-memory] RL primer fetch failed", { error: String(err) });
      return "";
    });

  const entityCtxPromise = import("@/lib/brain/entity-memory")
    .then(({ getEntityContext }) => getEntityContext(workspaceId, workerId))
    .catch((err) => {
      logger.warn("[working-memory] Entity context fetch failed", { error: String(err) });
      return "";
    });

  const driftStatusPromise = import("@/lib/brain/context-drift-detector")
    .then(({ getDriftStatus }) => getDriftStatus(workspaceId, service as any))
    .catch((err) => {
      logger.warn("[working-memory] Drift status fetch failed", { error: String(err) });
      return null;
    });

  const capsPromise = import("@/lib/brain/capability-synthesizer")
    .then(({ getOrSynthesizeCapabilities }) =>
      getOrSynthesizeCapabilities(message, workspaceId, anthropicApiKey, service as any)
    )
    .catch((err) => {
      logger.warn("[working-memory] Capability synthesis failed", { error: String(err) });
      return null;
    });

  // 8. Tool Library retrieval (ADR-028: CRAFT multi-view)
  const toolLibraryPromise = import("@/lib/brain/tool-retrieval")
    .then(({ retrieveRelevantTools }) =>
      retrieveRelevantTools(service, workspaceId, message, undefined, { limit: 5 })
    )
    .then(tools => {
      if (!tools.length) return { block: "", ids: [] };
      const sections = tools.map(t =>
        `**${t.name}** (${t.domain}, quality: ${Math.round(t.quality_score * 100)}%)\n` +
        `${t.description}\n` +
        "```javascript\n" + t.implementation + "\n```"
      );
      return {
        block:
          "## DYNAMIC TOOL LIBRARY\n" +
          "The following synthesized tools are available for this request:\n\n" +
          sections.join("\n\n") +
          "\n\nUse these functions when they match the user's needs.",
        ids: tools.map(t => t.id),
      };
    })
    .catch(() => ({ block: "", ids: [] }));

  const copilotMemPromise = import("@/lib/copilot/copilot-memory")
    .then(({ recallCopilotMemory }) =>
      recallCopilotMemory(service, workspaceId, {
        aiWorkerId: workerId,
        userMessage: message,
      })
    )
    .catch((err) => {
      logger.warn("[working-memory] Copilot memory recall failed", { error: String(err) });
      return "";
    });

  const plannerStrategyPromise = (service as any)
    .from("ai_memory")
    .select("content, created_at")
    .eq("organization_id", workspaceId)
    .eq("domain", "cognitive-planner")
    .eq("memory_type", "working")
    .order("created_at", { ascending: false })
    .limit(1)
    .then(({ data }: { data: Array<{ content: string; created_at: string }> | null }) => {
      if (!data?.length) return "";
      try {
        const parsed = JSON.parse(data[0].content);
        const domains: string[] = (parsed.decisions ?? []).map((d: { domain: string }) => d.domain);
        const gaps: string[] = parsed.coverageGaps ?? [];
        const poor: string[] = parsed.poorQualityDomains ?? [];
        const parts: string[] = [];
        if (domains.length) parts.push(`Scheduled: ${domains.join(", ")}`);
        if (gaps.length) parts.push(`Coverage gaps: ${gaps.slice(0, 3).join(", ")}`);
        if (poor.length) parts.push(`Poor quality: ${poor.slice(0, 3).join(", ")}`);
        if (!parts.length) return "";
        return `## Planner Strategy (last cycle)\n${parts.join("\n")}`;
      } catch {
        return "";
      }
    })
    .catch(() => "");

  const brainContextPromise = import("@/lib/brain/brain-context")
    .then(({ getBrainContext }) =>
      getBrainContext(service, workspaceId, { query: message })
        .then(ctx => ctx as unknown as Record<string, unknown>)
    )
    .catch((err) => {
      logger.warn("[working-memory] Brain context pre-fetch failed", { error: String(err) });
      return null;
    });

  return {
    rlPrimerPromise,
    entityCtxPromise,
    driftStatusPromise,
    capsPromise,
    toolLibraryPromise,
    copilotMemPromise,
    plannerStrategyPromise,
    brainContextPromise,
    gatherStartMs,
  };
}

// ── Phase 2: AWAIT — resolve all promises into structured memory ─────────────

/**
 * Resolve all working memory promises into a typed structure.
 * Call this just before system prompt finalization.
 *
 * @param handles  The WorkingMemoryPromises from gatherWorkingMemory()
 * @param message  The user's message (for format detection)
 */
export async function resolveWorkingMemory(
  handles: WorkingMemoryPromises,
  message: string,
): Promise<CopilotWorkingMemory> {
  const [rawRLPrimer, entityCtx, rawDriftStatus, rawCaps, copilotMem, plannerStrategy, rawBrainContext] = await Promise.all([
    handles.rlPrimerPromise,
    handles.entityCtxPromise,
    handles.driftStatusPromise,
    handles.capsPromise,
    handles.copilotMemPromise,
    handles.plannerStrategyPromise,
    handles.brainContextPromise,
  ]);

  // ── Extract RL primer block + pattern IDs ──
  const rlPrimerBlock = typeof rawRLPrimer === "string"
    ? rawRLPrimer
    : (rawRLPrimer as any)?.block ?? "";
  const rlPrimerPatternIds: string[] = typeof rawRLPrimer === "string"
    ? []
    : (rawRLPrimer as any)?.patternIds ?? [];

  // ── Build drift suffix ──
  let driftSuffixBlock = "";
  try {
    const { buildDriftAwareContextSuffix } = await import("@/lib/brain/context-drift-detector");
    driftSuffixBlock = buildDriftAwareContextSuffix(rawDriftStatus as any) ?? "";
  } catch { /* non-fatal */ }

  // ── Build capabilities prompt ──
  let capabilitiesBlock = "";
  try {
    const { formatCapabilitiesForPrompt } = await import("@/lib/brain/capability-synthesizer");
    capabilitiesBlock = formatCapabilitiesForPrompt(rawCaps as any) ?? "";
  } catch { /* non-fatal */ }

  // ── Resolve tool library (ADR-028) ──
  const toolLib = await handles.toolLibraryPromise;
  const toolLibraryBlock = toolLib.block;
  const toolLibraryIds = toolLib.ids;

  // ── Build format directive ──
  let formatDirectiveBlock = "";
  try {
    const { hasFormatRequirement, detectOutputFormat, buildFormatDirective } =
      await import("@/lib/brain/format-detector");
    if (hasFormatRequirement(message)) {
      formatDirectiveBlock = buildFormatDirective(detectOutputFormat(message)) ?? "";
    }
  } catch { /* non-fatal */ }

  // ── Extract planner strategy block ──
  const plannerStrategyBlock: string = (plannerStrategy as string) ?? "";

  // ── Extract brain context data (cache warmer — not injected into prompt) ──
  const brainContextData = (rawBrainContext as Record<string, unknown> | null) ?? null;

  // ── Track which pieces were non-empty (for RL) ──
  const injectedPieces: string[] = [];
  if (rlPrimerBlock) injectedPieces.push("rl_primer");
  if (copilotMem) injectedPieces.push("copilot_memory");
  if (entityCtx) injectedPieces.push("entity_context");
  if (driftSuffixBlock) injectedPieces.push("drift_warning");
  if (capabilitiesBlock) injectedPieces.push("capabilities");
  if (formatDirectiveBlock) injectedPieces.push("format_directive");
  if (plannerStrategyBlock) injectedPieces.push("planner_strategy");
  if (toolLibraryBlock) injectedPieces.push("toolLibrary");

  return {
    rlPrimerBlock,
    rlPrimerPatternIds,
    copilotMemoryBlock: copilotMem ?? "",
    entityContextBlock: entityCtx ?? "",
    driftSuffixBlock,
    capabilitiesBlock,
    toolLibraryBlock,
    toolLibraryIds,
    plannerStrategyBlock,
    brainContextData,
    formatDirectiveBlock,
    gatherStartMs: handles.gatherStartMs,
    resolvedAtMs: Date.now(),
    injectedPieces,
  };
}

// ── Phase 3: INJECT — append all blocks to system prompt ─────────────────────

/**
 * Append all non-empty working memory blocks to the system prompt.
 * Returns the extended prompt string.
 *
 * @param basePrompt  The system prompt built so far
 * @param wm          Resolved working memory
 * @returns Extended system prompt with all memory blocks appended
 */
export function injectWorkingMemory(
  basePrompt: string,
  wm: CopilotWorkingMemory,
): string {
  let prompt = basePrompt;

  // 1. RL Primer — past success/failure patterns
  if (wm.rlPrimerBlock) {
    prompt += `\n\n${wm.rlPrimerBlock}`;
  }

  // 2. Copilot Session Memory — routing decisions + user preferences
  if (wm.copilotMemoryBlock) {
    prompt += `\n\n${wm.copilotMemoryBlock}`;
  }

  // 2b. Planner Strategy — what the cognitive planner scheduled this cycle
  if (wm.plannerStrategyBlock) {
    prompt += `\n\n${wm.plannerStrategyBlock}`;
  }

  // 3. Entity Context — known entities from recent conversations
  if (wm.entityContextBlock) {
    prompt += `\n\n${wm.entityContextBlock}`;
  }

  // 4. Drift Warning — stale brain context alert
  if (wm.driftSuffixBlock) {
    prompt += `\n\n${wm.driftSuffixBlock}`;
  }

  // 5. Format Directive — structured output shape
  if (wm.formatDirectiveBlock) {
    prompt += `\n\n## FORMAT REQUIREMENT\n${wm.formatDirectiveBlock}`;
  }

  // 6. Capabilities — synthesised tool descriptions
  if (wm.capabilitiesBlock) {
    prompt += `\n\n${wm.capabilitiesBlock}`;
  }

  // 7. Tool Library — CRAFT multi-view retrieved tools (ADR-028)
  if (wm.toolLibraryBlock) {
    prompt += "\n\n" + wm.toolLibraryBlock;
  }

  return prompt;
}

// ── Utility: Serialize working memory for agent_checkpoints ──────────────────

/**
 * Serialize working memory to a JSON-safe object for persistence
 * to agent_checkpoints (multi-turn agent resumability).
 *
 * Strips the large prompt blocks — only keeps metadata + pattern IDs.
 */
export function serializeWorkingMemoryMeta(wm: CopilotWorkingMemory): Record<string, unknown> {
  return {
    rlPrimerPatternIds: wm.rlPrimerPatternIds,
    injectedPieces: wm.injectedPieces,
    gatherStartMs: wm.gatherStartMs,
    resolvedAtMs: wm.resolvedAtMs,
    gatherDurationMs: wm.resolvedAtMs - wm.gatherStartMs,
    plannerStrategyPresent: !!wm.plannerStrategyBlock,
    brainContextPresent: !!wm.brainContextData,
  };
}
