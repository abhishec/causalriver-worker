import { createClient } from "@/lib/supabase/server";
import { CostsClient } from "./costs-client";

export const dynamic = 'force-dynamic';

const CORE_ORG_ID = "00000000-0000-4000-a000-000000000001";

export const metadata = { title: "Costs" };

export default async function CostsPage() {
  const supabase = await createClient();

  const [costLogResult, awsResult, budgetResult] = await Promise.all([
    // LLM cost log (last 30 days)
    supabase
      .from("llm_cost_log")
      .select("*")
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(500),

    // AWS cost snapshots (last 30 days)
    supabase
      .from("aws_cost_snapshots")
      .select("*")
      .gte("period_start", new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0])
      .order("period_start", { ascending: false })
      .limit(30),

    // Budget config
    supabase
      .from("cost_budget_config")
      .select("*")
      .eq("organization_id", CORE_ORG_ID)
      .single(),
  ]);

  return (
    <CostsClient
      costLogs={costLogResult.data || []}
      awsSnapshots={awsResult.data || []}
      budget={budgetResult.data}
    />
  );
}
