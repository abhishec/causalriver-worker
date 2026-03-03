/**
 * Worker Bootstrap
 * =================
 *
 * Runs after a new AI Worker is created. Seeds:
 *   1. Federated knowledge → ai_memory (universal + org-specific)
 *   2. Prediction records seed (if org has none)
 *   3. Initial bootstrap memory entry
 *
 * All steps are wrapped in individual try/catch — any failure is non-fatal.
 * Called fire-and-forget from POST /api/ai-workers.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { seedWorkerKnowledge } from "@/lib/brain/training-seeder";

export async function triggerWorkerBootstrap(
  workerId: string,
  orgId: string
): Promise<void> {
  let supabase;
  try {
    supabase = await createServiceClient();
  } catch (err) {
    logger.warn("[worker-bootstrap] Could not create service client — skipping bootstrap", err);
    return;
  }

  // ── Step 1: Federated knowledge pull ──────────────────────────────────────
  // Pull universal knowledge (org IS NULL) + org-specific knowledge, limit 20.
  // Insert each as ai_memory with memory_type='federated'.
  try {
    const { data: fedRows } = await supabase
      .from("federated_knowledge")
      .select("id, content, domain, metadata")
      .or(`organization_id.is.null,organization_id.eq.${orgId}`)
      .limit(20);

    if (fedRows && fedRows.length > 0) {
      const memoryRows = fedRows.map((row: { id: string; content: string; domain?: string; metadata?: Record<string, unknown> }) => ({
        organization_id: orgId,
        ai_worker_id: workerId,
        context_id: workerId,
        memory_type: "federated",
        domain: row.domain || "general",
        content: row.content,
        importance: 0.7,
        metadata: {
          source: "federated_knowledge",
          source_id: row.id,
          ...(row.metadata || {}),
        },
      }));

      await supabase.from("ai_memory").insert(memoryRows);
      logger.info("[worker-bootstrap] Federated knowledge seeded", { workerId, count: memoryRows.length });
    }
  } catch (err) {
    logger.warn("[worker-bootstrap] Step 1 (federated knowledge) failed — non-fatal", err);
  }

  // ── Step 2: Prediction records seed ───────────────────────────────────────
  // If no prediction_records exist for this org, insert 3 defaults.
  try {
    const { data: existing } = await supabase
      .from("prediction_records")
      .select("id")
      .eq("organization_id", orgId)
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from("prediction_records").insert([
        {
          organization_id: orgId,
          ai_worker_id: workerId,
          domain: "general",
          confidence: 0.65,
          success: true,
        },
        {
          organization_id: orgId,
          ai_worker_id: workerId,
          domain: "general",
          confidence: 0.65,
          success: true,
        },
        {
          organization_id: orgId,
          ai_worker_id: workerId,
          domain: "general",
          confidence: 0.65,
          success: true,
        },
      ]);
      logger.info("[worker-bootstrap] Prediction records seeded", { workerId, orgId });
    }
  } catch (err) {
    logger.warn("[worker-bootstrap] Step 2 (prediction records) failed — non-fatal", err);
  }

  // ── Step 3: Initial memory bootstrap ──────────────────────────────────────
  try {
    await supabase.from("ai_memory").insert({
      organization_id: orgId,
      ai_worker_id: workerId,
      memory_type: "bootstrap",
      domain: "general",
      content: "AI Worker initialized. Ready to assist.",
      importance: 0.5,
      metadata: {
        bootstrapped_at: new Date().toISOString(),
        worker_id: workerId,
      },
    });
  } catch (err) {
    logger.warn("[worker-bootstrap] Step 3 (initial memory) failed — non-fatal", err);
  }

  // ── Step 4: Training seeder ───────────────────────────────────────────────
  // Seeds the new worker with high-quality federated knowledge.
  // Idempotent (24h guard via ai_memory marker) — safe to call on every bootstrap.
  try {
    await seedWorkerKnowledge(workerId, orgId, supabase);
    logger.info("[worker-bootstrap] Training seeder complete", { workerId, orgId });
  } catch (err) {
    logger.warn("[worker-bootstrap] Step 4 (training seeder) failed — non-fatal", err);
  }

  // ── Step 5: Log completion ─────────────────────────────────────────────────
  logger.info("[worker-bootstrap] Bootstrap complete", { workerId, orgId });
}
