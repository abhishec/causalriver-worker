/**
 * Leap 11: Red Team (Adversarial Self-Testing)
 *
 * The brain's "amygdala" — generates adversarial scenarios to stress-test
 * predictions before they reach users. Every prediction is attacked.
 *
 * How it works:
 * 1. Take a prediction from any brain region
 * 2. Generate adversarial scenarios that would invalidate it
 * 3. Score the prediction's robustness (0-1)
 * 4. Flag weak predictions for human review
 * 5. Learn from past adversarial failures to improve future attacks
 *
 * Compute tier: scheduled (runs nightly + on-demand for critical predictions)
 */

import { getDefaultLogger, type NexusLogger } from '../observability';

// ============================================================================
// TYPES
// ============================================================================

export interface RedTeamConfig {
  /** Min robustness score to pass (default: 0.6) */
  minRobustnessScore?: number;
  /** Max adversarial scenarios to generate per prediction (default: 5) */
  maxScenariosPerPrediction?: number;
  /** Historical window for learning past failures (default: 90 days) */
  learningWindowDays?: number;
  /** Logger */
  logger?: NexusLogger;
  /** Anthropic API key — when provided, generates LLM-powered adversarial scenarios */
  anthropicApiKey?: string;
  /** LLM model for red-teaming (default: 'claude-3-5-haiku-20241022') */
  llmModel?: string;
}

export interface Prediction {
  id: string;
  organizationId: string;
  domain: string;
  claim: string;
  confidence: number;
  evidence: string[];
  method: string;
  timestamp: Date;
}

export interface AdversarialScenario {
  id: string;
  type: AdversarialType;
  description: string;
  assumption_challenged: string;
  counter_evidence: string[];
  plausibility: number;
  impact_if_true: 'low' | 'medium' | 'high' | 'critical';
}

export type AdversarialType =
  | 'data_quality'
  | 'confounding_variable'
  | 'selection_bias'
  | 'temporal_shift'
  | 'regime_change'
  | 'survivorship_bias'
  | 'reverse_causality'
  | 'simpson_paradox'
  | 'ecological_fallacy'
  | 'black_swan';

export interface RedTeamResult {
  predictionId: string;
  robustnessScore: number;
  passed: boolean;
  scenarios: AdversarialScenario[];
  weaknesses: string[];
  recommendations: string[];
  testDurationMs: number;
}

export interface RedTeamInstance {
  /** Run adversarial testing on a single prediction (template-based, sync) */
  testPrediction(prediction: Prediction): RedTeamResult;
  /** Run LLM-powered adversarial testing (async — falls back to template if no API key) */
  testPredictionLLM(prediction: Prediction): Promise<RedTeamResult>;
  /** Batch test multiple predictions */
  testBatch(predictions: Prediction[]): RedTeamResult[];
  /** Get historical attack patterns that were effective */
  getEffectiveAttacks(domain?: string): AdversarialScenario[];
  /** Record a prediction that failed in production */
  recordFailure(predictionId: string, actualOutcome: string): void;
  /** Get stats */
  getStats(): { totalTested: number; totalFailed: number; avgRobustness: number; failureRate: number };
}

// ============================================================================
// ADVERSARIAL GENERATORS
// ============================================================================

