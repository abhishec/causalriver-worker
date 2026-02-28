/**
 * Cron: Memory Cleaner
 * ====================
 *
 * GET /api/cron/cleanup-memory
 *   Deletes old rows from memory/signal tables so they don't grow unbounded.
 *
 * Schedule (vercel.json / external scheduler): daily
 *
 * What it removes:
 *   - cross_domain_signals        older than 90 days
 *   - prediction_records          older than 90 days
 *   - brain_case_log              older than 180 days
 *   - agent_queue (done rows)     older than 30 days  (status: success | error | recovered)
 *   - ai_memory (working)         memory_type='working', domain='cognitive-planner', older than 1 hour
 *   - ai_memory (dedup markers)   memory_type='dedup', older than 3 hours
 *   - ai_memory (conversation/bootstrap/planner-schedule)  older than 30 days
 *   - ai_memory (federated)       older than 90 days
 *   Keep: memory_type='correction' and memory_type='dedup' (dedup handled above with 3h window)
 *
 * Each table is deleted independently — a failure on one does NOT abort the rest.
 * Returns a JSON summary with the deleted row counts per table.
 *
 * Security: Protected by CRON_SECRET Bearer token (same pattern as /api/cron/evolution).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function hoursAgoISO(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

/** Run a single delete, swallow errors, return deleted count (or -1 on failure). */
async function safeDelete(
  label: string,
  fn: () => PromiseLike<{ error: unknown; count: number | null }>
): Promise<{ label: string; deleted: number; error: string | null }> {
  try {
    const { error, count } = await fn();
    if (error) {
      const msg = (error as { message?: string }).message ?? String(error);
      logger.warn(`[cleanup-memory] ${label} delete error: ${msg}`);
      return { label, deleted: 0, error: msg };
    }
    const deleted = count ?? 0;
    logger.info(`[cleanup-memory] ${label}: deleted ${deleted} rows`);
    return { label, deleted, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[cleanup-memory] ${label} threw: ${msg}`);
    return { label, deleted: 0, error: msg };
  }
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // ── Security: Verify cron secret ──────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Require CRON_SECRET in ALL environments. Fail closed if not set.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();

  try {
    const admin = await createServiceClient();

    // Run all deletes independently — don't let one failure stop the others
    const results = await Promise.all([
      // cross_domain_signals older than 90 days
      safeDelete("cross_domain_signals", () =>
        admin
          .from("cross_domain_signals")
          .delete({ count: "exact" })
          .lt("created_at", daysAgoISO(90))
      ),

      // prediction_records older than 90 days
      safeDelete("prediction_records", () =>
        admin
          .from("prediction_records")
          .delete({ count: "exact" })
          .lt("created_at", daysAgoISO(90))
      ),

      // brain_case_log entries older than 180 days
      safeDelete("brain_case_log", () =>
        admin
          .from("brain_case_log")
          .delete({ count: "exact" })
          .lt("created_at", daysAgoISO(180))
      ),

      // agent_queue completed/failed jobs older than 30 days
      safeDelete("agent_queue", () =>
        admin
          .from("agent_queue")
          .delete({ count: "exact" })
          .in("status", ["success", "error", "recovered"])
          .lt("created_at", daysAgoISO(30))
      ),

      // ai_memory working memory rows inserted by cognitive-planner Phase 4, older than 1 hour
      // B1: cognitive-planner inserts a working row every 30min per org — never cleaned up otherwise
      safeDelete("ai_memory(working)", () =>
        admin
          .from("ai_memory")
          .delete({ count: "exact" })
          .eq("memory_type", "working")
          .eq("domain", "cognitive-planner")
          .lt("created_at", hoursAgoISO(1))
      ),

      // ai_memory dedup markers expire after 2h but are never deleted — orphaned rows accumulate
      // B2: delete markers older than 3 hours (1h grace buffer beyond the 2h cooldown window)
      safeDelete("ai_memory(dedup)", () =>
        admin
          .from("ai_memory")
          .delete({ count: "exact" })
          .eq("memory_type", "dedup")
          .lt("created_at", hoursAgoISO(3))
      ),

      // ai_memory conversation/bootstrap/planner-schedule entries older than 30 days
      // These are high-volume ephemeral types: conversation turns, worker bootstrap seeds, planner schedules
      // Keep: correction (indefinite), dedup (handled above)
      safeDelete("ai_memory(conversation/bootstrap/planner-schedule)", () =>
        admin
          .from("ai_memory")
          .delete({ count: "exact" })
          .in("memory_type", ["conversation", "bootstrap", "planner-schedule"])
          .lt("created_at", daysAgoISO(30))
      ),

      // ai_memory federated entries older than 90 days
      // Federated knowledge ages out — promoted entries live in federated_knowledge table instead
      safeDelete("ai_memory(federated)", () =>
        admin
          .from("ai_memory")
          .delete({ count: "exact" })
          .eq("memory_type", "federated")
          .lt("created_at", daysAgoISO(90))
      ),
    ]);

    const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);
    const errors = results.filter((r) => r.error !== null);

    const completedAt = new Date().toISOString();

    logger.info(
      `[cleanup-memory] Complete: ${totalDeleted} rows deleted across ${results.length} tables, ${errors.length} errors`
    );

    return NextResponse.json({
      success: errors.length === 0,
      summary: {
        totalDeleted,
        tablesProcessed: results.length,
        errorCount: errors.length,
      },
      results: results.reduce<Record<string, { deleted: number; error: string | null }>>(
        (acc, r) => {
          acc[r.label] = { deleted: r.deleted, error: r.error };
          return acc;
        },
        {}
      ),
      startedAt,
      completedAt,
    });
  } catch (err: unknown) {
    logger.error("[cleanup-memory] Fatal error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
