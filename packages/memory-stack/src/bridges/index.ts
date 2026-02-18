/**
 * Nexus Brain Bridges
 *
 * The nervous system that connects the 7 layers.
 * Each bridge subscribes to events on the event bus and
 * triggers the next layer in the processing pipeline.
 *
 * EntityResolution → Signal → EventBus → CausalDiscovery → PatternLearning → AgentContext → Feedback
 */

import { createSignalBridge } from './signal-to-eventbus';
import { createCausalSubscriber, type CausalSubscriberConfig } from './eventbus-to-causal';
import { createLearningBridge, type LearningBridgeConfig } from './causal-to-learning';
import {
  createAgentContextEnricher,
  type AgentContextCache,
  type CachedPattern,
  type CachedRelationship,
} from './patterns-to-agents';
import { createFeedbackBridge } from './outcome-to-feedback';
import {
  createObservationBridge,
  type StructuredObservation,
  type ObservationRule,
  type ObservationCascade,
  type ObservationStore,
  type ObservationTag,
} from './observation-bridge';
import {
  createEntityResolutionBridge,
  withEntityResolution,
  type EntityResolutionBridgeConfig,
  type EntityResolutionBridge,
  type ResolutionStats,
} from './entity-resolution-bridge';

// Re-export everything
export { createSignalBridge };
export { createCausalSubscriber, type CausalSubscriberConfig };
export { createLearningBridge, type LearningBridgeConfig };
export { createAgentContextEnricher, type AgentContextCache, type CachedPattern, type CachedRelationship };
export { createFeedbackBridge };
export { createObservationBridge, type StructuredObservation, type ObservationRule, type ObservationCascade, type ObservationStore, type ObservationTag };
export { createEntityResolutionBridge, withEntityResolution, type EntityResolutionBridgeConfig, type EntityResolutionBridge, type ResolutionStats };

// Re-export event bus types for convenience
export type { CausalEvent, EventBusConfig } from '../causality/event-bus';

/**
 * Configuration for wiring all bridges
 */
export interface BridgeConfig {
  /** Minimum signals before batch causal discovery (default: 200) */
  causalBatchThreshold?: number;
  /** Enable incremental learning per-event (default: true) */
  enableIncrementalLearning?: boolean;
  /** Continuous learner instance for real-time graph updates */
  continuousLearner?: { processEvent: (event: any) => any };
  /** Minimum relationships before pattern mining (default: 5) */
  minRelationshipsForMining?: number;
  /**
   * Entity resolution config.
   * When provided, Bridge 0 (entity resolution) is activated and all
   * signals passing through `signalBridge.onSignalsCollected` will
   * have their entity IDs canonicalised before entering the event bus.
   * Requires a Supabase client and the current org ID.
   */
  entityResolution?: {
    supabase: any;
    organizationId: string;
    fuzzyThreshold?: number;
    asyncMode?: boolean;
    skipEntityTypes?: string[];
  };
}

/**
 * Wire all bridges to an event bus in one call.
 *
 * This is the main entry point for activating the Nexus Brain.
 * After calling this, signals that enter the event bus will
 * automatically flow through all 7 layers.
 *
 * @example
 * ```typescript
 * const eventBus = createEventBus();
 * const { signalBridge, contextEnricher } = wireNexusBridges(eventBus);
 *
 * const collector = createSignalCollector({
 *   collectors: [paymentVelocityCollectorTemplate],
 *   onSignalsCollected: signalBridge.onSignalsCollected,
 * });
 *
 * const context = contextEnricher.getContextForAgent(orgId, 'finance');
 * ```
 */
export function wireNexusBridges(
  eventBus: any,
  config: BridgeConfig = {}
) {
  // Bridge 0: Entity Resolution (optional — activated when entityResolution config is provided)
  // Canonicalises entity IDs across all systems (GitHub, Jira, Slack, Freshworks, etc.)
  // BEFORE signals reach the event bus, ensuring causal discovery operates on
  // consistent identities.  NB-051: Phase 4 — Entity Resolution.
  let entityResolutionBridge: EntityResolutionBridge | null = null;
  if (config.entityResolution) {
    entityResolutionBridge = createEntityResolutionBridge(config.entityResolution);
  }

  // Bridge 1: Signal → EventBus
  const signalBridge = createSignalBridge(eventBus);

  // If entity resolution is active, wrap the signal bridge so every batch
  // of signals is automatically resolved before entering the event bus.
  if (entityResolutionBridge) {
    signalBridge.onSignalsCollected = withEntityResolution(
      entityResolutionBridge,
      signalBridge.onSignalsCollected
    ) as typeof signalBridge.onSignalsCollected;
  }

  // Bridge 2: EventBus → Causal Discovery
  const causalSubscriber = createCausalSubscriber(eventBus, {
    batchThreshold: config.causalBatchThreshold,
    enableIncrementalLearning: config.enableIncrementalLearning,
    continuousLearner: config.continuousLearner,
  });

  // Bridge 3: Causal → Pattern Learning
  const learningBridge = createLearningBridge(eventBus, {
    minRelationshipsForMining: config.minRelationshipsForMining,
  });

  // Bridge 4: Patterns → Agent Context
  const contextEnricher = createAgentContextEnricher(eventBus);

  // Bridge 5: Outcomes → Feedback Loop
  const feedbackBridge = createFeedbackBridge(eventBus);

  // Bridge 6: Observation Memory (federated observational pipeline)
  // Subscribes to all events, generates structured observations with
  // [FACT], [PREFERENCE], [EVENT], [CHANGE], [TEMPORAL], [RELATIONSHIP],
  // [ASSISTANT_SAID], [ASSISTANT_CREATED] tags.
  // Maintains per-org observation stores with rules (L4), cascades (L5),
  // entity graphs (L2), and relevance scoring (L3).
  const observationBridge = createObservationBridge(eventBus);

  return {
    entityResolutionBridge,
    signalBridge,
    causalSubscriber,
    learningBridge,
    contextEnricher,
    feedbackBridge,
    observationBridge,

    /** Get stats from all bridges */
    getStats() {
      return {
        entityResolution: entityResolutionBridge?.getStats() ?? null,
        signals: signalBridge.getStats(),
        causal: causalSubscriber.getStats(),
        learning: learningBridge.getStats(),
        context: contextEnricher.getStats(),
        feedback: feedbackBridge.getStats(),
        observations: observationBridge.getStats(),
      };
    },
  };
}
