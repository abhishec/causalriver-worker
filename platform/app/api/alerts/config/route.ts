export const dynamic = "force-dynamic";
/**
 * Alert Configuration API
 *
 * GET  /api/alerts/config — Get threshold configs + notification preferences for org
 * PUT  /api/alerts/config — Upsert threshold config + notification preferences
 *
 * Auth: Org admin (owner/admin role)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { DEFAULT_THRESHOLDS } from "@/lib/health/health-poller";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
    }

    // Verify org admin
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Get thresholds (or defaults)
    const service = await createServiceClient();
    const { data: thresholds } = await service
      .from("health_alert_thresholds")
      .select("*")
      .eq("organization_id", workspaceId)
      .single();

    // Get notification preferences for this user
    const { data: notifPrefs } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("organization_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    return NextResponse.json({
      thresholds: thresholds || { ...DEFAULT_THRESHOLDS, organization_id: workspaceId },
      notification_preferences: notifPrefs || {
        organization_id: workspaceId,
        user_id: user.id,
        cascade_alerts: true,
        budget_warnings: true,
        training_completions: true,
        brain_health_alerts: true,
        anomaly_detections: true,
        min_severity: "medium",
        email_digest: false,
        digest_email_recipients: "",
        slack_webhook_url: "",
      },
      defaults: DEFAULT_THRESHOLDS,
    });
  } catch (err) {
    logger.error("[alerts/config] GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load config" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
    }

    // Verify org admin
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const service = await createServiceClient();

    // Upsert thresholds
    if (body.thresholds) {
      const { enabled, min_prediction_score, min_causal_graph_score, min_signal_score, min_connector_score, min_job_score, min_overall_score, min_pipeline_sla_score, cooldown_hours } = body.thresholds;

      await service
        .from("health_alert_thresholds")
        .upsert({
          organization_id: workspaceId,
          enabled: enabled ?? true,
          min_prediction_score: min_prediction_score ?? DEFAULT_THRESHOLDS.min_prediction_score,
          min_causal_graph_score: min_causal_graph_score ?? DEFAULT_THRESHOLDS.min_causal_graph_score,
          min_signal_score: min_signal_score ?? DEFAULT_THRESHOLDS.min_signal_score,
          min_connector_score: min_connector_score ?? DEFAULT_THRESHOLDS.min_connector_score,
          min_job_score: min_job_score ?? DEFAULT_THRESHOLDS.min_job_score,
          min_overall_score: min_overall_score ?? DEFAULT_THRESHOLDS.min_overall_score,
          min_pipeline_sla_score: min_pipeline_sla_score ?? DEFAULT_THRESHOLDS.min_pipeline_sla_score,
          cooldown_hours: cooldown_hours ?? DEFAULT_THRESHOLDS.cooldown_hours,
          updated_at: new Date().toISOString(),
        }, { onConflict: "organization_id" });
    }

    // Upsert notification preferences
    if (body.notification_preferences) {
      const np = body.notification_preferences;
      await supabase
        .from("notification_preferences")
        .upsert({
          organization_id: workspaceId,
          user_id: user.id,
          cascade_alerts: np.cascade_alerts ?? true,
          budget_warnings: np.budget_warnings ?? true,
          training_completions: np.training_completions ?? true,
          brain_health_alerts: np.brain_health_alerts ?? true,
          anomaly_detections: np.anomaly_detections ?? true,
          min_severity: np.min_severity ?? "medium",
          email_digest: np.email_digest ?? false,
          digest_email_recipients: np.digest_email_recipients ?? "",
          slack_webhook_url: np.slack_webhook_url ?? "",
          updated_at: new Date().toISOString(),
        }, { onConflict: "organization_id,user_id" });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[alerts/config] PUT error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save config" },
      { status: 500 },
    );
  }
}
