/**
 * Bridge 6: Observation Memory Bridge
 *
 * Percolates the observational memory paradigm (proven at 79.6% on LongMemEval)
 * across the production brain architecture. This bridge:
 *
 * 1. Subscribes to signals, outcomes, and feedback events
 * 2. Generates structured observations tagged with [FACT], [PREFERENCE], [EVENT],
 *    [CHANGE], [TEMPORAL], [RELATIONSHIP], [ASSISTANT_SAID], [ASSISTANT_CREATED]
 * 3. Maintains per-org observation stores (rules, cascades, entity graphs)
 * 4. Publishes observation events consumed by the agent context enricher
 *
 * Architecture mapping to the 7-layer federated model:
 *   L1 Signal   → observation generation from raw events
 *   L2 Causal   → entity graph extraction from [FACT], [RELATIONSHIP] tags
 *   L3 Pattern  → observation relevance scoring per agent domain
 *   L4 Rules    → preference/fact rule extraction from [PREFERENCE], [FACT] tags
 *   L5 Cascade  → cross-entity change detection from [CHANGE] tags
 *   L6 Predict  → observation context injection into agent prompts
 *   L7 Anomaly  → multi-signal abstention (contradictions, low coverage)
 */

import type { CausalEvent } from '../causality/event-bus';

type EventBusInstance = {
  subscribe: (options: {
    filter: any;
    handler: (events: CausalEvent[]) => Promise<void>;
  }) => string;
  emit: (event: CausalEvent) => boolean;
};

// ============================================================================
// OBSERVATION TAG TYPES
// ============================================================================

export type ObservationTag =
  | 'FACT'
  | 'PREFERENCE'
  | 'EVENT'
  | 'CHANGE'
  | 'TEMPORAL'
  | 'RELATIONSHIP'
  | 'ASSISTANT_SAID'
  | 'ASSISTANT_CREATED';

/**
 * A single structured observation extracted from system events.
 * Maps to the ParsedObservation concept from the benchmark pipeline.
 */
export interface StructuredObservation {
  /** The observation tag category */
  tag: ObservationTag;
  /** Human-readable observation content */
  content: string;
  /** Entity this observation relates to (metric name, domain, etc.) */
  entityId: string;
  /** Domain this observation originated from */
  domain: string;
  /** When this observation was recorded */
  timestamp: Date;
  /** Source event ID for traceability */
  sourceEventId: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Whether this observation supersedes a previous one */
  supersedes?: string;
}

/**
 * An extracted rule from accumulated observations.
 * Maps to L4 ObservationalL4Rules from the benchmark pipeline.
 */
export interface ObservationRule {
  /** Unique rule ID */
  id: string;
  /** Rule type: preference, fact, or constraint */
  type: 'preference' | 'fact' | 'constraint';
  /** The rule content in natural language */
  content: string;
  /** Entity this rule applies to */
  entityId: string;
  /** Domain scope */
  domain: string;
  /** Whether this rule is still current (not superseded) */
  isCurrent: boolean;
  /** When the rule was first observed */
  firstSeen: Date;
  /** When the rule was last confirmed */
  lastSeen: Date;
  /** Number of observations supporting this rule */
  supportCount: number;
  /** Superseded by which rule ID (if not current) */
  supersededBy?: string;
}

/**
 * A cascade detection result from cross-entity change tracking.
 * Maps to L5 ObservationalL5Cascade from the benchmark pipeline.
 */
export interface ObservationCascade {
  /** Entity that changed */
  entityId: string;
  /** Type of cascade: knowledge_update, contradiction, temporal_progression, reinforcement */
  cascadeType: 'knowledge_update' | 'contradiction' | 'temporal_progression' | 'reinforcement';
  /** Timeline of changes for this entity */
  timeline: Array<{
    content: string;
    timestamp: Date;
    tag: ObservationTag;
  }>;
  /** Domain scope */
  domain: string;
  /** Detected at */
  detectedAt: Date;
}

/**
 * Per-organization observation store.
 * Maintains the accumulated observational intelligence.
 */
