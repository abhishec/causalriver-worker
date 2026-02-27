import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

type MemoryRow = {
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type RelevantMemory = {
  content: string;
  confidence?: number;
  created_at: string;
  metadata?: Record<string, unknown>;
};

/**
 * Retrieve semantically relevant memories from ai_memory.
 *
 * Strategy: hybrid approach
 * 1. Recent memories (last 5 by time) — always include
 * 2. High-confidence failures (confidence < 0.4, any time) — always include
 * 3. Domain-matched memories — memories that mention the same domains as current query
 * 4. Deduplicate and return top N
 *
 * Note: This is a SQL-based approximation of semantic search until pgvector is available.
 * The vector embedding infrastructure can be wired in later as a drop-in replacement.
 */
export async function retrieveRelevantMemories(
  supabase: SupabaseClient,
  orgId: string,
  options: {
    currentDomains?: string[]; // domains active in current planning cycle
    currentFailures?: string[]; // domains that failed recently
    limit?: number;
    lookbackDays?: number; // default: 90 (3 months)
  } = {}
): Promise<RelevantMemory[]> {
  const limit = options.limit ?? 15;
  const lookbackDays = options.lookbackDays ?? 90;
  const since = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  ).toISOString();

  // Build bucket queries as plain promises so we avoid complex generic inference
  const bucket1 = supabase
    .from("ai_memory")
    .select("content, metadata, created_at")
    .eq("organization_id", orgId)
    .eq("domain", "cognitive-planner")
    .eq("memory_type", "episodic")
    .order("created_at", { ascending: false })
    .limit(5)
    .then((r) => r);

  const bucket2 = supabase
    .from("ai_memory")
    .select("content, metadata, created_at")
    .eq("organization_id", orgId)
    .eq("domain", "cognitive-planner")
    .eq("memory_type", "episodic")
    .gte("created_at", since)
    .lt("metadata->>confidence", "0.4")
    .order("created_at", { ascending: false })
    .limit(5)
    .then((r) => r);

  const domainBuckets = (options.currentDomains ?? [])
    .slice(0, 3)
    .map((domain) =>
      supabase
        .from("ai_memory")
        .select("content, metadata, created_at")
        .eq("organization_id", orgId)
        .eq("domain", "cognitive-planner")
        .eq("memory_type", "episodic")
        .gte("created_at", since)
        .ilike("content", `%${domain}%`)
        .order("created_at", { ascending: false })
        .limit(2)
        .then((r) => r)
    );

  const results = await Promise.allSettled([
    bucket1,
    bucket2,
    ...domainBuckets,
  ]);

  const memories: RelevantMemory[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    if (result.status === "rejected") {
      logger.warn("[retrieveRelevantMemories] Bucket query rejected:", result.reason);
      continue;
    }
    const data = (result.value?.data ?? []) as MemoryRow[];
    for (const row of data) {
      const key = row.content.slice(0, 100);
      if (seen.has(key)) continue;
      seen.add(key);

      // Extract confidence from metadata if stored as a number
      const rawConfidence = row.metadata?.confidence;
      const confidence =
        typeof rawConfidence === "number" ? rawConfidence : undefined;

      memories.push({
        content: row.content,
        confidence,
        created_at: row.created_at,
        metadata: row.metadata ?? undefined,
      });
    }
  }

  // Sort: failures first (low confidence), then by recency
  memories.sort((a, b) => {
    const aConf = a.confidence ?? 1;
    const bConf = b.confidence ?? 1;
    if (aConf < 0.4 && bConf >= 0.4) return -1;
    if (bConf < 0.4 && aConf >= 0.4) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  logger.info(
    `[retrieveRelevantMemories] Retrieved ${memories.length} unique memories (limit=${limit}, lookbackDays=${lookbackDays})`
  );

  return memories.slice(0, limit);
}
