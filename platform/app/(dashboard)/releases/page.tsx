import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import ReleaseDashboardClient from "./releases-client";

export const dynamic = 'force-dynamic';

export default async function ReleasesPage() {
  const orgId = await getCurrentOrgId();
  const service = await createServiceClient();

  // Load active releases from DB
  const { data: releases } = await service
    .from("release_entities")
    .select("*")
    .eq("organization_id", orgId)
    .eq("status", "in_progress")
    .order("target_date", { ascending: true });

  return <ReleaseDashboardClient initialReleases={releases ?? []} orgId={orgId} />;
}
