/**
 * SE-aaS Observability Metrics (BLOCKER 4 ✅)
 * ============================================
 *
 * Software Engineering as a Service specific metrics tracking.
 * Extends the base NexusMetrics with domain-specific observability
 * for code reviews, feature builds, tech debt analysis, and codebase health.
 *
 * Key Metrics:
 * - PR Analysis: Review time, risk scores, reviewer suggestions, issue detection
 * - Feature Builds: Build time, complexity, test coverage, deployment readiness
 * - Tech Debt: Debt scores, code smells, refactoring opportunities
 * - Codebase Health: Quality trends, dependency health, security vulnerabilities
 * - Prediction Accuracy: Calibration scores, outcome matching success rate
 *
 * Integration:
 * - Works with BrainCommander cognitive stack metrics
 * - Feeds into CTO Performance Tracker
 * - Powers SE-aaS Service observability dashboard
 * - Enables prediction calibration feedback loop
 *
 * @module observability/se-metrics
 */

import { getDefaultMetrics, type NexusMetrics } from './metrics';

// ============================================================================
// TYPES
// ============================================================================

export interface SEMetricsConfig {
  /** Optional custom metrics instance (defaults to singleton) */
  metrics?: NexusMetrics;
  /** Organization ID for scoping */
  organizationId?: string;
}

export interface PRAnalysisMetrics {
  /** Total PRs analyzed */
  totalPRs: number;
  /** Average analysis time (ms) */
  avgAnalysisTime: number;
  /** Risk distribution */
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  /** Average issues detected per PR */
  avgIssuesPerPR: number;
  /** Reviewer suggestion accuracy (0-1) */
  reviewerAccuracy: number;
}

export interface FeatureBuildMetrics {
  /** Total features built */
  totalFeatures: number;
  /** Average build time (ms) */
  avgBuildTime: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average test coverage (0-1) */
  avgTestCoverage: number;
  /** Deployment readiness rate (0-1) */
  deploymentReadiness: number;
}

export interface TechDebtMetrics {
  /** Total debt audits */
  totalAudits: number;
  /** Average debt score (0-100) */
  avgDebtScore: number;
  /** Code smells detected */
  codeSmellsDetected: number;
  /** Refactoring opportunities identified */
  refactoringOpportunities: number;
  /** Debt reduction rate (change per week) */
  debtReductionRate: number;
}

export interface CodebaseHealthMetrics {
  /** Quality score trend (0-100) */
  qualityScore: number;
  /** Dependency health (0-100) */
  dependencyHealth: number;
  /** Security vulnerabilities */
  securityVulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  /** Test coverage (0-1) */
  testCoverage: number;
  /** Documentation coverage (0-1) */
  documentationCoverage: number;
}

export interface PredictionAccuracyMetrics {
  /** Total predictions made */
  totalPredictions: number;
  /** Predictions with outcomes */
  predictionsWithOutcomes: number;
  /** Calibration score (0-1, 1 = perfect) */
  calibrationScore: number;
  /** Outcome matching success rate (0-1) */
  outcomeMatchRate: number;
  /** Average confidence (0-1) */
  avgConfidence: number;
}

export interface DORAMetrics {
  /** Deployment frequency (deployments per day) */
  deploymentFrequency: number;
  /** Lead time for changes (hours from commit to deploy) */
  leadTimeForChanges: number;
  /** Mean time to recovery (hours) */
  meanTimeToRecovery: number;
  /** Change failure rate (0-1) */
  changeFailureRate: number;
}

export interface SEMetricsSummary {
  timestamp: string;
  organizationId: string;
  prAnalysis: PRAnalysisMetrics;
  featureBuild: FeatureBuildMetrics;
  techDebt: TechDebtMetrics;
  codebaseHealth: CodebaseHealthMetrics;
  predictionAccuracy: PredictionAccuracyMetrics;
  dora: DORAMetrics;
}

// ============================================================================
// SE METRICS TRACKER
// ============================================================================

