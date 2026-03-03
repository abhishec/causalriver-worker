import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
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

  // Validate that the worker exists.
  // Uses service client to bypass RLS on ai_workers — the ai_workers RLS policy
  // references org_members which has its own RLS, causing infinite recursion when
  // queried via user client (same pattern as /api/workspace/memberships admin bypass).
  // Auth is already validated above (user must be authenticated).
  let service;
  try {
    service = await createServiceClient();
  } catch {
    service = supabase; // fallback to user client
  }
  const { data: workerRow } = await service
    .from("ai_workers")
    .select("name, organization_id")
    .eq("id", workerId)
    .maybeSingle();

  if (!workerRow) redirect("/workspace");

  const initialWorkerName: string | undefined = workerRow.name ?? undefined;
  // Use the worker's own org — always correct; avoids CORE workspace fallback for admins
  const workerOrgId: string = (workerRow as any).organization_id ?? orgId;

  return <AIWorkerControlClient orgId={workerOrgId} workerId={workerId} initialWorkerName={initialWorkerName} />;
}
