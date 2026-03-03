/**
 * Cron: Tool Maker (ADR-028)
 * ===========================
 *
 * GET /api/cron/tool-maker
 *   Synthesizes tools from recurring capability gaps in capability_library.
 *   Uses Opus/Sonnet for high-quality synthesis with self-correction loops.
 *
 * Schedule: Every 30 minutes (same cadence as cognitive-cycle)
 * Security: Protected by Bearer CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max

const MAX_ORGS_PER_RUN = 3;
const MAX_TOOLS_PER_ORG = 3;
const MIN_GAP_OCCURRENCES = 3;

// Module-level TTL guard — max once per 30 min per org
const _lastRunMs = new Map<string, number>();
const COOLDOWN_MS = 30 * 60 * 1000;

export async function GET(req: NextRequest) {
  // Auth check (same pattern as cognitive-cycle)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();

  try {
    const service = await createServiceClient();

    // Get active orgs with capability gaps
    const { data: orgs } = await service
      .from("capability_library")
      .select("organization_id")
      .eq("status", "gap")
      .limit(50);

    if (!orgs?.length) {
      return NextResponse.json({ message: "No gaps to process", duration: Date.now() - startMs });
    }

    // Deduplicate org IDs
    const uniqueOrgIds = [...new Set(orgs.map(r => r.organization_id as string))].slice(0, MAX_ORGS_PER_RUN);

    let totalSynthesized = 0;
    const results: Array<{ orgId: string; synthesized: number; errors: number }> = [];

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
    }

    for (const orgId of uniqueOrgIds) {
      // TTL guard
      const lastRun = _lastRunMs.get(orgId) ?? 0;
      if (Date.now() - lastRun < COOLDOWN_MS) {
        results.push({ orgId: orgId.slice(0, 8), synthesized: 0, errors: 0 });
        continue;
      }
      _lastRunMs.set(orgId, Date.now());

      let synthesized = 0;
      let errors = 0;

      try {
        // Find recurring gaps (domains with 3+ gap records)
        const { data: gapRows } = await service
          .from("capability_library")
          .select("id, domain, description")
          .eq("organization_id", orgId)
          .eq("status", "gap")
          .order("created_at", { ascending: false })
          .limit(100);

        if (!gapRows?.length) continue;

        // Group by domain, count occurrences
        const domainCounts = new Map<string, { count: number; gap: { id: string; domain: string; query: string } }>();
        for (const row of gapRows) {
          const domain = (row.domain as string).replace(/^capability-gap:/, "");
          const existing = domainCounts.get(domain);
          if (existing) {
            existing.count++;
          } else {
            domainCounts.set(domain, {
              count: 1,
              gap: { id: row.id as string, domain, query: (row.description as string) || "" },
            });
          }
        }

        // Filter for recurring gaps (3+ occurrences), take top N
        const qualifyingGaps = [...domainCounts.entries()]
          .filter(([, v]) => v.count >= MIN_GAP_OCCURRENCES)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, MAX_TOOLS_PER_ORG);

        for (const [, { count, gap }] of qualifyingGaps) {
          try {
            // Check if a validated/promoted tool already exists for this domain
            const { data: existingTool } = await service
              .from("capability_library")
              .select("id")
              .eq("organization_id", orgId)
              .eq("domain", gap.domain)
              .in("status", ["validated", "promoted"])
              .limit(1);

            if (existingTool?.length) continue; // Already have a tool

            // ADR-031: Route to appropriate synthesizer based on gap domain.
            // reflex: domain gaps → workflow synthesis (generates step graphs)
            // other domain gaps → compute synthesis (generates JS functions)
            const isReflexGap = gap.domain.startsWith("reflex:");
            let result;

            if (isReflexGap) {
              const { synthesizeWorkflowFromGap } = await import("@/lib/brain/tool-maker");
              result = await synthesizeWorkflowFromGap(service, orgId, { ...gap, occurrences: count }, apiKey);
            } else {
              const { synthesizeToolFromGap } = await import("@/lib/brain/tool-maker");
              result = await synthesizeToolFromGap(service, orgId, { ...gap, occurrences: count }, apiKey);
            }

            if (result) {
              synthesized++;
              totalSynthesized++;
            }
          } catch (err) {
            errors++;
            logger.warn("[tool-maker-cron] Gap synthesis failed", {
              orgId: orgId.slice(0, 8),
              domain: gap.domain,
              error: String(err),
            });
          }
        }
      } catch (err) {
        errors++;
        logger.warn("[tool-maker-cron] Org processing failed", {
          orgId: orgId.slice(0, 8),
          error: String(err),
        });
      }

      results.push({ orgId: orgId.slice(0, 8), synthesized, errors });
    }

    const durationMs = Date.now() - startMs;
    logger.info("[tool-maker-cron] Completed", { totalSynthesized, orgs: uniqueOrgIds.length, durationMs });

    return NextResponse.json({
      message: `Synthesized ${totalSynthesized} tools`,
      results,
      duration: durationMs,
    });
  } catch (err) {
    logger.error("[tool-maker-cron] Fatal error", { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
