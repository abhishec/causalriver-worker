/**
 * GET /api/brain/repo-map
 * ========================
 * Builds a PageRank-weighted symbol map of the codebase (Aider pattern).
 * Scales to unlimited repo size — always outputs a compact map that fits in LLM context.
 *
 * Security: Bearer CRON_SECRET required.
 *
 * Query params:
 *   organizationId  — org to store the map under (required)
 *   maxSymbols      — top N symbols to include (default: 150)
 *   maxMapChars     — max chars in output map (default: 4000)
 *
 * Returns:
 *   { totalFiles, totalSymbols, topSymbolCount, mapLength, mapPreview, generatedAt }
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { buildAndStoreRepoMap } from "@/lib/brain/repo-map";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — ts-morph parsing can be slow on large repos

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const orgId = searchParams.get("organizationId");
  const maxSymbols = parseInt(searchParams.get("maxSymbols") ?? "150", 10);
  const maxMapChars = parseInt(searchParams.get("maxMapChars") ?? "4000", 10);

  if (!orgId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  // ── Resolve project root ───────────────────────────────────────────────────
  // process.cwd() in Next.js runtime points to the app root (the platform/ directory).
  // For the monorepo: repo root is one level up.
  const projectRoot = path.resolve(process.cwd());
  logger.warn(`[repo-map] Starting repo map build. projectRoot=${projectRoot} orgId=${orgId}`);

  const supabase = getAdminClient();

  try {
    const start = Date.now();
    const result = await buildAndStoreRepoMap(supabase, orgId, projectRoot, {
      maxSymbols: isNaN(maxSymbols) ? 150 : Math.min(maxSymbols, 500),
      maxMapChars: isNaN(maxMapChars) ? 4000 : Math.min(maxMapChars, 10_000),
    });
    const elapsed = Date.now() - start;

    logger.warn(
      `[repo-map] Complete. files=${result.totalFiles} symbols=${result.totalSymbols} mapLen=${result.mapLength} elapsed=${elapsed}ms`,
    );

    return NextResponse.json({
      success: true,
      totalFiles: result.totalFiles,
      totalSymbols: result.totalSymbols,
      mapLength: result.mapLength,
      elapsedMs: elapsed,
      projectRoot,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[repo-map] Failed to build repo map:", message);
    return NextResponse.json({ error: "Failed to build repo map", detail: message }, { status: 500 });
  }
}
