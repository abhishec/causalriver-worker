import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { ObservabilityClient } from "./observability-client";
import { logger } from "@/lib/logger";


export const metadata = {
  title: "Observability",
};

export default async function ObservabilityPage() {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Wrap each query to prevent a single failure from crashing the whole page
  const safe = <T,>(p: PromiseLike<{ data: T | null; error: any }>): Promise<{ data: T | null; error: any }> =>
    Promise.resolve(p).catch((err) => {
      logger.warn("[Observability] Query failed:", err);
      return { data: null as T | null, error: err };
    });

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
    safe(supabase
      .from("obs_signal_ingestion")
      .select("*")
      .eq("organization_id", workspaceId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(200)),

    // Causal calculations
    safe(supabase
      .from("obs_causal_calculations")
      .select("*")
      .eq("organization_id", workspaceId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(100)),

    // Entity resolution
    safe(supabase
      .from("obs_entity_resolution")
      .select("*")
      .eq("organization_id", workspaceId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(100)),

    // Connector operations
    safe(supabase
      .from("obs_connector_operations")
      .select("*")
      .eq("organization_id", workspaceId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(100)),

    // Agent executions
    safe(supabase
      .from("obs_agent_executions")
      .select("*")
      .eq("organization_id", workspaceId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(100)),

    // Layer health
    safe(supabase
      .from("obs_layer_health")
      .select("*")
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(15)),

    // Alerts
    safe(supabase
      .from("cascade_alerts")
      .select("*")
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50)),
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
