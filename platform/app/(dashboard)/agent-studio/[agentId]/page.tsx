import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { AgentEditorClient } from "./agent-editor-client";
import { notFound } from "next/navigation";

export const metadata = { title: "Edit Agent" };

interface Props {
  params: Promise<{ agentId: string }>;
}

export default async function AgentEditorPage({ params }: Props) {
  const { agentId } = await params;

  // "new" is handled client-side with prefill
  if (agentId === "new") {
    return <AgentEditorClient template={null} workspaceId="" isOwner={true} />;
  }

  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: template, error } = await supabase
    .from("agent_templates")
    .select("*")
    .eq("id", agentId)
    .single();

  if (error || !template) {
    notFound();
  }

  const isOwner = template.created_by === user?.id;

  return (
    <AgentEditorClient
      template={template}
      workspaceId={workspaceId}
      isOwner={isOwner}
    />
  );
}
