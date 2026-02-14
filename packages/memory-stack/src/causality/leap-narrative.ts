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
  /** Generate a narrative from brain data */
  generate(input: NarrativeInput): Narrative;
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
// IMPLEMENTATION
// ============================================================================

export function createNarrativeIntelligence(config: NarrativeConfig = {}): NarrativeIntelligenceInstance {
  const {
    defaultAudience = 'executive',
    maxLengthWords = 500,
    includeCitations = true,
  } = config;

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