export interface ObservationStore {
  /** All raw observations, newest first */
  observations: StructuredObservation[];
  /** Extracted rules (L4) */
  rules: ObservationRule[];
  /** Detected cascades (L5) */
  cascades: ObservationCascade[];
  /** Entity graph: entity → domains it appears in */
  entityGraph: Map<string, Set<string>>;
  /** Cross-entity relationships */
  relationships: Array<{ source: string; target: string; type: string; evidence: string }>;
}

// ============================================================================
// OBSERVATION GENERATION (L1)
// ============================================================================

/**
 * Generate structured observations from a causal event.
 * This is the L1 Signal layer — converts raw events into tagged observations.
 */
function generateObservations(event: CausalEvent): StructuredObservation[] {
  const observations: StructuredObservation[] = [];
  const payload = event.payload as Record<string, any>;
  const ts = event.timestamp;
  const base = {
    entityId: event.entityId,
    domain: event.domain,
    timestamp: ts,
    sourceEventId: event.eventId,
  };

  switch (event.eventType) {
    case 'signal': {
      // Signal events generate [FACT] and potentially [CHANGE] observations
      const signalValue = payload.signal_value ?? payload.value ?? 0;
      const signalType = payload.signal_type ?? payload.type ?? 'metric';

      observations.push({
        ...base,
        tag: 'FACT',
        content: `${event.domain} ${signalType} for ${event.entityId}: value=${signalValue}`,
        confidence: Math.min(1, Math.abs(signalValue as number)),
      });

      // Extreme signals indicate changes
      if (Math.abs(signalValue as number) > 0.7) {
        observations.push({
          ...base,
          tag: 'CHANGE',
          content: `Significant ${(signalValue as number) > 0 ? 'increase' : 'decrease'} in ${event.domain} ${signalType} for ${event.entityId} (value=${signalValue})`,
          confidence: Math.min(1, Math.abs(signalValue as number)),
        });
      }

      // Time-based signals get TEMPORAL tags
      if (payload.period || payload.date_range || payload.temporal_window) {
        observations.push({
          ...base,
          tag: 'TEMPORAL',
          content: `${event.domain} ${signalType} measured over ${payload.period || payload.date_range || payload.temporal_window}`,
          confidence: 0.8,
        });
      }
      break;
    }

    case 'relationship_update': {
      // Discovered relationships generate [RELATIONSHIP] and [FACT] observations
      const sourceDomain = payload.source_domain || event.domain;
      const targetDomain = payload.target_domain || payload.target;
      const effectSize = payload.effect_size || payload.weight || 0;
      const lagDays = payload.optimal_lag_days || payload.lagDays || 0;
      const nl = payload.natural_language || payload.evidence || '';

      observations.push({
        ...base,
        tag: 'RELATIONSHIP',
        content: `${sourceDomain} → ${targetDomain}: ${nl} (effect=${effectSize}, lag=${lagDays}d)`,
        confidence: 1 - (payload.granger_p_value || 0.5),
      });

      observations.push({
        ...base,
        tag: 'FACT',
        content: `Causal relationship discovered: ${sourceDomain} affects ${targetDomain} with ${Math.abs(effectSize)} effect size and ${lagDays}-day lag`,
        confidence: 1 - (payload.granger_p_value || 0.5),
      });
      break;
    }

    case 'outcome': {
      // Outcomes generate [EVENT] observations
      const metricType = payload.metric_type || payload.type || 'outcome';
      const value = payload.value ?? payload.metric_value ?? 'recorded';

      observations.push({
        ...base,
        tag: 'EVENT',
        content: `Outcome recorded: ${event.domain} ${metricType} = ${value} for ${event.entityId}`,
        confidence: 0.9,
      });
      break;
    }

    case 'prediction': {
      // Predictions generate [ASSISTANT_SAID] observations
      const predicted = payload.predicted_value ?? payload.prediction ?? 'N/A';
      const rule = payload.rule_id || payload.pattern_id || '';

      observations.push({
        ...base,
        tag: 'ASSISTANT_SAID',
        content: `System predicted ${event.domain} ${event.entityType} = ${predicted}${rule ? ` (based on rule ${rule})` : ''}`,
        confidence: (payload.confidence as number) || 0.5,
      });
      break;
    }

    case 'feedback': {
      // Feedback generates [CHANGE] observations about prediction accuracy
      const wasCorrect = payload.wasCorrect;
      const confidenceDelta = payload.confidenceDelta ?? 0;

      observations.push({
        ...base,
        tag: wasCorrect ? 'FACT' : 'CHANGE',
        content: wasCorrect
          ? `Prediction confirmed correct for ${event.entityId} in ${event.domain} (confidence ${wasCorrect ? '+' : ''}${confidenceDelta})`
          : `Prediction was incorrect for ${event.entityId} in ${event.domain} — updating model`,
        confidence: 0.95,
      });
      break;
    }

    case 'cascade_trigger':
    case 'cascade_propagation': {
      // Cascades generate [TEMPORAL] observations
      const cascadeSource = payload.source_entity || event.entityId;
      const cascadeTarget = payload.target_entity || payload.affected_entity || '';

      observations.push({
        ...base,
        tag: 'TEMPORAL',
        content: `Cascade ${event.eventType === 'cascade_trigger' ? 'triggered' : 'propagated'}: ${cascadeSource}${cascadeTarget ? ` → ${cascadeTarget}` : ''} in ${event.domain}`,
        confidence: 0.8,
      });
      break;
    }

    case 'intervention': {
      // Interventions generate [EVENT] observations
      observations.push({
        ...base,
        tag: 'EVENT',
        content: `Intervention applied: ${payload.intervention_type || payload.type || 'manual'} on ${event.entityId} in ${event.domain}`,
        confidence: 1.0,
      });
      break;
    }
  }

  return observations;
}

