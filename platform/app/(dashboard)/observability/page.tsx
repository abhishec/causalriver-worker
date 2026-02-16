import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { ObservabilityClient } from "./observability-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Observability",
};

export default async function ObservabilityPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId();

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Fetch observability data in parallel
  const [
    signalIngestionResult,
    causalCalcResult,
    entityResResult,
    connectorOpsResult,
    agentExecResult,
    layerHealthResult,
    alertsResult,
  ] = await Promise.all([
    // Signal ingestion metrics
    supabase
      .from("obs_signal_ingestion")
      .select("*")
      .eq("organization_id", orgId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(200),

    // Causal calculations
    supabase
      .from("obs_causal_calculations")
      .select("*")
      .eq("organization_id", orgId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(100),

    // Entity resolution
    supabase
      .from("obs_entity_resolution")
      .select("*")
      .eq("organization_id", orgId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(100),

    // Connector operations
    supabase
      .from("obs_connector_operations")
      .select("*")
      .eq("organization_id", orgId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(100),

    // Agent executions
    supabase
      .from("obs_agent_executions")
      .select("*")
      .eq("organization_id", orgId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(100),

    // Layer health
    supabase
      .from("obs_layer_health")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(15),

    // Alerts
    supabase
      .from("cascade_alerts")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <ObservabilityClient
      signalIngestion={signalIngestionResult.data || []}
      causalCalcs={causalCalcResult.data || []}
      entityResolution={entityResResult.data || []}
      connectorOps={connectorOpsResult.data || []}
      agentExecutions={agentExecResult.data || []}
      layerHealth={layerHealthResult.data || []}
      alerts={alertsResult.data || []}
    />
  );
}
