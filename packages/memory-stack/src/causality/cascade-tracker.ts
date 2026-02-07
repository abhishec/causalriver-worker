/**
 * Nexus Memory Stack - Cascade Tracker
 *
 * L4: Causal Graph Engine - Real-Time Cascade Monitoring
 *
 * Tracks propagation of causal effects through the organizational graph.
 * When a trigger event occurs in one domain, this module:
 * 1. Identifies matching causal chains
 * 2. Predicts downstream impacts
 * 3. Monitors actual propagation
 * 4. Generates intervention alerts
 *
 * Key insight: A finance signal today predicts CS issues in 14 days,
 * which predicts AM churn risk in 28 days. This module tracks the cascade.
 */

import { type CausalEvent } from './event-bus';
import { type CausalChain } from './sequence-miner';
import { type CausalDAG } from './continuous-learner';

// ============================================================================
// TYPES
// ============================================================================

export interface ActiveCascade {
  /** Unique cascade identifier */
  id: string;
  /** Organization this cascade belongs to */
  organizationId: string;
  /** The event that triggered this cascade */
  triggerEvent: CausalEvent;
  /** Domain where cascade started */
  triggerDomain: string;
  /** Entity affected by cascade */
  entityId: string;
  entityType: string;
  /** Current stage (0 = trigger, 1 = first propagation, etc.) */
  currentStage: number;
  /** Expected propagation path based on matched chain */
  expectedPath: string[];
  /** Actually observed domains so far */
  actualPath: string[];
  /** Chain this cascade is following */
  matchedChainId?: string;
  /** Predicted cascade completion time */
  predictedEndTime: Date;
  /** Current probability of full cascade completion */
  probability: number;
  /** Estimated impact if cascade completes */
  estimatedImpact: CascadeImpact;
  /** Windows for intervention */
  interventionOpportunities: InterventionOpportunity[];
  /** Cascade status */
  status: 'active' | 'completed' | 'interrupted' | 'expired' | 'stalled';
  /** When cascade was first detected */
  createdAt: Date;
  /** Last update time */
  updatedAt: Date;
  /** Interventions attempted on this cascade */
  interventions: CascadeIntervention[];
}

export interface CascadeImpact {
  /** Affected domains and predicted changes */
  domainImpacts: Array<{
    domain: string;
    metric: string;
    predictedChange: number;
    confidenceInterval: { lower: number; upper: number };
    expectedTimeframeDays: number;
  }>;
  /** Total ARR at risk (if applicable) */
  arrAtRisk?: number;
  /** Number of clients potentially affected */
  clientsAffected?: number;
  /** Severity score (0-100) */
  severityScore: number;
}

export interface InterventionOpportunity {
  /** Domain where intervention is possible */
  domain: string;
  /** Hours remaining to intervene effectively */
  timeWindowHours: number;
  /** Effectiveness if intervention taken (0-1) */
  effectiveness: number;
  /** Recommended action */
  recommendedAction: string;
  /** Priority (1 = highest) */
  priority: number;
  /** Whether window has passed */
  isExpired: boolean;
}

export interface CascadeIntervention {
  /** Intervention identifier */
  interventionId: string;
  /** Domain where intervention occurred */
  domain: string;
  /** When intervention was recorded */
  recordedAt: Date;
  /** Type of intervention */
  interventionType: string;
  /** Whether cascade stopped after intervention */
  stoppedCascade: boolean;
}

export interface CascadeAlert {
  /** Cascade this alert is for */
  cascadeId: string;
  /** Alert severity */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Human-readable message */
  message: string;
  /** Expected impacts */
  expectedImpacts: CascadeImpact['domainImpacts'];
  /** Recommended interventions */
  recommendedInterventions: Array<{
    action: string;
    domain: string;
    priority: number;
    timeRemaining: string;
    effectiveness: number;
  }>;
  /** Alert timestamp */
  createdAt: Date;
}

export interface CascadeTrackerConfig {
  /** Maximum cascade duration in days before marking expired */
  maxCascadeDurationDays: number;
  /** Minimum probability to continue tracking */
  minTrackingProbability: number;
  /** Hours without activity before marking stalled */
  stallThresholdHours: number;
  /** Minimum impact score to generate alerts */
  alertThresholdSeverity: number;
}

export interface StageTransition {
  /** Cascade being updated */
  cascadeId: string;
  /** Previous stage */
  fromStage: number;
  /** New stage */
  toStage: number;
  /** Domain transitioned to */
  newDomain: string;
  /** Whether this was predicted */
  wasPredicted: boolean;
  /** Event that caused transition */
  causingEvent: CausalEvent;
  /** Updated probability */
  newProbability: number;
}