// ============================================================================
// RULE EXTRACTION (L4)
// ============================================================================

/**
 * Extract rules from accumulated observations.
 * This implements L4 ObservationalL4Rules logic.
 */
function extractRules(observations: StructuredObservation[], existingRules: ObservationRule[]): ObservationRule[] {
  const ruleMap = new Map<string, ObservationRule>();

  // Index existing rules
  for (const rule of existingRules) {
    ruleMap.set(rule.id, rule);
  }

  // Extract preference rules from [PREFERENCE] tags
  const preferenceObs = observations.filter(o => o.tag === 'PREFERENCE');
  for (const obs of preferenceObs) {
    const ruleId = `pref::${obs.domain}::${obs.entityId}::${obs.content.substring(0, 50)}`;
    const existing = ruleMap.get(ruleId);
    if (existing) {
      existing.lastSeen = obs.timestamp;
      existing.supportCount++;
    } else {
      ruleMap.set(ruleId, {
        id: ruleId,
        type: 'preference',
        content: obs.content,
        entityId: obs.entityId,
        domain: obs.domain,
        isCurrent: true,
        firstSeen: obs.timestamp,
        lastSeen: obs.timestamp,
        supportCount: 1,
      });
    }
  }

  // Extract fact rules from [FACT] tags (with high confidence)
  const factObs = observations.filter(o => o.tag === 'FACT' && o.confidence > 0.7);
  for (const obs of factObs) {
    const ruleId = `fact::${obs.domain}::${obs.entityId}::${obs.content.substring(0, 50)}`;
    const existing = ruleMap.get(ruleId);
    if (existing) {
      existing.lastSeen = obs.timestamp;
      existing.supportCount++;
    } else {
      ruleMap.set(ruleId, {
        id: ruleId,
        type: 'fact',
        content: obs.content,
        entityId: obs.entityId,
        domain: obs.domain,
        isCurrent: true,
        firstSeen: obs.timestamp,
        lastSeen: obs.timestamp,
        supportCount: 1,
      });
    }
  }

  // Mark superseded rules from [CHANGE] tags
  const changeObs = observations.filter(o => o.tag === 'CHANGE');
  for (const change of changeObs) {
    // Find existing rules for the same entity that might be superseded
    for (const [id, rule] of ruleMap) {
      if (
        rule.entityId === change.entityId &&
        rule.domain === change.domain &&
        rule.isCurrent &&
        rule.lastSeen < change.timestamp
      ) {
        // Check if the change contradicts or updates this rule
        if (
          rule.type === 'fact' &&
          change.content.toLowerCase().includes(rule.entityId.toLowerCase())
        ) {
          rule.isCurrent = false;
          rule.supersededBy = `change::${change.sourceEventId}`;
        }
      }
    }
  }

  return Array.from(ruleMap.values());
}

