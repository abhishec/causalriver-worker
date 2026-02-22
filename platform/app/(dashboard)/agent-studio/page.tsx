import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { AgentStudioClient } from "./agent-studio-client";
import { logger } from "@/lib/logger";

export const metadata = { title: "Agent Studio" };

export default async function AgentStudioPage() {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  const safe = <T,>(p: PromiseLike<{ data: T | null; error: any }>): Promise<{ data: T | null; error: any }> =>
    Promise.resolve(p).catch((err) => {
      logger.warn("[AgentStudio] Query failed:", err);
      return { data: null as T | null, error: err };
    });

  const { data: { user } } = await supabase.auth.getUser();

  // Fetch templates + usage stats in parallel
  const [templatesResult, statsResult] = await Promise.all([
    safe(supabase
      .from("agent_templates")
      .select("id, org_id, created_by, command_id, label, description, icon, prompt, category, service, gathering_schema, agent_config, source_artifact_id, source_domain_id, is_public, is_archived, usage_count, last_used_at, created_at, updated_at")
      .or(`org_id.eq.${workspaceId},is_public.eq.true`)
      .eq("is_archived", false)
      .order("usage_count", { ascending: false })),
    safe(supabase
      .from("agent_templates")
      .select("id")
      .eq("org_id", workspaceId)
      .eq("is_archived", false)),
  ]);

  const templates = templatesResult.data || [];
  const totalOrgAgents = statsResult.data?.length || 0;

  // Separate: my agents, shared, system
  const myAgents = templates.filter(t => t.org_id === workspaceId && t.created_by === user?.id);
  const sharedAgents = templates.filter(t => t.org_id === workspaceId && t.created_by !== user?.id);
  const publicAgents = templates.filter(t => t.org_id !== workspaceId && t.is_public);

  return (
    <AgentStudioClient
      templates={templates}
      myAgentsCount={myAgents.length}
      sharedAgentsCount={sharedAgents.length}
      publicAgentsCount={publicAgents.length}
      workspaceId={workspaceId}
      userId={user?.id || ""}
    />
  );
}
