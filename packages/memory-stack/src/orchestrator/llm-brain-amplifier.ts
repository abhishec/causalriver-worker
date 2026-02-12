/**
 * NexusBrain LLM Brain Amplifier
 *
 * Claude as the Brain's Judgment Layer
 *
 * The brain handles statistical pattern detection (15-method causal ensemble,
 * Bayesian learning, anomaly detection). This module adds semantic understanding
 * on top — the brain does the math, Claude explains WHY it matters.
 *
 * 5 Amplification Functions:
 *   1. amplifyInsight        — Turn DMN correlations into business narratives (Sonnet)
 *   2. interpretAnomaly      — Explain what anomaly means in context (Haiku)
 *   3. verifyPredictionWithLLM — Nuanced prediction judging (Haiku)
 *   4. generateCausalHypothesis — "Why does A cause B?" (Sonnet)
 *   5. generateConsolidationBriefing — CTO-grade daily briefing (Sonnet)
 *
 * Two-tier model approach:
 *   - Haiku for high-volume tasks (~100s/day): anomaly, verification
 *   - Sonnet for high-value tasks (~5-10/day): narratives, hypotheses, briefings
 *
 * Design: Never throws. All calls are try/catch wrapped with graceful degradation.
 * If LLM fails, the statistical output stands alone.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface BrainAmplifierConfig {
  /** LLM provider */
  provider: 'anthropic' | 'openai';
  /** API key */
  apiKey: string;
  /** Fast model for high-volume tasks (default: claude-3-5-haiku-20241022) */
  fastModel?: string;
  /** Deep model for high-value tasks (default: claude-sonnet-4-5-20250929) */
  deepModel?: string;
  /** Max tokens per call (default: 1024) */
  maxTokens?: number;
  /** Verbose logging */
  verbose?: boolean;
}

/** Gap 1: Amplified DMN insight */
export interface AmplifiedInsight {
  /** Business-readable explanation of what the statistical correlation means */
  explanation: string;
  /** How this impacts the business */
  businessImpact: string;
  /** Concrete actions to take */
  recommendedActions: string[];
  /** LLM confidence in its interpretation (0-1) */
  confidence: number;
}

/** Gap 2: Interpreted anomaly */
export interface InterpretedAnomaly {
  /** What this anomaly means in plain English */
  interpretation: string;
  /** Reassessed severity: 'critical' | 'high' | 'medium' | 'low' */
  severity: string;
  /** Most likely root causes */
  likelyCauses: string[];
  /** What to do about it */
  suggestedActions: string[];
}

/** Gap 3: LLM-verified prediction */
export interface LLMPredictionVerdict {
  /** Nuanced verdict beyond binary correct/incorrect */
  verdict: 'correct' | 'incorrect' | 'partially_correct' | 'inconclusive';
  /** Reasoning for the verdict */
  reasoning: string;
  /** Suggested confidence adjustment (-0.2 to +0.2) */
  confidenceAdjustment: number;
}

/** Gap 4: Causal hypothesis */
export interface CausalHypothesis {
  /** "Why does A cause B?" — the mechanism */
  mechanismHypothesis: string;
  /** Potential confounders that could explain the correlation without causation */
  confounders: string[];
  /** Testable implications — if this mechanism is real, what else should we see? */
  testableImplications: string[];
  /** LLM confidence in the hypothesis (0-1) */
  confidence: number;
}

/** Gap 5: Consolidation briefing */
export interface ConsolidationBriefing {
  /** 2-3 sentence executive summary */
  executiveSummary: string;
  /** Top findings (max 5) */
  keyFindings: string[];
  /** Identified risks */
  risks: string[];
  /** Strategic implications for the organization */
  strategicImplications: string[];
}

/** Gap 6: Enhanced scenario narrative (What-If Simulator / Prefrontal Cortex) */
export interface ScenarioNarrative {
  /** Rich narrative explaining the cascade in business terms */
  narrative: string;
  /** Key risks identified in this scenario */
  scenarioRisks: string[];
  /** Recommended interventions with reasoning */
  interventionRecommendations: string[];
  /** Confidence assessment in the simulation's assumptions */
  confidenceAssessment: string;
}

