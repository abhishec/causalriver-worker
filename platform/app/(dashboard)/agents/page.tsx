import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { AgentsClient } from "./agents-client";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Agents",
};

export default async function AgentsPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId();

  const { data: snapshots } = await supabase
    .from("brain_daily_snapshots")
    .select("*")
    .eq("organization_id", orgId)
    .order("snapshot_date", { ascending: false })
    .limit(7);

  return (
    <AgentsClient
      latestSnapshot={snapshots?.[0] || null}
      recentSnapshots={snapshots || []}
    />
  );
}
