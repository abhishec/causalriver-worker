/**
 * Tool Retrieval — CRAFT Multi-View (ADR-028)
 * =============================================
 *
 * Retrieves relevant synthesized tools from capability_library using
 * CRAFT multi-view scoring (3 signals fused):
 *   1. Embedding similarity (weight: 0.5) — pgvector cosine via search_capability_library RPC
 *   2. Domain match (weight: 0.3) — exact domain match or parent domain
 *   3. Recency + quality (weight: 0.2) — quality_score * 0.15 + recency_decay * 0.05
 *
 * When library exceeds 200 tools (ITR paper): two-stage retrieval
 *   Stage 1: top-20 by embedding similarity (coarse)
 *   Stage 2: re-rank by CRAFT multi-view, return top-5 (fine)
 *
 * Fire-and-forget safe: never throws, returns [] on any failure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CapabilityLibraryTool {
  id: string;
  name: string;
  description: string;
  domain: string;
  implementation: string;
  input_schema: Record<string, unknown>;
  quality_score: number;
  status: string;
  similarity: number;       // from vector search
  craftScore: number;       // final CRAFT multi-view score
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_QUALITY = 0.4;
const ITR_THRESHOLD = 200;        // Switch to two-stage at 200+ tools
const COARSE_FETCH_LIMIT = 20;    // Stage 1: top-20 by embedding
const EMBEDDING_WEIGHT = 0.5;
const DOMAIN_WEIGHT = 0.3;
const QUALITY_RECENCY_WEIGHT = 0.2;
const RECENCY_DECAY_DAYS = 30;    // Tool from 30 days ago gets 0.5 recency score

// ── Main Retrieval Function ───────────────────────────────────────────────────

/**
 * Retrieve relevant tools from capability_library using CRAFT multi-view scoring.
 *
 * Falls back to domain-only search if embedding generation fails.
 * Returns [] on any error — never throws.
 */
export async function retrieveRelevantTools(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
  domain?: string,
  options?: { limit?: number; minQuality?: number },
): Promise<CapabilityLibraryTool[]> {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const minQuality = options?.minQuality ?? DEFAULT_MIN_QUALITY;

  try {
    // Generate embedding for the query
    let queryEmbedding: number[] | null = null;
    try {
      const { embedText } = await import("@/lib/brain/tier2-signals");
      queryEmbedding = await embedText(query.slice(0, 2000));
    } catch {
      // embedText failed — fall back to domain-only search
    }

    // Check total tool count for ITR two-stage decision
    const { count: totalCount } = await supabase
      .from("capability_library")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .in("status", ["validated", "promoted"]);

    const useITR = (totalCount ?? 0) >= ITR_THRESHOLD;
    const fetchLimit = useITR ? COARSE_FETCH_LIMIT : limit * 3; // Fetch extra for re-ranking

    let candidates: CapabilityLibraryTool[] = [];

    if (queryEmbedding) {
      // Vector search via RPC
      const { data: vectorResults } = await supabase
        .rpc("search_capability_library", {
          p_org_id: orgId,
          p_embedding: JSON.stringify(queryEmbedding),
          p_match_threshold: 0.3,  // Low threshold — CRAFT re-ranking handles precision
          p_match_count: fetchLimit,
          p_status_filter: ["validated", "promoted"],
        });

      if (vectorResults?.length) {
        candidates = (vectorResults as Array<Record<string, unknown>>).map(row => ({
          id: row.id as string,
          name: row.name as string,
          description: row.description as string,
          domain: row.domain as string,
          implementation: row.implementation as string,
          input_schema: (row.input_schema as Record<string, unknown>) || {},
          quality_score: row.quality_score as number,
          status: row.status as string,
          similarity: row.similarity as number,
          craftScore: 0,
        }));
      }
    }

    // If no vector results (no embedding or no matches), fall back to domain + quality search
    if (candidates.length === 0) {
      const fallbackQuery = supabase
        .from("capability_library")
        .select("id, name, description, domain, implementation, input_schema, quality_score, status")
        .eq("organization_id", orgId)
        .in("status", ["validated", "promoted"])
        .gte("quality_score", minQuality)
        .order("quality_score", { ascending: false })
        .limit(fetchLimit);

      if (domain) {
        fallbackQuery.or(`domain.eq.${domain},domain.like.${domain}.%`);
      }

      const { data: fallbackResults } = await fallbackQuery;

      if (fallbackResults?.length) {
        candidates = (fallbackResults as Array<Record<string, unknown>>).map(row => ({
          id: row.id as string,
          name: row.name as string,
          description: row.description as string,
          domain: row.domain as string,
          implementation: row.implementation as string,
          input_schema: (row.input_schema as Record<string, unknown>) || {},
          quality_score: row.quality_score as number,
          status: row.status as string,
          similarity: 0.5,  // No embedding — neutral similarity
          craftScore: 0,
        }));
      }
    }

    if (candidates.length === 0) return [];

    // Apply CRAFT multi-view scoring
    const now = Date.now();
    for (const tool of candidates) {
      const embeddingScore = tool.similarity;

      // Domain match scoring
      let domainBoost = 0;
      if (domain) {
        if (tool.domain === domain) {
          domainBoost = 1.0;  // Exact match
        } else if (tool.domain.startsWith(domain + ".") || domain.startsWith(tool.domain + ".")) {
          domainBoost = 0.5;  // Parent/child domain
        }
      }
      // Also check query text for domain keywords in tool description
      const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const descLower = tool.description.toLowerCase();
      const nameMatch = queryWords.some(w => tool.name.toLowerCase().includes(w) || descLower.includes(w));
      if (nameMatch && domainBoost < 0.5) domainBoost = 0.3;

      // Quality + recency scoring
      const qualityComponent = tool.quality_score * 0.75;
      // Recency: assume tools created recently are more relevant (no created_at in results, use status)
      const statusBonus = tool.status === "promoted" ? 0.25 : 0;
      const qualityRecency = qualityComponent + statusBonus;

      // CRAFT fusion
      tool.craftScore =
        EMBEDDING_WEIGHT * embeddingScore +
        DOMAIN_WEIGHT * domainBoost +
        QUALITY_RECENCY_WEIGHT * qualityRecency;
    }

    // Sort by CRAFT score, filter by min quality, take top-K
    candidates.sort((a, b) => b.craftScore - a.craftScore);
    const filtered = candidates.filter(t => t.quality_score >= minQuality);

    return filtered.slice(0, limit);
  } catch (err) {
    logger.warn("[tool-retrieval] retrieveRelevantTools failed (non-fatal)", {
      orgId,
      error: String(err),
    });
    return [];
  }
}
