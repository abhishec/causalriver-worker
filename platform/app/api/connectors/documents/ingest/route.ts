/**
 * POST /api/connectors/documents/ingest
 * ======================================
 * Accepts raw text content and ingests it into document_chunks for
 * BrainContextMesh semantic + full-text retrieval.
 *
 * Body params:
 *   content      (required) — raw text to chunk and store
 *   sourceType   — 'pdf' | 'confluence' | 'github' | 'markdown' | 'text' (default: 'text')
 *   documentTitle — human-readable title
 *   sourceUrl    — original URL or S3 key
 *   documentId   — external ID (e.g. Confluence page ID, GitHub blob SHA)
 *   metadata     — arbitrary JSONB (page number, section headings, etc.)
 *   pinned       — if true, chunk never expires (default: false)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { ingestDocument } from "@/lib/connectors/document-ingester";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

  // ── Parse body ────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    content,
    sourceType = "text",
    documentTitle,
    sourceUrl,
    documentId,
    metadata,
    pinned,
  } = body as {
    content?: string;
    sourceType?: string;
    documentTitle?: string;
    sourceUrl?: string;
    documentId?: string;
    metadata?: Record<string, unknown>;
    pinned?: boolean;
  };

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  if (content.length > 10_000_000) {
    return NextResponse.json({ error: "Document too large (max 10MB text)" }, { status: 413 });
  }

  const validSourceTypes = ["pdf", "confluence", "github", "markdown", "text"] as const;
  type ValidSourceType = typeof validSourceTypes[number];
  const resolvedSourceType: ValidSourceType = validSourceTypes.includes(sourceType as ValidSourceType)
    ? (sourceType as ValidSourceType)
    : "text";

  // ── Ingest ────────────────────────────────────────────────────────────
  const service = getAdminClient();

  try {
    const result = await ingestDocument(service, {
      organizationId: workspaceId,
      sourceUrl,
      sourceType: resolvedSourceType,
      documentTitle,
      documentId,
      content,
      metadata,
      pinned,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[/api/connectors/documents/ingest] failed", { error: message });
    return NextResponse.json({ error: "Ingestion failed" }, { status: 500 });
  }
}
