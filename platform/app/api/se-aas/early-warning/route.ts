/**
 * SE-aaS Early Warning System — GET /api/se-aas/early-warning
 *
 * BRAIN-INTEGRATED: Routes through BrainCommander → 15-Layer Cognitive Stack
 *   L3  Dreaming          — surfaces historical velocity patterns
 *   L5  Curiosity Engine  — generates root cause hypotheses
 *   L6  Self-Modifying    — calibrates confidence from past predictions
 *   L9  Theory of Mind    — models affected contributor perspectives
 *   L11 Red Team          — stress-tests predictions adversarially
 *   L14 Goal-Backward     — builds intervention plans from desired outcome
 *   L15 Narrative Intel   — produces executive narrative
 *
 * Every call also:
 *   1. Records predictions in prediction_records → Brain verifies later
 *   2. Emits cross_domain_signals → Brain observes patterns
 *   3. Triggers lightweight Brain evolution → Bayesian weight updates
 *
 * The more you check early warnings, the smarter the Brain gets.
 */

import { NextRequest } from "next/server";
import {
  authenticateSeAaSRequest,
  createSeAaSResponse,
  createSeAaSError,
} from "@/lib/se-aas/middleware";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateSeAaSRequest(request);

    const {
      runBrainEarlyWarning,
      createBrainCommander,
      runBrainEvolutionCycle,
    } = await import("@nexus-ai/memory-stack");

    const url = new URL(request.url);
    const domainsParam = url.searchParams.get("domains");
    const lookbackDays = parseInt(
      url.searchParams.get("lookbackDays") || "90",
      10
    );
    const forecastDays = parseInt(
      url.searchParams.get("forecastDays") || "7",
      10
    );

    const domains = domainsParam
      ? domainsParam.split(",").map((d) => d.trim())
      : ["backend", "frontend", "infrastructure"];

    // Instantiate BrainCommander — the 15-layer cognitive stack gateway
    const brainCommander = createBrainCommander({
      supabase: auth.supabase,
      organizationId: auth.organizationId,
      anthropicApiKey: auth.anthropicApiKey,
    });

    // Run through the full brain cognitive stack (NOT the deprecated standalone engine)
    const report = await runBrainEarlyWarning({
      brainCommander,
      supabase: auth.supabase,
      organizationId: auth.organizationId,
      domains,
      lookbackDays,
      forecastDays,
      anthropicApiKey: auth.anthropicApiKey,
    });

    // =====================================================================
    // BRAIN FEEDBACK LOOP: Early warning results feed back into the Brain
    // =====================================================================
    // Non-blocking: Brain learns from every early warning analysis
    (async () => {
      try {
        const service = auth.supabase;
        const orgId = auth.organizationId;

        // 1. Record velocity collapse prediction for Brain verification
        if (report.velocityCollapse) {
          const vc = report.velocityCollapse.prediction;
          await service.from("prediction_records").insert({
            organization_id: orgId,
            domain: "velocity",
            predicted_outcome: `Velocity collapse predicted: ${vc.predictedDrop}% drop in ${vc.daysUntilCollapse} days`,
            predicted_value: vc.predictedDrop ?? null,
            confidence: report.velocityCollapse.confidence,
            entity_type: "early_warning",
            entity_id: `velocity_${new Date().toISOString().split("T")[0]}`,
          });
        }

        // 2. Record critical/high bottleneck predictions for Brain verification
        for (const risk of report.bottleneckRisks ?? []) {
          if (risk.metrics.giniCoefficient > 0.6) {
            await service.from("prediction_records").insert({
              organization_id: orgId,
              domain: risk.domain ?? "bottleneck",
              predicted_outcome: `Bottleneck risk in ${risk.domain}: Gini ${risk.metrics.giniCoefficient.toFixed(2)}, bus factor ${risk.metrics.busFactor}`,
              predicted_value: risk.metrics.giniCoefficient,
              confidence: risk.confidence,
              entity_type: "early_warning",
              entity_id: `bottleneck_${risk.domain ?? "unknown"}_${new Date().toISOString().split("T")[0]}`,
            });
          }
        }

        // 3. Emit early warning signal → Brain observes patterns
        await service.from("cross_domain_signals").insert({
          organization_id: orgId,
          source_domain: "brain.early_warning",
          signal_type: "early_warning_analysis",
          signal_value: report.velocityCollapse ? 1 : 0,
          entity_type: "early_warning",
          entity_id: `ew_${new Date().toISOString().split("T")[0]}`,
          signal_metadata: {
            domains,
            lookbackDays,
            forecastDays,
            overallRisk: report.overallRisk,
            confidence: report.confidence,
            velocityAtRisk: !!report.velocityCollapse,
            bottleneckRisks: (report.bottleneckRisks ?? []).length,
            cognitiveLayersUsed: ["L3", "L5", "L6", "L9", "L11", "L14", "L15"],
          },
        });

        // 4. Lightweight Brain evolution cycle (verify past predictions + update weights)
        try {
          await runBrainEvolutionCycle(service, orgId, "lightweight");
        } catch {
          // Evolution cycle is optional — never block the response
        }
      } catch {
        // Non-blocking: feedback failures should never break early warning
      }
    })();

    return createSeAaSResponse(request, {
      success: true,
      report,
      // Convenience top-level fields for dashboard consumers
      overallRisk: report.overallRisk,
      confidence: report.confidence,
      narrative: report.narrative,
      interventionPlan: report.interventionPlan,
      generatedAt: report.generatedAt,
    });
  } catch (err: any) {
    if (err.status) {
      return createSeAaSError(request, err.error, err.status);
    }
    return createSeAaSError(
      request,
      err.message || "Internal server error",
      500
    );
  }
}
