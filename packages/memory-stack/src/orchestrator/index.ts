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

// Early Warning Systems
export {
  runEarlyWarningSystem,
  runEarlyWarningWithAlerts,
  getEarlyWarningSummary,
  type EarlyWarningConfig,
  type EarlyWarningReport,
} from './early-warning-system';

// Bottleneck Detection
export {
  detectBottlenecks,
  detectAllBottlenecks,
  getBottleneckHeatmap,
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

// Velocity Tracking & Prediction
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
