export const dynamic = "force-dynamic";
/**
 * Brain Evolution API — THE INSPIRATIONAL FEATURE
 * =================================================
 *
 * GET /api/brain/evolution?organizationId=xxx
 *   Returns the Brain's evolution state: intelligence score, accuracy,
 *   calibration, learning velocity, knowledge growth, and timeline.
 *   Users SEE the Brain getting smarter over time.
 *
 * POST /api/brain/evolution
 *   Trigger a Brain evolution cycle (prediction verification + weight updates).
 *   Can be called by a cron job or manually.
 *
 * POST /api/brain/evolution/counterfactual
 *   "What if" analysis — what would have happened if we did X instead of Y?
 *   Uses the Brain's causal graph for counterfactual reasoning.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { runBrainEvolutionCycle } from "@nexus-ai/memory-stack";
import { logger } from "@/lib/logger";
import { getDomainsForService } from "@/lib/ai-worker-domains";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = request.nextUrl.searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 400 });
    }

    // Verify user belongs to this org
    const { data: member } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
    }

    const service = await createServiceClient();

    // Run lightweight evolution cycle (just compute, don't save snapshot)
    const state = await runBrainEvolutionCycle(service, organizationId, 'lightweight');

    // Per-AI-Worker brain: filter accuracy to this worker's domain
    const serviceMode = request.nextUrl.searchParams.get("serviceMode");
    if (serviceMode && serviceMode !== "general") {
      const domains = getDomainsForService(serviceMode);
      if (domains.length > 0 && state.accuracy?.byDomain) {
        const domainAccuracies = Object.entries(state.accuracy.byDomain)
          .filter(([d]) => domains.some((prefix) => d.startsWith(prefix)));

        if (domainAccuracies.length > 0) {
          const totalPreds = domainAccuracies.reduce((s, [, v]) => s + (v as { totalPredictions: number }).totalPredictions, 0);
          const correctPreds = domainAccuracies.reduce((s, [, v]) => s + (v as { correctPredictions: number }).correctPredictions, 0);
          state.accuracy.overall = totalPreds > 0 ? correctPreds / totalPreds : 0;
          state.accuracy.byDomain = Object.fromEntries(domainAccuracies);
        }
      }
    }

    return NextResponse.json({
      success: true,
      evolution: state,
      serviceMode: serviceMode || "all",
      // Human-readable summary for the dashboard
      summary: {
        headline: getEvolutionHeadline(state.intelligenceScore, state.accuracy.trend),
        subtitle: getEvolutionSubtitle(state),
        badges: getEvolutionBadges(state),
      },
    });
  } catch (error: unknown) {
    // Graceful degradation: return default brain state instead of 500
    // Tables may not exist yet for new workspaces or the evolution cycle may fail
    logger.warn("[brain/evolution] GET failed, returning defaults:", error);
    return NextResponse.json({
      success: true,
      evolution: {
        intelligenceScore: 0,
        accuracy: { overall: 0, trend: "stable", improvementRate: 0 },
        calibration: { isWellCalibrated: false, brierScore: 1 },
        learningVelocity: { newEdgesPerWeek: 0, weightUpdatesPerWeek: 0, totalEvidence: 0 },
        knowledge: { totalCausalEdges: 0, verifiedPredictions: 0, cognitiveLayersActive: 0, highConfidenceEdges: 0 },
        interventions: { totalSuggested: 0, totalActedOn: 0, successRate: 0, avgImpactScore: 0 },
      },
      summary: {
        headline: "Brain Initializing",
        subtitle: "Connect data sources to start learning",
        badges: [],
      },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId, mode = "full" } = body;

    if (!organizationId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 400 });
    }

    // Verify user belongs to this org (same check as GET handler)
    const { data: evoMember } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!evoMember) {
      return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
    }

    const service = await createServiceClient();

    // Run full evolution cycle
    const state = await runBrainEvolutionCycle(
      service,
      organizationId,
      mode === "full" ? "full" : "lightweight"
    );

    return NextResponse.json({
      success: true,
      evolution: state,
      message: `Brain evolution cycle complete. Intelligence score: ${state.intelligenceScore}/100`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================================
// DASHBOARD HELPERS
// ============================================================================

function getEvolutionHeadline(score: number, trend: string): string {
  if (score >= 90) return "🧠 Exceptional Intelligence";
  if (score >= 75) return "🧠 Advanced Intelligence";
  if (score >= 60) return "🧠 Growing Intelligence";
  if (score >= 40) return "🧠 Learning Intelligence";
  if (score >= 20) return "🧠 Emerging Intelligence";
  return "🧠 Initializing Brain";
}

function getEvolutionSubtitle(state: {
  intelligenceScore: number;
  accuracy: { overall: number; trend: string; improvementRate: number };
  knowledge: { verifiedPredictions: number; totalCausalEdges: number };
}): string {
  const acc = Math.round(state.accuracy.overall * 100);
  const evidence = state.knowledge.verifiedPredictions;
  const edges = state.knowledge.totalCausalEdges;

  if (evidence === 0) {
    return `Brain has ${edges} causal edges. Awaiting first prediction verification.`;
  }

  const trendWord = state.accuracy.trend === 'improving'
    ? 'improving'
    : state.accuracy.trend === 'degrading' ? 'needs attention' : 'stable';

  return `${acc}% accurate across ${evidence} verified predictions. Trend: ${trendWord}. ${edges} causal edges learned.`;
}

function getEvolutionBadges(state: {
  accuracy: { overall: number; trend: string };
  calibration: { isWellCalibrated: boolean; brierScore: number };
  learningVelocity: { weightUpdatesPerWeek: number };
  knowledge: { highConfidenceEdges: number; cognitiveLayersActive: number };
}): string[] {
  const badges: string[] = [];

  if (state.accuracy.overall > 0.8) badges.push("🎯 High Accuracy");
  if (state.accuracy.trend === "improving") badges.push("📈 Improving");
  if (state.calibration.isWellCalibrated) badges.push("⚖️ Well Calibrated");
  if (state.learningVelocity.weightUpdatesPerWeek > 10) badges.push("⚡ Actively Learning");
  if (state.knowledge.highConfidenceEdges > 20) badges.push("🔗 Deep Knowledge");
  if (state.knowledge.cognitiveLayersActive >= 25) badges.push("🧬 Full Cognitive Stack");

  return badges;
}
