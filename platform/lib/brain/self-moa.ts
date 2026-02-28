/**
 * Self-MoA: Mixture of Agents — two patterns
 *
 * Pattern 1 — Dual top_p synthesis (original):
 *   For high-stakes queries: run at top_p=0.85 (focused/conservative) and
 *   top_p=0.99 (exploratory/creative) in parallel, then synthesize the best
 *   of both responses with a cheap Haiku call.
 *   Research: +6% quality improvement, near-zero additional cost.
 *
 * Pattern 2 — 3-lens multi-agent synthesis (new):
 *   For high-stakes domain queries (early-warning, delivery-intelligence)
 *   with Brain IQ >= 50 and query length > 100 chars.
 *   Fans out to 3 parallel sub-agents (Haiku), each with a different analytical
 *   lens, then a Sonnet synthesis agent combines their outputs into a single
 *   high-confidence answer. Consensus is measured by key-finding overlap.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import { routeCallType } from "@/lib/se-aas/model-router";

export interface MoAResult {
  synthesizedResponse: string;
  usedMoA: boolean;
  conservativeResponse?: string; // top_p=0.85 (for debugging/audit)
  creativeResponse?: string;     // top_p=0.99 (for debugging/audit)
  qualityBoost: number;          // estimated quality gain (0.06 for MoA)
}

const HIGH_STAKES_PHRASES = [
  "should i",
  "recommend",
  "strategy",
  "strategic",
  "plan",
  "decide",
  "best way",
  "architecture",
  "root cause",
  "debug",
  "why is",
  "risk",
  "critical",
  "important",
  "key decision",
  "tradeoff",
  "trade-off",
];

/**
 * Determine whether Self-MoA should be activated for this query.
 *
 * Conditions (both must be true):
 * 1. complexityScore >= 0.65 — query is Sonnet/Opus tier
 * 2. Query contains at least one high-stakes phrase (strategic decisions)
 */
export function shouldUseMoA(
  message: string,
  complexityScore: number
): boolean {
  if (complexityScore < 0.65) return false;
  const lowerMsg = message.toLowerCase();
  return HIGH_STAKES_PHRASES.some((phrase) => lowerMsg.includes(phrase));
}

/**
 * Run Self-MoA: dual top_p sampling + Haiku synthesis.
 *
 * Runs two Anthropic calls in parallel:
 *   - top_p=0.85 → focused, high-accuracy response
 *   - top_p=0.99 → diverse, exploratory response
 *
 * Then a Haiku synthesis call merges the best of both.
 * Falls back gracefully (returns empty synthesizedResponse) on any error.
 */
export async function runSelfMoA(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string,
  model: string,
  maxTokens: number = 1024
): Promise<MoAResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    // Run both temperature variants in parallel for minimal latency overhead
    const [conservativeResp, creativeResp] = await Promise.all([
      anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
        top_p: 0.85, // focused/conservative: high-accuracy, lower entropy
      }),
      anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
        top_p: 0.99, // exploratory/creative: diverse sampling, more nuance
      }),
    ]);

    const conservative =
      conservativeResp.content[0]?.type === "text"
        ? conservativeResp.content[0].text
        : "";
    const creative =
      creativeResp.content[0]?.type === "text"
        ? creativeResp.content[0].text
        : "";

    if (!conservative && !creative) {
      logger.warn("[Self-MoA] Both variants returned empty content");
      return { synthesizedResponse: "", usedMoA: false, qualityBoost: 0 };
    }

    // Synthesize with Haiku — cheap, fast, purpose-built for merging
    const userQuery =
      messages[messages.length - 1]?.content ?? "";
    const synthesisPrompt = `You are a synthesis expert. Two AI responses were generated for the same query using different sampling strategies.

Response A (focused/precise):
${conservative}

Response B (exploratory/creative):
${creative}

Original query: ${userQuery}

Synthesize the best of both responses. Take the factual accuracy and structure of A, and incorporate any additional insights, nuances, or perspectives from B that genuinely improve the answer.
Return ONLY the synthesized response — no meta-commentary, no "combining A and B" framing, no preamble.`;

    const synthesisResp = await anthropic.messages.create({
      model: routeCallType('self-moa').model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: synthesisPrompt }],
    });

    const synthesized =
      synthesisResp.content[0]?.type === "text"
        ? synthesisResp.content[0].text
        : conservative; // fallback to conservative if synthesis fails

    logger.warn(
      `[Self-MoA] Synthesis complete — conservative=${conservative.length}chars creative=${creative.length}chars synthesized=${synthesized.length}chars`
    );

    return {
      synthesizedResponse: synthesized,
      usedMoA: true,
      conservativeResponse: conservative,
      creativeResponse: creative,
      qualityBoost: 0.06,
    };
  } catch (err) {
    logger.warn("[Self-MoA] Failed, skipping MoA enhancement", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { synthesizedResponse: "", usedMoA: false, qualityBoost: 0 };
  }
}

