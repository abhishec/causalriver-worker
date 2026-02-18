/**
 * POST /api/connectors/freshworks/sync
 *
 * Syncs Freshworks suite (Freshdesk, Freshsales, Freshchat) data into
 * cross_domain_signals.
 *
 * Body: {
 *   product?: 'freshdesk' | 'freshsales' | 'freshchat' | 'all'   (default: 'all')
 *   mode?:    'initial' | 'incremental'                           (default: 'incremental')
 * }
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // 1. Auth
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId();
    const service = await createServiceClient();

    // 2. Parse body
    const body = await request.json().catch(() => ({}));
    const product: string = body.product || "all";
    const mode: "initial" | "incremental" = body.mode || "incremental";

    // 3. Load connector config from org_connectors
    const { data: connectors, error: connErr } = await service
      .from("org_connectors")
      .select("id, connector_type, config, credentials")
      .eq("organization_id", orgId)
      .in(
        "connector_type",
        product === "all"
          ? ["freshdesk", "freshsales", "freshchat"]
          : [product]
      );

    if (connErr) {
      return NextResponse.json({ error: connErr.message }, { status: 500 });
    }

    if (!connectors || connectors.length === 0) {
      return NextResponse.json(
        {
          error:
            "No Freshworks connectors set up. Please configure Freshdesk, Freshsales, or Freshchat first.",
        },
        { status: 404 }
      );
    }

    // 4. Dynamically import connectors (avoids bundling all at edge init)
    const { FreshdeskConnector } = await import(
      "@nexus-ai/memory-stack/connectors/freshworks/freshdesk-connector"
    ).catch(() => ({ FreshdeskConnector: null }));

    const { FreshsalesConnector } = await import(
      "@nexus-ai/memory-stack/connectors/freshworks/freshsales-connector"
    ).catch(() => ({ FreshsalesConnector: null }));

    const { FreshchatConnector } = await import(
      "@nexus-ai/memory-stack/connectors/freshworks/freshchat-connector"
    ).catch(() => ({ FreshchatConnector: null }));

    const results: Record<string, any> = {};

    for (const connector of connectors) {
      const creds = connector.credentials as Record<string, any>;
      const cfg = connector.config as Record<string, any>;
      const type = connector.connector_type as string;

      try {
        let instance: any = null;

        if (type === "freshdesk" && FreshdeskConnector) {
          instance = new FreshdeskConnector(
            orgId,
            {
              apiKey: creds.api_key || creds.apiKey,
              domain: cfg.domain || creds.domain,
            },
            service
          );
        } else if (type === "freshsales" && FreshsalesConnector) {
          instance = new FreshsalesConnector(
            orgId,
            {
              apiKey: creds.api_key || creds.apiKey,
              domain: cfg.domain || creds.domain,
            },
            service
          );
        } else if (type === "freshchat" && FreshchatConnector) {
          instance = new FreshchatConnector(
            orgId,
            {
              apiKey: creds.api_key || creds.apiKey,
              domain: cfg.domain || creds.domain,
            },
            service
          );
        }

        if (!instance) {
          results[type] = { skipped: true, reason: "Connector class not available" };
          continue;
        }

        // Run sync (non-blocking: returns quickly, ingestion is async)
        const result = await instance.ingest({ mode });
        results[type] = result;

        // Update last_synced_at
        await service
          .from("org_connectors")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", connector.id);
      } catch (err: any) {
        console.error(`[Freshworks sync] ${type} failed:`, err);
        results[type] = { success: false, error: err.message };
      }
    }

    const totalSignals = Object.values(results).reduce(
      (sum: number, r: any) => sum + (r.signalsIngested || 0),
      0
    );

    return NextResponse.json({
      success: true,
      mode,
      product,
      results,
      totalSignalsIngested: totalSignals,
    });
  } catch (err: any) {
    console.error("[Freshworks sync] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
