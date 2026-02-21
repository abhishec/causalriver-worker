import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { formatNumber } from "@/lib/utils";
import { CodeIntelligenceClient } from "./code-intelligence-client";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Code Intelligence" };

export default async function CodeIntelligencePage() {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();
  const service = await createServiceClient();

  // Fetch connector info and signal count in parallel
  const [{ data: connector }, { count: signalCount }] = await Promise.all([
    service
      .from("org_connectors")
      .select("id, status, config, last_sync_at, signals_count")
      .eq("organization_id", workspaceId)
      .eq("connector_type", "github")
      .maybeSingle(),
    supabase
      .from("cross_domain_signals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", workspaceId)
      .like("source_domain", "engineering%"),
  ]);

  const config = (connector?.config || {}) as Record<string, any>;
  const isConnected = connector?.status === "active";
  const ingestionStats = config?.ingestion_progress?.stats;
  const isIngested = ingestionStats?.filesProcessed > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Code Intelligence</h1>
        <p className="text-xs text-muted mt-0.5">
          Dependency graphs, expertise maps, and engineering cascade analysis
        </p>
      </div>

      {!isConnected ? (
        /* Not connected state */
        <div className="rounded-xl bg-card border border-border-subtle p-8 text-center">
          <span className="text-4xl mb-4 block">🐙</span>
          <h2 className="text-lg font-semibold mb-2">Connect GitHub to Get Started</h2>
          <p className="text-sm text-muted mb-4 max-w-md mx-auto">
            Link a GitHub repository to build code intelligence — dependency graphs,
            expertise maps, collaboration networks, and engineering cascade analysis.
          </p>
          <a
            href="/connectors"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            Go to Connectors →
          </a>
        </div>
      ) : !isIngested ? (
        /* Connected but not ingested */
        <div className="rounded-xl bg-card border border-border-subtle p-8 text-center">
          <span className="text-4xl mb-4 block">⚡</span>
          <h2 className="text-lg font-semibold mb-2">
            {config.repoFullName} Connected
          </h2>
          <p className="text-sm text-muted mb-4 max-w-md mx-auto">
            Repository is connected but code has not been ingested yet.
            Go to Connectors to start the brain ingestion pipeline.
          </p>
          <a
            href="/connectors"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            Start Ingestion →
          </a>
        </div>
      ) : (
        /* Full dashboard */
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl bg-card border border-border-subtle p-5">
              <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                Repository
              </div>
              <div className="text-sm font-bold truncate">{config.repoFullName}</div>
              <div className="text-xs text-muted mt-1">
                {config.repoLanguage} · {config.repoStars?.toLocaleString()} stars
              </div>
            </div>
            <div className="rounded-xl bg-card border border-border-subtle p-5">
              <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                Files Indexed
              </div>
              <div className="text-2xl font-bold text-accent">
                {formatNumber(ingestionStats.filesProcessed)}
              </div>
              <div className="text-xs text-muted mt-1">
                {formatNumber(ingestionStats.symbolsFound)} symbols
              </div>
            </div>
            <div className="rounded-xl bg-card border border-border-subtle p-5">
              <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                Dependency Edges
              </div>
              <div className="text-2xl font-bold text-accent">
                {formatNumber(ingestionStats.dependencyEdges)}
              </div>
              <div className="text-xs text-muted mt-1">
                {formatNumber(ingestionStats.dependencyEntities)} entities
              </div>
            </div>
            <div className="rounded-xl bg-card border border-border-subtle p-5">
              <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                Engineering Signals
              </div>
              <div className="text-2xl font-bold text-success">
                {formatNumber(signalCount || 0)}
              </div>
              <div className="text-xs text-muted mt-1">PRs, CI/CD, reviews</div>
            </div>
          </div>

          {/* Client-side interactive sections */}
          <CodeIntelligenceClient />
        </>
      )}
    </div>
  );
}
