import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";

/**
 * GET /api/notifications
 * Derive notifications from existing brain data tables.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = await getCurrentOrgId();

  // Fetch from multiple tables in parallel to build notifications
  const [cascadeResult, snapshotResult, costResult] = await Promise.all([
    // Recent cascade alerts
    supabase
      .from("cascade_alerts")
      .select("id, alert_type, severity, message, created_at, is_read")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20),

    // Brain health drops (snapshot with health_score < previous)
    supabase
      .from("brain_daily_snapshots")
      .select("id, snapshot_date, brain_health_score, prediction_accuracy, top_discoveries")
      .eq("organization_id", orgId)
      .order("snapshot_date", { ascending: false })
      .limit(5),

    // Budget threshold checks
    supabase
      .from("cost_budget_config")
      .select("daily_llm_budget, alert_threshold_pct")
      .eq("organization_id", orgId)
      .single(),
  ]);

  const notifications: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    severity: string;
    timestamp: string;
    read: boolean;
  }> = [];

  // Convert cascade alerts to notifications
  const cascadeAlerts = cascadeResult.data || [];
  for (const alert of cascadeAlerts) {
    notifications.push({
      id: `cascade-${alert.id}`,
      type: "cascade",
      title: `Cascade Alert: ${alert.alert_type || "Chain Detected"}`,
      message: alert.message || "A causal cascade has been triggered across domains.",
      severity: alert.severity || "medium",
      timestamp: alert.created_at,
      read: alert.is_read || false,
    });
  }

  // Convert snapshots to health notifications
  const snapshots = snapshotResult.data || [];
  if (snapshots.length >= 2) {
    const latest = snapshots[0];
    const previous = snapshots[1];
    if (
      latest.brain_health_score !== null &&
      previous.brain_health_score !== null &&
      latest.brain_health_score < previous.brain_health_score - 5
    ) {
      notifications.push({
        id: `health-${latest.id}`,
        type: "health",
        title: "Brain Health Declined",
        message: `Health score dropped from ${previous.brain_health_score} to ${latest.brain_health_score}`,
        severity: latest.brain_health_score < 50 ? "critical" : "high",
        timestamp: latest.snapshot_date,
        read: false,
      });
    }

    // Surface top discoveries as low-severity notifications
    if (latest.top_discoveries?.length) {
      for (let i = 0; i < Math.min(latest.top_discoveries.length, 3); i++) {
        notifications.push({
          id: `discovery-${latest.id}-${i}`,
          type: "training",
          title: "New Discovery",
          message: latest.top_discoveries[i],
          severity: "low",
          timestamp: latest.snapshot_date,
          read: false,
        });
      }
    }
  }

  // Sort by timestamp, newest first
  notifications.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return NextResponse.json({ notifications: notifications.slice(0, 20) });
}

/**
 * PATCH /api/notifications
 * Mark notifications as read or save preferences.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  if (body.action === "mark_read" && body.notificationId) {
    // If it's a cascade alert, mark it as read in the DB
    const alertId = body.notificationId.replace("cascade-", "");
    if (body.notificationId.startsWith("cascade-")) {
      await supabase
        .from("cascade_alerts")
        .update({ is_read: true })
        .eq("id", alertId);
    }
    return NextResponse.json({ success: true });
  }

  if (body.action === "mark_all_read") {
    const orgId = await getCurrentOrgId();
    await supabase
      .from("cascade_alerts")
      .update({ is_read: true })
      .eq("organization_id", orgId)
      .eq("is_read", false);
    return NextResponse.json({ success: true });
  }

  if (body.action === "save_preferences" && body.preferences) {
    const orgId = await getCurrentOrgId();
    // Upsert notification preferences
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(
        {
          organization_id: orgId,
          user_id: user.id,
          ...body.preferences,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,user_id" }
      );

    if (error) {
      // Table might not exist yet — fail silently
      console.error("Failed to save notification preferences:", error.message);
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
