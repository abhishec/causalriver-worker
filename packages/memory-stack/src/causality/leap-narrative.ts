/**
 * Leap 15: Narrative Intelligence
 *
 * The brain's "Broca + Wernicke" — generates executive narratives from
 * causal insights. The "story" of what happened, why, and what to do.
 *
 * How it works:
 * 1. Collect recent causal edges, predictions, anomalies, and interventions
 * 2. Identify the narrative arc (what changed, why it matters)
 * 3. Generate structured narrative with evidence
 * 4. Adapt language for audience (exec, analyst, engineer)
 * 5. Include actionable recommendations
 *
 * Compute tier: interactive (<5s)
 */

import { getDefaultLogger, type NexusLogger } from '../observability';

// ============================================================================
// TYPES
// ============================================================================

export interface NarrativeConfig {
  /** Default audience (default: 'executive') */
  defaultAudience?: NarrativeAudience;
  /** Max narrative length in words (default: 500) */
  maxLengthWords?: number;
  /** Include evidence citations (default: true) */
  includeCitations?: boolean;
  /** Logger */
  logger?: NexusLogger;
  /** Anthropic API key — when provided, narratives are LLM-generated instead of template-based */
  anthropicApiKey?: string;
  /** LLM model (default: 'claude-3-5-haiku-20241022') — Haiku for cost efficiency */
  llmModel?: string;
  /** Max tokens for LLM response (default: 1024) */
  llmMaxTokens?: number;
}

export type NarrativeAudience = 'executive' | 'analyst' | 'engineer' | 'all';

export interface NarrativeInput {
  organizationId: string;
  timeRangeHours: number;
  audience?: NarrativeAudience;
  focusDomain?: string;
  edges: NarrativeEdge[];
  predictions: NarrativePrediction[];
  anomalies: NarrativeAnomaly[];
  interventions: NarrativeIntervention[];
  metrics: NarrativeMetric[];
}

export interface NarrativeEdge {
  source: string;
  target: string;
  weight: number;
  confidence: number;
  isNew: boolean;
  strengthChange: number;
}

export interface NarrativePrediction {
  id: string;
  claim: string;
  confidence: number;
  domain: string;
  verified?: boolean;
  accurate?: boolean;
}

export interface NarrativeAnomaly {
  id: string;
  metric: string;
  domain: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  value: number;
  expectedValue: number;
}

export interface NarrativeIntervention {
  id: string;
  type: string;
  target: string;
  outcome: 'pending' | 'successful' | 'failed' | 'partial';
  description: string;
}

export interface NarrativeMetric {
  name: string;
  domain: string;
  currentValue: number;
  previousValue: number;
  trend: 'up' | 'down' | 'stable';
  change: number;
  changePercent: number;
}

export interface Narrative {
  id: string;
  title: string;
  summary: string;
  sections: NarrativeSection[];
  keyInsights: string[];
  recommendations: NarrativeRecommendation[];
  evidence: NarrativeEvidence[];
  audience: NarrativeAudience;
  generatedAt: Date;
  confidence: number;
  wordCount: number;
}

export interface NarrativeSection {
  heading: string;
  body: string;
  importance: number;
  domain?: string;
}

export interface NarrativeRecommendation {
  action: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  expectedImpact: string;
  basedOn: string;
}

export interface NarrativeEvidence {
  claim: string;
  support: string;
  confidence: number;
  source: string;
}

export interface NarrativeIntelligenceInstance {
  /** Generate a narrative from brain data (sync template fallback) */
  generate(input: NarrativeInput): Narrative;
  /** Generate an LLM-powered narrative (async — falls back to template if no API key) */
  generateLLM(input: NarrativeInput): Promise<Narrative>;
  /** Generate a specific type of narrative */
  generateDailyBriefing(input: NarrativeInput): Narrative;
  generateIncidentReport(anomaly: NarrativeAnomaly, input: NarrativeInput): Narrative;
  generateTrendAnalysis(metrics: NarrativeMetric[], input: NarrativeInput): Narrative;
  /** Adapt narrative for different audience */
  adaptForAudience(narrative: Narrative, audience: NarrativeAudience): Narrative;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(1)}%`;
}

function formatChange(metric: NarrativeMetric): string {
  const direction = metric.trend === 'up' ? 'increased' : metric.trend === 'down' ? 'decreased' : 'remained stable';
  return `${metric.name} ${direction} by ${formatPercent(metric.changePercent / 100)} (${metric.previousValue.toFixed(1)} → ${metric.currentValue.toFixed(1)})`;
}

function severityEmoji(severity: string): string {
  switch (severity) {
    case 'critical': return '[CRITICAL]';
    case 'high': return '[HIGH]';
    case 'medium': return '[MEDIUM]';
    default: return '[LOW]';
  }
}

// ============================================================================
// LLM NARRATIVE SYSTEM PROMPT
// ============================================================================

const NARRATIVE_SYSTEM_PROMPT = `You are the Narrative Intelligence layer (L15) of NexusBrain — the brain's "Broca + Wernicke" regions responsible for transforming raw analytical output into compelling, actionable executive narratives.

