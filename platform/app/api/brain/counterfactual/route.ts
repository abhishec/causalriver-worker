/**
 * Brain Counterfactual API — "What If?" Analysis Nobody Has Built
 * =================================================================
 *
 * POST /api/brain/counterfactual
 *   Answer counterfactual questions using the Brain's causal graph:
 *
 *   "What would happen to velocity if we hired 2 more reviewers?"
 *   "What would have happened if we didn't deploy on Friday?"
 *   "What if we reduced PR size by 30%?"
 *
 *   Uses the Brain's learned causal relationships to simulate
 *   intervention effects WITHOUT actually doing them.
 *
 * THIS IS THE DIFFERENTIATOR:
 * No other engineering intelligence tool does causal counterfactual reasoning.
 * Traditional tools show dashboards. We simulate alternative realities.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export interface CounterfactualRequest {
  organizationId: string;
  question: string;
  intervention: {
    variable: string;      // "reviewer_count", "pr_size", "deploy_frequency"
    currentValue: number;
    proposedValue: number;
  };
  targetMetric: string;     // "velocity", "cycle_time", "incident_rate"
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: CounterfactualRequest = await request.json();
    const { organizationId, question, intervention, targetMetric } = body;

    if (!organizationId || !intervention || !targetMetric) {
      return NextResponse.json({
        error: "Missing required fields: organizationId, intervention, targetMetric",
      }, { status: 400 });
    }

    // Verify user belongs to this org
    const { data: cfMember } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!cfMember) {
      return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
    }

    const service = await createServiceClient();

    // Load the Brain's causal graph for this workspace
    const [causalEdges, velocitySnapshot, bottleneckSnapshot] = await Promise.all([
      service
        .from("causal_relationships_statistical")
        .select("source_domain, target_domain, effect_size, evidence_weight, granger_p_value, optimal_lag_days, natural_language")
        .eq("organization_id", organizationId)
        .eq("is_significant", true)
        .order("evidence_weight", { ascending: false })
        .limit(50),
      service
        .from("velocity_snapshots")
        .select("*")
        .eq("organization_id", organizationId)
        .order("snapshot_date", { ascending: false })
        .limit(1),
      service
        .from("bottleneck_snapshots")
        .select("*")
        .eq("organization_id", organizationId)
        .order("snapshot_date", { ascending: false })
        .limit(1),
    ]);

    // Find relevant causal edges for this intervention
    const edges = causalEdges.data ?? [];
    const velocity = velocitySnapshot.data?.[0];
    const bottleneck = bottleneckSnapshot.data?.[0];

    // Simulate the counterfactual
    const result = simulateCounterfactual(
      intervention,
      targetMetric,
      edges,
      velocity,
      bottleneck
    );

    // Record the counterfactual query as an intervention suggestion
    await service.from("brain_intervention_records").insert({
      organization_id: organizationId,
      intervention_type: `counterfactual_${intervention.variable}`,
      description: question || `What if ${intervention.variable} changed from ${intervention.currentValue} to ${intervention.proposedValue}?`,
      suggested_by: "L8_causal_imagination",
      target_metric: targetMetric,
      baseline_value: intervention.currentValue,
      target_value: intervention.proposedValue,
      user_id: user.id,
    });

    return NextResponse.json({
      success: true,
      counterfactual: {
        question: question || `What if ${intervention.variable} = ${intervention.proposedValue}?`,
        intervention,
        targetMetric,
        prediction: result,
        causalChain: result.causalChain,
        confidence: result.confidence,
        disclaimer: "This prediction is based on the Brain's learned causal relationships. " +
          "Actual outcomes may vary due to unobserved confounders.",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================================
// COUNTERFACTUAL SIMULATION ENGINE
// ============================================================================

interface SimulationResult {
  predictedChange: number;       // Expected change in target metric
  predictedNewValue: number;     // Expected new value of target metric
  direction: "increase" | "decrease" | "no_change";
  magnitude: "small" | "medium" | "large";
  confidence: number;            // 0-1
  timeToEffect: number;          // Days until effect is visible
  causalChain: CausalStep[];     // The chain of cause → effect
  risks: string[];               // Potential risks of this intervention
  recommendation: string;        // Human-readable recommendation
}

interface CausalStep {
  from: string;
  to: string;
  effectSize: number;
  lag: number;
  description: string;
}

function simulateCounterfactual(
  intervention: { variable: string; currentValue: number; proposedValue: number },
  targetMetric: string,
  edges: Array<{
    source_domain: string;
    target_domain: string;
    effect_size: number | null;
    evidence_weight: number | null;
    granger_p_value: number | null;
    optimal_lag_days: number | null;
    natural_language: string | null;
  }>,
  velocity: Record<string, unknown> | null,
  bottleneck: Record<string, unknown> | null
): SimulationResult {
  const changeMagnitude = intervention.proposedValue - intervention.currentValue;
  const changeRatio = intervention.currentValue !== 0
    ? changeMagnitude / intervention.currentValue
    : changeMagnitude;

  // Find edges from intervention variable to target metric
  const relevantEdges = edges.filter(e =>
    e.source_domain?.includes(intervention.variable) ||
    e.target_domain?.includes(targetMetric) ||
    e.source_domain?.includes(targetMetric)
  );

  // Build causal chain
  const causalChain: CausalStep[] = [];
  let totalEffectSize = 0;
  let maxLag = 0;
  let avgConfidence = 0;

  if (relevantEdges.length > 0) {
    for (const edge of relevantEdges.slice(0, 5)) {
      const effectSize = edge.effect_size ?? 0.1;
      const lag = edge.optimal_lag_days ?? 7;
      const weight = edge.evidence_weight ?? 0.5;

      causalChain.push({
        from: edge.source_domain,
        to: edge.target_domain,
        effectSize,
        lag,
        description: edge.natural_language || `${edge.source_domain} → ${edge.target_domain}`,
      });

      totalEffectSize += effectSize * weight;
      maxLag = Math.max(maxLag, lag);
      avgConfidence += weight;
    }
    avgConfidence /= relevantEdges.length;
  } else {
    // No direct edges — use domain knowledge heuristics
    const heuristicEffect = estimateHeuristicEffect(intervention.variable, targetMetric, changeRatio);
    totalEffectSize = heuristicEffect.effect;
    maxLag = heuristicEffect.lag;
    avgConfidence = heuristicEffect.confidence;

    causalChain.push({
      from: intervention.variable,
      to: targetMetric,
      effectSize: totalEffectSize,
      lag: maxLag,
      description: heuristicEffect.description,
    });
  }

  // Compute predicted change
  const predictedChange = changeRatio * totalEffectSize;
  const currentMetricValue = getCurrentMetricValue(targetMetric, velocity, bottleneck);
  const predictedNewValue = currentMetricValue * (1 + predictedChange);

  // Determine direction and magnitude
  const direction = predictedChange > 0.01 ? "increase" as const
    : predictedChange < -0.01 ? "decrease" as const
      : "no_change" as const;

  const absMagnitude = Math.abs(predictedChange);
  const magnitude = absMagnitude > 0.3 ? "large" as const
    : absMagnitude > 0.1 ? "medium" as const
      : "small" as const;

  // Generate risks
  const risks = generateRisks(intervention, targetMetric, predictedChange);

  // Generate recommendation
  const recommendation = generateRecommendation(
    intervention, targetMetric, predictedChange, avgConfidence, risks
  );

  return {
    predictedChange: Math.round(predictedChange * 100) / 100,
    predictedNewValue: Math.round(predictedNewValue * 100) / 100,
    direction,
    magnitude,
    confidence: Math.round(avgConfidence * 100) / 100,
    timeToEffect: maxLag || 7,
    causalChain,
    risks,
    recommendation,
  };
}

function getCurrentMetricValue(
  metric: string,
  velocity: Record<string, unknown> | null,
  bottleneck: Record<string, unknown> | null
): number {
  if (velocity) {
    if (metric === "velocity" || metric === "prs_merged") return Number(velocity.prs_merged ?? 10);
    if (metric === "cycle_time") return Number(velocity.mean_pr_cycle_time_hours ?? 24);
  }
  if (bottleneck) {
    if (metric === "bottleneck_risk") return Number(bottleneck.bottleneck_risk_score ?? 50);
    if (metric === "reviewer_concentration") return Number(bottleneck.reviewer_hhi ?? 0.3);
  }
  return 1; // Default
}

function estimateHeuristicEffect(
  variable: string,
  target: string,
  changeRatio: number
): { effect: number; lag: number; confidence: number; description: string } {
  // Domain knowledge heuristics for common engineering interventions
  const heuristics: Record<string, Record<string, { effect: number; lag: number; desc: string }>> = {
    reviewer_count: {
      cycle_time: { effect: -0.4, lag: 14, desc: "More reviewers → shorter review queues → faster cycle time" },
      velocity: { effect: 0.3, lag: 14, desc: "More reviewers → less bottleneck → higher velocity" },
      bottleneck_risk: { effect: -0.5, lag: 7, desc: "More reviewers → lower concentration → reduced bottleneck" },
    },
    pr_size: {
      cycle_time: { effect: 0.6, lag: 7, desc: "Larger PRs → longer review time → slower cycle" },
      velocity: { effect: -0.3, lag: 7, desc: "Larger PRs → slower reviews → lower velocity" },
    },
    deploy_frequency: {
      incident_rate: { effect: 0.2, lag: 3, desc: "More frequent deploys → smaller batches → mixed incident risk" },
      velocity: { effect: 0.1, lag: 3, desc: "More deploys → faster feedback → slightly higher velocity" },
    },
    wip_limit: {
      velocity: { effect: 0.25, lag: 14, desc: "Lower WIP → focus → higher throughput (Little's Law)" },
      cycle_time: { effect: -0.3, lag: 7, desc: "Lower WIP → less context switching → faster delivery" },
    },
  };

  const match = heuristics[variable]?.[target];
  if (match) {
    return {
      effect: match.effect * Math.sign(changeRatio),
      lag: match.lag,
      confidence: 0.5, // Heuristic confidence is moderate
      description: match.desc,
    };
  }

  // Unknown combination — low confidence estimate
  return {
    effect: changeRatio * 0.1,
    lag: 14,
    confidence: 0.2,
    description: `Estimated effect of ${variable} on ${target} (low confidence — no learned relationship)`,
  };
}

function generateRisks(
  intervention: { variable: string; currentValue: number; proposedValue: number },
  _targetMetric: string,
  predictedChange: number
): string[] {
  const risks: string[] = [];

  if (Math.abs(predictedChange) > 0.5) {
    risks.push("Large predicted change — may have unintended cascading effects");
  }

  if (intervention.variable === "reviewer_count" && intervention.proposedValue > intervention.currentValue * 2) {
    risks.push("Doubling reviewers may introduce coordination overhead");
  }

  if (intervention.variable === "deploy_frequency" && intervention.proposedValue > 10) {
    risks.push("Very high deploy frequency requires strong CI/CD infrastructure");
  }

  if (predictedChange < -0.3) {
    risks.push("Significant negative impact predicted — proceed with caution");
  }

  return risks;
}

function generateRecommendation(
  intervention: { variable: string; currentValue: number; proposedValue: number },
  targetMetric: string,
  predictedChange: number,
  confidence: number,
  risks: string[]
): string {
  const changePercent = Math.round(Math.abs(predictedChange) * 100);
  const direction = predictedChange > 0 ? "increase" : "decrease";

  if (confidence < 0.3) {
    return `The Brain has limited evidence about the relationship between ${intervention.variable} and ${targetMetric}. ` +
      `Consider running a controlled experiment first.`;
  }

  if (predictedChange > 0 && risks.length === 0) {
    return `Recommended. Changing ${intervention.variable} from ${intervention.currentValue} to ${intervention.proposedValue} ` +
      `is predicted to ${direction} ${targetMetric} by ~${changePercent}% with ${Math.round(confidence * 100)}% confidence.`;
  }

  if (risks.length > 0) {
    return `Proceed with caution. Expected ~${changePercent}% ${direction} in ${targetMetric}, ` +
      `but ${risks.length} risk(s) identified. Consider gradual rollout.`;
  }

  return `Neutral impact expected. The predicted change in ${targetMetric} is minimal (~${changePercent}%).`;
}
