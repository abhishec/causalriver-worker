import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import ReleaseDashboardClient from "./releases-client";

export const dynamic = 'force-dynamic';

export default async function ReleasesPage() {
  const workspaceId = await getCurrentWorkspaceId();
  const service = await createServiceClient();

  // Load active releases from DB
  const { data: releases } = await service
    .from("release_entities")
    .select("*")
    .eq("organization_id", workspaceId)
    .eq("status", "in_progress")
    .order("target_date", { ascending: true });

  return <ReleaseDashboardClient initialReleases={releases ?? []} orgId={workspaceId} />;
}