// ============================================================================
// CASCADE DETECTION (L5)
// ============================================================================

/**
 * Detect cascades from change observations.
 * This implements L5 ObservationalL5Cascade logic.
 */
function detectCascades(observations: StructuredObservation[]): ObservationCascade[] {
  // Group changes by entity
  const entityChanges = new Map<string, StructuredObservation[]>();
  for (const obs of observations) {
    if (obs.tag === 'CHANGE' || obs.tag === 'TEMPORAL') {
      const key = `${obs.domain}::${obs.entityId}`;
      if (!entityChanges.has(key)) {
        entityChanges.set(key, []);
      }
      entityChanges.get(key)!.push(obs);
    }
  }

  const cascades: ObservationCascade[] = [];

  for (const [key, changes] of entityChanges) {
    if (changes.length < 2) continue;

    // Sort chronologically
    changes.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const [domain, entityId] = key.split('::');

    // Detect cascade type
    let cascadeType: ObservationCascade['cascadeType'] = 'temporal_progression';

    // Check for contradictions (opposite directions)
    const hasContradiction = changes.some((c, i) => {
      if (i === 0) return false;
      const prev = changes[i - 1];
      return (
        c.content.includes('increase') && prev.content.includes('decrease') ||
        c.content.includes('decrease') && prev.content.includes('increase')
      );
    });

    if (hasContradiction) {
      cascadeType = 'contradiction';
    } else if (changes.every(c => c.tag === 'CHANGE')) {
      cascadeType = 'knowledge_update';
    } else if (changes.length >= 3 && !hasContradiction) {
      cascadeType = 'reinforcement';
    }

    cascades.push({
      entityId,
      cascadeType,
      timeline: changes.map(c => ({
        content: c.content,
        timestamp: c.timestamp,
        tag: c.tag,
      })),
      domain,
      detectedAt: new Date(),
    });
  }

  return cascades;
}

// ============================================================================
// ENTITY GRAPH (L2)
// ============================================================================

/**
 * Update the entity graph from observations.
 * This implements L2 ObservationalL2Causal entity extraction.
 */
function updateEntityGraph(
  observations: StructuredObservation[],
  entityGraph: Map<string, Set<string>>,
  relationships: ObservationStore['relationships']
): void {
  for (const obs of observations) {
    // Track entity → domain membership
    if (!entityGraph.has(obs.entityId)) {
      entityGraph.set(obs.entityId, new Set());
    }
    entityGraph.get(obs.entityId)!.add(obs.domain);

    // Extract relationships from [RELATIONSHIP] tags
    if (obs.tag === 'RELATIONSHIP') {
      // Parse "source → target" pattern from content
      const arrowMatch = obs.content.match(/^(\S+)\s*→\s*(\S+)/);
      if (arrowMatch) {
        const [, source, target] = arrowMatch;
        const existingIdx = relationships.findIndex(
          r => r.source === source && r.target === target
        );
        if (existingIdx < 0) {
          relationships.push({
            source,
            target,
            type: 'causal',
            evidence: obs.content,
          });
        }
      }
    }
  }
}

// ============================================================================
// OBSERVATION CONTEXT FORMATTER (L6)
// ============================================================================

/**
 * Format observations into a prompt-ready context block.
 * This implements L6 prompt enrichment from observations.
 */
