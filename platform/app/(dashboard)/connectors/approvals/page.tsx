import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { ApprovalsClient } from "./approvals-client";
import { logger } from "@/lib/logger";
import { redirect } from "next/navigation";
import type { WritebackApproval } from "@/app/api/connectors/writeback/pending/route";

export const metadata = { title: "Write-back Approvals" };

export default async function ApprovalsPage() {
  // 500→401 Lambda pattern: wrap each init separately
  const supabase = await createClient().catch(() => redirect("/login"));
  const workspaceId = await getCurrentWorkspaceId().catch(() => redirect("/login"));

  const {
    data: { user },
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  if (!user) redirect("/login");

  // Fetch user role to gate approve/reject buttons
  let memberRow: { role: string } | null = null;
  try {
    const { data } = await supabase
      .from("org_members")
      .select("role")
      .eq("organization_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();
    memberRow = data as { role: string } | null;
  } catch {
    // Non-fatal: canApprove defaults to false
  }

  const userRole: string | null = memberRow?.role ?? null;
  const canApprove = userRole === "admin" || userRole === "owner";

  // Fetch pending approvals
  let approvalsData: Array<{
    id: string;
    organization_id: string;
    job_id: string | null;
    connector_type: string;
    action_type: string;
    action_payload: unknown;
    status: string;
    requested_by: string | null;
    reviewed_by: string | null;
    review_note: string | null;
    created_at: string;
    reviewed_at: string | null;
  }> | null = null;
  try {
    const { data, error } = await supabase
      .from("writeback_approvals")
      .select(
        "id, organization_id, job_id, connector_type, action_type, action_payload, status, requested_by, reviewed_by, review_note, created_at, reviewed_at"
      )
      .eq("organization_id", workspaceId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) {
      logger.warn("[ApprovalsPage] Failed to fetch approvals:", error);
    }
    approvalsData = data ?? null;
  } catch (err) {
    logger.warn("[ApprovalsPage] Approvals query threw:", err);
  }

  const approvals: WritebackApproval[] = (approvalsData ?? []).map((row) => ({
    id: row.id,
    organization_id: row.organization_id,
    job_id: row.job_id ?? null,
    connector_type: row.connector_type,
    action_type: row.action_type,
    action_payload: (row.action_payload as Record<string, unknown>) ?? {},
    status: row.status as WritebackApproval["status"],
    requested_by: row.requested_by ?? null,
    reviewed_by: row.reviewed_by ?? null,
    review_note: row.review_note ?? null,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at ?? null,
  }));

  return (
    <ApprovalsClient
      initialApprovals={approvals}
      canApprove={canApprove}
    />
  );
}
