/**
 * GET /api/brain/documents
 * =========================
 * Returns a list of documents ingested into document_chunks for the current
 * workspace, grouped by document_title. Used by the Knowledge Base UI to
 * show what PDFs and files have been fed into the Brain.
 *
 * Query params:
 *   source_type — filter by source type: 'pdf' | 'text' | 'markdown' | etc.
 *   limit       — max document groups (default: 50, max: 200)
 *
 * Returns:
 *   {
 *     documents: [
 *       {
 *         title: string,
 *         sourceType: string,
 *         chunkCount: number,
 *         uploadedAt: string,      // earliest created_at for this title
 *         uploadedBy: string|null, // from metadata.uploaded_by
 *         isPinned: boolean,
 *         wasTruncated: boolean,
 *       }
 *     ]
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────
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

  // ── Parse query params ────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const rawLimit = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Number.isNaN(rawLimit) ? 50 : Math.max(1, Math.min(rawLimit, 200));
  const sourceTypeFilter = searchParams.get("source_type") ?? null;

  // ── Query document_chunks, group by document_title ─────────────────
  const service = getAdminClient();

  try {
    // Fetch chunks (select only metadata columns — not chunk_text — to keep payload small)
    let query = service
      .from("document_chunks")
      .select("document_title, source_type, chunk_index, pinned, metadata, created_at")
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit * 50); // fetch enough raw chunks to produce `limit` unique docs

    if (sourceTypeFilter) {
      query = query.eq("source_type", sourceTypeFilter);
    }

    const { data: chunks, error } = await query;

    if (error) {
      logger.warn("[/api/brain/documents] Query failed", { error: error.message });
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    if (!chunks || chunks.length === 0) {
      return NextResponse.json({ documents: [] });
    }

    // Group by document_title — produce one entry per unique title
    type DocEntry = {
      title: string;
      sourceType: string;
      chunkCount: number;
      uploadedAt: string;
      uploadedBy: string | null;
      isPinned: boolean;
      wasTruncated: boolean;
    };

    const docMap = new Map<string, DocEntry>();

    for (const chunk of chunks) {
      const title = chunk.document_title ?? "(untitled)";
      const existing = docMap.get(title);
      const meta = (chunk.metadata ?? {}) as Record<string, unknown>;

      if (!existing) {
        docMap.set(title, {
          title,
          sourceType: chunk.source_type ?? "unknown",
          chunkCount: 1,
          uploadedAt: chunk.created_at ?? new Date().toISOString(),
          uploadedBy: typeof meta.uploaded_by === "string" ? meta.uploaded_by : null,
          isPinned: chunk.pinned ?? false,
          wasTruncated: meta.is_truncated === true,
        });
      } else {
        existing.chunkCount += 1;
        // Keep earliest uploadedAt
        if (chunk.created_at && chunk.created_at < existing.uploadedAt) {
          existing.uploadedAt = chunk.created_at;
        }
        if (chunk.pinned) existing.isPinned = true;
        if (meta.is_truncated === true) existing.wasTruncated = true;
      }
    }

    // Return up to `limit` documents, ordered by most recent first
    const documents = Array.from(docMap.values()).slice(0, limit);

    return NextResponse.json({ documents });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[/api/brain/documents] Failed", { error: message });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