/** Gap 7: Enhanced impact summary (Impact Scorer / Amygdala) */
export interface EnhancedImpactSummary {
  /** Rich human-readable impact summary */
  summary: string;
  /** Why this event matters beyond the numbers */
  businessContext: string;
  /** Specific recommended actions */
  recommendedActions: string[];
  /** Whether the statistical severity seems right */
  severityAssessment: string;
}

/** Gap 8: Enhanced pattern explanation (Pattern Detector / Basal Ganglia) */
export interface EnhancedPatternExplanation {
  /** Business-readable pattern name */
  name: string;
  /** Rich description of what this pattern means */
  description: string;
  /** Natural language explanation for stakeholders */
  naturalLanguage: string;
  /** Why this pattern is actionable */
  actionability: string;
  /** Potential blind spots or caveats */
  caveats: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 10_000;
const LLM_CALL_TIMEOUT_MS = 30_000;

const DEFAULT_FAST_MODEL = 'claude-3-5-haiku-20241022';
const DEFAULT_DEEP_MODEL = 'claude-sonnet-4-20250514'; // Cost control: regular Sonnet (3x cheaper than 4.5) for deep analysis
const DEFAULT_MAX_TOKENS = 1024;

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const INSIGHT_SYSTEM_PROMPT = `You are the semantic layer of NexusBrain, an AI brain that discovers causal relationships across business domains (Sales, Finance, CS, Engineering, People, etc.).

Your role: Take statistical insights from the brain's DMN (Default Mode Network) and translate them into business-actionable narratives.

The brain found a statistical pattern. You explain WHY it matters to business leaders.

Respond in JSON format:
{
  "explanation": "Clear, jargon-free explanation of what this pattern means",
  "businessImpact": "How this affects the business (revenue, growth, retention, etc.)",
  "recommendedActions": ["Action 1", "Action 2", "Action 3"],
  "confidence": 0.0-1.0
}`;

const ANOMALY_SYSTEM_PROMPT = `You are the semantic layer of NexusBrain. A statistical anomaly has been detected — a metric has deviated significantly from its historical baseline.

Your role: Interpret what this anomaly means in business context. Is it a real problem, a data artifact, or an opportunity?

Respond in JSON format:
{
  "interpretation": "What this anomaly means in plain business English",
  "severity": "critical|high|medium|low",
  "likelyCauses": ["Cause 1", "Cause 2"],
  "suggestedActions": ["Action 1", "Action 2"]
}`;

const PREDICTION_SYSTEM_PROMPT = `You are the judgment layer of NexusBrain's prediction verification system.

The brain made a prediction about a metric (direction + magnitude). Now the actual outcome is known. The statistical check uses a simple rule: direction matches AND magnitude within 50%.

Your role: Provide a more nuanced assessment. Consider:
- Did external factors (market conditions, seasonality) affect the outcome?
- Is the prediction directionally right but off on timing?
- Should confidence be adjusted based on the quality of the prediction?

Respond in JSON format:
{
  "verdict": "correct|incorrect|partially_correct|inconclusive",
  "reasoning": "Why you reached this verdict (2-3 sentences)",
  "confidenceAdjustment": -0.2 to +0.2
}`;

const CAUSAL_HYPOTHESIS_SYSTEM_PROMPT = `You are the theoretical reasoning layer of NexusBrain. The brain discovered a statistical causal relationship between two business domains.

Your role: Generate a plausible MECHANISM — why does A cause B? Think like a business strategist and systems thinker.

Also identify potential confounders (alternative explanations) and testable implications (if this mechanism is real, what else should we observe?).

Respond in JSON format:
{
  "mechanismHypothesis": "The causal mechanism in 2-3 sentences",
  "confounders": ["Alternative explanation 1", "Alternative explanation 2"],
  "testableImplications": ["If this is real, we should also see X", "We could test by doing Y"],
  "confidence": 0.0-1.0
}`;

const SCENARIO_NARRATIVE_SYSTEM_PROMPT = `You are the scenario interpretation layer of NexusBrain's What-If Simulator (Prefrontal Cortex).

The brain simulated a "what if" scenario through the causal graph — tracing cascade effects through domains with statistical effect sizes and lag times. The statistical simulation is complete.

Your role: Transform the dry cascade trace into a compelling scenario narrative that a CTO can act on. Identify the real risks, recommend the best intervention points, and assess whether the simulation's assumptions are reasonable.

Respond in JSON format:
{
  "narrative": "A rich 3-5 sentence narrative explaining what would happen and why it matters",
  "scenarioRisks": ["Risk 1 specific to this scenario", "Risk 2"],
  "interventionRecommendations": ["Where and how to intervene, with reasoning"],
  "confidenceAssessment": "1-2 sentences on how trustworthy this simulation is"
}`;

const IMPACT_SUMMARY_SYSTEM_PROMPT = `You are the impact assessment layer of NexusBrain's Impact Scorer (Amygdala).

The brain scored a business event using 4 quantitative components: Cascade Reach, Dollar Effect, Strategic Alignment, and Novelty. The composite score is computed.

Your role: Add the qualitative judgment that numbers can't capture. Is this event more or less important than its score suggests? What's the business context? What should leadership actually DO about it?

Respond in JSON format:
{
  "summary": "A crisp 2-3 sentence impact summary for a dashboard",
  "businessContext": "Why this matters beyond the numbers (market context, timing, strategic significance)",
  "recommendedActions": ["Specific action 1", "Specific action 2"],
  "severityAssessment": "Does the statistical severity feel right? Over/under-rated?"
}`;

const PATTERN_EXPLANATION_SYSTEM_PROMPT = `You are the pattern interpretation layer of NexusBrain's Pattern Detector (Basal Ganglia).

The brain discovered a statistically significant pattern using association rule mining, clustering, or sequential pattern mining. The statistical evidence (p-value, effect size, support, confidence) is established.

Your role: Give this pattern a memorable business name, explain what it means for stakeholders in plain language, assess whether it's actionable, and note any caveats.

Respond in JSON format:
{
  "name": "A memorable 3-6 word business name for this pattern",
  "description": "What this pattern means in business terms (2-3 sentences)",
  "naturalLanguage": "Full stakeholder-ready explanation with implications",
  "actionability": "Is this actionable? What can the team do with this knowledge?",
  "caveats": ["Caveat 1 — potential limitation", "Caveat 2"]
}`;

const CONSOLIDATION_SYSTEM_PROMPT = `You are the CTO briefing layer of NexusBrain. You receive the full output of the brain's nightly consolidation cycle — what was discovered, what was learned, what predictions were verified, and how the brain changed.

Your role: Produce a concise executive briefing suitable for a CTO or VP-level leader. Focus on:
- What materially changed in the brain's understanding
- Any surprising discoveries or validated predictions
- Risks or deteriorating patterns that need attention
- Strategic implications for decision-making

Respond in JSON format:
{
  "executiveSummary": "2-3 sentence TL;DR of what happened overnight",
  "keyFindings": ["Finding 1", "Finding 2", "Finding 3"],
  "risks": ["Risk 1", "Risk 2"],
  "strategicImplications": ["Implication 1", "Implication 2"]
}`;

// ============================================================================
// RETRY + TIMEOUT HELPERS
// ============================================================================

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on auth errors (401/403) or client errors (400)
      const message = error?.message || '';
      if (message.includes('401') || message.includes('403') || message.includes('400')) {
        throw error;
      }

