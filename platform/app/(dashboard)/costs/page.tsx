import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { CostsClient } from "./costs-client";
import { logger } from "@/lib/logger";


export const metadata = { title: "Costs" };

export default async function CostsPage() {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  const safe = <T,>(p: PromiseLike<{ data: T | null; error: any }>): Promise<{ data: T | null; error: any }> =>
    Promise.resolve(p).catch((err) => {
      logger.warn("[Costs] Query failed:", err);
      return { data: null as T | null, error: err };
    });

  const [costLogResult, awsResult, budgetResult] = await Promise.all([
    // LLM cost log (last 30 days, org-scoped)
    safe(supabase
      .from("llm_cost_log")
      .select("*")
      .eq("organization_id", workspaceId)
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(500)),

    // AWS cost snapshots (last 30 days, org-scoped)
    safe(supabase
      .from("aws_cost_snapshots")
      .select("*")
      .eq("organization_id", workspaceId)
      .gte("period_start", new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0])
      .order("period_start", { ascending: false })
      .limit(30)),

    // Budget config
    safe(supabase
      .from("cost_budget_config")
      .select("*")
      .eq("organization_id", workspaceId)
      .single()),
  ]);

  return (
    <CostsClient
      costLogs={costLogResult.data || []}
      awsSnapshots={awsResult.data || []}
      budget={budgetResult.data}
    />
  );
}