export function formatObservationsForPrompt(
  store: ObservationStore,
  domain?: string,
  maxObservations: number = 30
): string {
  const sections: string[] = [];

  // Filter by domain if specified
  const relevantObs = domain
    ? store.observations.filter(o => o.domain === domain)
    : store.observations;

  if (relevantObs.length === 0 && store.rules.length === 0) {
    return '';
  }

  sections.push('## Observational Memory (Accumulated Intelligence)');
  sections.push('');

  // Current rules (L4)
  const currentRules = store.rules.filter(r => r.isCurrent && (!domain || r.domain === domain));
  if (currentRules.length > 0) {
    sections.push('### Known Facts & Preferences');
    for (const rule of currentRules.slice(0, 10)) {
      const badge = rule.type === 'preference' ? '[PREFERENCE]' : '[FACT]';
      sections.push(`- ${badge} ${rule.content} (confirmed ${rule.supportCount}x)`);
    }
    sections.push('');
  }

  // Superseded rules (for knowledge-update context)
  const supersededRules = store.rules.filter(r => !r.isCurrent && (!domain || r.domain === domain));
  if (supersededRules.length > 0) {
    sections.push('### Updated Information (Previous → Current)');
    for (const rule of supersededRules.slice(0, 5)) {
      sections.push(`- [CHANGE] ${rule.content} (was known ${rule.firstSeen.toISOString().split('T')[0]} → superseded)`);
    }
    sections.push('');
  }

  // Active cascades (L5)
  const relevantCascades = domain
    ? store.cascades.filter(c => c.domain === domain)
    : store.cascades;
  if (relevantCascades.length > 0) {
    sections.push('### Entity Change Timelines');
    for (const cascade of relevantCascades.slice(0, 5)) {
      sections.push(`- **${cascade.entityId}** (${cascade.cascadeType}):`);
      for (const entry of cascade.timeline.slice(-3)) {
        sections.push(`  - [${entry.tag}] ${entry.content} (${entry.timestamp.toISOString().split('T')[0]})`);
      }
    }
    sections.push('');
  }

  // Recent observations by category (L3 relevance ordering)
  const recentByTag = new Map<ObservationTag, StructuredObservation[]>();
  for (const obs of relevantObs.slice(0, maxObservations)) {
    if (!recentByTag.has(obs.tag)) {
      recentByTag.set(obs.tag, []);
    }
    recentByTag.get(obs.tag)!.push(obs);
  }

  if (recentByTag.size > 0) {
    sections.push('### Recent Observations');
    const tagOrder: ObservationTag[] = ['FACT', 'PREFERENCE', 'CHANGE', 'RELATIONSHIP', 'TEMPORAL', 'EVENT', 'ASSISTANT_SAID', 'ASSISTANT_CREATED'];
    for (const tag of tagOrder) {
      const obs = recentByTag.get(tag);
      if (obs && obs.length > 0) {
        for (const o of obs.slice(0, 5)) {
          sections.push(`- [${o.tag}] ${o.content}`);
        }
      }
    }
    sections.push('');
  }

  // Cross-entity relationships (L2)
  const relevantRels = domain
    ? store.relationships.filter(r => r.source.includes(domain) || r.target.includes(domain))
    : store.relationships;
  if (relevantRels.length > 0) {
    sections.push('### Cross-Entity Relationships');
    for (const rel of relevantRels.slice(0, 5)) {
      sections.push(`- ${rel.source} → ${rel.target} (${rel.type}): ${rel.evidence.substring(0, 100)}`);
    }
    sections.push('');
  }

  sections.push('Use these observations to inform your reasoning — they represent accumulated intelligence from the brain\'s event processing.');

  return sections.join('\n');
}

// ============================================================================
// ANOMALY DETECTION (L7)
// ============================================================================

/**
 * Multi-signal abstention check.
 * Returns true if the observation store suggests low confidence for a domain.
 */
