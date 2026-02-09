/**
 * Learning Module - Pattern Memory (L5)
 *
 * Learned patterns from historical outcomes with confidence scoring.
 * Now includes calibration, pattern discovery, statistical testing,
 * and outcome-based learning for Brain rules.
 */

// Brain Evaluator (original)
export {
  getNestedValue,
  evaluateCondition,
  evaluateConditionGroup,
  applyActions,
  aggregateResults,
  evaluateRule,
  createBrainEvaluator,
} from './brain-evaluator';

export type { BrainEvaluatorConfig } from './brain-evaluator';

// ============================================================================
// NEW: OUTCOME-BASED LEARNING
// ============================================================================

export {
  createBrainPrediction,
  inferPredictionType,
  findPredictionsAwaitingOutcome,
  matchOutcomeToPredictons,
  resolvePrediction,
  computePredictionAccuracy,
  computeAccuracyByRule,
  hasMinimumSampleSize,
  type BrainPrediction,
  type OutcomeResult,
  type PredictionAccuracy,
  type AccuracyByType,
} from './outcome-tracker';

export {
  computeAdaptiveLearningRate,
  computeCalibrationPenalty,
  computeNewConfidence,
  computeF1WeightedConfidence,
  calibrateAllRules,
  summarizeCalibration,
  DEFAULT_CALIBRATION_CONFIG,
  type ConfidenceUpdate,
  type CalibrationConfig,
} from './confidence-adjuster';

// ============================================================================
// PREDICTION TRACKING & CALIBRATION
// ============================================================================

export {
  recordPrediction,
  recordOutcome,
  getPendingPredictions,
  matchPredictionsToOutcomes,
  groupPredictionsByType,
  filterByTimeWindow,
  getPredictionStats,
  type PredictionRecord,
  type OutcomeRecord,
  type MatchedPrediction,
  type PendingPrediction,
} from './prediction-tracker';

export {
  computeAUC,
  computeAUCConfidenceInterval,
  computeCalibrationCurve,
  computeECE,
  computeBrierScore,
  decomposeBrierScore,
  getConfidenceInterval,
  generateReliabilityDiagram,
  analyzeCalibration,
  interpretCalibration,
  type CalibrationBucket,
  type CalibrationResult,
} from './calibration-engine';

export {
  wilsonScoreInterval,
  bootstrapCI,
  bayesianCredibleInterval,
  quantifyUncertainty,
  formatInterval,
  type Interval,
  type BootstrapConfig,
  type BetaPrior,
} from './confidence-intervals';

// ============================================================================
// PATTERN DISCOVERY
// ============================================================================

export {
  mineAssociationRules,
  clusterEntities,
  validatePattern,
  registerPattern,
  discoverPatterns,
  mineSequentialPatterns,
  sequentialPatternsToDiscovered,
  mineTemporalAssociationRules,
  type DiscoveredPattern,
  type PatternEvidence,
  type AssociationRule,
  type EntityCluster,
  type EntityFeatures,
  type SequentialPattern,
  type TemporalEvent,
  type TemporalAssociationRule,
} from './pattern-detector';

export {
  computeStatistics,
  zScoreDetection,
  iqrDetection,
  madDetection,
  detectAnomalies,
  explainAnomaly,
  detectEntityAnomalies,
  summarizeAnomalies,
  type DetectionMethod,
  type AnomalyEvent,
  type AnomalyConfig,
  type MetricStatistics,
} from './anomaly-detector';

export {
  chiSquaredTest,
  fisherExactTest,
  tTest,
  computeEffectSize,
  applyBonferroniCorrection,
  computeFDR,
  generateNaturalLanguageResult,
  testPatternSignificance,
  type SignificanceTestResult,
  type ContingencyTable,
} from './significance-testing';

// ============================================================================
// BRAIN TRAINING
// ============================================================================

export {
  createBrainTrainer,
  type TrainingPack,
  type CausalChainEntry,
  type TrainingRule,
  type TrainingCascade,
  type TrainingPattern,
  type TrainingOutcome,
  type TrainingStats,
  type PackTrainingResult,
  type PackValidationResult,
  type BrainTrainerConfig,
} from './brain-trainer';

export {
  TRAINING_LIBRARY,
  getTrainingPackById,
  getTrainingPacksByIndustry,
  getTrainingPacksByDomain,
  getTrainingPacksByTag,
  getAllTrainingPacks,
} from './training-library';
