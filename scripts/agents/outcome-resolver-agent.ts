/**
 * Outcome Resolver Agent — Calibration Loop Closure
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Brain Region: **Cerebellum** (Error Detection & Correction)
 * Neurological Function: Compares predictions to actual outcomes, updates
 * calibration metrics, and triggers recalibration when accuracy degrades.
 *
 * This agent CLOSES THE CALIBRATION LOOP by:
 * 1. Querying pending predictions from prediction_tracker table
 * 2. Fetching actual outcomes from the brain (signals, patterns, metrics)
 * 3. Calling calibrationLoop.recordOutcome() to match predictions to reality
 * 4. Computing Brier scores, ECE, and calibration curves
 * 5. Triggering recalibration when domain/action accuracy drops below threshold
 *
 * Without this agent, predictions are recorded but never resolved, making
 * calibration metrics meaningless (Brier score = 1.0, no learning).
 *
 * Schedule: Daily at 3 AM (after consolidation, before morning reports)
 *
 * @packageDocumentation
 */

import {
  ManusNativeAgent,
  type ManusCapabilitiesConfig,
} from '../agent-framework/brain-native-agent-v5-manus';
import type { BrainNativeAgentConfig } from '../agent-framework/brain-native-agent-template';
import type {
  FetchResult,
  ConvertResult,
  TrainResult,
} from '../agent-framework/base-training-agent';
import type { MotorCommand } from '../../packages/memory-stack/src/orchestrator/motor-command-engine';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';
import { createCalibrationFeedbackLoop } from '../../packages/memory-stack/src/orchestrator/calibration-feedback-loop';

// ============================================================================
// TYPES
// ============================================================================

interface PendingPrediction {
  predictionId: string;
  domain: string;
  actionType: string;
  prediction: string;
  confidence: number;
  reviewDate: string;
  createdAt: string;
  metadata: any;
}

interface OutcomeResolutionResult {
  totalPending: number;
  resolved: number;
  correct: number;
  incorrect: number;
  domainsRecalibrated: string[];
  averageBrierScore: number;
}

// ============================================================================
// OUTCOME RESOLVER AGENT
// ============================================================================

class OutcomeResolverAgent extends ManusNativeAgent {
  readonly name = 'outcome-resolver';
  readonly version = '7.0.0';
  readonly description = 'Calibration loop closure — matches predictions to outcomes, computes accuracy metrics';
  readonly brainRegion = 'Cerebellum';
  readonly neurologicalFunction = 'Error detection — compares predicted vs actual, triggers recalibration';

  constructor(config: BrainNativeAgentConfig & ManusCapabilitiesConfig) {
    super({
      ...config,
      enableMotorCommands: true,
      enableCalibration: true,
      enableAgentRegistry: true,
      motorCommandAutoExecuteThreshold: 0.9,
    });
  }

  private resolutionResult?: OutcomeResolutionResult;