export function checkObservationalAnomaly(
  store: ObservationStore,
  domain: string
): { shouldAbstain: boolean; reason: string; signals: string[] } {
  const signals: string[] = [];

  // Signal 1: No observations for this domain
  const domainObs = store.observations.filter(o => o.domain === domain);
  if (domainObs.length === 0) {
    signals.push('no_observations');
  }

  // Signal 2: Rule contradictions
  const domainRules = store.rules.filter(r => r.domain === domain);
  const contradicted = domainRules.filter(r => !r.isCurrent);
  if (contradicted.length > domainRules.length * 0.5) {
    signals.push('high_contradiction_rate');
  }

  // Signal 3: Cascade inconsistency
  const domainCascades = store.cascades.filter(c => c.domain === domain);
  const contradictionCascades = domainCascades.filter(c => c.cascadeType === 'contradiction');
  if (contradictionCascades.length > 0) {
    signals.push('cascade_contradiction');
  }

  // Signal 4: Low confidence observations
  const avgConfidence = domainObs.length > 0
    ? domainObs.reduce((sum, o) => sum + o.confidence, 0) / domainObs.length
    : 0;
  if (avgConfidence < 0.3) {
    signals.push('low_confidence');
  }

  // Conservative abstention: only if 2+ signals agree
  const shouldAbstain = signals.length >= 2;
  const reason = shouldAbstain
    ? `Low observational confidence: ${signals.join(', ')}`
    : '';

  return { shouldAbstain, reason, signals };
}

// ============================================================================
// MAIN BRIDGE
// ============================================================================

const MAX_OBSERVATIONS_PER_ORG = 500;
const MAX_RULES_PER_ORG = 100;
const MAX_CASCADES_PER_ORG = 50;

/**
 * Create the observation memory bridge.
 *
 * Subscribes to all event types on the event bus and maintains
 * per-organization observation stores with rules, cascades, and entity graphs.
 *
 * This percolates the observational memory paradigm (proven at 79.6% accuracy
 * on LongMemEval) across the production brain architecture.
 */
