/**
 * POST /api/connectors/logs/sync
 *
 * Syncs logs from the configured log provider (CloudWatch, Datadog, ELK, or Generic)
 * into cross_domain_signals, powering the Log Query SE-aaS domain.
 *
 * Body: {
 *   mode?:    'initial' | 'incremental'   (default: 'incremental')
 *   lookbackHours?: number                 (default: 24 for initial, 1 for incremental)
 * }
 *
 * Credentials stored in org_connectors.credentials:
 *   For CloudWatch:  { provider: 'cloudwatch', region, accessKeyId, secretAccessKey, logGroupNames[] }
 *   For Datadog:     { provider: 'datadog', apiKey, appKey, site?, indexes?, query? }
 *   For ELK:         { provider: 'elk', host, username?, password?, apiKey?, indexPattern }
 *   For Generic:     { provider: 'generic', endpoint, authHeader? }
 *
 * NB-019: This route was missing — the LogConnector had no API surface.
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Log queries can take time for large windows

const LOG_CONNECTOR_TYPES = ["logs", "cloudwatch", "datadog", "elk", "generic"];

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
    const mode: "initial" | "incremental" = body.mode || "incremental";
    const lookbackHours: number =
      body.lookbackHours ??
      (mode === "initial" ? 24 : 1);

    // 3. Load log connector config — supports multiple connector_type values
    const { data: connectors, error: connErr } = await service
      .from("org_connectors")
      .select("id, connector_type, config, credentials")
      .eq("organization_id", orgId)
      .in("connector_type", LOG_CONNECTOR_TYPES);

    if (connErr) {
      return NextResponse.json({ error: connErr.message }, { status: 500 });
    }

    if (!connectors || connectors.length === 0) {
      return NextResponse.json(
        {
          error:
            "No log connector configured. Please set up a log source (CloudWatch, Datadog, ELK, or Generic) first.",
          hint: "Store credentials in org_connectors with connector_type='cloudwatch', 'datadog', 'elk', or 'logs'.",
        },
        { status: 404 }
      );
    }

    // 4. Import connector class
    const { LogConnector } = await import(
      "@nexus-ai/memory-stack/connectors/logs/log-connector"
    ).catch(() => ({ LogConnector: null as any }));

    if (!LogConnector) {
      // Fallback: try direct package import
      const pkg = await import("@nexus-ai/memory-stack").catch(() => ({})) as any;
      if (!pkg.LogConnector) {
        return NextResponse.json(
          { error: "LogConnector not available — ensure @nexus-ai/memory-stack is built" },
          { status: 500 }
        );
      }
    }

    const results: Record<string, any> = {};
    let totalSignals = 0;

    // 5. Run sync for each configured log connector
    for (const conn of connectors) {
      const creds = conn.credentials as Record<string, any>;
      const cfg = conn.config as Record<string, any>;

      // Build credentials object for LogConnector
      // The provider field is required — infer from connector_type if missing
      const provider = creds.provider || conn.connector_type || "generic";
      const logCreds = {
        provider,
        queryLookbackHours: lookbackHours,
        ...creds,
        // Config overrides (org-level settings take precedence over stored creds)
        ...(cfg || {}),
      };

      try {
        const instance = new LogConnector(orgId, logCreds, service);
        const result = await instance.ingest({ mode });

        results[conn.connector_type] = result;
        totalSignals += result.signalsIngested || 0;

        // Update last_synced_at
        await service
          .from("org_connectors")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", conn.id);
      } catch (err: any) {
        console.error(`[Logs sync] ${conn.connector_type} failed:`, err);
        results[conn.connector_type] = { success: false, error: err.message };
      }
    }

    return NextResponse.json({
      success: true,
      mode,
      lookbackHours,
      results,
      signalsGenerated: totalSignals,
      totalSignalsIngested: totalSignals,
    });
  } catch (err: any) {
    console.error("[Logs sync] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
