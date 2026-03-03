/**
 * Training Seeder
 * ================
 *
 * Seeds new AI Workers with high-quality federated_knowledge examples so
 * they start smart, not cold.
 *
 * Seeding strategy (applied in order, first non-empty source wins):
 *   1. Workspace-specific: top-quality federated_knowledge for the workspace
 *      (confidence >= 0.75, last 30 days, limit 15)
 *   2. Core pool fallback: if workspace has < 5 high-quality entries AND
 *      CORE_WORKSPACE_ID env var is set, pull from the global knowledge pool
 *   3. Synthetic seed: if still empty, insert 3 baseline entries covering
 *      fundamental AI Worker behaviours
 *
 * Idempotency: checks ai_memory for a 'training-seed' marker within the last
 * 24h. If found, skips all seeding and returns { seeded: false, source: 'skipped' }.
 *
 * Design: fire-and-forget safe, never throws.
 *
 * CRITICAL: CORE_WORKSPACE_ID is ONLY used as an explicit source for the
 * global knowledge pool pull — it is NEVER used as a fallback organizationId
 * for other queries.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { getAdminClient } from "@/lib/supabase/admin";

// ── Constants ─────────────────────────────────────────────────────────────────

const HIGH_QUALITY_THRESHOLD = 0.75;
const WORKSPACE_SEED_LIMIT = 15;
const MIN_WORKSPACE_ENTRIES_BEFORE_CORE_FALLBACK = 5;
const SEED_MARKER_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Synthetic baseline entries seeded when no workspace or core knowledge exists.
// These cover the three most fundamental AI Worker behavioural patterns.
const SYNTHETIC_SEED_ENTRIES = [
  {
    content:
      "When asked about delivery or engineering metrics, always request connector data before answering",
    domain: "general",
  },
  {
    content:
      "Always acknowledge when data is unavailable rather than estimating",
    domain: "general",
  },
  {
    content:
      "Structure responses with clear sections: Summary, Details, Recommended Actions",
    domain: "general",
  },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SeedResult {
  /** false if skipped because worker was seeded recently */
  seeded: boolean;
  /** Number of federated_knowledge entries written to ai_memory */
  entriesSeeded: number;
  /** Which source provided the knowledge */
  source: "workspace" | "core" | "synthetic" | "skipped";
  /** Wall-clock duration of the seeding operation */
  durationMs: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Inserts federated_knowledge rows into ai_memory for the given worker.
 * Uses the admin client to bypass RLS — seeding is an internal operation.
 *
 * Returns the number of rows successfully inserted.
 */
async function insertSeedEntries(
  entries: Array<{ content: string; domain: string; confidence?: number; id?: string }>,
  workerId: string,
  workspaceId: string,
  admin: ReturnType<typeof getAdminClient>
): Promise<number> {
  if (entries.length === 0) return 0;

  const memoryRows = entries.map((entry) => ({
    organization_id: workspaceId,
    ai_worker_id: workerId,
    context_id: workerId,
    memory_type: "training-seed",
    domain: entry.domain || "general",
    content: entry.content,
    importance: entry.confidence ?? HIGH_QUALITY_THRESHOLD,
    metadata: {
      source: "training-seeder",
      seeded_at: new Date().toISOString(),
      worker_id: workerId,
      ...(entry.id ? { source_knowledge_id: entry.id } : { synthetic: true }),
    },
  }));

  const { error } = await admin.from("ai_memory").insert(memoryRows);

  if (error) {
    logger.warn("[training-seeder] ai_memory insert failed", {
      workerId,
      error: error.message,
      count: memoryRows.length,
    });
    return 0;
  }

  return memoryRows.length;
}

/**
 * Writes a seed marker to ai_memory so the idempotency check in
 * isAlreadySeeded() can detect a recent seed run.
 */
async function writeSeedMarker(
  workerId: string,
  workspaceId: string,
  admin: ReturnType<typeof getAdminClient>
): Promise<void> {
  const { error } = await admin.from("ai_memory").insert({
    organization_id: workspaceId,
    ai_worker_id: workerId,
    context_id: workerId,
    memory_type: "seeded-at",
    domain: "training-seed",
    content: `Worker seeded at ${new Date().toISOString()}`,
    importance: 0.5,
    metadata: {
      seeded_at: new Date().toISOString(),
      worker_id: workerId,
    },
  });

  if (error) {
    logger.warn("[training-seeder] seed marker insert failed (non-fatal)", {
      workerId,
      error: error.message,
    });
  }
}

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Checks ai_memory for a recent seed marker for this worker.
 * Returns true if the worker was seeded within the last 24 hours.
 *
 * Fire-and-forget safe — returns false on any error (causes re-seed, which is
 * harmless since ai_memory is append-only and duplicates are tolerated).
 */
