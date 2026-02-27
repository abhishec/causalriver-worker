/**
 * Process Engine — GET /api/process/list
 *
 * Returns recent process instances (agent_queue rows where agent_type='bpaas')
 * for the current workspace. Used by the /processes UI page.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = await getCurrentWorkspaceId();
    if (!organizationId) {
      return NextResponse.json({ jobs: [] });
    }

    const { data, error } = await supabase
      .from("agent_queue")
      .select("id, agent_type, task_type, status, created_at, payload")
      .eq("organization_id", organizationId)
      .eq("agent_type", "bpaas")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      logger.warn("[ProcessList] DB error", { error: error.message });
      return NextResponse.json({ jobs: [] });
    }

    const jobs = (data ?? []).map((row) => ({
      id: row.id,
      process_type: (row.payload as Record<string, unknown>)?.templateType ?? row.task_type ?? "unknown",
      status: row.status,
      created_at: row.created_at,
      payload: row.payload,
    }));

    return NextResponse.json({ jobs });
  } catch (err) {
    logger.error("[ProcessList] Unexpected error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ jobs: [] });
  }
}
