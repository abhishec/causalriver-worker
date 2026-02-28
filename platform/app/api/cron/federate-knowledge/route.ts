/**
 * Cron: Federated Knowledge Promotion (ADR-019)
 * ===============================================
 *
 * GET /api/cron/federate-knowledge
 *   Promotes workspace-specific insights in federated_knowledge to universal
 *   (organization_id = null) when the same insight content appears across
 *   3+ distinct workspaces for the same domain.
 *
 * Promotion logic (conservative — content similarity via exact match on first
 * 120 chars of content, same domain):
 *   1. Group workspace-specific rows by (domain, content_prefix)
 *   2. Count distinct organization_ids per group
 *   3. If count >= 3 AND no universal row exists for that content_prefix + domain → promote
 *   4. Insert a new universal row (organization_id = null) with the most common content
 *
 * Schedule: Weekly (see brain-refresh.yml).
 * Max duration: 60s.
 *
 * Security: Bearer CRON_SECRET (same as all other cron routes).
 *
 * Returns: { promoted, skipped, errors }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROMOTION_THRESHOLD = 3; // distinct workspaces required before promoting to universal
const CONTENT_PREFIX_LEN = 120; // chars used for similarity grouping

export async function GET(request: NextRequest) {
  // ── Security ────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();

  try {
    const service = await createServiceClient();

    // ── Step 1: Fetch all workspace-specific rows (org IS NOT NULL) ─────────
    // Limit to 2000 rows to bound memory usage in the weekly run.
    const { data: rows, error: fetchErr } = await service
      .from("federated_knowledge")
      .select("id, organization_id, domain, content, metadata")
      .not("organization_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (fetchErr) {
      logger.warn("[federate-knowledge] Fetch error (non-fatal)", { error: fetchErr.message });
      return NextResponse.json({
        promoted: 0,
        skipped: 0,
        errors: 1,
        message: `Fetch failed: ${fetchErr.message}`,
        startedAt,
      });
    }

    if (!rows || rows.length === 0) {
      logger.info("[federate-knowledge] No workspace-specific rows found — nothing to promote");
      return NextResponse.json({ promoted: 0, skipped: 0, errors: 0, startedAt });
    }

    // ── Step 2: Group by (domain, content_prefix) ────────────────────────────
    type GroupKey = string;
    const groups = new Map<
      GroupKey,
      { domain: string; contentPrefix: string; orgIds: Set<string>; bestContent: string }
    >();

    for (const row of rows) {
      if (!row.content || !row.domain || !row.organization_id) continue;
      const prefix = String(row.content).slice(0, CONTENT_PREFIX_LEN);
      const key: GroupKey = `${row.domain}::${prefix}`;

      if (!groups.has(key)) {
        groups.set(key, {
          domain: row.domain,
          contentPrefix: prefix,
          orgIds: new Set(),
          bestContent: row.content as string,
        });
      }
      groups.get(key)!.orgIds.add(row.organization_id as string);
    }

    // ── Step 3: Fetch existing universal rows to avoid duplicates ────────────
    const { data: universalRows } = await service
      .from("federated_knowledge")
      .select("domain, content")
      .is("organization_id", null)
      .limit(500);

    const existingUniversalKeys = new Set<GroupKey>();
    for (const uRow of universalRows ?? []) {
      if (!uRow.content || !uRow.domain) continue;
      const prefix = String(uRow.content).slice(0, CONTENT_PREFIX_LEN);
      existingUniversalKeys.add(`${uRow.domain}::${prefix}`);
    }

    // ── Step 4: Promote eligible groups ─────────────────────────────────────
    let promoted = 0;
    let skipped = 0;
    let errors = 0;

    for (const [key, group] of groups.entries()) {
      if (group.orgIds.size < PROMOTION_THRESHOLD) {
        skipped++;
        continue;
      }
      if (existingUniversalKeys.has(key)) {
        skipped++;
        continue;
      }

      const promotedAt = new Date().toISOString();
      const { error: insertErr } = await service.from("federated_knowledge").insert({
        organization_id: null,  // universal — applies to all workspaces
        domain: group.domain,
        content: group.bestContent,
        // Direct columns required by brain-context.ts and brain_context org-confidence filter
        confidence: 0.9,        // universal rows always high-confidence (promoted from 3+ orgs)
        promoted_at: promotedAt,
        metadata: {
          source: "federate-knowledge-cron",
          source_workspace_count: group.orgIds.size,
          promoted_at: promotedAt,
        },
      });

      if (insertErr) {
        logger.warn("[federate-knowledge] Promotion insert failed", {
          domain: group.domain,
          error: insertErr.message,
        });
        errors++;
      } else {
        promoted++;
        logger.info("[federate-knowledge] Promoted insight to universal", {
          domain: group.domain,
          sourceWorkspaces: group.orgIds.size,
          contentSnippet: group.contentPrefix.slice(0, 60),
        });
      }
    }

    const completedAt = new Date().toISOString();
    logger.info("[federate-knowledge] Cron complete", { promoted, skipped, errors });

    return NextResponse.json({
      promoted,
      skipped,
      errors,
      totalGroupsEvaluated: groups.size,
      startedAt,
      completedAt,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[federate-knowledge] Fatal error", { error: msg });
    return NextResponse.json({ error: "Internal error", detail: msg }, { status: 500 });
  }
}
