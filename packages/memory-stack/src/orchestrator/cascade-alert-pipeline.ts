/**
 * Cascade Alert Pipeline
 *
 * Subscribes to cascade_trigger events.
 * Uses the causal graph to predict propagation paths.
 * Generates alerts with recommended interventions.
 */

import type { CausalEvent } from '../causality/event-bus';
import type { CachedRelationship } from '../bridges/patterns-to-agents';

type EventBusInstance = {
  emit: (event: any) => boolean;
  subscribe: (options: {
    filter: any;
    handler: (events: CausalEvent[]) => Promise<void>;
  }) => string;
};

type ContextEnricherInstance = {
  getContextForAgent: (
    orgId: string,
    domain?: string
  ) => {
    causalRelationships: CachedRelationship[];
    patterns: any[];
  };
};

export interface CascadeAlertPayload {
  alertId: string;
  organizationId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  triggerDomain: string;
  triggerSignalType: string;
  anomalyScore: number;
  predictedPath: string[];
  expectedImpacts: Array<{
    domain: string;
    expectedLagDays: number;
    effectSize: number;
  }>;
  recommendedInterventions: Array<{
    action: string;
    domain: string;
    timeWindowDays: number;
    estimatedEffectiveness: number;
  }>;
  createdAt: Date;
}

export interface CascadeAlertConfig {
  /** Minimum severity score to generate alert (default: 30) */
  minSeverity: number;
  /** Alert callback */
  onAlert?: (alert: CascadeAlertPayload) => Promise<void>;
}

const DEFAULT_CONFIG: CascadeAlertConfig = {
  minSeverity: 30,
};

/**
 * Create a cascade alert pipeline
 */
export function createCascadeAlertPipeline(
  eventBus: EventBusInstance,
  contextEnricher: ContextEnricherInstance,
  config: Partial<CascadeAlertConfig> = {}
) {
  const { minSeverity = 30, onAlert } = { ...DEFAULT_CONFIG, ...config };

  let totalAlertsGenerated = 0;

  const subscriptionId = eventBus.subscribe({
    filter: { eventTypes: ['cascade_trigger'] as any },
    handler: async (events: CausalEvent[]) => {
      for (const event of events) {
        const orgId = event.organizationId;
        const triggerDomain = event.domain;
        const anomalyScore = (event.payload.anomaly_score as number) || 0;

        // Get causal relationships for this domain
        const { causalRelationships } = contextEnricher.getContextForAgent(
          orgId,
          triggerDomain
        );

        if (causalRelationships.length === 0) continue;

        // Predict cascade path by following causal edges
        const predictedPath = predictPath(triggerDomain, causalRelationships);
        if (predictedPath.length <= 1) continue;

        // Calculate severity
        const severityScore = Math.min(
          100,
          anomalyScore * 20 + predictedPath.length * 10
        );
        if (severityScore < minSeverity) continue;

        // Build expected impacts
        const expectedImpacts = causalRelationships
          .filter((r) => r.sourceDomain === triggerDomain)
          .map((r) => ({
            domain: r.targetDomain,
            expectedLagDays: r.lagDays,
            effectSize: r.effectSize,
          }));

        // Build intervention recommendations
        const recommendedInterventions = expectedImpacts.map((impact) => ({
          action: `Proactive outreach to ${impact.domain} team regarding ${triggerDomain} cascade`,
          domain: impact.domain,
          timeWindowDays: Math.max(1, Math.floor(impact.expectedLagDays * 0.5)),
          estimatedEffectiveness: Math.min(0.9, impact.effectSize * 2),
        }));

        const severity: CascadeAlertPayload['severity'] =
          severityScore > 70
            ? 'critical'
            : severityScore > 50
              ? 'high'
              : severityScore > 30
                ? 'medium'
                : 'low';

        const alert: CascadeAlertPayload = {
          alertId: `alert_${Date.now()}_${totalAlertsGenerated}`,
          organizationId: orgId,
          severity,
          triggerDomain,
          triggerSignalType:
            (event.payload.signal_type as string) || 'unknown',
          anomalyScore,
          predictedPath,
          expectedImpacts,
          recommendedInterventions,
          createdAt: new Date(),
        };

        totalAlertsGenerated++;

        if (onAlert) {
          await onAlert(alert);
        }
      }
    },
  });

  return {
    subscriptionId,
    getStats() {
      return { totalAlertsGenerated };
    },
  };
}

/**
 * Predict cascade path by following causal edges (BFS, strongest edge)
 */
function predictPath(
  startDomain: string,
  relationships: CachedRelationship[],
  maxDepth: number = 5
): string[] {
  const path: string[] = [startDomain];
  const visited = new Set<string>([startDomain]);
  let current = startDomain;

  for (let depth = 0; depth < maxDepth; depth++) {
    const outgoing = relationships
      .filter(
        (r) => r.sourceDomain === current && !visited.has(r.targetDomain)
      )
      .sort((a, b) => b.effectSize - a.effectSize);

    if (outgoing.length === 0) break;

    current = outgoing[0].targetDomain;
    visited.add(current);
    path.push(current);
  }

  return path;
}