export function createObservationBridge(eventBus: EventBusInstance) {
  const stores = new Map<string, ObservationStore>();
  let totalObservations = 0;
  let totalRulesExtracted = 0;
  let totalCascadesDetected = 0;

  function getOrCreateStore(orgId: string): ObservationStore {
    if (!stores.has(orgId)) {
      stores.set(orgId, {
        observations: [],
        rules: [],
        cascades: [],
        entityGraph: new Map(),
        relationships: [],
      });
    }
    return stores.get(orgId)!;
  }

  // Subscribe to ALL event types for comprehensive observation
  const subscriptionId = eventBus.subscribe({
    filter: {
      eventTypes: [
        'signal',
        'relationship_update',
        'outcome',
        'prediction',
        'feedback',
        'cascade_trigger',
        'cascade_propagation',
        'intervention',
      ] as any,
    },
    handler: async (events: CausalEvent[]) => {
      for (const event of events) {
        const store = getOrCreateStore(event.organizationId);

        // L1: Generate observations from event
        const newObs = generateObservations(event);
        if (newObs.length === 0) continue;

        // Add to store (newest first)
        store.observations.unshift(...newObs);
        totalObservations += newObs.length;

        // Trim to max
        if (store.observations.length > MAX_OBSERVATIONS_PER_ORG) {
          store.observations.length = MAX_OBSERVATIONS_PER_ORG;
        }

        // L2: Update entity graph
        updateEntityGraph(newObs, store.entityGraph, store.relationships);

        // L4: Extract/update rules (periodically, not every event)
        if (store.observations.length % 10 === 0) {
          store.rules = extractRules(store.observations, store.rules);
          totalRulesExtracted = store.rules.length;

          // Trim rules
          if (store.rules.length > MAX_RULES_PER_ORG) {
            // Keep current rules, trim oldest non-current
            const current = store.rules.filter(r => r.isCurrent);
            const superseded = store.rules.filter(r => !r.isCurrent)
              .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
              .slice(0, MAX_RULES_PER_ORG - current.length);
            store.rules = [...current, ...superseded];
          }

          // Emit rules_extracted event
          try {
            eventBus.emit({
              eventId: `obs_rules_${event.eventId}`,
              organizationId: event.organizationId,
              domain: event.domain,
              entityType: 'observation_rules',
              entityId: event.organizationId,
              eventType: 'observation_rules_extracted' as any,
              payload: {
                totalRules: store.rules.length,
                currentRules: store.rules.filter(r => r.isCurrent).length,
                supersededRules: store.rules.filter(r => !r.isCurrent).length,
              },
              timestamp: new Date(),
              vectorClock: 0,
            });
          } catch {
            // Non-fatal
          }
        }

        // L5: Detect cascades (periodically)
        if (store.observations.length % 20 === 0) {
          store.cascades = detectCascades(store.observations);
          totalCascadesDetected = store.cascades.length;

          if (store.cascades.length > MAX_CASCADES_PER_ORG) {
            store.cascades = store.cascades
              .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
              .slice(0, MAX_CASCADES_PER_ORG);
          }

          // Emit cascades_analyzed event
          try {
            eventBus.emit({
              eventId: `obs_cascade_${event.eventId}`,
              organizationId: event.organizationId,
              domain: event.domain,
              entityType: 'observation_cascades',
              entityId: event.organizationId,
              eventType: 'observation_cascades_analyzed' as any,
              payload: {
                totalCascades: store.cascades.length,
                types: {
                  knowledge_update: store.cascades.filter(c => c.cascadeType === 'knowledge_update').length,
                  contradiction: store.cascades.filter(c => c.cascadeType === 'contradiction').length,
                  temporal_progression: store.cascades.filter(c => c.cascadeType === 'temporal_progression').length,
                  reinforcement: store.cascades.filter(c => c.cascadeType === 'reinforcement').length,
                },
              },
              timestamp: new Date(),
              vectorClock: 0,
            });
          } catch {
            // Non-fatal
          }
        }

        // Emit observation event for downstream consumers
        try {
          eventBus.emit({
            eventId: `obs_${event.eventId}`,
            organizationId: event.organizationId,
            domain: event.domain,
            entityType: 'observation',
            entityId: event.entityId,
            eventType: 'observation' as any,
            payload: {
              tags: newObs.map(o => o.tag),
              count: newObs.length,
              content: newObs.map(o => `[${o.tag}] ${o.content}`).join('\n'),
            },
            timestamp: new Date(),
            vectorClock: 0,
          });
        } catch {
          // Non-fatal
        }
      }
    },
  });

  return {
    subscriptionId,

    /**
     * Get the observation store for an organization.
     */
    getStore(organizationId: string): ObservationStore | undefined {
      return stores.get(organizationId);
    },

    /**
     * Get observation context formatted for agent prompts (L6).
     */
    getContextForAgent(organizationId: string, domain?: string): string {
      const store = stores.get(organizationId);
      if (!store) return '';
      return formatObservationsForPrompt(store, domain);
    },

    /**
     * Check if abstention is recommended for a domain (L7).
     */
    checkAnomaly(organizationId: string, domain: string) {
      const store = stores.get(organizationId);
      if (!store) {
        return { shouldAbstain: true, reason: 'No observations available', signals: ['no_store'] };
      }
      return checkObservationalAnomaly(store, domain);
    },

    /**
     * Get rules for an organization, optionally filtered by domain.
     */
    getRules(organizationId: string, domain?: string): ObservationRule[] {
      const store = stores.get(organizationId);
      if (!store) return [];
      return domain
        ? store.rules.filter(r => r.domain === domain)
        : store.rules;
    },

    /**
     * Get cascades for an organization, optionally filtered by domain.
     */
    getCascades(organizationId: string, domain?: string): ObservationCascade[] {
      const store = stores.get(organizationId);
      if (!store) return [];
      return domain
        ? store.cascades.filter(c => c.domain === domain)
        : store.cascades;
    },

    /**
     * Clear observation store for an organization.
     */
    clearStore(organizationId?: string): void {
      if (organizationId) {
        stores.delete(organizationId);
      } else {
        stores.clear();
      }
    },

    /**
     * Get bridge statistics.
     */
    getStats() {
      return {
        organizationsTracked: stores.size,
        totalObservations,
        totalRulesExtracted,
        totalCascadesDetected,
        storeDetails: Array.from(stores.entries()).map(([orgId, store]) => ({
          organizationId: orgId,
          observations: store.observations.length,
          rules: store.rules.length,
          cascades: store.cascades.length,
          entities: store.entityGraph.size,
          relationships: store.relationships.length,
        })),
      };
    },
  };
}
