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

  // Pre-fetch worker name server-side so the first render shows the real name
  // instead of the "AI Worker" fallback during the async client fetch.
  let initialWorkerName: string | undefined;
  try {
    const { data } = await supabase
      .from("ai_workers")
      .select("name")
      .eq("id", workerId)
      .single();
    initialWorkerName = data?.name ?? undefined;
  } catch {
    // fall through — client fetch will populate name
  }

  return <AIWorkerControlClient orgId={orgId} workerId={workerId} initialWorkerName={initialWorkerName} />;
}
