/**
 * Nexus Memory Stack - Causality Module
 *
 * L4: Causal Graph Engine
 * Cross-domain signal collection, cascade rule detection,
 * and statistical causal inference.
 *
 * The 10x Innovation: AI-first discovery of causal relationships
 * using Nobel Prize-winning Granger causality methods, PC Algorithm
 * for structural discovery, and Do-Calculus for intervention effects.
 */

export * from './signal-collector';
export * from './cascade-rules';

// Statistical Causal Discovery
export * from './granger-causality';
export * from './intervention-effects';
export * from './causal-graph-builder';
export * from './statistical-tests';

// Time Series Conversion & Discovery Runner
export * from './signal-to-timeseries';
export * from './causal-discovery-runner';

// Phase 1: Real-Time Event Streaming & Outcome Tracking
export * from './event-bus';
export * from './outcome-tracker';

// Phase 2: True Causal Discovery (PC Algorithm, Do-Calculus)
// Note: pc-algorithm and do-calculus define their own CausalEdge/CausalDAG
// types that conflict with causal-graph-builder. We re-export selectively.
export {
  runPCAlgorithm,
  pcResultToDAG,
  findAncestors,
  findDescendants,
  PCAlgorithm,
  type PCAlgorithmConfig,
  type PCAlgorithmResult,
  type VStructure,
  type CausalEdge as PCCausalEdge,
  type ConditionalIndependenceTest,
} from './pc-algorithm';

export {
  createDoCalculusEstimator,
  DoCalculus,
  type InterventionQuery,
  type CausalEffectEstimate,
  type CausalDAG as DoCalculusCausalDAG,
  type DoCalculusConfig,
} from './do-calculus';

export * from './confounding-detector';
export * from './counterfactual-engine';

// Phase 3: Graph Intelligence (Continuous Learning, Chain Detection)
export {
  createContinuousLearner,
  createEmptyDAG,
  ContinuousLearner,
  type GraphUpdate,
  type LearningConfig,
  type CausalDAG as LearnerCausalDAG,
} from './continuous-learner';
export * from './sequence-miner';
export * from './cascade-tracker';

// Phase 4: Adaptive System (Thresholds, Feedback Loop)
export * from './threshold-optimizer';
export * from './feedback-loop';
