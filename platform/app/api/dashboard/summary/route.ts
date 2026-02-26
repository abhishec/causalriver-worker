import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/summary
 *
 * Returns per-workspace summary data (connector count, brain status)
 * for the post-login dashboard cards.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();

    // Get user's org memberships — guard against missing/broken org_members table
    let memberships: { organization_id: string }[] = [];
    try {
      const { data, error: memErr } = await admin
        .from("org_members")
        .select("organization_id")
        .eq("user_id", user.id);

      if (memErr) {
        logger.warn("[/api/dashboard/summary] memberships query error:", memErr.message);
        return NextResponse.json({ workspaces: {} });
      }
      memberships = (data ?? []) as { organization_id: string }[];
    } catch (e) {
      logger.warn("[/api/dashboard/summary] org_members unavailable:", e);
      return NextResponse.json({ workspaces: {} });
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ workspaces: {} });
    }

    const orgIds = memberships.map((m: { organization_id: string }) => m.organization_id);

    // Query connectors for all user's orgs
    const result: Record<string, {
      connector_count: number;
      connectors: string[];
      has_brain: boolean;
      active_agents: number;
      active_services: string[];
      ai_workers: { id: string; service: string; name: string; description?: string; status: string; created_at: string; created_by?: string }[];
    }> = {};

    // Fetch workspace settings for active_services + ai_workers
    let settingsMap: Record<string, Record<string, unknown>> = {};
    try {
      const { data: orgs } = await admin
        .from("organizations")
        .select("id, settings")
        .in("id", orgIds);

      if (orgs) {
        for (const org of orgs as { id: string; settings: Record<string, unknown> | null }[]) {
          settingsMap[org.id] = org.settings ?? {};
        }
      }
    } catch {
      // settings column may not exist yet
    }

    // Initialize all orgs
    for (const orgId of orgIds) {
      const settings = settingsMap[orgId] ?? {};
      const activeServices = Array.isArray(settings.active_services)
        ? (settings.active_services as string[])
        : ["seaas", "aas", "general"];
      const aiWorkers = Array.isArray(settings.ai_workers)
        ? (settings.ai_workers as { id: string; service: string; name: string; description?: string; status: string; created_at: string; created_by?: string }[])
        : [];
      result[orgId] = {
        connector_count: 0,
        connectors: [],
        has_brain: false,
        active_agents: 0,
        active_services: activeServices,
        ai_workers: aiWorkers,
      };
    }

    // Connectors — try connector_type first (actual column name), fallback to provider
    try {
      const { data: connectors } = await admin
        .from("org_connectors")
        .select("organization_id, connector_type")
        .in("organization_id", orgIds);

      if (connectors) {
        for (const c of connectors as { organization_id: string; connector_type: string }[]) {
          const ws = result[c.organization_id];
          if (ws) {
            ws.connector_count++;
            if (c.connector_type && !ws.connectors.includes(c.connector_type)) {
              ws.connectors.push(c.connector_type);
            }
          }
        }
      }
    } catch {
      logger.warn("[/api/dashboard/summary] org_connectors query failed — skipping");
    }

    // Active agents (brain_agent_tasks with status = 'running')
    try {
      const { data: tasks } = await admin
        .from("brain_agent_tasks")
        .select("organization_id")
        .in("organization_id", orgIds)
        .eq("status", "running");

      if (tasks) {
        for (const t of tasks as { organization_id: string }[]) {
          const ws = result[t.organization_id];
          if (ws) {
            ws.active_agents++;
            ws.has_brain = true;
          }
        }
      }
    } catch {
      // brain_agent_tasks may not exist — that's fine
    }

    return NextResponse.json({ workspaces: result });
  } catch (err) {
    logger.error("[/api/dashboard/summary] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
