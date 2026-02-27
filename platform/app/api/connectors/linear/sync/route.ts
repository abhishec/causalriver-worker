import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { createOutcomeOracle, createCausalMethodBandit } from "@nexus-ai/memory-stack";
import { logger } from "@/lib/logger";
import { getConnectorWithCredentials } from "@/lib/connectors/get-credentials";
import { ingestDocument } from "@/lib/connectors/document-ingester";

export const dynamic = "force-dynamic";

/**
 * POST /api/connectors/linear/sync
 *
 * Syncs Linear issues, projects, and cycles into cross_domain_signals.
 * Uses the memory-stack Linear connector with GraphQL API.
 *
 * Body: { teamIds?: string[] }
 */
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

    // 2. Load connector config + credentials
    const service = await createServiceClient();
    const connector = await getConnectorWithCredentials(service, workspaceId, "linear");

    if (!connector) {
      return NextResponse.json(
        { error: "Linear connector not set up. Please connect Linear first." },
        { status: 404 }
      );
    }

    const credentials = connector.credentials as { api_key?: string; access_token?: string } | null;
    const apiKey = credentials?.api_key || credentials?.access_token;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Linear API key missing. Please re-authorize Linear." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { teamIds } = body as { teamIds?: string[] };
    const config = connector.config as Record<string, any>;

    // 3. Update status to syncing
    await service
      .from("org_connectors")
      .update({
        config: {
          ...config,
          ingestion_progress: {
            step: "syncing_linear_signals",
            message: "Syncing Linear issues, projects, and cycles...",
            startedAt: new Date().toISOString(),
          },
        },
      })
      .eq("id", connector.id);

    // 4. Fetch Linear data and transform to signals
    const startMs = Date.now();
    let signalsGenerated = 0;
    const errors: string[] = [];

    try {
      const { ingestLinearData } = await import("@nexus-ai/memory-stack");

      // Lookback 90 days for initial sync
      const updatedSince = new Date(Date.now() - 90 * 24 * 3600000);

      const signals = await ingestLinearData(
        {
          apiKey,
          teamIds: teamIds || config?.team_ids || [],
          includeArchived: false,
        },
        workspaceId,
        updatedSince
      );

      // 5. Store signals via dual-write bridge
      if (signals.length > 0) {
        const { storeDualWriteConnectorSignals } = await import("@nexus-ai/memory-stack");

        // Batch insert (100 at a time for safety)
        const BATCH_SIZE = 100;
        for (let i = 0; i < signals.length; i += BATCH_SIZE) {
          const batch = signals.slice(i, i + BATCH_SIZE);
          try {
            await storeDualWriteConnectorSignals(
              service,
              batch.map((s) => ({
                source: "linear",
                signal_type: s.signal_type,
                signal_value: s.signal_value,
                signal_timestamp: s.signal_timestamp,
                metadata: s.metadata || {},
              })),
              workspaceId
            );
            signalsGenerated += batch.length;
          } catch (batchErr: any) {
            errors.push(`Batch ${i / BATCH_SIZE} failed: ${batchErr.message}`);
          }
        }
      }

      // Document ingestion — fire-and-forget Linear issue signals
      {
        const { data: linearSignals } = await service
          .from("cross_domain_signals")
          .select("entity_id, signal_metadata")
          .eq("organization_id", workspaceId)
          .eq("source_domain", "engineering.linear")
          .order("created_at", { ascending: false })
          .limit(50);

        for (const signal of linearSignals ?? []) {
          const meta = signal.signal_metadata as Record<string, unknown>;
          const title = (meta?.title as string) || signal.entity_id;
          const description = (meta?.description as string) || "";
          void ingestDocument(service, {
            organizationId: workspaceId,
            documentTitle: `Linear: ${title}`,
            content: [title, description].filter(Boolean).join("\n"),
            sourceType: "text",
            documentId: signal.entity_id,
            metadata: { team: meta?.team, state: meta?.state, priority: meta?.priority },
          }).catch(e => logger.warn("Linear doc ingest failed", { error: e.message }));
        }
      }

      // ── GAP 4: Outcome Oracle — autonomous prediction verification ─────────
      let oracleResult: { predictionsVerified: number; predictionsExpired: number; averageReward: number } | null = null;
      try {
        const { data: recentSignals } = await service
          .from("cross_domain_signals")
          .select("source_domain, signal_type, signal_value, signal_timestamp, organization_id, entity_type, entity_id")
          .eq("organization_id", workspaceId)
          .or("source_domain.like.product%,source_domain.like.engineering%,source_domain.like.support%")
          .gte("signal_timestamp", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order("signal_timestamp", { ascending: false })
          .limit(500);

        if (recentSignals && recentSignals.length > 0) {
          const bandit = createCausalMethodBandit({ supabase: service, organizationId: workspaceId });
          const oracle = createOutcomeOracle({ supabase: service, bandit });
          await oracle.loadFromSupabase(workspaceId);
          const result = await oracle.processBatch(recentSignals);
          oracleResult = {
            predictionsVerified: result.predictionsVerified,
            predictionsExpired: result.predictionsExpired,
            averageReward: result.banditRewardsGiven ?? 0,
          };
          logger.info(`[Linear sync] Oracle: ${result.predictionsVerified} verified, ${result.predictionsExpired} expired`);
        }
      } catch (oracleErr: any) {
        // Non-critical: oracle verification errors don't fail the sync
        logger.warn("[Linear sync] Oracle error (non-fatal):", oracleErr.message);
      }

      // 6. Update connector status (accumulate signals_count — never reset to current batch only)
      const previousSignalsCount = (connector as any).signals_count || 0;
      const durationMs = Date.now() - startMs;
      await service
        .from("org_connectors")
        .update({
          last_sync_at: new Date().toISOString(),
          signals_count: previousSignalsCount + signalsGenerated,
          config: {
            ...config,
            ingestion_progress: {
              step: "complete",
              message: `Synced ${signalsGenerated} Linear signals`,
              completedAt: new Date().toISOString(),
              durationMs,
            },
          },
        })
        .eq("id", connector.id);

      return NextResponse.json({
        success: true,
        signalsGenerated,
        durationMs,
        errors: errors.length > 0 ? errors : undefined,
        oracle: oracleResult,
      });
    } catch (syncErr: any) {
      errors.push(syncErr.message);

      await service
        .from("org_connectors")
        .update({
          config: {
            ...config,
            ingestion_progress: {
              step: "error",
              message: syncErr.message,
              failedAt: new Date().toISOString(),
            },
          },
        })
        .eq("id", connector.id);

      return NextResponse.json(
        {
          success: false,
          error: "Sync failed",
          signalsGenerated,
          errors,
        },
        { status: 500 }
      );
    }
  } catch (err: any) {
    logger.error("[Linear Sync] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
