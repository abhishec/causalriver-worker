/**
 * Orchestrator Exports
 * ====================
 *
 * Unified exports for all orchestration capabilities:
 * - Brain Commander (cognitive stack)
 * - PR Analyzer
 * - Deployment Actions
 * - Early Warning Systems (Bottleneck + Velocity)
 * - Anomaly Monitoring
 * - Cascade Alerts
 *
 * @packageDocumentation
 */

// Brain Commander
export { createBrainCommander, type BrainCommanderConfig, type CommandResult, type BrainCommanderInstance } from './brain-commander';

// PR Analysis
export { createPRAnalyzer, type PRAnalysisConfig, type PRAnalysisResult } from './pr-analyzer';

// Deployment Actions
export {
  deployToStaging,
  deployToProduction,
  rollbackDeployment,
  createFeatureBranch,
  runTestSuite,
  triggerCIBuild,
  type DeploymentConfig,
  type DeploymentPayload,
  type RollbackPayload,
  type FeatureBranchPayload,
  type TestSuitePayload,
} from './deployment-actions';

// ============================================================================
// EARLY WARNING SYSTEMS - BRAIN-INTEGRATED (RECOMMENDED FOR DESIGN PARTNERS)
// ============================================================================

/**
 * Brain-integrated early warning system (routes through 15-layer cognitive stack)
 *
 * **Use this for design partners** - shows Brain intelligence with:
 * - L3 (Causal Discovery) - Granger causality in cognitive context
 * - L5 (Curiosity) - Root cause exploration
 * - L6 (Self-Modifying) - Confidence calibration
 * - L9 (Theory of Mind) - Contributor perspective modeling
 * - L11 (Red Team) - Stress-tested predictions
 * - L14 (Goal Planning) - Intervention planning
 * - L15 (Narrative) - AI-generated executive summaries
 */
export {
  runBrainEarlyWarning,
  type BrainEarlyWarningConfig,
  type BrainEarlyWarningReport,
  type BrainBottleneckRisk,
  type BrainVelocityPrediction,
  type ContributorImpact,
  type CascadeEffect,
  type InterventionPlan,
  type InterventionPath,
  type InterventionStep,
  type RootCauseAnalysis,
  type StressTestResult,
  type Experiment,
} from './early-warning-brain-integration';

// ============================================================================
// LEGACY STANDALONE VERSIONS (For backward compatibility only)
// ============================================================================

/**
 * @deprecated Use runBrainEarlyWarning() instead for Brain-integrated analysis
 *
 * These standalone functions bypass the Brain's cognitive stack and provide
 * raw analytics only. Keep for backward compatibility but recommend migration.
 */
export {
  runEarlyWarningSystem,
  runEarlyWarningWithAlerts,
  getEarlyWarningSummary,
  type EarlyWarningConfig,
  type EarlyWarningReport,
} from './early-warning-system';

/**
 * @deprecated Use runBrainEarlyWarning() for bottleneck analysis through Brain
 *
 * Direct bottleneck detection bypasses Theory of Mind (L9) and Goal Planning (L14).
 * Use for utility functions only (e.g., calculating Gini coefficient).
 */
export {
  detectBottlenecks,
  detectAllBottlenecks,
  getBottleneckHeatmap,
  getBRSRiskLevel,
  generateBottleneckAlerts,
  calculateGiniCoefficient,
  calculateTopNConcentration,
  calculateBusFactor,
  calculateCentralityScore,
  type BottleneckMetrics,
  type BottleneckAlert,
  type BottleneckAlertEvent,
  type ConcentrationConfig,
} from './bottleneck-detector';

/**
 * @deprecated Use runBrainEarlyWarning() for velocity prediction through Brain
 *
 * Direct velocity tracking bypasses Granger causality in cognitive context,
 * curiosity-driven root cause analysis (L5), and stress testing (L11).
 * Use for utility functions only (e.g., building time series).
 */
export {
  buildVelocityTimeSeries,
  getCurrentWIP,
  predictVelocityCollapse,
  formatVelocityAlert,
  type VelocityMetrics,
  type VelocityCollapseAlert,
  type VelocityIntervention,
  type VelocityConfig,
} from './velocity-tracker';

// Anomaly Monitoring
export {
  createAnomalyMonitor,
  type AnomalyMonitorConfig,
} from './anomaly-monitor';

// Cascade Alerts
export {
  createCascadeAlertPipeline,
  type CascadeAlertPayload,
  type CascadeAlertConfig,
} from './cascade-alert-pipeline';

// Brain Agent Runtime — Full L1-L30 powered agent execution
export {
  createBrainAgentRuntime,
  type BrainAgentRuntimeConfig,
  type BrainAgentRuntimeInstance,
  type BrainAgentRequest,
  type BrainAgentResult,
} from './brain-agent-runtime';

// Brain Agent Definitions — 15 specialized brain agent types
export {
  type BrainAgentDefinition,
  ALL_BRAIN_AGENT_DEFINITIONS,
  registerAllBrainAgents,
  BRAIN_LAYER_NAMES,
} from './brain-agent-definitions';

// Brain Layer Persistence — Supabase-backed state persistence for L3-L30
// CTO Audit Fix: Gaps #2 (L3-L15 persistence) and #3 (L16-L30 persistence)
export {
  createBrainLayerPersistence,
  saveCognitiveLayerState,
  saveDeepLayerState,
  type BrainLayerPersistenceConfig,
  type BrainLayerPersistenceInstance,
  type LayerStateSnapshot,
  type CognitiveStackPersistable,
  type DeepLayersPersistable,
  LAYER_IDS,
} from './brain-layer-persistence';
