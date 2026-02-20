import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { PredictionsClient } from "./predictions-client";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Prediction Tracker",
};

export default async function PredictionsPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId();

  // Fetch predictions and accuracy trend in parallel
  const [{ data: predictions }, { data: snapshots }] = await Promise.all([
    supabase
      .from("prediction_outcomes")
      .select("id, entity_name, domain, predicted_value, actual_value, accuracy, prediction_type, created_at, verification_date, status")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("brain_daily_snapshots")
      .select("snapshot_date, prediction_accuracy")
      .eq("organization_id", orgId)
      .order("snapshot_date", { ascending: false })
      .limit(30),
  ]);

  return (
    <PredictionsClient
      predictions={predictions || []}
      accuracyTrend={(snapshots || []).reverse()}
    />
  );
}