      // Retry on network errors, 429, and 5xx
      if (attempt < maxRetries) {
        const delay = Math.min(
          INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500,
          MAX_RETRY_DELAY_MS
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('LLM call failed after retries');
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = LLM_CALL_TIMEOUT_MS
): Promise<Response> {
  if (typeof AbortController !== 'undefined') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(`LLM call timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Fallback: race fetch against a timeout
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`LLM call timed out after ${timeoutMs}ms`)), timeoutMs)
  );
  return Promise.race([fetch(url, init), timeoutPromise]);
}

// ============================================================================
// JSON PARSING HELPER
// ============================================================================

/**
 * Parse JSON from LLM response, handling markdown fences and partial JSON.
 */
function parseJSONResponse<T>(raw: string, fallback: T): T {
  try {
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    return JSON.parse(cleaned) as T;
  } catch {
    // Try to extract JSON from mixed content
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a Brain Amplifier — Claude as the brain's semantic judgment layer.
 *
 * @example
 * ```typescript
 * const amplifier = createBrainAmplifier({
 *   provider: 'anthropic',
 *   apiKey: process.env.ANTHROPIC_API_KEY!,
 * });
 *
 * // Amplify a DMN insight
 * const amplified = await amplifier.amplifyInsight(insight);
 * console.log(amplified.businessImpact);
 *
 * // Get CTO-grade briefing
 * const briefing = await amplifier.generateConsolidationBriefing(report, stats);
 * console.log(briefing.executiveSummary);
 * ```
 */
export function createBrainAmplifier(config: BrainAmplifierConfig) {
  const {
    provider,
    apiKey,
    fastModel = DEFAULT_FAST_MODEL,
    deepModel = DEFAULT_DEEP_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    verbose = false,
  } = config;

  // ──────────────────────────────────────────────
  // Internal LLM call (dual-provider)
  // ──────────────────────────────────────────────

  async function callLLM(
    systemPrompt: string,
    userMessage: string,
    model: string,
    callMaxTokens: number = maxTokens
  ): Promise<{ response: string; tokensUsed: { input: number; output: number } }> {
    if (provider === 'anthropic') {
      const response = await fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: callMaxTokens,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      return {
        response: data.content?.[0]?.text || '{}',
        tokensUsed: {
          input: data.usage?.input_tokens || 0,
          output: data.usage?.output_tokens || 0,
        },
      };
    } else {
      // OpenAI
      const response = await fetchWithTimeout(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: callMaxTokens,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      return {
        response: data.choices?.[0]?.message?.content || '{}',
        tokensUsed: {
          input: data.usage?.prompt_tokens || 0,
          output: data.usage?.completion_tokens || 0,
        },
      };
    }
  }

  /**
   * Call LLM with retry and logging. Never throws — returns fallback on failure.
   */
  async function callWithFallback<T>(
    label: string,
    systemPrompt: string,
    userMessage: string,
    model: string,
    fallback: T,
    callMaxTokens?: number
  ): Promise<T> {
    try {
      const start = Date.now();
      const result = await withRetry(
        () => callLLM(systemPrompt, userMessage, model, callMaxTokens)
      );
      const durationMs = Date.now() - start;

      if (verbose) {
        console.log(
          `[BrainAmplifier] ${label}: ${durationMs}ms | ` +
          `tokens: ${result.tokensUsed.input}in/${result.tokensUsed.output}out`
        );
      }

      return parseJSONResponse<T>(result.response, fallback);
    } catch (error: any) {
      console.warn(
        `[BrainAmplifier] ${label} failed (graceful degradation): ${error?.message || error}`
      );
      return fallback;
    }
  }

  // ──────────────────────────────────────────────
  // GAP 1: DMN Insight Amplification
  // ──────────────────────────────────────────────

  /**
   * Amplify a DMN insight with business context and actionable recommendations.
   * Uses Sonnet (deep model) for high-value narrative generation.
   *
   * Brain Analog: Wernicke's area — comprehension of meaning
   */
  async function amplifyInsight(insight: {
    type: string;
    title: string;
    explanation: string;
    domains: string[];
    importance: number;
    surpriseScore: number;
    evidence?: {
      causalEdges?: Array<{ source: string; target: string; weight: number }>;
      statistics?: Record<string, number>;
    };
  }): Promise<AmplifiedInsight> {
    const fallback: AmplifiedInsight = {
      explanation: insight.explanation,
      businessImpact: 'Unable to generate business impact analysis.',
      recommendedActions: [],
      confidence: 0,
    };

    const userMessage = `The brain's DMN discovered this insight:

Type: ${insight.type}
Title: ${insight.title}
Statistical Explanation: ${insight.explanation}
Domains Involved: ${insight.domains.join(', ')}
Importance Score: ${insight.importance}/100
Surprise Score: ${insight.surpriseScore}/100
${insight.evidence?.causalEdges ? `Causal Edges: ${JSON.stringify(insight.evidence.causalEdges)}` : ''}
${insight.evidence?.statistics ? `Statistics: ${JSON.stringify(insight.evidence.statistics)}` : ''}

Translate this into a business-actionable narrative. What does this mean for a CTO or VP?`;

    return callWithFallback<AmplifiedInsight>(
      'amplifyInsight',
      INSIGHT_SYSTEM_PROMPT,
      userMessage,
      deepModel,
      fallback
    );
  }

  // ──────────────────────────────────────────────
  // GAP 2: Anomaly Interpretation
  // ──────────────────────────────────────────────

  /**
   * Interpret a statistical anomaly in business context.
   * Uses Haiku (fast model) for high-volume anomaly processing.
   *
   * Brain Analog: Insula — interoception and error detection
   */
  async function interpretAnomaly(anomaly: {
    domain: string;
    signalType: string;
    anomalyScore: number;
    signalValue: number;
    historicalMean: number;
    historicalStd: number;
    windowSize: number;
  }): Promise<InterpretedAnomaly> {
    const fallback: InterpretedAnomaly = {
      interpretation: `Anomaly detected in ${anomaly.domain}/${anomaly.signalType}: ${anomaly.anomalyScore.toFixed(1)}σ from mean.`,
      severity: anomaly.anomalyScore > 3 ? 'high' : 'medium',
      likelyCauses: [],
      suggestedActions: [],
    };

    const deviation = ((anomaly.signalValue - anomaly.historicalMean) / anomaly.historicalStd).toFixed(2);
    const direction = anomaly.signalValue > anomaly.historicalMean ? 'above' : 'below';

    const userMessage = `Statistical anomaly detected:

Domain: ${anomaly.domain}
Signal Type: ${anomaly.signalType}
Current Value: ${anomaly.signalValue}
Historical Mean: ${anomaly.historicalMean.toFixed(2)}
Historical Std Dev: ${anomaly.historicalStd.toFixed(2)}
Deviation: ${deviation}σ ${direction} mean
Anomaly Score: ${anomaly.anomalyScore.toFixed(2)}
Analysis Window: ${anomaly.windowSize} data points

Is this a real business problem, a data artifact, or potentially an opportunity? What should the team do?`;

    return callWithFallback<InterpretedAnomaly>(
      'interpretAnomaly',
      ANOMALY_SYSTEM_PROMPT,
      userMessage,
      fastModel,
      fallback,
      512 // Shorter for anomalies
    );
  }

  // ──────────────────────────────────────────────
  // GAP 3: Prediction Verification
  // ──────────────────────────────────────────────

  /**
   * Provide nuanced prediction verification beyond direction+magnitude check.
   * Uses Haiku (fast model) for high-volume verification.
   *
   * Brain Analog: Prefrontal cortex — judgment and evaluation
   */
  async function verifyPredictionWithLLM(prediction: {
    sourceDomain: string;
    targetDomain: string;
    targetMetric: string;
    predictedDirection: string;
    predictedMagnitude: number;
    timeframeHours: number;
    confidence: number;
  }, actualOutcome: {
    direction: string;
    magnitude: number;
  }, contextSignals?: Array<{
    domain: string;
    signalType: string;
    value: number;
    timestamp: string;
  }>): Promise<LLMPredictionVerdict> {
    const fallback: LLMPredictionVerdict = {
      verdict: 'inconclusive',
      reasoning: 'LLM verification unavailable; using statistical check only.',
      confidenceAdjustment: 0,
    };

    const directionMatch = prediction.predictedDirection === actualOutcome.direction;
    const magnitudeError = Math.abs(prediction.predictedMagnitude - actualOutcome.magnitude);

    const userMessage = `Prediction verification request:

PREDICTION:
  Source Domain: ${prediction.sourceDomain} → Target: ${prediction.targetDomain}
  Predicted: ${prediction.targetMetric} would ${prediction.predictedDirection} by ${prediction.predictedMagnitude.toFixed(3)}
  Timeframe: ${prediction.timeframeHours} hours
  Confidence: ${(prediction.confidence * 100).toFixed(0)}%

ACTUAL OUTCOME:
  Direction: ${actualOutcome.direction}
  Magnitude: ${actualOutcome.magnitude.toFixed(3)}

STATISTICAL CHECK:
  Direction Match: ${directionMatch ? 'YES' : 'NO'}
  Magnitude Error: ${magnitudeError.toFixed(3)} (${(magnitudeError / Math.max(Math.abs(prediction.predictedMagnitude), 0.001) * 100).toFixed(0)}% off)

${contextSignals && contextSignals.length > 0 ? `CONTEXT (recent signals in these domains):
${contextSignals.slice(0, 10).map(s => `  ${s.domain}/${s.signalType}: ${s.value} at ${s.timestamp}`).join('\n')}` : ''}

Was this prediction correct? Consider nuance — timing, external factors, partial correctness.`;

    return callWithFallback<LLMPredictionVerdict>(
      'verifyPrediction',
      PREDICTION_SYSTEM_PROMPT,
      userMessage,
      fastModel,
      fallback,
      512
    );
  }

  // ──────────────────────────────────────────────
  // GAP 4: Causal Hypothesis Generation
  // ──────────────────────────────────────────────

  /**
   * Generate a mechanistic hypothesis for a discovered causal relationship.
   * Uses Sonnet (deep model) for deep reasoning about causality.
   *
   * Brain Analog: Hippocampus — connecting experiences to form understanding
   */
  async function generateCausalHypothesis(edge: {
    sourceDomain: string;
    targetDomain: string;
    effectSize: number;
    lagHours?: number;
    method?: string;
    naturalLanguage?: string;
  }): Promise<CausalHypothesis> {
    const fallback: CausalHypothesis = {
      mechanismHypothesis: edge.naturalLanguage || `${edge.sourceDomain} influences ${edge.targetDomain} with effect size ${edge.effectSize.toFixed(3)}.`,
      confounders: [],
      testableImplications: [],
      confidence: 0,
    };

    const userMessage = `The brain discovered a new causal relationship:

Source Domain: ${edge.sourceDomain}
Target Domain: ${edge.targetDomain}
Effect Size: ${edge.effectSize.toFixed(3)} (${edge.effectSize > 0 ? 'positive' : 'negative'} relationship)
${edge.lagHours ? `Time Lag: ${edge.lagHours} hours` : ''}
${edge.method ? `Discovery Method: ${edge.method}` : ''}
${edge.naturalLanguage ? `Statistical Description: ${edge.naturalLanguage}` : ''}

Why might changes in ${edge.sourceDomain} cause changes in ${edge.targetDomain}? What is the plausible business mechanism? What could alternatively explain this correlation? How could we test if this is truly causal?`;

    return callWithFallback<CausalHypothesis>(
      'generateCausalHypothesis',
      CAUSAL_HYPOTHESIS_SYSTEM_PROMPT,
      userMessage,
      deepModel,
      fallback
    );
  }

  // ──────────────────────────────────────────────
  // GAP 5: Consolidation Briefing
  // ──────────────────────────────────────────────

  /**
   * Generate a CTO-grade executive briefing from the nightly consolidation.
   * Uses Sonnet (deep model) for strategic analysis.
   *
   * Brain Analog: Prefrontal cortex executive function — synthesis and strategy
   */
  async function generateConsolidationBriefing(report: {
    narrative?: string;
    discoveries?: string[];
    warnings?: string[];
    stats?: Record<string, number>;
  }, consolidationStats?: {
    signalsProcessed?: number;
    edgesDiscovered?: number;
    edgesStrengthed?: number;
    edgesPruned?: number;
    edgesDecayed?: number;
    anomaliesDetected?: number;
    patternsFound?: number;
    predictionsVerified?: number;
    predictionAccuracy?: number;
    memoriesCreated?: number;
    runDurationMs?: number;
  }): Promise<ConsolidationBriefing> {
    const fallback: ConsolidationBriefing = {
      executiveSummary: report.narrative || 'Consolidation completed. No executive summary available.',
      keyFindings: report.discoveries || [],
      risks: report.warnings || [],
      strategicImplications: [],
    };

    const userMessage = `Nightly brain consolidation cycle completed. Here is the full output:

NARRATIVE:
${report.narrative || 'No narrative generated.'}

DISCOVERIES:
${report.discoveries?.map((d, i) => `${i + 1}. ${d}`).join('\n') || 'None'}

WARNINGS:
${report.warnings?.map((w, i) => `${i + 1}. ${w}`).join('\n') || 'None'}

CONSOLIDATION STATS:
${consolidationStats ? Object.entries(consolidationStats).map(([k, v]) => `  ${k}: ${v}`).join('\n') : 'Not available'}

RAW METRICS:
${report.stats ? Object.entries(report.stats).map(([k, v]) => `  ${k}: ${v}`).join('\n') : 'Not available'}

Generate a concise executive briefing for CTO-level leadership. Focus on what materially changed, what's surprising, what's risky, and what actions to consider.`;

    return callWithFallback<ConsolidationBriefing>(
      'generateConsolidationBriefing',
      CONSOLIDATION_SYSTEM_PROMPT,
      userMessage,
      deepModel,
      fallback,
      1536 // Longer for comprehensive briefings
    );
  }

  // ──────────────────────────────────────────────
  // GAP 6: Scenario Narrative (What-If Simulator)
  // ──────────────────────────────────────────────

  /**
   * Generate a rich scenario narrative from a What-If simulation result.
   * Uses Sonnet (deep model) for strategic scenario analysis.
   *
   * Brain Analog: Prefrontal cortex — planning and consequence anticipation
   */
  async function generateScenarioNarrative(scenario: {
    sourceDomain: string;
    direction: string;
    magnitudePercent: number;
    affectedDomains: string[];
    totalImpactPercent: number;
    overallConfidence: number;
    templateNarrative: string;
    interventions: Array<{ domain: string; suggestedAction: string; effectiveness: number }>;
    cascadeSteps: Array<{ fromDomain: string; toDomain: string; predictedChangePercent: number; cumulativeDays: number }>;
  }): Promise<ScenarioNarrative> {
    const fallback: ScenarioNarrative = {
      narrative: scenario.templateNarrative,
      scenarioRisks: [],
      interventionRecommendations: [],
      confidenceAssessment: `Simulation confidence: ${(scenario.overallConfidence * 100).toFixed(0)}%`,
    };

    const userMessage = `What-If simulation result:

SCENARIO: "${scenario.sourceDomain}" ${scenario.direction} by ${scenario.magnitudePercent}%

CASCADE EFFECTS:
${scenario.cascadeSteps.map(s => `  Day ${s.cumulativeDays}: ${s.fromDomain} → ${s.toDomain}: ${s.predictedChangePercent > 0 ? '+' : ''}${s.predictedChangePercent.toFixed(1)}%`).join('\n')}

SUMMARY:
  Affected Domains: ${scenario.affectedDomains.join(', ')}
  Total Impact: ${scenario.totalImpactPercent.toFixed(1)}%
  Overall Confidence: ${(scenario.overallConfidence * 100).toFixed(0)}%

TEMPLATE NARRATIVE:
${scenario.templateNarrative}

AVAILABLE INTERVENTIONS:
${scenario.interventions.map(iv => `  ${iv.domain}: ${iv.suggestedAction} (effectiveness: ${(iv.effectiveness * 100).toFixed(0)}%)`).join('\n')}

Transform this simulation into a strategic scenario brief. What are the real risks? Where should leadership intervene? How reliable is this prediction?`;

    return callWithFallback<ScenarioNarrative>(
      'generateScenarioNarrative',
      SCENARIO_NARRATIVE_SYSTEM_PROMPT,
      userMessage,
      deepModel,
      fallback,
      1024
    );
  }

  // ──────────────────────────────────────────────
  // GAP 7: Enhanced Impact Summary (Impact Scorer)
  // ──────────────────────────────────────────────

  /**
   * Generate a rich impact summary with business context.
   * Uses Haiku (fast model) for high-volume scoring.
   *
   * Brain Analog: Amygdala — emotional significance and threat assessment
   */
  async function generateEnhancedImpactSummary(event: {
    type: string;
    title: string;
    description: string;
    domains: string[];
    rawSeverity: number;
  }, score: {
    compositeScore: number;
    cascadeReach: number;
    dollarEffect: number;
    strategicAlignment: number;
    novelty: number;
    alertTier?: string;
    affectedDomains: string[];
    alignedPriorities: string[];
    templateSummary: string;
  }): Promise<EnhancedImpactSummary> {
    const fallback: EnhancedImpactSummary = {
      summary: score.templateSummary,
      businessContext: '',
      recommendedActions: [],
      severityAssessment: `Composite score: ${score.compositeScore}/100`,
    };

    const userMessage = `Business event to assess:

EVENT:
  Type: ${event.type}
  Title: ${event.title}
  Description: ${event.description}
  Domains: ${event.domains.join(', ')}
  Raw Severity: ${(event.rawSeverity * 100).toFixed(0)}%

QUANTITATIVE SCORE:
  Composite: ${score.compositeScore}/100 (${score.alertTier || 'no alert'})
  Cascade Reach: ${(score.cascadeReach * 100).toFixed(0)}% | Dollar Effect: ${(score.dollarEffect * 100).toFixed(0)}%
  Strategic Alignment: ${(score.strategicAlignment * 100).toFixed(0)}% | Novelty: ${(score.novelty * 100).toFixed(0)}%
  Affected Domains: ${score.affectedDomains.join(', ')}
  Aligned Priorities: ${score.alignedPriorities.join(', ') || 'none'}

Provide a dashboard-ready impact summary. Is this more or less important than the numbers suggest? What should leadership do?`;

    return callWithFallback<EnhancedImpactSummary>(
      'generateEnhancedImpactSummary',
      IMPACT_SUMMARY_SYSTEM_PROMPT,
      userMessage,
      fastModel,
      fallback,
      512
    );
  }

  // ──────────────────────────────────────────────
  // GAP 8: Enhanced Pattern Explanation
  // ──────────────────────────────────────────────

  /**
   * Generate rich pattern explanations from statistical discoveries.
   * Uses Haiku (fast model) for pattern processing.
   *
   * Brain Analog: Basal ganglia — habit/pattern recognition and naming
   */
  async function enhancePatternExplanation(pattern: {
    name: string;
    description: string;
    domainsInvolved: string[];
    evidence: {
      testType: string;
      pValue: number;
      effectSize: number;
      sampleSize: number;
    };
    currentNaturalLanguage: string;
  }): Promise<EnhancedPatternExplanation> {
    const fallback: EnhancedPatternExplanation = {
      name: pattern.name,
      description: pattern.description,
      naturalLanguage: pattern.currentNaturalLanguage,
      actionability: '',
      caveats: [],
    };

    const userMessage = `Pattern discovered by statistical analysis:

PATTERN:
  Current Name: ${pattern.name}
  Current Description: ${pattern.description}
  Domains: ${pattern.domainsInvolved.join(', ')}

STATISTICAL EVIDENCE:
  Test: ${pattern.evidence.testType}
  p-value: ${pattern.evidence.pValue.toFixed(6)}
  Effect Size: ${pattern.evidence.effectSize.toFixed(3)}
  Sample Size: ${pattern.evidence.sampleSize}

CURRENT EXPLANATION:
  ${pattern.currentNaturalLanguage}

Give this pattern a memorable business name, explain it clearly for stakeholders, assess its actionability, and note any caveats (sample size concerns, confounders, etc.).`;

    return callWithFallback<EnhancedPatternExplanation>(
      'enhancePatternExplanation',
      PATTERN_EXPLANATION_SYSTEM_PROMPT,
      userMessage,
      fastModel,
      fallback,
      512
    );
  }

  // ──────────────────────────────────────────────
  // Return public API
  // ──────────────────────────────────────────────

  return {
    amplifyInsight,
    interpretAnomaly,
    verifyPredictionWithLLM,
    generateCausalHypothesis,
    generateConsolidationBriefing,
    generateScenarioNarrative,
    generateEnhancedImpactSummary,
    enhancePatternExplanation,
  };
}

// ============================================================================
// CONVENIENCE TYPE EXPORTS
// ============================================================================

export type BrainAmplifier = ReturnType<typeof createBrainAmplifier>;
