/**
 * Knowledge Extractor (ADR-019)
 * ==============================
 *
 * After every domain execution with quality >= 0.65, extracts 1-2 reusable
 * insights and stores them in `federated_knowledge` as workspace-specific rows
 * (organization_id = orgId).
 *
 * A weekly promotion cron (federate-knowledge) promotes insights that appear
 * in 3+ workspaces to universal rows (organization_id = null).
 *
 * All operations are non-fatal fire-and-forget. This module NEVER blocks
 * domain execution or the caller's return path.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const _ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY ?? process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? "";

export interface KnowledgeExtractionParams {
  domain: string;
  taskType: string;
  inputSummary: string;   // brief description of what was asked (max 200 chars)
  outputSummary: string;  // brief description of what was returned (max 200 chars)
  qualityScore: number;   // 0-1
  orgId: string;
  aiWorkerId?: string;
}

interface ExtractedInsight {
  insight: string;        // 1-2 sentence factual observation
  applicability: string;  // which domains/scenarios this applies to
  confidence: number;     // 0-1
}

/**
 * Extract 1-2 learnable insights from a completed domain execution.
 * Only runs when qualityScore >= 0.65.
 * Stores each insight in federated_knowledge as a workspace-specific row.
 *
 * Returns silently on any error — never throws.
 */
export async function extractAndStoreKnowledge(
  supabase: SupabaseClient,
  params: KnowledgeExtractionParams
): Promise<void> {
  // ADR-026.2: Caller (domain-executor) gates via getDomainThreshold() — this is a safety floor
  // only. Lowered from 0.5 to 0.3 to catch edge cases where adaptive threshold is used.
  if (params.qualityScore < 0.3) return;
  if (!_ANTHROPIC_API_KEY) {
    logger.warn("[knowledge-extractor] ANTHROPIC_API_KEY not set — skipping extraction");
    return;
  }

  try {
    const anthropic = new Anthropic({ apiKey: _ANTHROPIC_API_KEY });

    const prompt = `You are a knowledge extraction system for an AI workforce platform.

A domain execution just completed:
- Domain: ${params.domain}
- Task type: ${params.taskType}
- Input: ${params.inputSummary.slice(0, 200)}
- Output: ${params.outputSummary.slice(0, 200)}
- Quality score: ${Math.round(params.qualityScore * 100)}%

Extract 1-2 concise, reusable insights from this execution. Each insight should be:
- Applicable to future similar tasks in this domain
- Specific to the domain pattern observed
- Written as a factual observation (not advice)
- Maximum 100 words

Respond ONLY in JSON: { "insights": [{ "insight": "...", "applicability": "...", "confidence": 0.8 }] }
Max 2 insights.`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn("[knowledge-extractor] No JSON found in LLM response — skipping");
      return;
    }

    let parsed: { insights?: ExtractedInsight[] };
    try {
      parsed = JSON.parse(jsonMatch[0]) as { insights?: ExtractedInsight[] };
    } catch {
      logger.warn("[knowledge-extractor] JSON parse failed — skipping");
      return;
    }

    const insights = (parsed.insights ?? []).slice(0, 2);

    let stored = 0;
    for (const insight of insights) {
      if (!insight.insight || insight.insight.length < 10) continue;

      const { error } = await supabase.from("federated_knowledge").insert({
        organization_id: params.orgId,
        domain: params.domain,
        content: insight.insight,
        // Issue B fix: confidence as direct column (brain-context.ts filters .gte('confidence', 0.7))
        confidence: insight.confidence ?? params.qualityScore,
        metadata: {
          applicability: insight.applicability ?? params.domain,
          confidence: insight.confidence ?? params.qualityScore,
          task_type: params.taskType,
          quality_score: params.qualityScore,
          ai_worker_id: params.aiWorkerId ?? null,
          source: "knowledge-extractor",
          extracted_at: new Date().toISOString(),
        },
      });

      if (error) {
        logger.warn("[knowledge-extractor] Insert failed (non-fatal)", {
          domain: params.domain,
          error: error.message,
        });
      } else {
        stored++;
      }
    }

    if (stored > 0) {
      logger.info("[knowledge-extractor] Extracted insights stored", {
        domain: params.domain,
        count: stored,
        orgId: params.orgId,
        qualityScore: params.qualityScore,
      });
    }
  } catch (err) {
    // Non-fatal — knowledge extraction failure NEVER blocks execution
    logger.warn("[knowledge-extractor] Extraction failed (non-fatal)", {
      error: String(err),
      domain: params.domain,
    });
  }
}
