import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { CostsClient } from "./costs-client";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Costs" };

export default async function CostsPage() {
  const supabase = await createClient();
  const CORE_ORG_ID = await getCurrentOrgId();

  const safe = <T,>(p: PromiseLike<{ data: T | null; error: any }>): Promise<{ data: T | null; error: any }> =>
    Promise.resolve(p).catch((err) => {
      console.warn("[Costs] Query failed:", err);
      return { data: null as T | null, error: err };
    });

  const [costLogResult, awsResult, budgetResult] = await Promise.all([
    // LLM cost log (last 30 days, org-scoped)
    safe(supabase
      .from("llm_cost_log")
      .select("*")
      .eq("organization_id", CORE_ORG_ID)
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(500)),

    // AWS cost snapshots (last 30 days, org-scoped)
    safe(supabase
      .from("aws_cost_snapshots")
      .select("*")
      .eq("organization_id", CORE_ORG_ID)
      .gte("period_start", new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0])
      .order("period_start", { ascending: false })
      .limit(30)),

    // Budget config
    safe(supabase
      .from("cost_budget_config")
      .select("*")
      .eq("organization_id", CORE_ORG_ID)
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