// ============================================================================
// CASCADE TRACKER FACTORY
// ============================================================================

/**
 * Create a cascade tracker for monitoring causal propagation
 *
 * @example
 * ```typescript
 * const tracker = createCascadeTracker(dag, chains, {
 *   maxCascadeDurationDays: 90,
 *   minTrackingProbability: 0.1
 * });
 *
 * // Register a new cascade when trigger detected
 * const cascade = tracker.registerCascade(financeEvent);
 *
 * // Update when subsequent events occur
 * const alert = tracker.updateCascade(cascade.id, csEvent);
 *
 * // Get intervention opportunities
 * const opportunities = tracker.getInterventionWindow(cascade.id);
 * ```
 */
export function createCascadeTracker(
  dag: CausalDAG,
  chains: CausalChain[],
  config: Partial<CascadeTrackerConfig> = {}
) {
  const {
    maxCascadeDurationDays = 90,
    minTrackingProbability = 0.1,
    stallThresholdHours = 168, // 1 week
    alertThresholdSeverity = 30
  } = config;

  // Active cascades indexed by ID
  const activeCascades = new Map<string, ActiveCascade>();

  // Index cascades by entity for quick lookup
  const cascadesByEntity = new Map<string, Set<string>>();

  // Index cascades by current domain for matching
  const cascadesByCurrentDomain = new Map<string, Set<string>>();

  return {
    /**
     * Register a new cascade when a potential trigger event is detected
     */
    registerCascade(event: CausalEvent): ActiveCascade | null {
      // Find chains that start with this domain
      const matchingChains = chains.filter(
        chain => chain.nodes[0] === event.domain && chain.confidence >= 0.3
      );

      if (matchingChains.length === 0) {
        return null; // No known cascade pattern from this domain
      }

      // Use the strongest matching chain
      const bestChain = matchingChains.reduce((best, chain) =>
        chain.chainStrength * chain.confidence > best.chainStrength * best.confidence
          ? chain
          : best
      );

      const cascadeId = generateCascadeId();
      const now = new Date();

      // Calculate predicted end time based on chain lag
      const predictedEndTime = new Date(
        now.getTime() + bestChain.totalLagDays * 24 * 60 * 60 * 1000
      );

      // Generate intervention opportunities
      const interventionOpportunities = generateInterventionOpportunities(
        bestChain,
        dag,
        now
      );

      // Estimate impact
      const estimatedImpact = estimateCascadeImpact(
        event,
        bestChain,
        dag
      );

      const cascade: ActiveCascade = {
        id: cascadeId,
        organizationId: event.organizationId,
        triggerEvent: event,
        triggerDomain: event.domain,
        entityId: event.entityId,
        entityType: event.entityType,
        currentStage: 0,
        expectedPath: bestChain.nodes,
        actualPath: [event.domain],
        matchedChainId: bestChain.nodes.join('→'),
        predictedEndTime,
        probability: bestChain.confidence,
        estimatedImpact,
        interventionOpportunities,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        interventions: []
      };

      // Store cascade
      activeCascades.set(cascadeId, cascade);

      // Index by entity
      const entityKey = `${event.entityType}:${event.entityId}`;
      if (!cascadesByEntity.has(entityKey)) {
        cascadesByEntity.set(entityKey, new Set());
      }
      cascadesByEntity.get(entityKey)!.add(cascadeId);

      // Index by current domain
      const currentDomain = event.domain;
      if (!cascadesByCurrentDomain.has(currentDomain)) {
        cascadesByCurrentDomain.set(currentDomain, new Set());
      }
      cascadesByCurrentDomain.get(currentDomain)!.add(cascadeId);

      return cascade;
    },

    /**
     * Update a cascade when a new related event occurs
     */
    updateCascade(cascadeId: string, event: CausalEvent): CascadeAlert | null {
      const cascade = activeCascades.get(cascadeId);
      if (!cascade || cascade.status !== 'active') {
        return null;
      }

      const now = new Date();
      const nextExpectedDomain = cascade.expectedPath[cascade.currentStage + 1];
      const wasPredicted = event.domain === nextExpectedDomain;

      // Update cascade state
      cascade.actualPath.push(event.domain);
      cascade.currentStage++;
      cascade.updatedAt = now;

      // Update probability based on whether this was predicted
      if (wasPredicted) {
        // Increase confidence when prediction is correct
        cascade.probability = Math.min(1, cascade.probability * 1.1);
      } else {
        // Decrease confidence but don't drop too fast
        cascade.probability = cascade.probability * 0.8;
      }

      // Update intervention opportunities
      cascade.interventionOpportunities = cascade.interventionOpportunities.map(opp => ({
        ...opp,
        timeWindowHours: Math.max(0, opp.timeWindowHours -
          (now.getTime() - cascade.updatedAt.getTime()) / (1000 * 60 * 60)),
        isExpired: opp.domain === event.domain || opp.timeWindowHours <= 0
      }));

      // Check if cascade is complete
      if (cascade.currentStage >= cascade.expectedPath.length - 1) {
        cascade.status = 'completed';
      }

      // Check if should stop tracking
      if (cascade.probability < minTrackingProbability) {
        cascade.status = 'stalled';
      }

      // Generate alert if severity threshold met
      if (cascade.estimatedImpact.severityScore >= alertThresholdSeverity) {
        return generateCascadeAlert(cascade, event);
      }

      return null;
    },

    /**
     * Find cascades that might be affected by an event
     */
    findMatchingCascades(event: CausalEvent): ActiveCascade[] {
      const matches: ActiveCascade[] = [];

      // Check by entity
      const entityKey = `${event.entityType}:${event.entityId}`;
      const entityCascades = cascadesByEntity.get(entityKey);
      if (entityCascades) {
        for (const cascadeId of entityCascades) {
          const cascade = activeCascades.get(cascadeId);
          if (cascade && cascade.status === 'active') {
            // Check if this event domain is expected next
            const nextExpected = cascade.expectedPath[cascade.currentStage + 1];
            if (nextExpected === event.domain) {
              matches.push(cascade);
            }
          }
        }
      }

      return matches;
    },

    /**
     * Get intervention opportunities for a cascade
     */
    getInterventionWindow(cascadeId: string): InterventionOpportunity[] {
      const cascade = activeCascades.get(cascadeId);
      if (!cascade) return [];

      return cascade.interventionOpportunities.filter(opp => !opp.isExpired);
    },

    /**
     * Record that an intervention was attempted
     */
    recordIntervention(
      cascadeId: string,
      interventionId: string,
      domain: string,
      interventionType: string
    ): void {
      const cascade = activeCascades.get(cascadeId);
      if (!cascade) return;

      cascade.interventions.push({
        interventionId,
        domain,
        recordedAt: new Date(),
        interventionType,
        stoppedCascade: false
      });

      cascade.updatedAt = new Date();
    },

    /**
     * Mark that a cascade was interrupted by intervention
     */
    markInterrupted(cascadeId: string, interventionId: string): void {
      const cascade = activeCascades.get(cascadeId);
      if (!cascade) return;

      cascade.status = 'interrupted';
      cascade.updatedAt = new Date();

      // Mark the intervention as successful
      const intervention = cascade.interventions.find(
        i => i.interventionId === interventionId
      );
      if (intervention) {
        intervention.stoppedCascade = true;
      }
    },

    /**
     * Get all active cascades
     */
    getActiveCascades(organizationId?: string): ActiveCascade[] {
      const cascades = Array.from(activeCascades.values())
        .filter(c => c.status === 'active');

      if (organizationId) {
        return cascades.filter(c => c.organizationId === organizationId);
      }

      return cascades;
    },

    /**
     * Get cascade by ID
     */
    getCascade(cascadeId: string): ActiveCascade | undefined {
      return activeCascades.get(cascadeId);
    },

    /**
     * Get cascades for an entity
     */
    getCascadesForEntity(entityType: string, entityId: string): ActiveCascade[] {
      const entityKey = `${entityType}:${entityId}`;
      const cascadeIds = cascadesByEntity.get(entityKey);
      if (!cascadeIds) return [];

      return Array.from(cascadeIds)
        .map(id => activeCascades.get(id))
        .filter((c): c is ActiveCascade => c !== undefined);
    },

    /**
     * Clean up expired and stalled cascades
     */
    cleanupCascades(): { expired: number; stalled: number } {
      const now = new Date();
      let expired = 0;
      let stalled = 0;

      for (const [id, cascade] of activeCascades) {
        if (cascade.status !== 'active') continue;

        // Check if expired by duration
        const durationDays = (now.getTime() - cascade.createdAt.getTime()) /
          (1000 * 60 * 60 * 24);
        if (durationDays > maxCascadeDurationDays) {
          cascade.status = 'expired';
          expired++;
          continue;
        }

        // Check if stalled by inactivity
        const hoursSinceUpdate = (now.getTime() - cascade.updatedAt.getTime()) /
          (1000 * 60 * 60);
        if (hoursSinceUpdate > stallThresholdHours) {
          cascade.status = 'stalled';
          stalled++;
        }
      }

      return { expired, stalled };
    },

    /**
     * Get cascade statistics
     */
    getStats(organizationId?: string): CascadeStats {
      let cascades = Array.from(activeCascades.values());
      if (organizationId) {
        cascades = cascades.filter(c => c.organizationId === organizationId);
      }

      const active = cascades.filter(c => c.status === 'active').length;
      const completed = cascades.filter(c => c.status === 'completed').length;
      const interrupted = cascades.filter(c => c.status === 'interrupted').length;
      const stalled = cascades.filter(c => c.status === 'stalled').length;
      const expired = cascades.filter(c => c.status === 'expired').length;

      const completedCascades = cascades.filter(c => c.status === 'completed');
      const averageAccuracy = completedCascades.length > 0
        ? completedCascades.reduce((sum, c) => {
            const matchingStages = c.actualPath.filter(
              (domain, i) => c.expectedPath[i] === domain
            ).length;
            return sum + matchingStages / c.expectedPath.length;
          }, 0) / completedCascades.length
        : 0;

      const interruptedCascades = cascades.filter(c => c.status === 'interrupted');
      const interventionSuccessRate = cascades.filter(c => c.interventions.length > 0).length > 0
        ? interruptedCascades.length / cascades.filter(c => c.interventions.length > 0).length
        : 0;

      return {
        totalCascades: cascades.length,
        active,
        completed,
        interrupted,
        stalled,
        expired,
        averagePredictionAccuracy: averageAccuracy,
        interventionSuccessRate
      };
    },

    /**
     * Export cascades for database persistence
     */
    exportForDatabase(organizationId: string): Array<{
      organization_id: string;
      cascade_id: string;
      trigger_domain: string;
      entity_type: string;
      entity_id: string;
      expected_path: string[];
      actual_path: string[];
      current_stage: number;
      probability: number;
      severity_score: number;
      status: string;
      created_at: Date;
      updated_at: Date;
    }> {
      return Array.from(activeCascades.values())
        .filter(c => c.organizationId === organizationId)
        .map(cascade => ({
          organization_id: organizationId,
          cascade_id: cascade.id,
          trigger_domain: cascade.triggerDomain,
          entity_type: cascade.entityType,
          entity_id: cascade.entityId,
          expected_path: cascade.expectedPath,
          actual_path: cascade.actualPath,
          current_stage: cascade.currentStage,
          probability: cascade.probability,
          severity_score: cascade.estimatedImpact.severityScore,
          status: cascade.status,
          created_at: cascade.createdAt,
          updated_at: cascade.updatedAt
        }));
    }
  };
}

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface CascadeStats {
  totalCascades: number;
  active: number;
  completed: number;
  interrupted: number;
  stalled: number;
  expired: number;
  averagePredictionAccuracy: number;
  interventionSuccessRate: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate unique cascade ID
 */
function generateCascadeId(): string {
  return `cascade-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Generate intervention opportunities from chain
 */
function generateInterventionOpportunities(
  chain: CausalChain,
  dag: CausalDAG,
  startTime: Date
): InterventionOpportunity[] {
  const opportunities: InterventionOpportunity[] = [];
  let cumulativeLagDays = 0;

  for (let i = 0; i < chain.nodes.length - 1; i++) {
    const source = chain.nodes[i];
    const target = chain.nodes[i + 1];

    // Get edge lag from DAG
    const edge = dag.edges.get(source)?.get(target);
    const edgeLag = edge?.lagDays || 14; // Default 14 days if not found

    cumulativeLagDays += edgeLag;

    // Intervention window is 50% of lag time before next domain
    const windowHours = (edgeLag * 24) * 0.5;

    opportunities.push({
      domain: source,
      timeWindowHours: windowHours,
      effectiveness: 1 - (i / chain.nodes.length), // Earlier = more effective
      recommendedAction: getRecommendedAction(source, target),
      priority: i + 1,
      isExpired: false
    });
  }

  return opportunities;
}

/**
 * Get recommended action for domain transition
 */
function getRecommendedAction(sourceDomain: string, targetDomain: string): string {
  const actionMap: Record<string, Record<string, string>> = {
    Finance: {
      CS: 'Escalate payment issues to Finance head immediately',
      AM: 'Review contract terms and payment history',
      Revenue: 'Assess revenue recognition timeline'
    },
    CS: {
      AM: 'Schedule executive business review',
      Finance: 'Review support ticket patterns',
      Product: 'Escalate product issues to engineering'
    },
    AM: {
      Revenue: 'Initiate renewal discussions early',
      CS: 'Coordinate with CS on account health',
      Finance: 'Review expansion opportunities'
    },
    Product: {
      CS: 'Provide product roadmap updates',
      AM: 'Communicate delivery timelines',
      Revenue: 'Assess product impact on deals'
    }
  };

  return actionMap[sourceDomain]?.[targetDomain] ||
    `Review ${sourceDomain} signals affecting ${targetDomain}`;
}

/**
 * Estimate cascade impact
 */
function estimateCascadeImpact(
  triggerEvent: CausalEvent,
  chain: CausalChain,
  dag: CausalDAG
): CascadeImpact {
  const domainImpacts: CascadeImpact['domainImpacts'] = [];
  let cumulativeLag = 0;

  // Get signal value from trigger event
  const triggerValue = (triggerEvent.payload as { signal_value?: number }).signal_value || 0;

  for (let i = 1; i < chain.nodes.length; i++) {
    const prevDomain = chain.nodes[i - 1];
    const domain = chain.nodes[i];

    // Get edge from DAG
    const edge = dag.edges.get(prevDomain)?.get(domain);
    const edgeLag = edge?.lagDays || 14;
    const edgeWeight = edge?.weight || 0.5;

    cumulativeLag += edgeLag;

    // Predicted change attenuates along chain
    const predictedChange = triggerValue * Math.pow(edgeWeight, i);
    const uncertainty = 0.2 * i; // Uncertainty increases along chain

    domainImpacts.push({
      domain,
      metric: getDomainMetric(domain),
      predictedChange,
      confidenceInterval: {
        lower: predictedChange * (1 - uncertainty),
        upper: predictedChange * (1 + uncertainty)
      },
      expectedTimeframeDays: cumulativeLag
    });
  }

  // Calculate severity based on chain strength and trigger value
  const severityScore = Math.min(100, Math.round(
    Math.abs(triggerValue) * chain.chainStrength * chain.confidence * 100
  ));

  return {
    domainImpacts,
    severityScore,
    // These would be filled in with real data in production
    arrAtRisk: undefined,
    clientsAffected: undefined
  };
}

/**
 * Get primary metric for domain
 */
function getDomainMetric(domain: string): string {
  const metricMap: Record<string, string> = {
    Finance: 'payment_velocity',
    CS: 'health_score',
    AM: 'renewal_probability',
    Revenue: 'deal_velocity',
    Product: 'delivery_status',
    Marketing: 'pipeline_quality',
    People: 'capacity_utilization'
  };
  return metricMap[domain] || 'general_health';
}

/**
 * Generate alert for cascade
 */
function generateCascadeAlert(
  cascade: ActiveCascade,
  latestEvent: CausalEvent
): CascadeAlert {
  const severity = cascade.estimatedImpact.severityScore >= 70 ? 'critical' :
    cascade.estimatedImpact.severityScore >= 50 ? 'high' :
    cascade.estimatedImpact.severityScore >= 30 ? 'medium' : 'low';

  const activeOpportunities = cascade.interventionOpportunities
    .filter(opp => !opp.isExpired)
    .slice(0, 3);

  return {
    cascadeId: cascade.id,
    severity,
    message: formatAlertMessage(cascade, latestEvent),
    expectedImpacts: cascade.estimatedImpact.domainImpacts,
    recommendedInterventions: activeOpportunities.map(opp => ({
      action: opp.recommendedAction,
      domain: opp.domain,
      priority: opp.priority,
      timeRemaining: formatTimeRemaining(opp.timeWindowHours),
      effectiveness: opp.effectiveness
    })),
    createdAt: new Date()
  };
}

/**
 * Format alert message
 */
function formatAlertMessage(cascade: ActiveCascade, latestEvent: CausalEvent): string {
  const remainingDomains = cascade.expectedPath.slice(cascade.currentStage + 1);
  const pathStr = remainingDomains.join(' → ');

  return `Cascade detected: ${cascade.triggerDomain} signal propagating to ${latestEvent.domain}. ` +
    `Expected to continue: ${pathStr}. ` +
    `Probability: ${Math.round(cascade.probability * 100)}%. ` +
    `Severity: ${cascade.estimatedImpact.severityScore}/100.`;
}

/**
 * Format time remaining
 */
function formatTimeRemaining(hours: number): string {
  if (hours < 1) return 'less than 1 hour';
  if (hours < 24) return `${Math.round(hours)} hours`;
  const days = Math.round(hours / 24);
  return `${days} day${days > 1 ? 's' : ''}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const CascadeTracker = {
  createCascadeTracker
};