You receive structured data about an organization's brain cycle: causal edges, predictions, anomalies, metrics, and interventions. Your job is to weave these into a coherent story.

Rules:
- Write for the specified audience (executive = strategic/concise, analyst = data-rich, engineer = technical/specific)
- Lead with what matters most (crisis > setback > progress > discovery > stability)
- Every recommendation must be grounded in evidence from the input data
- Cite specific metrics, edges, or predictions when making claims
- Never fabricate data — only reference what's in the input
- Keep the narrative under the specified word limit

Respond in JSON format:
{
  "title": "A compelling 5-12 word headline",
  "summary": "2-3 sentence executive summary of the entire situation",
  "sections": [
    {
      "heading": "Section heading",
      "body": "Section content (2-4 sentences)",
      "importance": 0.0-1.0,
      "domain": "optional domain name"
    }
  ],
  "keyInsights": ["Insight 1", "Insight 2", "Insight 3"],
  "recommendations": [
    {
      "action": "Specific action to take",
      "priority": "critical|high|medium|low",
      "expectedImpact": "What this action will achieve",
      "basedOn": "The evidence supporting this recommendation"
    }
  ],
  "evidence": [
    {
      "claim": "A claim made in the narrative",
      "support": "The data supporting it",
      "confidence": 0.0-1.0,
      "source": "Where the evidence comes from"
    }
  ]
}`;

// ============================================================================
// LLM CALL HELPERS
// ============================================================================

const LLM_TIMEOUT_MS = 15_000;
const LLM_MAX_RETRIES = 2;

async function callAnthropicNarrative(
  systemPrompt: string,
  userMessage: string,
  opts: { apiKey: string; model: string; maxTokens: number },
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), LLM_TIMEOUT_MS) : null;

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
      // Don't retry auth errors
      if (error?.message?.includes('401') || error?.message?.includes('403')) throw error;
      if (attempt < LLM_MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError || new Error('Narrative LLM call failed');
}

function parseNarrativeJSON(raw: string): any | null {
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

function buildNarrativeUserPrompt(input: NarrativeInput, audience: NarrativeAudience, maxWords: number): string {
  const parts: string[] = [];
  parts.push(`Organization: ${input.organizationId}`);
  parts.push(`Time Range: last ${input.timeRangeHours} hours`);
  parts.push(`Audience: ${audience}`);
  parts.push(`Max Length: ${maxWords} words`);
  if (input.focusDomain) parts.push(`Focus Domain: ${input.focusDomain}`);

  if (input.metrics.length > 0) {
    parts.push(`\n## Metrics (${input.metrics.length}):`);
    for (const m of input.metrics.slice(0, 10)) {
      parts.push(`- ${m.name} [${m.domain}]: ${m.previousValue.toFixed(1)} → ${m.currentValue.toFixed(1)} (${m.trend}, ${m.changePercent >= 0 ? '+' : ''}${m.changePercent.toFixed(1)}%)`);
    }
  }

  if (input.anomalies.length > 0) {
    parts.push(`\n## Anomalies (${input.anomalies.length}):`);
    for (const a of input.anomalies.slice(0, 5)) {
      parts.push(`- [${a.severity.toUpperCase()}] ${a.description}: ${a.metric} at ${a.value.toFixed(2)} (expected ${a.expectedValue.toFixed(2)})`);
    }
  }

  if (input.edges.length > 0) {
    const newEdges = input.edges.filter(e => e.isNew);
    const changed = input.edges.filter(e => Math.abs(e.strengthChange) > 0.1);
    parts.push(`\n## Causal Edges (${input.edges.length} total, ${newEdges.length} new, ${changed.length} changed):`);
    for (const e of [...newEdges, ...changed].slice(0, 8)) {
      parts.push(`- ${e.source} → ${e.target} (weight: ${e.weight.toFixed(2)}, confidence: ${(e.confidence * 100).toFixed(0)}%${e.isNew ? ', NEW' : ''}${Math.abs(e.strengthChange) > 0.1 ? `, change: ${e.strengthChange > 0 ? '+' : ''}${e.strengthChange.toFixed(2)}` : ''})`);
    }
  }

  if (input.predictions.length > 0) {
    parts.push(`\n## Predictions (${input.predictions.length}):`);
    for (const p of input.predictions.slice(0, 5)) {
      parts.push(`- [${p.domain}] "${p.claim}" (confidence: ${(p.confidence * 100).toFixed(0)}%${p.verified ? `, verified: ${p.accurate ? 'accurate' : 'inaccurate'}` : ''})`);
    }
  }

  if (input.interventions.length > 0) {
    parts.push(`\n## Interventions (${input.interventions.length}):`);
    for (const i of input.interventions.slice(0, 5)) {
      parts.push(`- [${i.outcome.toUpperCase()}] ${i.description}`);
    }
  }

  return parts.join('\n');
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createNarrativeIntelligence(config: NarrativeConfig = {}): NarrativeIntelligenceInstance {
  const {
    defaultAudience = 'executive',
    maxLengthWords = 500,
    includeCitations = true,
  } = config;

  const anthropicApiKey = config.anthropicApiKey;
  const llmModel = config.llmModel || 'claude-3-5-haiku-20241022';
  const llmMaxTokens = config.llmMaxTokens || 1024;

  const logger = config.logger ?? getDefaultLogger().child({ module: 'narrative' });

  const generateId = () => `narr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  // Identify the dominant narrative arc
  const identifyArc = (input: NarrativeInput): { type: string; headline: string; tone: string } => {
    const criticalAnomalies = input.anomalies.filter(a => a.severity === 'critical' || a.severity === 'high');
    const significantChanges = input.metrics.filter(m => Math.abs(m.changePercent) > 10);
    const newEdges = input.edges.filter(e => e.isNew);
    const failedInterventions = input.interventions.filter(i => i.outcome === 'failed');

    if (criticalAnomalies.length > 0) {
      return {
        type: 'crisis',
        headline: `${criticalAnomalies.length} critical anomal${criticalAnomalies.length > 1 ? 'ies' : 'y'} detected requiring attention`,
        tone: 'urgent',
      };
    }

    if (failedInterventions.length > 0) {
      return {
        type: 'setback',
        headline: `${failedInterventions.length} intervention${failedInterventions.length > 1 ? 's' : ''} did not achieve expected outcomes`,
        tone: 'analytical',
      };
    }

    const positiveChanges = significantChanges.filter(m => m.trend === 'up' && m.changePercent > 0);
    const negativeChanges = significantChanges.filter(m => m.trend === 'down' && m.changePercent < 0);

    if (positiveChanges.length > negativeChanges.length) {
      return {
        type: 'progress',
        headline: `Positive momentum: ${positiveChanges.length} metric${positiveChanges.length > 1 ? 's' : ''} improving`,
        tone: 'optimistic',
      };
    }

    if (newEdges.length > 0) {
      return {
        type: 'discovery',
        headline: `${newEdges.length} new causal relationship${newEdges.length > 1 ? 's' : ''} discovered`,
        tone: 'informative',
      };
    }

    return {
      type: 'stable',
      headline: 'Operations stable — no significant changes detected',
      tone: 'neutral',
    };
  };

  return {
    generate(input) {
      const audience = input.audience ?? defaultAudience;
      const arc = identifyArc(input);
      const sections: NarrativeSection[] = [];
      const keyInsights: string[] = [];
      const recommendations: NarrativeRecommendation[] = [];
      const evidence: NarrativeEvidence[] = [];

      // Section 1: What happened
      const significantMetrics = input.metrics
        .filter(m => Math.abs(m.changePercent) > 5)
        .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

      if (significantMetrics.length > 0) {
        const body = significantMetrics
          .slice(0, 5)
          .map(formatChange)
          .join('. ') + '.';

        sections.push({
          heading: 'Key Metric Changes',
          body,
          importance: 0.9,
        });

        if (significantMetrics[0]) {
          keyInsights.push(
            `Most significant change: ${formatChange(significantMetrics[0])}`
          );
        }
      }

      // Section 2: Anomalies
      if (input.anomalies.length > 0) {
        const sorted = input.anomalies.sort((a, b) =>
          ['critical', 'high', 'medium', 'low'].indexOf(a.severity) -
          ['critical', 'high', 'medium', 'low'].indexOf(b.severity)
        );

        const body = sorted
          .slice(0, 5)
          .map(a => `${severityEmoji(a.severity)} ${a.description}: ${a.metric} at ${a.value.toFixed(2)} (expected ${a.expectedValue.toFixed(2)})`)
          .join('. ') + '.';

        sections.push({
          heading: 'Anomalies Detected',
          body,
          importance: 1.0,
        });

        for (const a of sorted.filter(a => a.severity === 'critical')) {
          recommendations.push({
            action: `Investigate ${a.metric} anomaly in ${a.domain}`,
            priority: 'critical',
            expectedImpact: 'Prevent potential cascade effects',
            basedOn: `Anomaly: ${a.description}`,
          });
        }
      }

      // Section 3: Causal discoveries
      const newEdges = input.edges.filter(e => e.isNew);
      const strengthened = input.edges.filter(e => e.strengthChange > 0.1);
      const weakened = input.edges.filter(e => e.strengthChange < -0.1);

      if (newEdges.length > 0 || strengthened.length > 0) {
        let body = '';
        if (newEdges.length > 0) {
          body += `Discovered ${newEdges.length} new causal relationship${newEdges.length > 1 ? 's' : ''}: `;
          body += newEdges.slice(0, 3)
            .map(e => `${e.source} → ${e.target} (confidence: ${(e.confidence * 100).toFixed(0)}%)`)
            .join(', ');
          body += '. ';
        }
        if (strengthened.length > 0) {
          body += `${strengthened.length} relationship${strengthened.length > 1 ? 's' : ''} strengthened. `;
        }
        if (weakened.length > 0) {
          body += `${weakened.length} relationship${weakened.length > 1 ? 's' : ''} weakened — may indicate regime change.`;
        }

        sections.push({
          heading: 'Causal Intelligence Updates',
          body,
          importance: 0.7,
        });

        if (newEdges.length > 0) {
          keyInsights.push(
            `New causal insight: ${newEdges[0].source} drives ${newEdges[0].target} (${(newEdges[0].confidence * 100).toFixed(0)}% confidence)`
          );
        }
      }

      // Section 4: Predictions status
      const verified = input.predictions.filter(p => p.verified);
      const accurate = verified.filter(p => p.accurate);
      const accuracy = verified.length > 0 ? accurate.length / verified.length : 0;

      if (verified.length > 0) {
        sections.push({
          heading: 'Prediction Accuracy',
          body: `${verified.length} predictions verified this period with ${(accuracy * 100).toFixed(0)}% accuracy. ${
            accuracy > 0.7 ? 'Brain calibration is strong.' : accuracy > 0.5 ? 'Brain calibration needs improvement.' : 'Calibration below target — review needed.'
          }`,
          importance: 0.6,
        });

        if (accuracy < 0.5) {
          recommendations.push({
            action: 'Review and recalibrate prediction models',
            priority: 'high',
            expectedImpact: 'Improve forecast reliability',
            basedOn: `Prediction accuracy at ${(accuracy * 100).toFixed(0)}%`,
          });
        }
      }

      // Section 5: Interventions
      const successful = input.interventions.filter(i => i.outcome === 'successful');
      const failed = input.interventions.filter(i => i.outcome === 'failed');

      if (input.interventions.length > 0) {
        sections.push({
          heading: 'Intervention Outcomes',
          body: `${input.interventions.length} interventions tracked: ${successful.length} successful, ${failed.length} failed, ${input.interventions.filter(i => i.outcome === 'pending').length} pending.${
            failed.length > 0 ? ` Failed: ${failed.map(f => f.description).join(', ')}.` : ''
          }`,
          importance: 0.8,
        });
      }

      // Generate evidence
      if (includeCitations) {
        for (const edge of newEdges.slice(0, 3)) {
          evidence.push({
            claim: `${edge.source} causally affects ${edge.target}`,
            support: `Causal discovery method detected relationship with ${(edge.confidence * 100).toFixed(0)}% confidence, weight ${edge.weight.toFixed(2)}`,
            confidence: edge.confidence,
            source: 'Causal Discovery Engine',
          });
        }
      }

      // Build summary
      const summary = `${arc.headline}. ${
        keyInsights.slice(0, 2).join('. ')
      }.${recommendations.length > 0 ? ` ${recommendations.length} recommended action${recommendations.length > 1 ? 's' : ''} identified.` : ''}`;

      const narrative: Narrative = {
        id: generateId(),
        title: arc.headline,
        summary,
        sections: sections.sort((a, b) => b.importance - a.importance),
        keyInsights,
        recommendations: recommendations.sort((a, b) =>
          ['critical', 'high', 'medium', 'low'].indexOf(a.priority) -
          ['critical', 'high', 'medium', 'low'].indexOf(b.priority)
        ),
        evidence,
        audience,
        generatedAt: new Date(),
        confidence: sections.length > 0 ? 0.8 : 0.5,
        wordCount: summary.split(' ').length + sections.reduce((sum, s) => sum + s.body.split(' ').length, 0),
      };

      logger.info('Narrative generated', {
        id: narrative.id,
        arc: arc.type,
        sections: sections.length,
        insights: keyInsights.length,
        recommendations: recommendations.length,
      });

      return narrative;
    },

    async generateLLM(input) {
      // If no API key, fall back to template-based generation
      if (!anthropicApiKey) {
        return this.generate(input);
      }

      const audience = input.audience ?? defaultAudience;
      const userPrompt = buildNarrativeUserPrompt(input, audience, maxLengthWords);

      try {
        const raw = await callAnthropicNarrative(
          NARRATIVE_SYSTEM_PROMPT,
          userPrompt,
          { apiKey: anthropicApiKey, model: llmModel, maxTokens: llmMaxTokens },
        );

        const parsed = parseNarrativeJSON(raw);
        if (!parsed) {
          logger.warn('LLM narrative JSON parse failed — falling back to template');
          return this.generate(input);
        }

        const narrative: Narrative = {
          id: generateId(),
          title: parsed.title || 'Brain Narrative',
          summary: parsed.summary || '',
          sections: (parsed.sections || []).map((s: any) => ({
            heading: s.heading || '',
            body: s.body || '',
            importance: typeof s.importance === 'number' ? s.importance : 0.5,
            domain: s.domain,
          })),
          keyInsights: parsed.keyInsights || [],
          recommendations: (parsed.recommendations || []).map((r: any) => ({
            action: r.action || '',
            priority: (['critical', 'high', 'medium', 'low'].includes(r.priority) ? r.priority : 'medium') as 'critical' | 'high' | 'medium' | 'low',
            expectedImpact: r.expectedImpact || '',
            basedOn: r.basedOn || '',
          })),
          evidence: (parsed.evidence || []).map((e: any) => ({
            claim: e.claim || '',
            support: e.support || '',
            confidence: typeof e.confidence === 'number' ? e.confidence : 0.5,
            source: e.source || 'LLM Narrative',
          })),
          audience,
          generatedAt: new Date(),
          confidence: 0.85, // LLM narratives get higher base confidence
          wordCount: (parsed.summary || '').split(' ').length +
            (parsed.sections || []).reduce((sum: number, s: any) => sum + (s.body || '').split(' ').length, 0),
        };

        logger.info('LLM narrative generated', {
          id: narrative.id,
          model: llmModel,
          sections: narrative.sections.length,
          insights: narrative.keyInsights.length,
          recommendations: narrative.recommendations.length,
        });

        return narrative;
      } catch (err) {
        logger.warn('LLM narrative failed — falling back to template', {
          error: err instanceof Error ? err.message : String(err),
        });
        return this.generate(input);
      }
    },

    generateDailyBriefing(input) {
      return this.generate({ ...input, audience: 'executive' });
    },

    generateIncidentReport(anomaly, input) {
      const focusedInput = {
        ...input,
        anomalies: [anomaly],
        metrics: input.metrics.filter(m => m.domain === anomaly.domain),
        edges: input.edges.filter(e => e.source.includes(anomaly.domain) || e.target.includes(anomaly.domain)),
        audience: 'analyst' as NarrativeAudience,
      };
      return this.generate(focusedInput);
    },

    generateTrendAnalysis(metrics, input) {
      return this.generate({
        ...input,
        metrics,
        audience: 'analyst' as NarrativeAudience,
      });
    },

    adaptForAudience(narrative, audience) {
      if (audience === narrative.audience) return narrative;

      const adapted = { ...narrative, audience };

      if (audience === 'executive') {
        // Shorten, focus on actions
        adapted.sections = narrative.sections
          .filter(s => s.importance > 0.6)
          .map(s => ({ ...s, body: s.body.split('.').slice(0, 2).join('.') + '.' }));
      } else if (audience === 'engineer') {
        // Add technical detail
        adapted.sections = narrative.sections.map(s => ({
          ...s,
          body: s.body + (narrative.evidence.length > 0
            ? ` [Evidence: ${narrative.evidence.filter(e => s.body.includes(e.claim.split(' ')[0])).map(e => e.support).join('; ')}]`
            : ''),
        }));
      }

      adapted.wordCount = adapted.summary.split(' ').length +
        adapted.sections.reduce((sum, s) => sum + s.body.split(' ').length, 0);

      return adapted;
    },
  };
}