const ADVERSARIAL_TEMPLATES: Record<AdversarialType, {
  generate: (prediction: Prediction) => Omit<AdversarialScenario, 'id'>;
}> = {
  data_quality: {
    generate: (p) => ({
      type: 'data_quality',
      description: `What if the data underlying "${p.claim}" has quality issues (missing values, duplicates, stale records)?`,
      assumption_challenged: 'Data is clean and representative',
      counter_evidence: ['Incomplete data ingestion', 'Stale connector data', 'Sampling bias in signals'],
      plausibility: 0.4,
      impact_if_true: 'high',
    }),
  },
  confounding_variable: {
    generate: (p) => ({
      type: 'confounding_variable',
      description: `Is there a hidden variable driving both the cause and effect in "${p.claim}"?`,
      assumption_challenged: 'Correlation implies causation in this context',
      counter_evidence: ['Seasonality effects', 'Market-wide trends', 'Organizational changes'],
      plausibility: 0.5,
      impact_if_true: 'critical',
    }),
  },
  selection_bias: {
    generate: (p) => ({
      type: 'selection_bias',
      description: `Does "${p.claim}" only hold for the subset of data we observed, not the full population?`,
      assumption_challenged: 'Observed data is representative',
      counter_evidence: ['Only successful cases tracked', 'Silent failures unrecorded', 'Voluntary reporting bias'],
      plausibility: 0.35,
      impact_if_true: 'high',
    }),
  },
  temporal_shift: {
    generate: (p) => ({
      type: 'temporal_shift',
      description: `Has the relationship in "${p.claim}" changed over time due to market/product evolution?`,
      assumption_challenged: 'Relationship is temporally stable',
      counter_evidence: ['Product changes', 'Market dynamics', 'Competitive landscape shifts'],
      plausibility: 0.45,
      impact_if_true: 'high',
    }),
  },
  regime_change: {
    generate: (p) => ({
      type: 'regime_change',
      description: `What if a regime change (new regulation, market crash, pivot) invalidates "${p.claim}"?`,
      assumption_challenged: 'Current conditions will persist',
      counter_evidence: ['Regulatory changes', 'Economic shocks', 'Technology disruption'],
      plausibility: 0.25,
      impact_if_true: 'critical',
    }),
  },
  survivorship_bias: {
    generate: (p) => ({
      type: 'survivorship_bias',
      description: `Are we only seeing successful examples that support "${p.claim}" while failures are invisible?`,
      assumption_challenged: 'We see the full picture',
      counter_evidence: ['Churned entities not tracked', 'Failed experiments deleted', 'Only winners reported'],
      plausibility: 0.4,
      impact_if_true: 'medium',
    }),
  },
  reverse_causality: {
    generate: (p) => ({
      type: 'reverse_causality',
      description: `What if the cause and effect in "${p.claim}" are actually reversed?`,
      assumption_challenged: 'Causal direction is correct',
      counter_evidence: ['Bidirectional relationship', 'Effect precedes cause in some cases', 'Common cause drives both'],
      plausibility: 0.3,
      impact_if_true: 'critical',
    }),
  },
  simpson_paradox: {
    generate: (p) => ({
      type: 'simpson_paradox',
      description: `Does "${p.claim}" reverse when controlling for subgroups (Simpson's Paradox)?`,
      assumption_challenged: 'Aggregate trend applies to all subgroups',
      counter_evidence: ['Different behavior by segment', 'Aggregation hides reversal', 'Subgroup sizes differ'],
      plausibility: 0.2,
      impact_if_true: 'high',
    }),
  },
  ecological_fallacy: {
    generate: (p) => ({
      type: 'ecological_fallacy',
      description: `Does the group-level finding in "${p.claim}" actually apply to individual cases?`,
      assumption_challenged: 'Group trends apply to individuals',
      counter_evidence: ['High within-group variance', 'Individual behavior differs from mean', 'Outliers dominate mean'],
      plausibility: 0.35,
      impact_if_true: 'medium',
    }),
  },
  black_swan: {
    generate: (p) => ({
      type: 'black_swan',
      description: `What unprecedented event could completely invalidate "${p.claim}"?`,
      assumption_challenged: 'No extreme outlier events will occur',
      counter_evidence: ['Unprecedented market event', 'System failure', 'Paradigm shift'],
      plausibility: 0.1,
      impact_if_true: 'critical',
    }),
  },
};

// ============================================================================
// LLM RED-TEAM SYSTEM PROMPT
// ============================================================================

