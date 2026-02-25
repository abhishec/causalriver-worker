export const dynamic = "force-dynamic";
/**
 * Workflow Runs API — List runs for a workflow
 * =============================================
 *
 * GET /api/workflows/[id]/runs
 */

import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  try {
    const { id: workflowId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();
    const limit = Math.min(Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 20), 100);

    const { data: runs, error } = await supabase
      .from("workflow_runs")
      .select("*")
      .eq("workflow_id", workflowId)
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: "Failed to fetch runs" }, { status: 500 });
    }

    return NextResponse.json({ runs: runs || [] });
  } catch (error: any) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
