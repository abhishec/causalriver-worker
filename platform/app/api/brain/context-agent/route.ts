/**
 * GET /api/brain/context-agent?query=...&domain=...&forceRefresh=1
 *
 * Runs the Context Agent for the current AI Worker (workspace).
 * Returns full ContextAgentResult: brain context, strategic brief,
 * worker config, cache metadata.
 *
 * Used by Copilot before sending a query to understand what the AI Worker
 * is capable of right now and get a domain recommendation.
 *
 * Query params:
 *   query        — (required) the user's query text
 *   domain       — (optional) pre-known domain, skips domain recommendation
 *   forceRefresh — (optional) set to "1" or "true" to bypass cache
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import { runContextAgent } from "@/lib/brain/context-agent";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  let user = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error) user = data.user;
  } catch (authErr) {
    logger.warn("[context-agent] Auth failed:", authErr);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Params ───────────────────────────────────────────────────────────────
  const url = new URL(req.url);
  const query = url.searchParams.get("query");
  const domain = url.searchParams.get("domain") ?? undefined;
  const forceRefreshParam = url.searchParams.get("forceRefresh");
  const forceRefresh =
    forceRefreshParam === "1" || forceRefreshParam === "true";

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: 'Missing required query param: "query"' },
      { status: 400 }
    );
  }

  // ── Workspace ────────────────────────────────────────────────────────────
  let workspaceId: string;
  try {
    workspaceId = await getCurrentWorkspaceId();
  } catch (wsErr) {
    logger.warn("[context-agent] Could not resolve workspace:", wsErr);
    return NextResponse.json(
      { error: "Could not resolve AI Worker workspace" },
      { status: 400 }
    );
  }

  if (!workspaceId) {
    return NextResponse.json(
      { error: "No active AI Worker workspace" },
      { status: 400 }
    );
  }

  // ── Run context agent ────────────────────────────────────────────────────
  try {
    const result = await runContextAgent({
      orgId: workspaceId,
      query: query.trim(),
      domain,
      forceRefresh,
    });

    logger.info(
      `[context-agent] org=${workspaceId} cacheHit=${result.cacheHit} ` +
        `dataAvailability=${result.strategicBrief?.dataAvailability ?? "n/a"} ` +
        `recommendedDomain=${result.strategicBrief?.recommendedDomain ?? "n/a"}`
    );

    return NextResponse.json(result);
  } catch (err) {
    logger.error("[context-agent] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
