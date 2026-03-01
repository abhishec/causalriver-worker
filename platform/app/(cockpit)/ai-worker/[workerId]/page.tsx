import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import AIWorkerControlClient from "./ai-worker-control-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "AI Worker — BrainOS" };

interface Props {
  params: Promise<{ workerId: string }>;
}

export default async function AIWorkerControlPage({ params }: Props) {
  const { workerId } = await params;

  // Guard: "new" is not a valid workerId — redirect to creation form
  if (workerId === "new") redirect("/ai-worker/create");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  let orgId = "";
  try {
    orgId = await getCurrentWorkspaceId();
  } catch {
    // fall through — client will handle missing orgId
  }

  // Validate that the worker exists and belongs to this session's org (enforced by RLS).
  // .maybeSingle() returns data=null when no row found (no throw), so redirect() won't
  // be accidentally swallowed by a catch block.
  const { data: workerRow } = await supabase
    .from("ai_workers")
    .select("name")
    .eq("id", workerId)
    .maybeSingle();

  if (!workerRow) redirect("/workspace");

  const initialWorkerName: string | undefined = workerRow.name ?? undefined;

  return <AIWorkerControlClient orgId={orgId} workerId={workerId} initialWorkerName={initialWorkerName} />;
}
