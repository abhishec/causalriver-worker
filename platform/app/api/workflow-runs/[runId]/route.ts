export const dynamic = "force-dynamic";
/**
 * Workflow Run Detail API — Get run with steps
 * =============================================
 *
 * GET /api/workflow-runs/[runId]
 */

import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";

interface Props {
  params: Promise<{ runId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  try {
    const { runId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();

    const [runResult, stepsResult] = await Promise.all([
      supabase
        .from("workflow_runs")
        .select("*")
        .eq("id", runId)
        .eq("organization_id", workspaceId)
        .single(),
      supabase
        .from("workflow_run_steps")
        .select("*")
        .eq("workflow_run_id", runId)
        .order("step_order", { ascending: true }),
    ]);

    if (runResult.error || !runResult.data) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json({
      run: runResult.data,
      steps: stepsResult.data || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
