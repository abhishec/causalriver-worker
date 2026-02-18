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
 * Called by "Sync & Train" UI to pull data from every connected source.
 *
 * Body: {
 *   organizationId?: string,
 *   skipBrainCycle?: boolean  — when true, skips auto-triggering brain cycle
 *                               (use when caller will call /api/brain/cycle itself
 *                               for accurate progress tracking in the UI)
 * }
 * Returns: { results: ConnectorSyncResult[], totalSignals: number, brainCycle: ... }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const skipBrainCycle: boolean = body.skipBrainCycle === true;

    const orgId = body.organizationId || await getCurrentOrgId();
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
            syncBody = { organizationId: orgId };
            break;
          case "slack":
            syncUrl = `${baseUrl}/api/connectors/slack/sync`;
            syncBody = { organizationId: orgId, lookbackDays: 30 };
            break;
          case "linear":
            syncUrl = `${baseUrl}/api/connectors/linear/sync`;
            syncBody = { organizationId: orgId };
            break;
          case "xero":
            syncUrl = `${baseUrl}/api/connectors/xero/sync`;
            syncBody = { organizationId: orgId };
            break;
          default:
            // Skip connector types without a sync route (e.g. hubspot, asana)
            return {
              connector: type,
              success: false,
              skipped: true,
              signalsGenerated: 0,
              error: `No sync route implemented for "${type}" — skipped`,
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
    const skippedCount = results.filter((r) => (r as any).skipped).length;
    const failedCount = results.filter((r) => !r.success && !(r as any).skipped).length;
    const syncedCount = results.length - skippedCount;

    // ── Auto-trigger brain cycle after successful sync ──────────────────
    // If signals were ingested AND the caller hasn't set skipBrainCycle=true,
    // fire a FULL brain cycle automatically so the brain processes them through
    // all 30 layers including deep analysis, entity linking, and wisdom layers.
    //
    // When called from the UI "Sync & Train" button, skipBrainCycle=true so the
    // UI controls the brain cycle step itself and can show accurate progress.
    // When called from cron/webhooks/API directly, skipBrainCycle=false (default)
    // so it always self-completes without needing a separate caller.
    let brainCycleResult: any = null;

    if (totalSignals > 0 && successCount > 0 && !skipBrainCycle) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL
          || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
          || "http://localhost:3000";

        const cookieHeader = request.headers.get("cookie") || "";

        const brainResponse = await fetch(`${baseUrl}/api/brain/cycle`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieHeader,
          },
          body: JSON.stringify({ organizationId: orgId, mode: "full" }),
        });

        if (brainResponse.ok) {
          const brainData = await brainResponse.json();
          brainCycleResult = {
            triggered: true,
            mode: "full",
            durationMs: brainData.duration_ms,
          };
          console.log(`[sync-all] Auto-triggered full brain cycle (${brainData.duration_ms}ms)`);
        } else {
          brainCycleResult = {
            triggered: false,
            error: `Brain cycle returned HTTP ${brainResponse.status}`,
          };
          console.warn(`[sync-all] Brain cycle failed: HTTP ${brainResponse.status}`);
        }
      } catch (brainErr: any) {
        brainCycleResult = {
          triggered: false,
          error: brainErr.message || "Brain cycle call failed",
        };
        console.warn("[sync-all] Brain cycle error:", brainErr.message);
      }
    } else if (skipBrainCycle) {
      brainCycleResult = { triggered: false, skipped: true, reason: "skipBrainCycle=true — caller will run brain cycle separately" };
    }

    return NextResponse.json({
      results,
      totalSignals,
      successCount,
      skippedCount,
      failedCount,
      totalConnectors: results.length,
      brainCycle: brainCycleResult,
      summary: `Synced ${successCount}/${syncedCount} connectors, ${totalSignals} signals${brainCycleResult?.triggered ? " → brain cycle triggered" : brainCycleResult?.skipped ? " → brain cycle deferred to caller" : ""}${skippedCount > 0 ? ` (${skippedCount} skipped — no sync route)` : ""}`,
    });
  } catch (err: any) {
    console.error("Sync-all error:", err);
    return NextResponse.json(
      { error: err.message || "Sync failed" },
      { status: 500 }
    );
  }
}
