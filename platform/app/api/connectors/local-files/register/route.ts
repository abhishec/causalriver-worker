/**
 * POST /api/connectors/local-files/register
 *
 * Called by LocalFilePicker after all files are uploaded.
 * Upserts an org_connectors row so the connector strip shows a
 * "Local Files" pill and status endpoints report it correctly.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = await getCurrentWorkspaceId();
    if (!organizationId) {
      return NextResponse.json({ error: "No workspace" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const filesProcessed = body.filesProcessed ?? 0;
    const chunksCreated = body.chunksCreated ?? 0;
    const directoryName = body.directoryName ?? null;

    const { error: upsertError } = await supabase
      .from("org_connectors")
      .upsert(
        {
          organization_id: organizationId,
          connector_type: "local-files",
          instance_name: "default",
          display_name: "Local Files",
          status: "active",
          signals_count: chunksCreated,
          metadata: {
            filesProcessed,
            chunksCreated,
            directoryName,
            lastUploadAt: new Date().toISOString(),
          },
        },
        { onConflict: "organization_id,connector_type,instance_name" },
      );

    if (upsertError) {
      logger.warn("[local-files/register] Upsert failed", { error: upsertError.message });
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.warn("[local-files/register] Unexpected error", { error: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