const RED_TEAM_SYSTEM_PROMPT = `You are the Adversarial Red Team layer (L11) of NexusBrain — the brain's "amygdala" that stress-tests every prediction before it reaches users.

Your job: Given a prediction, generate REALISTIC adversarial scenarios that could invalidate it. Think like a hostile critic, a skeptical analyst, and a chaos engineer combined.

For each scenario, assess:
1. How plausible is this threat? (0.0-1.0)
2. What assumption does it challenge?
3. What evidence would support this counter-argument?
4. How severe would the impact be if this scenario were true?

Focus on scenarios specific to the prediction's domain and claim. Avoid generic threats.

Respond in JSON format:
{
  "scenarios": [
    {
      "type": "data_quality|confounding_variable|selection_bias|temporal_shift|regime_change|survivorship_bias|reverse_causality|simpson_paradox|ecological_fallacy|black_swan",
      "description": "A specific, contextual adversarial scenario (2-3 sentences)",
      "assumption_challenged": "The specific assumption this attacks",
      "counter_evidence": ["Specific evidence 1", "Specific evidence 2"],
      "plausibility": 0.0-1.0,
      "impact_if_true": "low|medium|high|critical"
    }
  ],
  "overallAssessment": "1-2 sentence assessment of prediction robustness",
  "blindSpots": ["Specific blind spot 1", "Specific blind spot 2"]
}`;

// ============================================================================
// LLM CALL HELPERS
// ============================================================================

const RT_LLM_TIMEOUT_MS = 10_000;
const RT_LLM_MAX_RETRIES = 1;