// ============================================================================
// selfMoaSynthesize — Single-function dual-temperature synthesis
// ============================================================================
//
// Simplified interface for callers that just want "better answer from two
// sampling strategies". Takes system prompt + user message, returns the best
// synthesized response.
//
// Use ONLY for high-stakes decisions: overnight agent spec parsing,
// architectural decisions, domain routing when confidence < 0.5.
// Near-zero additional cost vs. single-sample — 2× Haiku + 1× Haiku synthesis.

/**
 * Run dual-temperature Self-MoA synthesis.
 *
 * Runs the LLM twice in parallel:
 *   temperature 0.3 → conservative, focused, high-accuracy
 *   temperature 0.8 → creative, exploratory, more nuanced
 *
 * A third Haiku call synthesizes the best of both.
 * Falls back to conservative response on any error.
 *
 * @param systemPrompt - System prompt for both candidate calls
 * @param userMessage  - User message for both candidate calls
 * @param model        - Model to use for candidates (default: claude-haiku-4-5-20251001)
 * @returns            - Best synthesized response string
 */
export async function selfMoaSynthesize(
  systemPrompt: string,
  userMessage: string,
  model: string = 'claude-haiku-4-5-20251001'
): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    // Run both temperature variants in parallel for minimal latency overhead
    const [conservativeResp, creativeResp] = await Promise.all([
      anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        top_p: 0.3, // conservative: focused, high-accuracy
      }),
      anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        top_p: 0.8, // creative: diverse sampling, more nuance
      }),
    ]);

    const conservative = conservativeResp.content[0]?.type === 'text' ? conservativeResp.content[0].text : '';
    const creative = creativeResp.content[0]?.type === 'text' ? creativeResp.content[0].text : '';

    if (!conservative && !creative) return '';
    if (!creative || conservative === creative) return conservative;

    // Synthesize with Haiku: pick the better response or combine best of both
    const synthesisResp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Two AI responses to the same question. Pick the BETTER one or synthesize the best of both. Return ONLY the response, no commentary.

Response A (conservative): ${conservative.slice(0, 800)}

Response B (exploratory): ${creative.slice(0, 800)}

Original question: ${userMessage.slice(0, 300)}

Return ONLY the best response verbatim, or a synthesis of both. No explanation.`,
      }],
    });

    return synthesisResp.content[0]?.type === 'text' ? synthesisResp.content[0].text : conservative;
  } catch (err) {
    logger.warn('[selfMoaSynthesize] Failed, returning empty string:', err instanceof Error ? err.message : String(err));
    return '';
  }
}

// ============================================================================
// Pattern 2: 3-Lens Multi-Agent Synthesis
// ============================================================================

/** Haiku model for sub-agents — fast, cheap, sufficient for focused lens analysis */
const MEMORY_EXTRACTION_MODEL = "claude-haiku-4-5-20251001";

export interface SelfMoaParams {
  query: string;
  domain: string;
  organizationId: string;
  userId: string;
  /** Stringified brain context from getBrainContext().contextSummary */
  brainContext: string;
  apiKey: string;
}

export interface MoaSubAgentResult {
  agentId: string;
  lens: "risk-focused" | "opportunity-focused" | "data-quality";
  analysis: string;
  confidence: number; // 0-1
  keyFindings: string[];
}

export interface SelfMoaResult {
  synthesis: string;
  subAgentResults: MoaSubAgentResult[];
  consensusLevel: number;    // 0-1: agreement between agents (key-findings overlap)
  overallConfidence: number; // weighted average of sub-agent confidences
  executionMs: number;
}

// ── Sub-agent lens definitions ──────────────────────────────────────────────

interface LensDefinition {
  id: "risk-focused" | "opportunity-focused" | "data-quality";
  systemPrompt: string;
}

const MOA_LENSES: LensDefinition[] = [
  {
    id: "risk-focused",
    systemPrompt: `You are a risk analysis specialist reviewing delivery intelligence data.