/**
 * SE-aaS metrics tracker
 *
 * Provides specialized tracking for Software Engineering observability:
 * - PR analysis performance and accuracy
 * - Feature build success and quality
 * - Tech debt detection and reduction
 * - Codebase health monitoring
 * - Prediction calibration feedback
 *
 * @example
 * ```typescript
 * const seMetrics = createSEMetrics({ organizationId: 'org-123' });
 *
 * // Track PR analysis
 * seMetrics.recordPRAnalysis({
 *   analysisTimeMs: 1200,
 *   riskLevel: 'medium',
 *   issuesDetected: 3,
 *   reviewersSuggested: 2,
 * });
 *
 * // Track feature build
 * seMetrics.recordFeatureBuild({
 *   buildTimeMs: 45000,
 *   success: true,
 *   testCoverage: 0.85,
 *   deploymentReady: true,
 * });
 *
 * // Track prediction outcome
 * seMetrics.recordPredictionOutcome({
 *   predictionId: 'pr_123_risk',
 *   predictedRisk: 'high',
 *   actualRisk: 'high',
 *   confidence: 0.92,
 * });
 *
 * // Get summary
 * const summary = seMetrics.getSummary();
 * console.log(summary.prAnalysis.avgAnalysisTime); // 1200
 * ```
 */
