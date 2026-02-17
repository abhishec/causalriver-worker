import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Allow up to 2 minutes for multi-connector sync

interface ConnectorSyncResult {
  connector: string;
  success: boolean;
  signalsGenerated?: number;
  error?: string;
  durationMs: number;
}

/**
 * POST /api/connectors/sync-all
 *
 * Syncs ALL active connectors for the org in parallel.
 * Called by "Run Initial Training" to pull data from every connected source.
 *
 * Body: { organizationId?: string }
 * Returns: { results: ConnectorSyncResult[], totalSignals: number }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId();
    const service = await createServiceClient();

    // Find all active connectors for this org
    const { data: connectors } = await service
      .from("org_connectors")
      .select("id, connector_type, config, credentials, status")
      .eq("organization_id", orgId)
      .in("status", ["active", "connected"]);

    if (!connectors || connectors.length === 0) {
      return NextResponse.json(
        { error: "No active connectors found. Please connect at least one data source." },
        { status: 404 }
      );
    }

    const results: ConnectorSyncResult[] = [];

    // Build sync promises for each active connector
    const syncPromises = connectors.map(async (connector) => {
      const start = Date.now();
      const type = connector.connector_type;

      try {
        // Determine the sync endpoint for each connector type
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL
          || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
          || "http://localhost:3000";

        let syncUrl: string;
        let syncBody: Record<string, unknown> = {};

        switch (type) {
          case "github":
            syncUrl = `${baseUrl}/api/connectors/github/sync`;
            syncBody = { organizationId: orgId };
            break;
          case "jira":
            syncUrl = `${baseUrl}/api/connectors/jira/sync`;
            syncBody = {};
            break;
          case "slack":
            syncUrl = `${baseUrl}/api/connectors/slack/sync`;
            syncBody = { lookbackDays: 30 };
            break;
          default:
            // Skip connector types without a sync route (e.g. linear, hubspot)
            return {
              connector: type,
              success: true,
              signalsGenerated: 0,
              durationMs: Date.now() - start,
            };
        }

        // Forward the user's auth cookie for the downstream API call
        const cookieHeader = request.headers.get("cookie") || "";

        const response = await fetch(syncUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieHeader,
          },
          body: JSON.stringify(syncBody),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          return {
            connector: type,
            success: false,
            error: data.error || `HTTP ${response.status}`,
            durationMs: Date.now() - start,
          };
        }

        return {
          connector: type,
          success: true,
          signalsGenerated: data.signalsGenerated || data.signals_generated || 0,
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          connector: type,
          success: false,
          error: err.message || "Sync failed",
          durationMs: Date.now() - start,
        };
      }
    });

    // Run all syncs in parallel
    const settled = await Promise.allSettled(syncPromises);

    for (const result of settled) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }

    const totalSignals = results.reduce(
      (sum, r) => sum + (r.signalsGenerated || 0),
      0
    );
    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      results,
      totalSignals,
      successCount,
      totalConnectors: results.length,
      summary: `Synced ${successCount}/${results.length} connectors, ${totalSignals} signals`,
    });
  } catch (err: any) {
    console.error("Sync-all error:", err);
    return NextResponse.json(
      { error: err.message || "Sync failed" },
      { status: 500 }
    );
  }
}
