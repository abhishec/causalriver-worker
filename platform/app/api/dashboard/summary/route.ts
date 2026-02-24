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

    // Get user's org memberships
    const { data: memberships, error: memErr } = await admin
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id);

    if (memErr || !memberships || memberships.length === 0) {
      return NextResponse.json({ workspaces: {} });
    }

    const orgIds = memberships.map((m: { organization_id: string }) => m.organization_id);

    // Query connectors for all user's orgs
    const result: Record<string, {
      connector_count: number;
      connectors: string[];
      has_brain: boolean;
      active_agents: number;
    }> = {};

    // Initialize all orgs
    for (const orgId of orgIds) {
      result[orgId] = {
        connector_count: 0,
        connectors: [],
        has_brain: false,
        active_agents: 0,
      };
    }

    // Connectors
    try {
      const { data: connectors } = await admin
        .from("org_connectors")
        .select("organization_id, provider")
        .in("organization_id", orgIds);

      if (connectors) {
        for (const c of connectors as { organization_id: string; provider: string }[]) {
          const ws = result[c.organization_id];
          if (ws) {
            ws.connector_count++;
            if (!ws.connectors.includes(c.provider)) {
              ws.connectors.push(c.provider);
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
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
