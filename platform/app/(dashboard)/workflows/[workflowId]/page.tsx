import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { WorkflowDetailClient } from "./workflow-detail-client";
import { logger } from "@/lib/logger";

export const metadata = { title: "Workflow Detail" };

interface Props {
  params: Promise<{ workflowId: string }>;
  searchParams: Promise<{ runId?: string }>;
}

export default async function WorkflowDetailPage({ params, searchParams }: Props) {
  const { workflowId } = await params;
  const { runId } = await searchParams;
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();
  const { data: { user } } = await supabase.auth.getUser();

  const safe = <T,>(p: PromiseLike<{ data: T | null; error: any }>): Promise<{ data: T | null; error: any }> =>
    Promise.resolve(p).catch((err) => {
      logger.warn("[WorkflowDetail] Query failed:", err);
      return { data: null as T | null, error: err };
    });

  const [workflowResult, runsResult] = await Promise.all([
    safe(supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .eq("organization_id", workspaceId)
      .single()),
    safe(supabase
      .from("workflow_runs")
      .select("*")
      .eq("workflow_id", workflowId)
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(20)),
  ]);

  const workflow = workflowResult.data;
  if (!workflow) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Workflow not found</p>
      </div>
    );
  }

  const runs = runsResult.data || [];

  return (
    <WorkflowDetailClient
      workflow={workflow}
      runs={runs}
      highlightRunId={runId || null}
      workspaceId={workspaceId}
      userId={user?.id || ""}
    />
  );
}
