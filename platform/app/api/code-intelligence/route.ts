import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import {
  createKnowledgeDependencyGraph,
  createExpertiseGraph,
  createCollaborationGraph,
} from "@nexus-ai/memory-stack";

export const dynamic = 'force-dynamic';

/**
 * GET /api/code-intelligence
 *
 * Returns all code intelligence data: dependency hotspots, expertise map,
 * collaboration network, engineering cascade, and recent activity.
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

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    // 1. Load connector info
    const { data: connector } = await service
      .from("org_connectors")
      .select("id, status, config, last_sync_at, signals_count")
      .eq("organization_id", workspaceId)
      .eq("connector_type", "github")
      .maybeSingle();

    if (!connector || connector.status !== "active") {
      return NextResponse.json({
        connected: false,
        message: "GitHub connector not configured",
      });
    }

    const config = connector.config as Record<string, any>;
    const ingestionStats = config?.ingestion_progress?.stats;

    // 2. Load all three graphs from database
    const depGraph = createKnowledgeDependencyGraph();
    const expertiseGraph = createExpertiseGraph();
    const collabGraph = createCollaborationGraph();

    await Promise.all([
      depGraph.load(service, workspaceId),
      expertiseGraph.load(service, workspaceId),
      collabGraph.load(service, workspaceId),
    ]);

    // 3. Compute dependency hotspots
    const depEdges = depGraph.getEdges();
    const fanOutMap = new Map<string, number>();
    const fanInMap = new Map<string, number>();

    for (const edge of depEdges) {
      fanOutMap.set(edge.sourceId, (fanOutMap.get(edge.sourceId) || 0) + 1);
      fanInMap.set(edge.targetId, (fanInMap.get(edge.targetId) || 0) + 1);
    }

    const topFanOut = [...fanOutMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([entity, count]) => ({
        entity,
        fanOut: count,
        domain: depGraph.mapEntityToDomain(entity),
      }));

    const topFanIn = [...fanInMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([entity, count]) => ({
        entity,
        fanIn: count,
        domain: depGraph.mapEntityToDomain(entity),
      }));

    // Cycle detection
    const cycles = depGraph.detectCycles();

    // 4. Expertise map — top contributors by topic
    const heatmap = expertiseGraph.getHeatmap(20);
    const expertiseMap: Array<{ topic: string; experts: Array<{ id: string; name?: string; strength: number }> }> = [];
    for (const [topic, edges] of heatmap) {
      expertiseMap.push({
        topic,
        experts: edges.slice(0, 5).map((e) => ({
          id: e.contributorId,
          name: e.contributorName || e.contributorId,
          strength: e.strength,
        })),
      });
    }

    // Bus factor: topics with only 1 expert
    const busFactorWarnings = expertiseMap
      .filter((t) => t.experts.length === 1 && t.experts[0].strength > 0.3)
      .map((t) => ({
        topic: t.topic,
        soleExpert: t.experts[0].name || t.experts[0].id,
        strength: t.experts[0].strength,
      }));

    // 5. Collaboration network
    const crossTeamEdges = collabGraph.getCrossTeamEdges();
    const bridgeContributors = collabGraph.getBridgeContributors(10);
    const networkStats = collabGraph.getNetworkStats();
    const teamSummary = collabGraph.getTeamSummary();

    // 6. Engineering cascade — fetch causal relationships
    const { data: cascadeEdges } = await service
      .from("causal_relationships_statistical")
      .select("*")
      .eq("organization_id", workspaceId)
      .in("source_domain", ["engineering", "engineering.github", "engineering.jira", "support", "cs"])
      .order("lag_days", { ascending: true });

    // 7. Recent activity — last 50 engineering signals
    const { data: recentSignals } = await service
      .from("cross_domain_signals")
      .select("signal_type, signal_value, signal_metadata, created_at")
      .eq("organization_id", workspaceId)
      .like("source_domain", "engineering%")
      .neq("signal_type", "code_file_indexed")
      .order("created_at", { ascending: false })
      .limit(50);

    // Signal type distribution (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: recentCounts } = await service
      .from("cross_domain_signals")
      .select("signal_type")
      .eq("organization_id", workspaceId)
      .like("source_domain", "engineering%")
      .gte("created_at", sevenDaysAgo.toISOString());

    const signalDistribution: Record<string, number> = {};
    if (recentCounts) {
      for (const s of recentCounts) {
        signalDistribution[s.signal_type] =
          (signalDistribution[s.signal_type] || 0) + 1;
      }
    }

    return NextResponse.json({
      connected: true,
      repo: {
        fullName: config.repoFullName,
        language: config.repoLanguage,
        stars: config.repoStars,
        description: config.repoDescription,
        isPrivate: config.isPrivate,
      },
      lastSyncAt: connector.last_sync_at,
      ingestionStats,
      graphs: {
        dependency: {
          stats: depGraph.getStats(),
          topFanOut,
          topFanIn,
          cycles: { count: cycles.count, samples: cycles.cycles.slice(0, 5) },
        },
        expertise: {
          stats: expertiseGraph.getStats(),
          map: expertiseMap,
          busFactorWarnings,
        },
        collaboration: {
          stats: networkStats,
          crossTeamEdges: crossTeamEdges.slice(0, 20),
          bridgeContributors,
          teamSummary: teamSummary.map((ts) => ({
            teamA: ts.teamA,
            teamB: ts.teamB,
            totalInteractions: ts.totalInteractions,
            uniqueContributorPairs: ts.uniqueContributorPairs,
          })),
        },
      },
      engineeringCascade: cascadeEdges || [],
      recentActivity: recentSignals || [],
      signalDistribution,
    });
  } catch (err: any) {
    console.error("Code intelligence error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to load code intelligence" },
      { status: 500 }
    );
  }
}