  // ──────────────────────────────────────────────────────────────────────────
  // FETCH: Get pending predictions that need outcome resolution
  // ──────────────────────────────────────────────────────────────────────────
  async fetch(): Promise<FetchResult> {
    this.divider('OUTCOME RESOLUTION');
    this.log('Fetching pending predictions for resolution...');

    // Query predictions that are past their review date
    const now = new Date().toISOString();
    const { data: predictions, error } = await this.supabase
      .from('prediction_tracker')
      .select('*')
      .eq('organization_id', this.organizationId)
      .eq('resolved', false)
      .lte('review_date', now)
      .order('created_at', { ascending: true })
      .limit(100); // Process up to 100 predictions per run

    if (error) {
      this.errors.push(`Failed to fetch pending predictions: ${error.message}`);
      return { data: [], sources: ['prediction_tracker'], recordCount: 0 };
    }

    const pendingPredictions = (predictions || []) as PendingPrediction[];
    this.log(`Found ${pendingPredictions.length} pending prediction(s) for resolution`);

    return {
      data: pendingPredictions,
      sources: ['prediction_tracker'],
      recordCount: pendingPredictions.length,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CONVERT: Match predictions to actual outcomes
  // ──────────────────────────────────────────────────────────────────────────
  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    const pendingPredictions = fetchResult.data as PendingPrediction[];
    const signals: ConnectorSignal[] = [];
    const packs: TrainingPack[] = [];

    if (pendingPredictions.length === 0) {
      this.log('No predictions to resolve');
      return { signals, packs };
    }

    // Create calibration loop instance
    const calibrationLoop = createCalibrationFeedbackLoop({
      supabase: this.supabase,
      organizationId: this.organizationId,
      lookbackDays: 30,
      verbose: true,
    });

    let resolved = 0;
    let correct = 0;
    let incorrect = 0;
    const brierScores: number[] = [];

    for (const pred of pendingPredictions) {
      try {
        // Fetch actual outcome for this prediction
        const actualOutcome = await this.fetchActualOutcome(pred);

        if (actualOutcome !== null) {
          // Record the outcome
          calibrationLoop.recordOutcome({
            predictionId: pred.predictionId,
            actuallyHappened: actualOutcome,
            confidence: pred.confidence,
            notes: `Auto-resolved by outcome-resolver-agent`,
          });

          // Compute Brier score for this prediction
          const brierScore = actualOutcome
            ? Math.pow(1 - pred.confidence, 2)
            : Math.pow(pred.confidence, 2);
          brierScores.push(brierScore);

          // Update prediction as resolved in database
          await this.supabase
            .from('prediction_tracker')
            .update({
              resolved: true,
              actual_outcome: actualOutcome,
              brier_score: brierScore,
              resolved_at: new Date().toISOString(),
            })
            .eq('id', pred.predictionId);

          resolved++;
          if (actualOutcome) correct++;
          else incorrect++;

          this.log(`Resolved prediction ${pred.predictionId}: ${actualOutcome ? 'CORRECT' : 'INCORRECT'} (Brier: ${brierScore.toFixed(3)})`);
        }
      } catch (err) {
        this.logError(`Failed to resolve prediction ${pred.predictionId}`, err);
      }
    }

    const averageBrierScore = brierScores.length > 0
      ? brierScores.reduce((sum, s) => sum + s, 0) / brierScores.length
      : 1.0;

    // Store results for motor command generation
    this.resolutionResult = {
      totalPending: pendingPredictions.length,
      resolved,
      correct,
      incorrect,
      domainsRecalibrated: [],
      averageBrierScore,
    };

    // Emit a system signal about calibration health
    signals.push({
      organization_id: this.organizationId,
      source_domain: 'system',
      signal_type: 'calibration_resolution',
      signal_value: averageBrierScore,
      entity_type: 'organization',
      entity_id: this.organizationId,
      metadata: {
        resolved,
        correct,
        incorrect,
        accuracy: resolved > 0 ? correct / resolved : 0,
        averageBrierScore,
        timestamp: new Date().toISOString(),
      },
    });

    return { signals, packs };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TRAIN: Trigger recalibration for domains with low accuracy
  // ──────────────────────────────────────────────────────────────────────────
  async train(signals: ConnectorSignal[], packs: TrainingPack[]): Promise<TrainResult> {
    const baseResult = await super.train(signals, packs);

    if (!this.resolutionResult || this.resolutionResult.resolved === 0) {
      return baseResult;
    }

    // Create calibration loop instance
    const calibrationLoop = createCalibrationFeedbackLoop({
      supabase: this.supabase,
      organizationId: this.organizationId,
      lookbackDays: 30,
      verbose: true,
    });

    // Check accuracy by domain and recalibrate if needed
    const { data: domainAccuracy } = await this.supabase
      .from('prediction_tracker')
      .select('domain, actual_outcome')
      .eq('organization_id', this.organizationId)
      .eq('resolved', true)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (domainAccuracy && domainAccuracy.length > 0) {
      const domainStats = new Map<string, { correct: number; total: number }>();

      for (const row of domainAccuracy) {
        const stats = domainStats.get(row.domain) || { correct: 0, total: 0 };
        stats.total++;
        if (row.actual_outcome) stats.correct++;
        domainStats.set(row.domain, stats);
      }

      // Recalibrate domains with accuracy < 70%
      for (const [domain, stats] of domainStats.entries()) {
        const accuracy = stats.correct / stats.total;
        if (accuracy < 0.7 && stats.total >= 5) {
          this.log(`⚠️  Domain "${domain}" accuracy is low (${(accuracy * 100).toFixed(1)}%), recalibrating...`);

          try {
            await calibrationLoop.recalibrate({
              domain,
              targetAccuracy: 0.8,
              adjustmentFactor: 0.9,
            });
            this.resolutionResult.domainsRecalibrated.push(domain);
          } catch (err) {
            this.logError(`Recalibration failed for domain ${domain}`, err);
          }
        }
      }
    }

    return baseResult;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MOTOR COMMANDS: Notify about calibration health
  // ──────────────────────────────────────────────────────────────────────────
  protected async generateMotorCommands(trainResult: TrainResult): Promise<MotorCommand[]> {
    const commands: MotorCommand[] = [];

    if (!this.resolutionResult || this.resolutionResult.resolved === 0) {
      return commands;
    }

    const { resolved, correct, incorrect, averageBrierScore, domainsRecalibrated } = this.resolutionResult;
    const accuracy = resolved > 0 ? (correct / resolved * 100).toFixed(1) : '0.0';

    // Send Slack notification if configured
    if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID) {
      const emoji = averageBrierScore < 0.3 ? '✅' : averageBrierScore < 0.5 ? '⚠️' : '❌';
      const message = `${emoji} Calibration Loop Closure: Resolved ${resolved} predictions
• Accuracy: ${accuracy}% (${correct}✓ / ${incorrect}✗)
• Avg Brier Score: ${averageBrierScore.toFixed(3)} ${averageBrierScore < 0.3 ? '(Excellent)' : averageBrierScore < 0.5 ? '(Good)' : '(Needs Improvement)'}
${domainsRecalibrated.length > 0 ? `• Recalibrated: ${domainsRecalibrated.join(', ')}` : ''}`;

      commands.push({
        commandId: `outcome-resolution-${Date.now()}`,
        organizationId: this.organizationId,
        actionType: 'slack_send_message',
        target: process.env.SLACK_CHANNEL_ID,
        payload: { text: message },
        priority: averageBrierScore > 0.5 ? 'high' : 'normal',
        requiresApproval: false,
        createdAt: new Date(),
      });
    }

    return commands;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HELPER: Fetch actual outcome for a prediction
  // ──────────────────────────────────────────────────────────────────────────
  private async fetchActualOutcome(prediction: PendingPrediction): Promise<boolean | null> {
    // This method checks if the prediction came true by querying relevant brain data
    // Implementation depends on prediction type and domain

    const { domain, prediction: predictionText, metadata } = prediction;

    // Example: For "revenue will increase" predictions, check actual revenue signals
    if (predictionText.toLowerCase().includes('revenue') || predictionText.toLowerCase().includes('increase')) {
      const { data: signals } = await this.supabase
        .from('cross_domain_signals')
        .select('signal_value')
        .eq('organization_id', this.organizationId)
        .eq('source_domain', domain)
        .ilike('signal_type', '%revenue%')
        .gte('created_at', prediction.reviewDate)
        .order('created_at', { ascending: false })
        .limit(1);

      if (signals && signals.length > 0) {
        // Compare to baseline from metadata
        const baseline = metadata?.baseline || 0;
        return signals[0].signal_value > baseline;
      }
    }

    // Example: For "pattern will emerge" predictions, check if pattern was discovered
    if (predictionText.toLowerCase().includes('pattern')) {
      const { data: patterns } = await this.supabase
        .from('ai_memory')
        .select('id')
        .eq('organization_id', this.organizationId)
        .eq('domain', domain)
        .gte('created_at', prediction.reviewDate)
        .limit(1);

      return patterns && patterns.length > 0;
    }

    // Default: Cannot determine outcome, return null (will skip resolution)
    return null;
  }
}

// ============================================================================
// SELF-REGISTRATION
// ============================================================================

import { globalRegistry } from '../agent-framework/agent-registry';

globalRegistry.register({
  name: 'outcome-resolver',
  description: 'Calibration loop closure — matches predictions to outcomes, triggers recalibration',
  version: '7.0.0',
  factory: (config) => {
    return new OutcomeResolverAgent(config) as any;
  },
  schedule: '30 3 * * *',  // Daily at 3:30 AM (staggered from cost-agent at 3:00 AM)
  resourceRequirements: { cpu: '512', memory: '2048' },
  tags: ['calibration', 'cerebellum', 'outcome-resolution', 'feedback-loop'],
});