export function createSEMetrics(config: SEMetricsConfig = {}) {
  const metrics = config.metrics || getDefaultMetrics();
  const orgId = config.organizationId || 'default';

  // Labels for scoping metrics to organization
  const orgLabels = { org: orgId };

  return {
    // ── PR Analysis Metrics ──────────────────────────────────────────────

    /**
     * Record PR analysis completion
     */
    recordPRAnalysis(params: {
      analysisTimeMs: number;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      issuesDetected: number;
      reviewersSuggested: number;
    }) {
      const { analysisTimeMs, riskLevel, issuesDetected, reviewersSuggested } = params;

      // Count total PRs analyzed
      metrics.increment('seaas.pr.analyzed', 1, orgLabels);

      // Track analysis time
      metrics.observe('seaas.pr.analysis_time_ms', analysisTimeMs, orgLabels);

      // Track risk distribution
      metrics.increment('seaas.pr.risk_distribution', 1, {
        ...orgLabels,
        risk: riskLevel,
      });

      // Track issues detected
      metrics.observe('seaas.pr.issues_detected', issuesDetected, orgLabels);

      // Track reviewers suggested
      metrics.observe('seaas.pr.reviewers_suggested', reviewersSuggested, orgLabels);
    },

    /**
     * Record reviewer suggestion accuracy (when PR is actually reviewed)
     */
    recordReviewerAccuracy(params: { suggested: string[]; actual: string[] }) {
      const { suggested, actual } = params;

      // Calculate precision: how many suggested reviewers actually reviewed
      const correctSuggestions = suggested.filter(s => actual.includes(s)).length;
      const precision = suggested.length > 0 ? correctSuggestions / suggested.length : 0;

      metrics.observe('seaas.pr.reviewer_precision', precision, orgLabels);
    },

    // ── Feature Build Metrics ────────────────────────────────────────────

    /**
     * Record feature build attempt
     */
    recordFeatureBuild(params: {
      buildTimeMs: number;
      success: boolean;
      testCoverage?: number;
      deploymentReady?: boolean;
    }) {
      const { buildTimeMs, success, testCoverage, deploymentReady } = params;

      // Count total builds
      metrics.increment('seaas.feature.builds_total', 1, orgLabels);

      // Count successes/failures
      if (success) {
        metrics.increment('seaas.feature.builds_success', 1, orgLabels);
      } else {
        metrics.increment('seaas.feature.builds_failed', 1, orgLabels);
      }

      // Track build time
      metrics.observe('seaas.feature.build_time_ms', buildTimeMs, orgLabels);

      // Track test coverage if available
      if (testCoverage !== undefined) {
        metrics.observe('seaas.feature.test_coverage', testCoverage, orgLabels);
      }

      // Track deployment readiness
      if (deploymentReady !== undefined) {
        metrics.increment(
          deploymentReady ? 'seaas.feature.deployment_ready' : 'seaas.feature.deployment_blocked',
          1,
          orgLabels
        );
      }
    },

    // ── Tech Debt Metrics ────────────────────────────────────────────────

    /**
     * Record tech debt audit
     */
    recordTechDebtAudit(params: {
      debtScore: number; // 0-100
      codeSmells: number;
      refactoringOpportunities: number;
    }) {
      const { debtScore, codeSmells, refactoringOpportunities } = params;

      // Count audits
      metrics.increment('seaas.techdebt.audits_total', 1, orgLabels);

      // Track debt score
      metrics.observe('seaas.techdebt.score', debtScore, orgLabels);

      // Track code smells
      metrics.observe('seaas.techdebt.code_smells', codeSmells, orgLabels);

      // Track refactoring opportunities
      metrics.observe('seaas.techdebt.refactoring_opportunities', refactoringOpportunities, orgLabels);
    },

    /**
     * Record debt reduction (when refactoring is completed)
     */
    recordDebtReduction(params: { previousScore: number; newScore: number }) {
      const { previousScore, newScore } = params;
      const reduction = previousScore - newScore;

      metrics.observe('seaas.techdebt.reduction', reduction, orgLabels);
    },

    // ── Codebase Health Metrics ──────────────────────────────────────────

    /**
     * Record codebase health snapshot
     */
    recordCodebaseHealth(params: {
      qualityScore: number; // 0-100
      dependencyHealth: number; // 0-100
      testCoverage: number; // 0-1
      documentationCoverage: number; // 0-1
      vulnerabilities: {
        critical: number;
        high: number;
        medium: number;
        low: number;
      };
    }) {
      const { qualityScore, dependencyHealth, testCoverage, documentationCoverage, vulnerabilities } = params;

      // Set quality gauges (point-in-time values)
      metrics.gauge('seaas.codebase.quality_score', qualityScore, orgLabels);
      metrics.gauge('seaas.codebase.dependency_health', dependencyHealth, orgLabels);
      metrics.gauge('seaas.codebase.test_coverage', testCoverage, orgLabels);
      metrics.gauge('seaas.codebase.documentation_coverage', documentationCoverage, orgLabels);

      // Record vulnerabilities
      metrics.gauge('seaas.codebase.vulnerabilities_critical', vulnerabilities.critical, orgLabels);
      metrics.gauge('seaas.codebase.vulnerabilities_high', vulnerabilities.high, orgLabels);
      metrics.gauge('seaas.codebase.vulnerabilities_medium', vulnerabilities.medium, orgLabels);
      metrics.gauge('seaas.codebase.vulnerabilities_low', vulnerabilities.low, orgLabels);
    },

    // ── Prediction Accuracy Metrics ──────────────────────────────────────

    /**
     * Record prediction made
     */
    recordPrediction(params: { predictionId: string; confidence: number }) {
      const { confidence } = params;

      // Count predictions
      metrics.increment('seaas.predictions.total', 1, orgLabels);

      // Track confidence
      metrics.observe('seaas.predictions.confidence', confidence, orgLabels);
    },

    /**
     * Record prediction outcome (for calibration feedback loop)
     */
    recordPredictionOutcome(params: {
      predictionId: string;
      predictedValue: number | string;
      actualValue: number | string;
      confidence: number;
      correct: boolean;
    }) {
      const { correct, confidence } = params;

      // Count outcomes recorded
      metrics.increment('seaas.predictions.outcomes_recorded', 1, orgLabels);

      // Track accuracy
      if (correct) {
        metrics.increment('seaas.predictions.correct', 1, orgLabels);
      } else {
        metrics.increment('seaas.predictions.incorrect', 1, orgLabels);
      }

      // Track calibration (confidence vs accuracy)
      const calibrationError = Math.abs(confidence - (correct ? 1 : 0));
      metrics.observe('seaas.predictions.calibration_error', calibrationError, orgLabels);
    },

    // ── DORA Metrics ─────────────────────────────────────────────────────

    /**
     * Record deployment (for deployment frequency)
     */
    recordDeployment(params: { environment: 'staging' | 'production'; success: boolean }) {
      const { environment, success } = params;

      // Count deployments
      metrics.increment('seaas.dora.deployments_total', 1, { ...orgLabels, environment });

      if (success) {
        metrics.increment('seaas.dora.deployments_success', 1, { ...orgLabels, environment });
      } else {
        metrics.increment('seaas.dora.deployments_failed', 1, { ...orgLabels, environment });
      }
    },

    /**
     * Record lead time for changes (commit to deploy)
     */
    recordLeadTime(params: { leadTimeHours: number; environment: 'staging' | 'production' }) {
      const { leadTimeHours, environment } = params;
      metrics.observe('seaas.dora.lead_time_hours', leadTimeHours, { ...orgLabels, environment });
    },

    /**
     * Record incident recovery (for MTTR)
     */
    recordIncidentRecovery(params: { recoveryTimeHours: number; severity: string }) {
      const { recoveryTimeHours, severity } = params;
      metrics.observe('seaas.dora.recovery_time_hours', recoveryTimeHours, {
        ...orgLabels,
        severity,
      });
    },

    // ── Summary & Aggregation ────────────────────────────────────────────

    /**
     * Get comprehensive SE metrics summary
     */
    getSummary(): SEMetricsSummary {
      // PR Analysis
      const prTotal = metrics.getCounter('seaas.pr.analyzed', orgLabels);
      const prAnalysisTime = metrics.getHistogram('seaas.pr.analysis_time_ms', orgLabels);
      const prIssues = metrics.getHistogram('seaas.pr.issues_detected', orgLabels);
      const reviewerPrecision = metrics.getHistogram('seaas.pr.reviewer_precision', orgLabels);

      const riskLow = metrics.getCounter('seaas.pr.risk_distribution', { ...orgLabels, risk: 'low' });
      const riskMedium = metrics.getCounter('seaas.pr.risk_distribution', { ...orgLabels, risk: 'medium' });
      const riskHigh = metrics.getCounter('seaas.pr.risk_distribution', { ...orgLabels, risk: 'high' });
      const riskCritical = metrics.getCounter('seaas.pr.risk_distribution', { ...orgLabels, risk: 'critical' });

      // Feature Build
      const buildTotal = metrics.getCounter('seaas.feature.builds_total', orgLabels);
      const buildSuccess = metrics.getCounter('seaas.feature.builds_success', orgLabels);
      const buildTime = metrics.getHistogram('seaas.feature.build_time_ms', orgLabels);
      const testCoverage = metrics.getHistogram('seaas.feature.test_coverage', orgLabels);
      const deploymentReady = metrics.getCounter('seaas.feature.deployment_ready', orgLabels);

      // Tech Debt
      const debtAudits = metrics.getCounter('seaas.techdebt.audits_total', orgLabels);
      const debtScore = metrics.getHistogram('seaas.techdebt.score', orgLabels);
      const codeSmells = metrics.getHistogram('seaas.techdebt.code_smells', orgLabels);
      const refactoringOps = metrics.getHistogram('seaas.techdebt.refactoring_opportunities', orgLabels);
      const debtReduction = metrics.getHistogram('seaas.techdebt.reduction', orgLabels);

      // Codebase Health
      const qualityScore = metrics.getGauge('seaas.codebase.quality_score', orgLabels);
      const dependencyHealth = metrics.getGauge('seaas.codebase.dependency_health', orgLabels);
      const codebaseTestCoverage = metrics.getGauge('seaas.codebase.test_coverage', orgLabels);
      const docCoverage = metrics.getGauge('seaas.codebase.documentation_coverage', orgLabels);
      const vulnCritical = metrics.getGauge('seaas.codebase.vulnerabilities_critical', orgLabels);
      const vulnHigh = metrics.getGauge('seaas.codebase.vulnerabilities_high', orgLabels);
      const vulnMedium = metrics.getGauge('seaas.codebase.vulnerabilities_medium', orgLabels);
      const vulnLow = metrics.getGauge('seaas.codebase.vulnerabilities_low', orgLabels);

      // Predictions
      const predTotal = metrics.getCounter('seaas.predictions.total', orgLabels);
      const predOutcomes = metrics.getCounter('seaas.predictions.outcomes_recorded', orgLabels);
      const predCorrect = metrics.getCounter('seaas.predictions.correct', orgLabels);
      const predConfidence = metrics.getHistogram('seaas.predictions.confidence', orgLabels);
      const calibrationError = metrics.getHistogram('seaas.predictions.calibration_error', orgLabels);

      return {
        timestamp: new Date().toISOString(),
        organizationId: orgId,
        prAnalysis: {
          totalPRs: prTotal,
          avgAnalysisTime: prAnalysisTime?.avg || 0,
          riskDistribution: {
            low: riskLow,
            medium: riskMedium,
            high: riskHigh,
            critical: riskCritical,
          },
          avgIssuesPerPR: prIssues?.avg || 0,
          reviewerAccuracy: reviewerPrecision?.avg || 0,
        },
        featureBuild: {
          totalFeatures: buildTotal,
          avgBuildTime: buildTime?.avg || 0,
          successRate: buildTotal > 0 ? buildSuccess / buildTotal : 0,
          avgTestCoverage: testCoverage?.avg || 0,
          deploymentReadiness: buildTotal > 0 ? deploymentReady / buildTotal : 0,
        },
        techDebt: {
          totalAudits: debtAudits,
          avgDebtScore: debtScore?.avg || 0,
          codeSmellsDetected: codeSmells?.sum || 0,
          refactoringOpportunities: refactoringOps?.sum || 0,
          debtReductionRate: debtReduction?.avg || 0,
        },
        codebaseHealth: {
          qualityScore,
          dependencyHealth,
          securityVulnerabilities: {
            critical: vulnCritical,
            high: vulnHigh,
            medium: vulnMedium,
            low: vulnLow,
          },
          testCoverage: codebaseTestCoverage,
          documentationCoverage: docCoverage,
        },
        predictionAccuracy: {
          totalPredictions: predTotal,
          predictionsWithOutcomes: predOutcomes,
          calibrationScore: calibrationError ? 1 - calibrationError.avg : 0,
          outcomeMatchRate: predOutcomes > 0 ? predCorrect / predOutcomes : 0,
          avgConfidence: predConfidence?.avg || 0,
        },
        dora: {
          // Deployment Frequency (deployments per day)
          deploymentFrequency: (() => {
            const prodDeployments = metrics.getCounter('seaas.dora.deployments_total', {
              ...orgLabels,
              environment: 'production',
            });
            // Assuming metrics started today, calculate per-day rate
            // Return raw count (per-day rate requires tracking metrics start time — deferred to metrics v2)
            return prodDeployments;
          })(),
          // Lead Time for Changes (avg hours from commit to deploy)
          leadTimeForChanges: (() => {
            const leadTime = metrics.getHistogram('seaas.dora.lead_time_hours', {
              ...orgLabels,
              environment: 'production',
            });
            return leadTime?.avg || 0;
          })(),
          // Mean Time To Recovery (avg hours to recover from incidents)
          meanTimeToRecovery: (() => {
            const mttr = metrics.getHistogram('seaas.dora.recovery_time_hours', orgLabels);
            return mttr?.avg || 0;
          })(),
          // Change Failure Rate (failed deployments / total deployments)
          changeFailureRate: (() => {
            const totalDeployments = metrics.getCounter('seaas.dora.deployments_total', {
              ...orgLabels,
              environment: 'production',
            });
            const failedDeployments = metrics.getCounter('seaas.dora.deployments_failed', {
              ...orgLabels,
              environment: 'production',
            });
            return totalDeployments > 0 ? failedDeployments / totalDeployments : 0;
          })(),
        },
      };
    },

    /**
     * Get underlying metrics instance
     */
    getMetrics(): NexusMetrics {
      return metrics;
    },
  };
}

// ============================================================================
// SINGLETON
// ============================================================================

let _defaultSEMetrics: ReturnType<typeof createSEMetrics> | null = null;

/**
 * Get or create the default SE metrics singleton
 */
export function getDefaultSEMetrics(): ReturnType<typeof createSEMetrics> {
  if (!_defaultSEMetrics) {
    _defaultSEMetrics = createSEMetrics();
  }
  return _defaultSEMetrics;
}
