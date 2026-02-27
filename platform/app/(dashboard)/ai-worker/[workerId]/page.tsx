import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { AIWorkerControlClient } from "./ai-worker-control-client";
import { redirect } from "next/navigation";

export const metadata = { title: "AI Worker Control" };

interface AIWorkerPageProps {
  params: Promise<{ workerId: string }>;
}

export default async function AIWorkerPage({ params }: AIWorkerPageProps) {
  const { workerId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const orgId = await getCurrentWorkspaceId();

  return <AIWorkerControlClient orgId={orgId} workerId={workerId} />;
}
