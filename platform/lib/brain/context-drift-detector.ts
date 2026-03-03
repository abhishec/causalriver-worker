import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

interface ContextDriftRecord {
  taskId: string;
  workspaceId: string;
  brainContextUsed: boolean;
  responseQuality: number;
  timestamp: string;
}

interface DriftStatus {
  isDrifted: boolean;
  recentAccuracy: number; // 0.0 - 1.0
  sampleSize: number;
  recommendation: string;
  driftWarning?: string; // injected into system prompt when drifted
}

const DRIFT_WARNING = `## BRAIN CONTEXT ACCURACY WARNING
Recent signals indicate brain context values may be stale or inaccurate for this workspace.
IMPORTANT: Do NOT rely on injected brain metrics as ground truth.
Acknowledge the signals exist but derive conclusions from the user's actual question.
If asked for specific numbers, tell the user you'd need fresh connector data to confirm.`;

const INSUFFICIENT_DATA_STATUS: DriftStatus = {
  isDrifted: false,
  recentAccuracy: 1.0,
  sampleSize: 0,
  recommendation: "insufficient data",
};

export async function recordContextUsage(
  taskId: string,
  workspaceId: string,
  brainContextUsed: boolean,
  quality: number,
  supabase: SupabaseClient
): Promise<void> {
  try {
    const record: ContextDriftRecord = {
      taskId,
      workspaceId,
      brainContextUsed,
      responseQuality: quality,
      timestamp: new Date().toISOString(),
    };

    await supabase.from("ai_memory").insert({
      organization_id: workspaceId,
      domain: "context-drift",
      memory_type: "accuracy-record",
      content: JSON.stringify(record),
      importance: quality,
    });
  } catch (err) {
    logger.warn("[context-drift-detector] recordContextUsage error", { err, taskId, workspaceId });
  }
}

export async function getDriftStatus(
  workspaceId: string,
  supabase: SupabaseClient
): Promise<DriftStatus> {
  try {
    const { data, error } = await supabase
      .from("ai_memory")
      .select("content")
      .eq("domain", "context-drift")
      .eq("memory_type", "accuracy-record")
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0) {
      return INSUFFICIENT_DATA_STATUS;
    }

    const records: ContextDriftRecord[] = [];
    for (const row of data) {
      try {
        records.push(JSON.parse(row.content as string) as ContextDriftRecord);
      } catch {
        // skip malformed rows
      }
    }

    const withContext = records.filter((r) => r.brainContextUsed);

    if (withContext.length === 0) {
      return INSUFFICIENT_DATA_STATUS;
    }

    const recentAccuracy =
      withContext.reduce((sum, r) => sum + r.responseQuality, 0) / withContext.length;

    const sampleSize = withContext.length;
    const isDrifted = sampleSize >= 5 && recentAccuracy < 0.45;

    const recommendation = isDrifted
      ? "switch to compute-fresh mode — injected context accuracy below threshold"
      : sampleSize < 5
        ? "accumulating samples — not enough data to assess drift"
        : "brain context appears healthy — continue injecting";

    return {
      isDrifted,
      recentAccuracy,
      sampleSize,
      recommendation,
      ...(isDrifted ? { driftWarning: DRIFT_WARNING } : {}),
    };
  } catch (err) {
    logger.warn("[context-drift-detector] getDriftStatus error", { err, workspaceId });
    return INSUFFICIENT_DATA_STATUS;
  }
}

export function buildDriftAwareContextSuffix(driftStatus: DriftStatus): string {
  return driftStatus.isDrifted && driftStatus.driftWarning ? driftStatus.driftWarning : "";
}

// ── Per-Signal-Type Drift Tracking ────────────────────────────────────────────

export type SignalTrustMode = "trust" | "caution" | "warning-instead-of-value";

export interface SignalTypeDriftStatus {
  signalType: string;
  mode: SignalTrustMode;
  recentAccuracy: number;
  sampleSize: number;
}

/**
 * Record a context usage event with signal_type tracking.
 * Extends the base recordContextUsage to also track per-signal-type accuracy.
 *
 * @param taskId           - Unique task identifier
 * @param workspaceId      - Organization ID
 * @param signalType       - Type of brain signal used (e.g. 'health_score', 'pod_match', 'rl_feedback')
 * @param brainContextUsed - Whether brain context was injected
 * @param quality          - Response quality 0..1
 * @param supabase         - Supabase client
 */
export async function recordSignalTypeUsage(
  taskId: string,
  workspaceId: string,
  signalType: string,
  brainContextUsed: boolean,
  quality: number,
  supabase: SupabaseClient
): Promise<void> {
  try {
    await supabase.from("ai_memory").insert({
      organization_id: workspaceId,
      domain: "context-drift",
      memory_type: `signal-accuracy:${signalType}`,
      content: JSON.stringify({
        taskId,
        workspaceId,
        signalType,
        brainContextUsed,
        responseQuality: quality,
        timestamp: new Date().toISOString(),
      }),
      importance: quality,
    });
  } catch (err) {
    logger.warn("[context-drift-detector] recordSignalTypeUsage error", {
      err,
      taskId,
      signalType,
    });
  }
}

/**
 * Get drift status for a specific signal type.
 *
 * Returns one of three modes:
 *   trust               — accuracy >= 0.70 or insufficient data
 *   caution             — 0.45 <= accuracy < 0.70 with >= 5 samples
 *   warning-instead-of-value — accuracy < 0.45 with >= 5 samples (inject warning)
 */
export async function getSignalTypeDriftStatus(
  workspaceId: string,
  signalType: string,
  supabase: SupabaseClient
): Promise<SignalTypeDriftStatus> {
  try {
    const { data, error } = await supabase
      .from("ai_memory")
      .select("content")
      .eq("domain", "context-drift")
      .eq("memory_type", `signal-accuracy:${signalType}`)
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0) {
      return {
        signalType,
        mode: "trust",
        recentAccuracy: 1.0,
        sampleSize: 0,
      };
    }

    const records: Array<{ responseQuality: number; brainContextUsed: boolean }> = [];
    for (const row of data) {
      try {
        const parsed = JSON.parse(row.content as string) as {
          responseQuality: number;
          brainContextUsed: boolean;
        };
        if (parsed.brainContextUsed) records.push(parsed);
      } catch {
        // skip malformed
      }
    }

    if (records.length < 5) {
      return {
        signalType,
        mode: "trust",
        recentAccuracy: 1.0,
        sampleSize: records.length,
      };
    }

    const avgAccuracy = records.reduce((s, r) => s + r.responseQuality, 0) / records.length;

    let mode: SignalTrustMode;
    if (avgAccuracy >= 0.70) {
      mode = "trust";
    } else if (avgAccuracy >= 0.45) {
      mode = "caution";
    } else {
      mode = "warning-instead-of-value";
    }

    return {
      signalType,
      mode,
      recentAccuracy: avgAccuracy,
      sampleSize: records.length,
    };
  } catch (err) {
    logger.warn("[context-drift-detector] getSignalTypeDriftStatus error", {
      err,
      workspaceId,
      signalType,
    });
    return {
      signalType,
      mode: "trust",
      recentAccuracy: 1.0,
      sampleSize: 0,
    };
  }
}

/**
 * Build a system prompt warning for a signal type in "warning-instead-of-value" mode.
 * Replaces the injected value with a caveat note.
 */
export function buildSignalWarning(signalType: string, originalValue: unknown): string {
  return `[${signalType}: data accuracy below threshold — treat ${JSON.stringify(originalValue)} as unverified estimate]`;
}
