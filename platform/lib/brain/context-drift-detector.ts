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
