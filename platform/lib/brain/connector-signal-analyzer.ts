import Anthropic from "@anthropic-ai/sdk";
import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { routeCallType } from "@/lib/brain/call-type-router";
import { captureStreamedResponse as _captureConnectorInsight } from "@/lib/brain/claude-learning-capture";

/**
 * Analyze recent connector signals for an org and extract brain knowledge.
 *
 * Raw connector sync events land in cross_domain_signals as individual rows.
 * This function groups them by source_domain, runs Haiku on the batch to
 * extract patterns/trends/risks, and stores the derived understanding into
 * ai_memory so the Brain's copilot context benefits from ALL connector data —
 * not just the hand-coded heuristics in the individual sync routes.
 *
 * Called:
 *   - By /api/brain/analyze-signals (cron endpoint, every 4h via brain-refresh.yml)
 *   - Optionally fire-and-forget after connector sync completes
 *
 * @param supabase  A service-role SupabaseClient (bypasses RLS)
 * @param orgId     The organization_id to analyze
 * @param lookbackHours  How far back to pull signals (default: 24h)
 */
export async function analyzeConnectorSignals(
  supabase: SupabaseClient,
  orgId: string,
  lookbackHours: number = 24
): Promise<{ insightsCreated: number; signalsAnalyzed: number }> {
  const since = new Date(
    Date.now() - lookbackHours * 60 * 60 * 1000
  ).toISOString();

  // Fetch recent signals grouped by source_domain
  const { data: signals, error: fetchErr } = await supabase
    .from("cross_domain_signals")
    .select(
      "source_domain, signal_type, signal_value, entity_id, signal_metadata, created_at"
    )
    .eq("organization_id", orgId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);

  if (fetchErr) {
    logger.warn("[connector-analyzer] Failed to fetch signals:", fetchErr.message);
    return { insightsCreated: 0, signalsAnalyzed: 0 };
  }

  if (!signals || signals.length === 0) {
    return { insightsCreated: 0, signalsAnalyzed: 0 };
  }

  // Group by source_domain
  const byDomain: Record<
    string,
    Array<{
      source_domain: string;
      signal_type: string;
      signal_value: number;
      entity_id: string;
      signal_metadata: Record<string, unknown> | null;
      created_at: string;
    }>
  > = {};

  for (const s of signals) {
    const domain = s.source_domain as string;
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain].push(s as (typeof byDomain)[string][number]);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let insightsCreated = 0;

  for (const [domain, domainSignals] of Object.entries(byDomain)) {
    // Need at least 3 signals to derive meaningful patterns
    if (domainSignals.length < 3) continue;

    // Summarize signals for LLM — avoid sending full payload, cap each at 100 chars
    const signalSummary = domainSignals
      .slice(0, 50)
      .map(
        (s) =>
          `${s.signal_type}: ${s.entity_id} (value: ${s.signal_value}) — ${JSON.stringify(
            s.signal_metadata ?? {}
          ).slice(0, 100)}`
      )
      .join("\n");

    try {
      const response = await client.messages.create({
        model: routeCallType('connector-analyze').model,
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `Analyze these ${domain} events from the last ${lookbackHours}h and extract operational intelligence:

${signalSummary}

Return JSON only (no markdown):
{
  "trends": ["trend 1", "trend 2"],
  "risks": ["risk 1", "risk 2"],
  "patterns": ["pattern 1", "pattern 2"],
  "summary": "2-sentence executive summary of what is happening",
  "healthScore": 0.0
}`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== "text") continue;

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn(
          `[connector-analyzer] ${domain}: no JSON found in LLM response`
        );
        continue;
      }

      let analysis: {
        trends?: string[];
        risks?: string[];
        patterns?: string[];
        summary?: string;
        healthScore?: number;
      };

      try {
        analysis = JSON.parse(jsonMatch[0]);
      } catch {
        logger.warn(`[connector-analyzer] ${domain}: JSON parse failed`);
        continue;
      }

      // Build the memory content from LLM-extracted fields
      const memContent = [
        analysis.summary,
        analysis.trends && analysis.trends.length > 0
          ? `Trends: ${analysis.trends.join("; ")}`
          : "",
        analysis.risks && analysis.risks.length > 0
          ? `Risks: ${analysis.risks.join("; ")}`
          : "",
        analysis.patterns && analysis.patterns.length > 0
          ? `Patterns: ${analysis.patterns.join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const { error: upsertErr } = await supabase.from("ai_memory").upsert(
        {
          organization_id: orgId,
          domain: `connector.${domain}`,
          memory_type: "insight",
          content: memContent.slice(0, 1000),
          importance: typeof analysis.healthScore === "number"
            ? Math.max(0, Math.min(1, analysis.healthScore))
            : 0.6,
          metadata: {
            source: "connector_signal_analyzer",
            connector_domain: domain,
            signals_analyzed: domainSignals.length,
            lookback_hours: lookbackHours,
            health_score: analysis.healthScore ?? null,
            analyzed_at: new Date().toISOString(),
          },
        },
        {
          onConflict: "organization_id,memory_type,domain",
          ignoreDuplicates: false,
        }
      );

      if (!upsertErr) {
        insightsCreated++;
        // Also capture to federated_knowledge for cross-org learning
        _captureConnectorInsight(memContent, 0, {
          supabase,
          organizationId: orgId,
          domain: `connector.${domain}`,
          inputSummary: `${domainSignals.length} signals from ${domain} last ${lookbackHours}h`,
          qualityThreshold: 0.4,
        });
        logger.warn(
          `[connector-analyzer] ${domain}: ${domainSignals.length} signals → insight stored (health: ${analysis.healthScore ?? "n/a"})`
        );
      } else {
        logger.warn(
          `[connector-analyzer] ${domain}: upsert failed — ${upsertErr.message}`
        );
      }
    } catch (err) {
      logger.warn(`[connector-analyzer] ${domain} analysis failed:`, err);
    }
  }

  return { insightsCreated, signalsAnalyzed: signals.length };
}