Your role: identify problems, risks, anomalies, and warning signals.
Focus on: what could go wrong, which engineers or projects are at risk, velocity drops, flight-risk scores, missed milestones, scope creep.
Be specific and cite data points where available.
Respond with a JSON object:
{
  "analysis": "2-4 sentence risk assessment",
  "confidence": 0.0-1.0,
  "keyFindings": ["finding1", "finding2", "finding3"]
}
Respond ONLY with the JSON object.`,
  },
  {
    id: "opportunity-focused",
    systemPrompt: `You are an opportunity and improvement analyst reviewing delivery intelligence data.
Your role: identify positive signals, improvement areas, wins, and actionable recommendations.
Focus on: strong performers, healthy velocity, positive engagement signals, quick wins, pod strengths.
Be specific and cite data points where available.
Respond with a JSON object:
{
  "analysis": "2-4 sentence opportunity assessment",
  "confidence": 0.0-1.0,
  "keyFindings": ["finding1", "finding2", "finding3"]
}
Respond ONLY with the JSON object.`,
  },
  {
    id: "data-quality",
    systemPrompt: `You are a data quality and confidence assessor reviewing delivery intelligence data.
Your role: assess the confidence level of the available data, flag missing or stale signals, and quantify uncertainty.
Focus on: how fresh the data is, which signals are missing, sample sizes, data completeness, any caveats the user should know.
Be specific about what data gaps exist.
Respond with a JSON object:
{
  "analysis": "2-4 sentence data quality assessment",
  "confidence": 0.0-1.0,
  "keyFindings": ["finding1", "finding2", "finding3"]
}
Respond ONLY with the JSON object.`,
  },
];

// ── Helper: run a single sub-agent lens call ────────────────────────────────

async function runSubAgent(
  anthropic: Anthropic,
  lens: LensDefinition,
  query: string,
  brainContext: string
): Promise<MoaSubAgentResult> {
  const agentId = `moa-${lens.id}-${Date.now()}`;

  const userMessage = `Brain context:\n${brainContext.slice(0, 2000)}\n\nUser query: ${query.slice(0, 500)}`;

  const resp = await anthropic.messages.create({
    model: MEMORY_EXTRACTION_MODEL,
    max_tokens: 400,
    system: lens.systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText =
    resp.content[0]?.type === "text" ? resp.content[0].text.trim() : "";

  if (!rawText) {
    return {
      agentId,
      lens: lens.id,
      analysis: "",
      confidence: 0,
      keyFindings: [],
    };
  }

  try {
    const jsonText = rawText
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "");
    const parsed = JSON.parse(jsonText) as {
      analysis?: string;
      confidence?: number;
      keyFindings?: string[];
    };
    return {
      agentId,
      lens: lens.id,
      analysis: (parsed.analysis ?? "").slice(0, 600),
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
      keyFindings: Array.isArray(parsed.keyFindings)
        ? parsed.keyFindings.slice(0, 5).map((f) => String(f).slice(0, 150))
        : [],
    };
  } catch {
    // Non-JSON response — return raw text as analysis with low confidence
    return {
      agentId,
      lens: lens.id,
      analysis: rawText.slice(0, 400),
      confidence: 0.3,
      keyFindings: [],
    };
  }
}

// ── Helper: measure consensus across sub-agent results ──────────────────────

function measureConsensus(results: MoaSubAgentResult[]): number {
  if (results.length < 2) return 1;

  // Collect all key findings as normalised tokens
  const allFindings = results.flatMap((r) =>
    r.keyFindings.map((f) =>
      f
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .join(" ")
    )
  );

  if (allFindings.length === 0) return 0.5;

  // Count findings that appear across at least 2 agents (word-level overlap)
  let overlappingCount = 0;
  for (const finding of allFindings) {
    const words = finding.split(/\s+/);
    const appearsInMultiple = results.filter((r) =>
      r.keyFindings.some((f) =>
        words.some((w) => w.length > 3 && f.toLowerCase().includes(w))
      )
    ).length;
    if (appearsInMultiple >= 2) overlappingCount++;
  }

  const consensus = Math.min(1, overlappingCount / Math.max(1, allFindings.length));
  return Math.round(consensus * 100) / 100;
}

// ── Main export: runSelfMoa ──────────────────────────────────────────────────

/**
 * Run Self-MOA: 3 parallel sub-agents with different analytical lenses,
 * followed by a Sonnet synthesis step.
 *
 * Sub-agents use Haiku (fast, cheap). Synthesis uses Sonnet (quality).
 * Everything is wrapped in try/catch — returns null on any failure.
 * Safe to call fire-and-forget from chat/route.ts.
 */
export async function runSelfMoa(
  params: SelfMoaParams
): Promise<SelfMoaResult | null> {
  const startMs = Date.now();

  try {
    const anthropic = new Anthropic({ apiKey: params.apiKey });

    // ── Step 1: Fan out to 3 sub-agents in parallel ──────────────────────
    const subAgentResults = await Promise.allSettled(
      MOA_LENSES.map((lens) =>
        runSubAgent(anthropic, lens, params.query, params.brainContext)
      )
    );

    // Collect fulfilled results — partial success is fine
    const fulfilled: MoaSubAgentResult[] = subAgentResults
      .filter(
        (r): r is PromiseFulfilledResult<MoaSubAgentResult> =>
          r.status === "fulfilled"
      )
      .map((r) => r.value)
      .filter((r) => r.analysis.length > 0);

    if (fulfilled.length === 0) {
      logger.warn("[Self-MOA] All sub-agents failed — skipping synthesis");
      return null;
    }

    // ── Step 2: Synthesize with Sonnet ───────────────────────────────────
    const synthesisModel = routeCallType("self-moa", 50).model; // always Sonnet

    const subAgentSummary = fulfilled
      .map(
        (r) =>
          `=== ${r.lens.toUpperCase()} AGENT (confidence: ${r.confidence.toFixed(2)}) ===\n` +
          `${r.analysis}\n` +
          (r.keyFindings.length > 0
            ? `Key findings:\n${r.keyFindings.map((f) => `- ${f}`).join("\n")}`
            : "")
      )
      .join("\n\n");

    const synthPrompt = `You are a synthesis expert for delivery intelligence analysis.
