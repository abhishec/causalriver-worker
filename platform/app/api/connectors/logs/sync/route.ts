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
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import { getConnectorsWithCredentials } from "@/lib/connectors/get-credentials";
import { ingestDocument } from "@/lib/connectors/document-ingester";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Log queries can take time for large windows

const LOG_CONNECTOR_TYPES = ["logs", "cloudwatch", "datadog", "elk", "generic"];

export async function POST(request: Request) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data: _routeAuthData } = await supabase.auth.getUser();
    user = _routeAuthData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace context" }, { status: 400 });
    }
    const service = await createServiceClient();

    // 2. Parse body
    const body = await request.json().catch(() => ({}));
    const mode: "initial" | "incremental" = body.mode || "incremental";
    const lookbackHours: number =
      body.lookbackHours ??
      (mode === "initial" ? 24 : 1);

    // 3. Load log connector config — supports multiple connector_type values
    const connectors = await getConnectorsWithCredentials(service, workspaceId, LOG_CONNECTOR_TYPES);

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

    // 4. Import connector class from main memory-stack entry point
    const { LogConnector } = await import("@nexus-ai/memory-stack").catch(() => ({ LogConnector: null as any }));

    if (!LogConnector) {
      return NextResponse.json(
        { error: "LogConnector not available — ensure @nexus-ai/memory-stack is built" },
        { status: 500 }
      );
    }

    const results: Record<string, any> = {};
    let totalSignals = 0;

    // 5. Run sync for each configured log connector
    for (const conn of connectors) {
      const creds = (conn.credentials ?? {}) as Record<string, any>;
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
        const instance = new LogConnector(workspaceId, logCreds, service);
        const result = await instance.ingest({ mode });

        results[conn.connector_type] = result;
        totalSignals += result.signalsIngested || 0;

        // Update last_sync_at and accumulate signals_count
        const prevCount = conn.signals_count || 0;
        const newSignals = (result?.signalsIngested || 0) as number;
        await service
          .from("org_connectors")
          .update({
            last_sync_at: new Date().toISOString(),
            signals_count: prevCount + newSignals,
          })
          .eq("id", conn.id);
      } catch (err: any) {
        logger.error(`[Logs sync] ${conn.connector_type} failed:`, err);
        results[conn.connector_type] = { success: false, error: "Sync failed" };
      }
    }

    // Document ingestion — fire-and-forget log error cluster signals
    {
      const { data: logSignals } = await service
        .from("cross_domain_signals")
        .select("entity_id, signal_metadata")
        .eq("organization_id", workspaceId)
        .in("source_domain", ["observability.cloudwatch", "observability.datadog", "observability.elk"])
        .eq("entity_type", "log_error")
        .order("created_at", { ascending: false })
        .limit(30);

      for (const signal of logSignals ?? []) {
        const meta = signal.signal_metadata as Record<string, unknown>;
        const message = (meta?.message as string) || (meta?.error as string) || signal.entity_id;
        if (!message) continue;
        void ingestDocument(service, {
          organizationId: workspaceId,
          documentTitle: `Log Error: ${message.slice(0, 80)}`,
          content: message,
          sourceType: "text",
          documentId: signal.entity_id,
          metadata: { service: meta?.service, level: meta?.level, source: meta?.source },
        }).catch(e => logger.warn("Log doc ingest failed", { error: e.message }));
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
    logger.error("[Logs sync] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
