/**
 * Nexus Brain Bridges
 *
 * The nervous system that connects the 7 layers.
 * Each bridge subscribes to events on the event bus and
 * triggers the next layer in the processing pipeline.
 *
 * Signal → EventBus → CausalDiscovery → PatternLearning → AgentContext → Feedback
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

// Re-export everything
export { createSignalBridge };
export { createCausalSubscriber, type CausalSubscriberConfig };
export { createLearningBridge, type LearningBridgeConfig };
export { createAgentContextEnricher, type AgentContextCache, type CachedPattern, type CachedRelationship };
export { createFeedbackBridge };

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
  // Bridge 1: Signal → EventBus
  const signalBridge = createSignalBridge(eventBus);

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

  return {
    signalBridge,
    causalSubscriber,
    learningBridge,
    contextEnricher,
    feedbackBridge,

    /** Get stats from all bridges */
    getStats() {
      return {
        signals: signalBridge.getStats(),
        causal: causalSubscriber.getStats(),
        learning: learningBridge.getStats(),
        context: contextEnricher.getStats(),
        feedback: feedbackBridge.getStats(),
      };
    },
  };
}
