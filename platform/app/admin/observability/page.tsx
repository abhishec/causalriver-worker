import { createServiceClient } from "@/lib/supabase/server";
import { AdminObservabilityClient } from "./admin-observability-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Platform Observability",
};

export default async function AdminObservabilityPage() {
  const supabase = await createServiceClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Fetch cross-org observability data
  const [
    signalIngestionResult,
    causalCalcResult,
    connectorOpsResult,
    agentExecResult,
    layerHealthResult,
    alertsResult,
  ] = await Promise.all([
    supabase
      .from("obs_signal_ingestion")
      .select("*, organizations(name)")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(500),

    supabase
      .from("obs_causal_calculations")
      .select("*, organizations(name)")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(200),

    supabase
      .from("obs_connector_operations")
      .select("*, organizations(name)")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(200),

    supabase
      .from("obs_agent_executions")
      .select("*, organizations(name)")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(200),

    supabase
      .from("obs_layer_health")
      .select("*, organizations(name)")
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("cascade_alerts")
      .select("*, organizations(name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <AdminObservabilityClient
      signalIngestion={signalIngestionResult.data || []}
      causalCalcs={causalCalcResult.data || []}
      connectorOps={connectorOpsResult.data || []}
      agentExecutions={agentExecResult.data || []}
      layerHealth={layerHealthResult.data || []}
      alerts={alertsResult.data || []}
    />
  );
}
