import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import ReleaseDashboardClient from "./releases-client";


export default async function ReleasesPage() {
  const workspaceId = await getCurrentWorkspaceId();
  const service = await createServiceClient();

  // Load active releases from DB — safe wrapper in case table doesn't exist yet
  let releases: any[] = [];
  try {
    const { data } = await service
      .from("release_entities")
      .select("*")
      .eq("organization_id", workspaceId)
      .eq("status", "in_progress")
      .order("target_date", { ascending: true });
    releases = data ?? [];
  } catch {
    // Table may not exist in all environments — degrade gracefully
  }

  return <ReleaseDashboardClient initialReleases={releases} orgId={workspaceId} />;
}