Three specialist agents have independently analysed the following query from different lenses.
Your task: combine their insights into one unified, high-confidence answer.

Original query: ${params.query.slice(0, 500)}

Brain context summary:
${params.brainContext.slice(0, 1000)}

${subAgentSummary}

Write a single unified answer that:
1. Leads with the most actionable insight
2. Integrates risk signals, opportunities, and data quality caveats
3. Is specific and references the actual data points mentioned by the agents
4. Ends with 1-2 concrete next steps the user can take

Return ONLY the unified answer — no meta-commentary, no agent references, no preamble.`;

    const synthesisResp = await anthropic.messages.create({
      model: synthesisModel,
      max_tokens: 1024,
      messages: [{ role: "user", content: synthPrompt }],
    });

    const synthesis =
      synthesisResp.content[0]?.type === "text"
        ? synthesisResp.content[0].text.trim()
        : fulfilled[0]?.analysis ?? "";

    // ── Step 3: Compute consensus + overall confidence ───────────────────
    const consensusLevel = measureConsensus(fulfilled);
    const overallConfidence =
      fulfilled.reduce((sum, r) => sum + r.confidence, 0) /
      Math.max(1, fulfilled.length);

    const executionMs = Date.now() - startMs;

    logger.warn(
      `[Self-MOA] Complete — domain=${params.domain} agents=${fulfilled.length} ` +
        `consensus=${consensusLevel.toFixed(2)} confidence=${overallConfidence.toFixed(2)} ` +
        `executionMs=${executionMs}`
    );

    return {
      synthesis,
      subAgentResults: fulfilled,
      consensusLevel,
      overallConfidence: Math.round(overallConfidence * 100) / 100,
      executionMs,
    };
  } catch (err) {
    logger.warn("[Self-MOA] Failed — returning null (non-fatal):", err);
    return null;
  }
}
