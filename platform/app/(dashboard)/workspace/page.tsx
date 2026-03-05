import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import WorkspaceMissionControl from "./workspace-mission-control";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mission Control — BrainOS" };

export default async function WorkspacePage() {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    redirect("/login");
  }

  let user;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    redirect("/login");
  }

  if (!user) redirect("/login");

  let orgId = "";
  try {
    orgId = await getCurrentWorkspaceId();
  } catch {
    // pass — orgId stays empty, page handles gracefully
  }

  return (
    <ErrorBoundary section="Mission Control">
      <WorkspaceMissionControl orgId={orgId} />
    </ErrorBoundary>
  );
}
