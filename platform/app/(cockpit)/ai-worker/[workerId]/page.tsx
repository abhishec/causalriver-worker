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

  return <AIWorkerControlClient orgId={orgId} workerId={workerId} />;
}