export async function isAlreadySeeded(
  workerId: string,
  supabase: SupabaseClient
): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - SEED_MARKER_TTL_MS).toISOString();

    const { data, error } = await supabase
      .from("ai_memory")
      .select("id, created_at")
      .eq("ai_worker_id", workerId)
      .eq("memory_type", "seeded-at")
      .eq("domain", "training-seed")
      .gte("created_at", cutoff)
      .limit(1);

    if (error) {
      logger.warn("[training-seeder] isAlreadySeeded query failed (non-fatal)", {
        workerId,
        error: error.message,
      });
      return false;
    }

    return (data ?? []).length > 0;
  } catch (err) {
    logger.warn("[training-seeder] isAlreadySeeded check threw (non-fatal)", {
      workerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Seeds a new AI Worker with high-quality federated_knowledge examples.
 *
 * Execution order:
 *   1. Idempotency check — skip if seeded within 24h
 *   2. Workspace pull — top-quality entries from the worker's own workspace
 *   3. Core pool fallback — global knowledge pool when workspace is sparse
 *      (only if CORE_WORKSPACE_ID env var is set)
 *   4. Synthetic seed — hardcoded baseline entries when both pools are empty
 *   5. Seed marker — write seeded-at marker to prevent re-seeding within 24h
 *
 * Fire-and-forget safe — never throws. All errors are caught and logged.
 */
export async function seedWorkerKnowledge(
  workerId: string,
  workspaceId: string,
  supabase: SupabaseClient
): Promise<SeedResult> {
  const startMs = Date.now();

  const skipResult: SeedResult = {
    seeded: false,
    entriesSeeded: 0,
    source: "skipped",
    durationMs: 0,
  };

  try {
    // ── Step 1: Idempotency check ────────────────────────────────────────────
    const alreadySeeded = await isAlreadySeeded(workerId, supabase);
    if (alreadySeeded) {
      logger.warn("[training-seeder] Worker already seeded recently — skipping", {
        workerId,
        workspaceId,
      });
      return { ...skipResult, durationMs: Date.now() - startMs };
    }

    // Admin client bypasses RLS for internal seeding operations
    const admin = getAdminClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // ── Step 2: Workspace-specific knowledge pull ────────────────────────────
    const { data: workspaceEntries, error: workspaceError } = await admin
      .from("federated_knowledge")
      .select("id, content, domain, confidence")
      .eq("organization_id", workspaceId)
      .gte("confidence", HIGH_QUALITY_THRESHOLD)
      .gte("created_at", thirtyDaysAgo)
      .order("confidence", { ascending: false })
      .limit(WORKSPACE_SEED_LIMIT);

    if (workspaceError) {
      logger.warn("[training-seeder] Workspace knowledge fetch failed (non-fatal)", {
        workspaceId,
        error: workspaceError.message,
      });
    }

    const workspaceRows = (workspaceEntries ?? []) as Array<{
      id: string;
      content: string;
      domain: string;
      confidence: number;
    }>;

    // Enough workspace entries found — seed from workspace and return
    if (workspaceRows.length >= MIN_WORKSPACE_ENTRIES_BEFORE_CORE_FALLBACK) {
      const inserted = await insertSeedEntries(workspaceRows, workerId, workspaceId, admin);
      await writeSeedMarker(workerId, workspaceId, admin);

      logger.warn("[training-seeder] Worker seeded from workspace knowledge", {
        workerId,
        workspaceId,
        entriesSeeded: inserted,
      });

      return {
        seeded: true,
        entriesSeeded: inserted,
        source: "workspace",
        durationMs: Date.now() - startMs,
      };
    }

    // ── Step 3: Core pool fallback ───────────────────────────────────────────
    // CRITICAL: CORE_WORKSPACE_ID is read here ONLY as an explicit source ID
    // for the global knowledge pool. It is never used as a fallback
    // organizationId for workspace-scoped queries anywhere in this file.
    const coreWorkspaceId = process.env.CORE_WORKSPACE_ID;

    if (coreWorkspaceId) {
      const { data: coreEntries, error: coreError } = await admin
        .from("federated_knowledge")
        .select("id, content, domain, confidence")
        .eq("organization_id", coreWorkspaceId) // explicit global pool query
        .gte("confidence", HIGH_QUALITY_THRESHOLD)
        .gte("created_at", thirtyDaysAgo)
        .order("confidence", { ascending: false })
        .limit(WORKSPACE_SEED_LIMIT);

      if (coreError) {
        logger.warn("[training-seeder] Core knowledge fetch failed (non-fatal)", {
          error: coreError.message,
        });
      }

      const coreRows = (coreEntries ?? []) as Array<{
        id: string;
        content: string;
        domain: string;
        confidence: number;
      }>;

      // Merge workspace entries (if any) with core entries, workspace wins on duplicates
      const merged = [...workspaceRows, ...coreRows].slice(0, WORKSPACE_SEED_LIMIT);

      if (merged.length > 0) {
        const inserted = await insertSeedEntries(merged, workerId, workspaceId, admin);
        await writeSeedMarker(workerId, workspaceId, admin);

        logger.warn("[training-seeder] Worker seeded from core pool", {
          workerId,
          workspaceId,
          workspaceRows: workspaceRows.length,
          coreRows: coreRows.length,
          entriesSeeded: inserted,
        });

        return {
          seeded: true,
          entriesSeeded: inserted,
          source: "core",
          durationMs: Date.now() - startMs,
        };
      }
    }

    // ── Step 4: Synthetic seed ───────────────────────────────────────────────
    // Neither workspace nor core provided entries — fall back to hardcoded
    // baseline patterns that apply universally to any AI Worker.
    const inserted = await insertSeedEntries(
      SYNTHETIC_SEED_ENTRIES.map((e) => ({ ...e, confidence: HIGH_QUALITY_THRESHOLD })),
      workerId,
      workspaceId,
      admin
    );
    await writeSeedMarker(workerId, workspaceId, admin);

    logger.warn("[training-seeder] Worker seeded with synthetic baseline entries", {
      workerId,
      workspaceId,
      entriesSeeded: inserted,
    });

    return {
      seeded: true,
      entriesSeeded: inserted,
      source: "synthetic",
      durationMs: Date.now() - startMs,
    };
  } catch (err) {
    logger.warn("[training-seeder] seedWorkerKnowledge failed (non-fatal)", {
      workerId,
      workspaceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ...skipResult, durationMs: Date.now() - startMs };
  }
}