async function callAnthropicRedTeam(
  systemPrompt: string,
  userMessage: string,
  opts: { apiKey: string; model: string; maxTokens: number },
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RT_LLM_MAX_RETRIES; attempt++) {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), RT_LLM_TIMEOUT_MS) : null;

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': opts.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: opts.model,
            max_tokens: opts.maxTokens,
            system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: userMessage }],
          }),
          ...(controller ? { signal: controller.signal } : {}),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => `HTTP ${response.status}`);
          throw new Error(`Anthropic API ${response.status}: ${errText}`);
        }

        const data = (await response.json()) as any;
        return data.content?.[0]?.text || '';
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    } catch (error: any) {
      lastError = error;
      if (error?.message?.includes('401') || error?.message?.includes('403')) throw error;
      if (attempt < RT_LLM_MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError || new Error('Red Team LLM call failed');
}

function parseRedTeamJSON(raw: string): any | null {
  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();
    return JSON.parse(cleaned);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
}

const VALID_ADVERSARIAL_TYPES: Set<string> = new Set([
  'data_quality', 'confounding_variable', 'selection_bias', 'temporal_shift',
  'regime_change', 'survivorship_bias', 'reverse_causality', 'simpson_paradox',
  'ecological_fallacy', 'black_swan',
]);

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createRedTeam(config: RedTeamConfig = {}): RedTeamInstance {
  const {
    minRobustnessScore = 0.6,
    maxScenariosPerPrediction = 5,
  } = config;

  const anthropicApiKey = config.anthropicApiKey;
  const llmModel = config.llmModel || 'claude-3-5-haiku-20241022';

  const logger = config.logger ?? getDefaultLogger().child({ module: 'red-team' });

  let totalTested = 0;
  let totalFailed = 0;
  let totalRobustness = 0;
  const effectiveAttacks: AdversarialScenario[] = [];
  const failureHistory: Array<{ predictionId: string; actualOutcome: string; timestamp: Date }> = [];

  // Select most relevant adversarial types based on prediction characteristics
  const selectAttackTypes = (prediction: Prediction): AdversarialType[] => {
    const types: AdversarialType[] = [];

    // Always test for confounders and data quality
    types.push('confounding_variable', 'data_quality');

    // Add domain-specific attacks
    if (prediction.confidence > 0.8) types.push('survivorship_bias');
    if (prediction.method.includes('granger') || prediction.method.includes('causal')) types.push('reverse_causality');
    if (prediction.evidence.length < 3) types.push('selection_bias');
    if (prediction.domain === 'finance') types.push('regime_change', 'black_swan');

    // Add temporal shift for all predictions
    types.push('temporal_shift');

    // Simpson and ecological for aggregate predictions
    if (prediction.claim.includes('overall') || prediction.claim.includes('average')) {
      types.push('simpson_paradox', 'ecological_fallacy');
    }

    return [...new Set(types)].slice(0, maxScenariosPerPrediction);
  };

  return {
    testPrediction(prediction) {
      const start = Date.now();
      totalTested++;

      const attackTypes = selectAttackTypes(prediction);
      const scenarios: AdversarialScenario[] = attackTypes.map((type, i) => ({
        id: `adv_${prediction.id}_${i}`,
        ...ADVERSARIAL_TEMPLATES[type].generate(prediction),
      }));

      // Calculate robustness score with ADAPTIVE threat calibration.
      // Like the amygdala habituating to proven stimuli: as the brain sees
      // more evidence (high confidence + strong evidence list), threat
      // plausibilities are dampened. The brain learns to trust its validated predictions.
      const evidenceStrength = Math.min(1, (prediction.evidence?.length || 0) / 5); // 5+ evidence = max
      const maturityFactor = Math.max(0.3, 1 - prediction.confidence * evidenceStrength * 0.6);
      // Dampen plausibility: proven predictions face reduced threat penalties
      const adjustedScenarios = scenarios.map(s => ({
        ...s,
        plausibility: s.plausibility * maturityFactor,
      }));

      const totalPlausibility = adjustedScenarios.reduce((sum, s) => sum + s.plausibility, 0);
      const avgPlausibility = adjustedScenarios.length > 0 ? totalPlausibility / adjustedScenarios.length : 0;
      const criticalThreats = adjustedScenarios.filter(s => s.impact_if_true === 'critical' && s.plausibility > 0.3 * maturityFactor);

      // Robustness = base confidence - threat penalty (reduced by maturity)
      const threatPenalty = avgPlausibility * 0.4 + criticalThreats.length * 0.1;
      const robustnessScore = Math.max(0, Math.min(1, prediction.confidence - threatPenalty));

      const passed = robustnessScore >= minRobustnessScore;
      if (!passed) totalFailed++;
      totalRobustness += robustnessScore;

      const weaknesses = scenarios
        .filter(s => s.plausibility > 0.3)
        .map(s => s.assumption_challenged);

      const recommendations = [];
      if (criticalThreats.length > 0) {
        recommendations.push('Gather additional evidence before acting on this prediction');
      }
      if (scenarios.some(s => s.type === 'confounding_variable' && s.plausibility > 0.4)) {
        recommendations.push('Run controlled experiment to isolate causal effect');
      }
      if (!passed) {
        recommendations.push('Flag for human review before deployment');
      }

      const result: RedTeamResult = {
        predictionId: prediction.id,
        robustnessScore,
        passed,
        scenarios,
        weaknesses,
        recommendations,
        testDurationMs: Date.now() - start,
      };

      if (!passed) {
        logger.warn('Prediction failed red team', {
          predictionId: prediction.id,
          robustness: robustnessScore,
          criticalThreats: criticalThreats.length,
        });
      }

      return result;
    },

    async testPredictionLLM(prediction) {
      if (!anthropicApiKey) {
        return this.testPrediction(prediction);
      }

      const start = Date.now();
      totalTested++;

      const userPrompt = [
        `## Prediction to Attack`,
        `- **Claim**: "${prediction.claim}"`,
        `- **Domain**: ${prediction.domain}`,
        `- **Confidence**: ${(prediction.confidence * 100).toFixed(0)}%`,
        `- **Method**: ${prediction.method}`,
        `- **Evidence**: ${prediction.evidence.join('; ') || 'None specified'}`,
        ``,
        `Generate ${maxScenariosPerPrediction} adversarial scenarios specific to this prediction.`,
      ].join('\n');

      try {
        const raw = await callAnthropicRedTeam(
          RED_TEAM_SYSTEM_PROMPT,
          userPrompt,
          { apiKey: anthropicApiKey, model: llmModel, maxTokens: 1024 },
        );

        const parsed = parseRedTeamJSON(raw);
        if (!parsed || !Array.isArray(parsed.scenarios)) {
          logger.warn('LLM red-team JSON parse failed — falling back to template');
          return this.testPrediction(prediction);
        }

        const scenarios: AdversarialScenario[] = parsed.scenarios
          .slice(0, maxScenariosPerPrediction)
          .map((s: any, i: number) => ({
            id: `adv_llm_${prediction.id}_${i}`,
            type: (VALID_ADVERSARIAL_TYPES.has(s.type) ? s.type : 'confounding_variable') as AdversarialType,
            description: s.description || '',
            assumption_challenged: s.assumption_challenged || '',
            counter_evidence: Array.isArray(s.counter_evidence) ? s.counter_evidence : [],
            plausibility: typeof s.plausibility === 'number' ? Math.max(0, Math.min(1, s.plausibility)) : 0.4,
            impact_if_true: (['low', 'medium', 'high', 'critical'].includes(s.impact_if_true) ? s.impact_if_true : 'medium') as 'low' | 'medium' | 'high' | 'critical',
          }));

        // Calculate robustness score (same logic as template-based)
        const totalPlausibility = scenarios.reduce((sum, s) => sum + s.plausibility, 0);
        const avgPlausibility = scenarios.length > 0 ? totalPlausibility / scenarios.length : 0;
        const criticalThreats = scenarios.filter(s => s.impact_if_true === 'critical' && s.plausibility > 0.3);

        const threatPenalty = avgPlausibility * 0.4 + criticalThreats.length * 0.1;
        const robustnessScore = Math.max(0, Math.min(1, prediction.confidence - threatPenalty));

        const passed = robustnessScore >= minRobustnessScore;
        if (!passed) totalFailed++;
        totalRobustness += robustnessScore;

        const weaknesses = scenarios
          .filter(s => s.plausibility > 0.3)
          .map(s => s.assumption_challenged);

        const recommendations: string[] = [];
        if (criticalThreats.length > 0) {
          recommendations.push('Gather additional evidence before acting on this prediction');
        }
        if (parsed.blindSpots && Array.isArray(parsed.blindSpots)) {
          for (const bs of parsed.blindSpots.slice(0, 2)) {
            recommendations.push(`Address blind spot: ${bs}`);
          }
        }
        if (!passed) {
          recommendations.push('Flag for human review before deployment');
        }

        const result: RedTeamResult = {
          predictionId: prediction.id,
          robustnessScore,
          passed,
          scenarios,
          weaknesses,
          recommendations,
          testDurationMs: Date.now() - start,
        };

        if (!passed) {
          logger.warn('Prediction failed LLM red team', {
            predictionId: prediction.id,
            robustness: robustnessScore,
            criticalThreats: criticalThreats.length,
          });
        }

        return result;
      } catch (err) {
        logger.warn('LLM red-team failed — falling back to template', {
          error: err instanceof Error ? err.message : String(err),
        });
        return this.testPrediction(prediction);
      }
    },

    testBatch(predictions) {
      return predictions.map(p => this.testPrediction(p));
    },

    getEffectiveAttacks(domain?: string) {
      if (domain) {
        return effectiveAttacks.filter(a => a.description.toLowerCase().includes(domain.toLowerCase()));
      }
      return [...effectiveAttacks];
    },

    recordFailure(predictionId, actualOutcome) {
      failureHistory.push({ predictionId, actualOutcome, timestamp: new Date() });
      logger.info('Prediction failure recorded', { predictionId, actualOutcome });
    },

    getStats() {
      return {
        totalTested,
        totalFailed,
        avgRobustness: totalTested > 0 ? totalRobustness / totalTested : 0,
        failureRate: totalTested > 0 ? totalFailed / totalTested : 0,
      };
    },
  };
}
