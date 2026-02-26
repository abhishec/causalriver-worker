import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { searchDocumentChunks } from "@/lib/connectors/document-ingester";
import { getRecentQualityPatterns } from "@/lib/brain/agent-rl";

export interface BrainContext {
  brainIq: number;                    // current Brain IQ score
  signalCount: number;                // total signals ingested
  brainState: "empty" | "populating" | "ready";
  topSignals: { domain: string; summary: string; strength: number }[];  // top 3 recent signals
  recentQuality: number;              // avg quality from last 10 prediction_records
  topPatterns: string[];              // top domains from high-quality recent records
  activeJobCount: number;             // jobs currently running
  contextSummary: string;             // 2-3 sentence natural language summary for LLM injection
}

export async function getBrainContext(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BrainContext> {
  try {
    // Run all 4 fetches in parallel — non-blocking, fail gracefully
    const [workspaceRow, signalsRow, qualityRow, jobsRow] = await Promise.allSettled([
      // Brain IQ + signal count
      supabase
        .from("ai_workspace")
        .select("orchestrator_config")
        .eq("organization_id", orgId)
        .maybeSingle(),
      // Top 3 recent signals
      supabase
        .from("cross_domain_signals")
        .select("source_domain, signal_type, signal_strength, metadata")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(3),
      // Recent RL quality — uses "confidence" column (the actual prediction_records schema)
      supabase
        .from("prediction_records")
        .select("confidence")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(10),
      // Active jobs
      supabase
        .from("agent_queue")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "running"),
    ]);

    // Extract values safely
    const workspace = workspaceRow.status === "fulfilled" ? workspaceRow.value.data : null;
    const config = (workspace?.orchestrator_config as Record<string, unknown>) ?? {};
    const brainIq = typeof config.brainIq === "number" ? config.brainIq : 0;
    const signalCount = typeof config.signalCount === "number" ? config.signalCount : 0;

    const threshold = typeof config.brainReadinessMinIq === "number" ? config.brainReadinessMinIq : 10;
    const brainState: BrainContext["brainState"] =
      signalCount === 0 ? "empty" : signalCount < threshold ? "populating" : "ready";

    const signals = signalsRow.status === "fulfilled" ? (signalsRow.value.data ?? []) : [];
    const topSignals = signals.map(s => ({
      domain: String(s.source_domain ?? ""),
      summary: String((s.metadata as Record<string, unknown>)?.summary ?? s.signal_type ?? ""),
      strength: typeof s.signal_strength === "number" ? s.signal_strength : 0,
    }));

    // "confidence" is the actual column name in prediction_records (not "quality_score")
    const qualityRows = qualityRow.status === "fulfilled" ? (qualityRow.value.data ?? []) : [];
    const recentQuality = qualityRows.length > 0
      ? qualityRows.reduce((sum, r) => sum + (typeof r.confidence === "number" ? r.confidence : 0), 0) / qualityRows.length
      : 0;

    const activeJobCount = jobsRow.status === "fulfilled" ? (jobsRow.value.count ?? 0) : 0;

    // Fetch recent quality patterns from prediction_records (RL flywheel — closes the loop)
    // getRecentQualityPatterns is fire-and-forget safe — never throws
    const qualityPatterns = await getRecentQualityPatterns(supabase, orgId);
    const topPatterns = qualityPatterns.topPatterns;

    // Fetch the 3 most recently ingested document chunks (empty query = latest by created_at)
    // Called by getBrainContext() to include document knowledge in every LLM decision
    let recentDocTitles: string[] = [];
    try {
      const docChunks = await searchDocumentChunks(supabase, orgId, "", 3);
      recentDocTitles = docChunks
        .map(c => c.document_title)
        .filter((t): t is string => typeof t === "string" && t.length > 0);
    } catch {
      // non-fatal — document chunks are best-effort
    }

    // Build natural language summary for LLM system prompt injection
    const contextSummary = buildContextSummary({ brainIq, signalCount, brainState, topSignals, recentQuality, topPatterns, activeJobCount, recentDocTitles });

    return { brainIq, signalCount, brainState, topSignals, recentQuality, topPatterns, activeJobCount, contextSummary };
  } catch (err) {
    // getBrainContext must never throw — return safe defaults
    logger.warn("[brain-context] getBrainContext failed, returning defaults:", err);
    return {
      brainIq: 0,
      signalCount: 0,
      brainState: "empty",
      topSignals: [],
      recentQuality: 0,
      topPatterns: [],
      activeJobCount: 0,
      contextSummary: "",
    };
  }
}

function buildContextSummary(ctx: Omit<BrainContext, "contextSummary"> & { recentDocTitles?: string[] }): string {
  const parts: string[] = [];

  if (ctx.brainState === "empty") {
    parts.push("The Brain has no data yet — no connectors have synced.");
  } else if (ctx.brainState === "populating") {
    parts.push(`The Brain is learning (${ctx.signalCount} signals collected so far, threshold: calibrating).`);
  } else {
    parts.push(`The Brain is active with ${ctx.signalCount} signals (IQ: ${ctx.brainIq}).`);
  }

  if (ctx.topSignals.length > 0) {
    const signalList = ctx.topSignals.map(s => `${s.domain}: ${s.summary}`).join("; ");
    parts.push(`Recent intelligence: ${signalList}.`);
  }

  if (ctx.recentQuality > 0) {
    const qualityLabel = ctx.recentQuality >= 0.8 ? "high" : ctx.recentQuality >= 0.6 ? "moderate" : "low";
    parts.push(`Recent response quality: ${qualityLabel} (${Math.round(ctx.recentQuality * 100)}%).`);
  }

  // RL flywheel: inject top-performing domains into the LLM context summary
  if (ctx.topPatterns && ctx.topPatterns.length > 0) {
    parts.push(`High-quality domains recently: ${ctx.topPatterns.join(", ")}.`);
  }

  if (ctx.activeJobCount > 0) {
    parts.push(`${ctx.activeJobCount} agent job(s) currently running.`);
  }

  if (ctx.recentDocTitles && ctx.recentDocTitles.length > 0) {
    parts.push(`Recent document context: ${ctx.recentDocTitles.join(", ")}.`);
  }

  return parts.join(" ");
}
