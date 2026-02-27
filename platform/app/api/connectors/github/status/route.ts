export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

/**
 * GET /api/connectors/github/status
 *
 * Returns the current GitHub connector status, ingestion progress,
 * and graph statistics.
 */
export async function GET() {
  try {
    // Step 1: createClient in isolated try-catch — throws when env vars missing in Lambda cold start
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Step 2: getUser in isolated try-catch
    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data?.user;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();

    // Fetch connector + signal counts in parallel
    const [connectorResult, signalCountResult, codeFileCountResult] =
      await Promise.all([
        supabase
          .from("org_connectors")
          .select("id, status, config, last_sync_at, signals_count, error_message")
          .eq("organization_id", workspaceId)
          .eq("connector_type", "github")
          .maybeSingle(),
        supabase
          .from("cross_domain_signals")
          .select("signal_type", { count: "exact" })
          .eq("organization_id", workspaceId)
          .like("source_domain", "engineering%"),
        supabase
          .from("cross_domain_signals")
          .select("id", { count: "exact" })
          .eq("organization_id", workspaceId)
          .eq("signal_type", "code_file_indexed"),
      ]);

    const connector = connectorResult.data;
    if (!connector) {
      return NextResponse.json({
        connected: false,
        status: "not_configured",
      });
    }

    const config = connector.config as Record<string, any>;
    const progress = config?.ingestion_progress || null;

    return NextResponse.json({
      connected: true,
      status: connector.status,
      repo: {
        fullName: config?.repoFullName,
        language: config?.repoLanguage,
        stars: config?.repoStars,
        owner: config?.owner,
        repo: config?.repo,
      },
      trackedBranches: Array.isArray(config?.trackedBranches) ? config.trackedBranches : [],
      lastSyncAt: connector.last_sync_at,
      signalsCount: signalCountResult.count || 0,
      codeFilesIndexed: codeFileCountResult.count || 0,
      errorMessage: connector.error_message,
      ingestionProgress: progress,
    });
  } catch (err: any) {
    logger.error("GitHub status error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
