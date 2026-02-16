/**
 * SE-aaS Early Warning System — GET /api/se-aas/early-warning
 *
 * BRAIN-INTEGRATED: Every early warning analysis also:
 * 1. Records predictions in prediction_records → Brain verifies later
 * 2. Emits cross_domain_signals → Brain observes patterns
 * 3. Triggers lightweight Brain evolution → Bayesian weight updates
 *
 * The more you check early warnings, the smarter the Brain gets.
 */

import { NextRequest } from "next/server";
import { authenticateSeAaSRequest, createSeAaSResponse, createSeAaSError } from "@/lib/se-aas/middleware";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateSeAaSRequest(request);

    const { runEarlyWarningSystem, getEarlyWarningSummary, runBrainEvolutionCycle } = await import("@nexus-ai/memory-stack");

    const url = new URL(request.url);
    const domainsParam = url.searchParams.get("domains");
    const lookbackDays = parseInt(url.searchParams.get("lookbackDays") || "90", 10);

    const domains = domainsParam
      ? domainsParam.split(",").map(d => d.trim())
      : ["backend", "frontend", "infrastructure"];

    const report = await runEarlyWarningSystem({
      supabase: auth.supabase,
      organizationId: auth.organizationId,
      domains,
      lookbackDays,
    });

    const summary = getEarlyWarningSummary(report);

    // =====================================================================
    // BRAIN FEEDBACK LOOP: Early warning results feed back into the Brain
    // =====================================================================
    // Non-blocking: Brain learns from every early warning analysis
    (async () => {
      try {
        const service = auth.supabase;
        const orgId = auth.organizationId;

        // 1. Record velocity predictions for Brain verification
        if (report.velocityCollapse) {
          await service.from("prediction_records").insert({
            organization_id: orgId,
            domain: "velocity",
            predicted_outcome: `Velocity collapse predicted: ${report.velocityCollapse.predictedDrop}% drop in ${report.velocityCollapse.daysUntilCollapse} days`,
            predicted_value: report.velocityCollapse.predictedDrop ?? null,
            confidence: 0.7,
            entity_type: "early_warning",
            entity_id: `velocity_${new Date().toISOString().split("T")[0]}`,
          });
        }

        // 2. Record bottleneck predictions for Brain verification
        for (const alert of report.bottleneckAlerts ?? []) {
          if (alert.severity === "critical" || alert.severity === "high") {
            await service.from("prediction_records").insert({
              organization_id: orgId,
              domain: alert.domain ?? "bottleneck",
              predicted_outcome: `Bottleneck risk: ${alert.message ?? alert.severity}`,
              predicted_value: null,
              confidence: 0.7,
              entity_type: "early_warning",
              entity_id: `bottleneck_${alert.domain ?? "unknown"}_${new Date().toISOString().split("T")[0]}`,
            });
          }
        }

        // 3. Emit early warning signal → Brain observes
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
            velocityAtRisk: !!report.velocityCollapse,
            bottleneckAlerts: (report.bottleneckAlerts ?? []).length,
            overallRisk: report.overallRisk,
          },
        });

        // 4. Lightweight Brain evolution cycle (verify past predictions + update weights)
        try {
          await runBrainEvolutionCycle(service, orgId, "lightweight");
        } catch {
          // Evolution cycle is optional
        }
      } catch {
        // Non-blocking: feedback failures should never break early warning
      }
    })();

    return createSeAaSResponse(request, {
      success: true,
      report,
      summary,
    });
  } catch (err: any) {
    if (err.status) {
      return createSeAaSError(request, err.error, err.status);
    }
    return createSeAaSError(request, err.message || "Internal server error", 500);
  }
}
