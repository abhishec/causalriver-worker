import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";

export const dynamic = "force-dynamic";

// Returns a comprehensive view of brain training status across all 30 layers
export async function GET() {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let workspaceId: string | null | undefined;
  try {
    workspaceId = await getCurrentWorkspaceId();
  } catch {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  if (!workspaceId)
    return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const since7d = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [signalsResult, memoryResult, predictionsResult, chunksResult] =
    await Promise.allSettled([
      supabase
        .from("cross_domain_signals")
        .select("source_domain, signal_type, created_at", { count: "exact" })
        .eq("organization_id", workspaceId)
        .gte("created_at", since7d)
        .limit(1),
      supabase
        .from("ai_memory")
        .select("domain, memory_type, importance, updated_at")
        .eq("organization_id", workspaceId)
        .order("importance", { ascending: false })
        .limit(20),
      supabase
        .from("prediction_records")
        .select("quality_score, domain_type, created_at", { count: "exact" })
        .eq("organization_id", workspaceId)
        .gte("created_at", since24h)
        .limit(1),
      supabase
        .from("document_chunks")
        .select("id", { count: "exact" })
        .eq("organization_id", workspaceId)
        .limit(1),
    ]);

  const signalCount =
    signalsResult.status === "fulfilled"
      ? (signalsResult.value.count ?? 0)
      : 0;
  const memories =
    memoryResult.status === "fulfilled"
      ? (memoryResult.value.data ?? [])
      : [];
  const predictionCount =
    predictionsResult.status === "fulfilled"
      ? (predictionsResult.value.count ?? 0)
      : 0;
  const chunkCount =
    chunksResult.status === "fulfilled"
      ? (chunksResult.value.count ?? 0)
      : 0;

  // L1-L30 training assessment
  const layerStatus = {
    "L1-L2": {
      name: "Signal Reception",
      trained: signalCount > 0,
      count: signalCount,
    },
    "L3-L7": {
      name: "Pattern Recognition",
      trained: memories.some((m) => m.memory_type === "pattern"),
      count: memories.filter((m) => m.memory_type === "pattern").length,
    },
    "L8-L15": {
      name: "Cognitive Cycle",
      trained: memories.some((m) => m.domain?.startsWith("cognitive")),
      count: memories.filter((m) => m.domain?.startsWith("cognitive")).length,
    },
    "L16-L18": {
      name: "SOMA Deep Reasoning",
      trained: memories.some((m) => m.domain === "deep.soma"),
      count: memories.filter((m) => m.domain?.includes("soma")).length,
    },
    "L19-L21": {
      name: "CORTEX Pattern Synthesis",
      trained: memories.some((m) => m.domain?.includes("cortex")),
      count: memories.filter((m) => m.domain?.includes("cortex")).length,
    },
    "L22-L24": {
      name: "CEREBELLUM Prediction",
      trained: predictionCount > 0,
      count: predictionCount,
    },
    "L25-L27": {
      name: "PREFRONTAL Planning",
      trained: memories.some((m) => m.domain?.includes("planning")),
      count: memories.filter((m) => m.domain?.includes("planning")).length,
    },
    "L28-L30": {
      name: "CORPUS CALLOSUM Integration",
      trained: memories.some((m) => m.domain?.includes("corpus")),
      count: memories.filter((m) => m.domain?.includes("corpus")).length,
    },
  };

  const trainedLayers = Object.values(layerStatus).filter(
    (l) => l.trained
  ).length;
  const totalLayers = Object.keys(layerStatus).length;

  return NextResponse.json({
    overallTraining: Math.round((trainedLayers / totalLayers) * 100),
    layerStatus,
    dataSources: {
      signals7d: signalCount,
      memoryEntries: memories.length,
      predictions24h: predictionCount,
      documentChunks: chunkCount,
    },
    topMemories: memories.slice(0, 5).map((m) => ({
      domain: m.domain,
      type: m.memory_type,
      importance: m.importance,
    })),
    timestamp: new Date().toISOString(),
  });
}
