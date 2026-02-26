/**
 * GET /api/connectors/documents/search
 * ======================================
 * Full-text search over document_chunks for the current workspace.
 * Uses PostgreSQL tsvector search (falls back to recent chunks when query is empty).
 * Scoped to the authenticated user's workspace via org membership check.
 *
 * Query params:
 *   q           — search query (optional; omit or empty for most-recent chunks)
 *   limit       — max results (default: 5, max: 20)
 *   source_type — filter by source type: 'pdf' | 'confluence' | 'github' | 'markdown' | 'text'
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { searchDocumentChunks } from "@/lib/connectors/document-ingester";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  // ── Parse query params ───────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") ?? "").trim();
  const rawLimit = parseInt(searchParams.get("limit") ?? "5", 10);
  const limit = Number.isNaN(rawLimit) ? 5 : Math.max(1, Math.min(rawLimit, 20));
  const sourceTypeFilter = searchParams.get("source_type") ?? null;

  const validSourceTypes = ["pdf", "confluence", "github", "markdown", "text"] as const;
  type ValidSourceType = (typeof validSourceTypes)[number];
  const resolvedSourceType =
    sourceTypeFilter && validSourceTypes.includes(sourceTypeFilter as ValidSourceType)
      ? (sourceTypeFilter as ValidSourceType)
      : null;

  // ── Search ────────────────────────────────────────────────────────────
  const service = getAdminClient();

  try {
    const chunks = await searchDocumentChunks(service, workspaceId, query, limit);

    // Apply source_type filter if specified (searchDocumentChunks doesn't support it directly)
    const filtered = resolvedSourceType
      ? chunks.filter((c) => c.source_type === resolvedSourceType)
      : chunks;

    return NextResponse.json({
      ok: true,
      query: query || null,
      source_type: resolvedSourceType,
      total: filtered.length,
      chunks: filtered,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[/api/connectors/documents/search] failed", { error: message });
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
