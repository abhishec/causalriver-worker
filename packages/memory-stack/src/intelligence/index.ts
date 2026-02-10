/**
 * Nexus Memory Stack - Intelligence Module
 *
 * L7: Intelligence Interface Layer
 * Claude-optimized AI reasoning and domain persona framework.
 *
 * Integrates with L4 Causal Graph Engine for causally-grounded
 * reasoning — CauseMe + CausalRivers proven algorithms power
 * the causal intelligence injected into LLM prompts.
 */

export * from './domain-personas';
export * from './reasoning-framework';

// Re-export causal discovery API for L7 consumers who need
// to run discovery and feed results into reasoning/personas
export {
  runCausalDiscovery,
  summarizeDiscovery,
  type CausalRelationship,
  type DiscoveryConfig,
  type DiscoveryResult,
} from '../causality/causal-discovery-runner';

export {
  type AdvancedDiscoveryMethod,
} from '../causality/advanced-discovery';
