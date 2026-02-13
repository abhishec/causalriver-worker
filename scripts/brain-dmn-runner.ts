/**
 * NexusBrain DMN Runner — "Default Mode Network" Agent
 *
 * A standalone agent that runs on your laptop and performs periodic
 * background insight scanning — the equivalent of the brain's default
 * mode network that makes connections when you're not actively thinking.
 *
 * Unlike the consolidation engine (nightly, deep), the DMN runs every
 * 2-4 hours and does lightweight scanning for surprising patterns:
 *   1. Unexpected cross-domain correlations
 *   2. Emerging cascade patterns (before they complete)
 *   3. What-changed analysis between consolidation cycles
 *   4. Knowledge gap detection (disconnected domains, fading edges)
 *
 * Modes:
 *   - once: Run a single DMN scan and exit
 *   - interval: Run every N hours continuously
 *
 * Usage:
 *   # One-time DMN scan
 *   pnpm exec tsx scripts/brain-dmn-runner.ts
 *
 *   # Run every 4 hours (default)
 *   DMN_MODE=interval pnpm exec tsx scripts/brain-dmn-runner.ts
 *
 *   # Run every 2 hours
 *   DMN_MODE=interval DMN_INTERVAL_HOURS=2 pnpm exec tsx scripts/brain-dmn-runner.ts
 *
 *   # With Slack notifications
 *   SLACK_WEBHOOK_URL=https://hooks.slack.com/... pnpm exec tsx scripts/brain-dmn-runner.ts
 *
 *   # Specific org
 *   ORGANIZATION_ID=your-org-id pnpm exec tsx scripts/brain-dmn-runner.ts
 *
 *   # Verbose output
 *   VERBOSE=true pnpm exec tsx scripts/brain-dmn-runner.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env from project root
function loadEnv(): void {
  try {
    const envPath = resolve(import.meta.dirname || __dirname, '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env file not found — rely on environment variables
  }
}
loadEnv();

// ── NexusBrain Imports ──
import {
  createBackgroundInsightEngine,
  type DMNScanResult,
  type ProactiveInsight,
} from '../packages/memory-stack/src/orchestrator/background-insight-engine';

import {
  createImpactScorer,
  type ScorableEvent,
} from '../packages/memory-stack/src/orchestrator/impact-scorer';

import {
  createActiveExplorer,
} from '../packages/memory-stack/src/orchestrator/active-explorer';

import {
  createWhatIfSimulator,
} from '../packages/memory-stack/src/orchestrator/whatif-simulator';

import {
  createAttentionManager,
} from '../packages/memory-stack/src/orchestrator/attention-manager';

// Region #10: Insula (Anomaly Monitor) — detects anomalies during DMN scans
import { createAnomalyMonitor } from '../packages/memory-stack/src/orchestrator/anomaly-monitor';
import { createEventBus, generateEventId } from '../packages/memory-stack/src/causality/event-bus';
// Region #10b: Thalamus (Cascade Alert Pipeline) — predicts cascade propagation paths
import {
  createCascadeAlertPipeline,
  type CascadeAlertPayload,
} from '../packages/memory-stack/src/orchestrator/cascade-alert-pipeline';
import type { CachedRelationship } from '../packages/memory-stack/src/bridges/patterns-to-agents';
// Prediction Recording — closes the learning feedback loop
import { recordPrediction } from '../packages/memory-stack/src/learning/prediction-tracker';
// Region #11: Working Memory (Context Manager) — enriches insights with org context
import { createContextManager } from '../packages/memory-stack/src/orchestrator/context-manager';
// LLM Brain Amplifier — Claude as semantic judgment layer
import { createBrainAmplifier } from '../packages/memory-stack/src/orchestrator/llm-brain-amplifier';
// Cost Tracker — centralized LLM cost logging
import { createCostTracker } from '../packages/memory-stack/src/persistence/cost-tracker';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

// Which org to scan
const ORGANIZATION_ID = process.env.ORGANIZATION_ID || CORE_BRAIN_ORG_ID;
const SCAN_ALL_ORGS = process.env.SCAN_ALL_ORGS === 'true';

// Running mode
const DMN_MODE = (process.env.DMN_MODE || 'once') as 'once' | 'interval';
const DMN_INTERVAL_HOURS = parseInt(process.env.DMN_INTERVAL_HOURS || '4', 10);

// Insight thresholds
const MIN_SURPRISE_SCORE = parseFloat(process.env.MIN_SURPRISE_SCORE || '0.5');
const MAX_INSIGHTS_PER_SCAN = parseInt(process.env.MAX_INSIGHTS_PER_SCAN || '10', 10);

// Notification
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';

// Verbose
const VERBOSE = process.env.VERBOSE === 'true';

// Module-level cost tracker — initialized in main(), used by scanOrg()
let costTracker: ReturnType<typeof createCostTracker> | undefined;

// LLM Brain Amplifier config (optional — graceful degradation if no key)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const LLM_PROVIDER = (process.env.LLM_PROVIDER || (ANTHROPIC_API_KEY ? 'anthropic' : 'openai')) as 'anthropic' | 'openai';
const LLM_API_KEY = LLM_PROVIDER === 'anthropic' ? ANTHROPIC_API_KEY : OPENAI_API_KEY;

// ============================================================================
// LOGGING
// ============================================================================

function log(stage: string, message: string): void {
  const time = new Date().toISOString().substring(11, 19);
  console.log(`[${time}] [${stage}] ${message}`);
}

function logError(stage: string, message: string, err?: unknown): void {
  const time = new Date().toISOString().substring(11, 19);
  console.error(`[${time}] [${stage}] ERROR: ${message}`);
  if (err instanceof Error) console.error(`  ${err.message}`);
}

function divider(title: string): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}\n`);
}

// ============================================================================
// SLACK NOTIFICATION
// ============================================================================

async function sendSlackInsight(insight: ProactiveInsight): Promise<void> {
  if (!SLACK_WEBHOOK_URL) return;

  const emoji = {
    unexpected_correlation: '🔗',
    emerging_cascade: '⚡',
    what_changed: '📊',
    knowledge_gap: '🔍',
    prediction_opportunity: '🎯',
  }[insight.type] || '💡';

  const importancePct = (insight.importance * 100).toFixed(0);
  const payload = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${emoji} NexusBrain Insight`, emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${insight.title}*\n\n${insight.explanation}\n\n_Importance: ${importancePct}% | Domains: ${insight.domains.join(', ')}_`,
        },
      },
    ],
  };

  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Non-critical — insight is still persisted
  }
}

// ============================================================================
// DMN SCAN ORCHESTRATION
// ============================================================================

async function scanOrg(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<DMNScanResult> {
  const isCore = orgId === CORE_BRAIN_ORG_ID;
  const label = isCore ? 'Core Brain' : `Org ${orgId.substring(0, 8)}...`;

  log('DMN', `Scanning: ${label}`);

  const engine = createBackgroundInsightEngine({
    supabase,
    organizationId: orgId,
    minSurpriseScore: MIN_SURPRISE_SCORE,
    maxInsightsPerScan: MAX_INSIGHTS_PER_SCAN,
    onInsight: SLACK_WEBHOOK_URL ? sendSlackInsight : undefined,
    verbose: VERBOSE,
  });

  const result = await engine.scan();

  // Lift scoring variables to function scope so Phase 4 (Thalamus) can use them
  let scorableEvents: ScorableEvent[] = [];
  let impactResult: { scores: any[]; alerts: any[] } = { scores: [], alerts: [] };

  // ── Phase 3 WIRING: Score insights through impact scorer (Amygdala) ──
  if (result.insights.length > 0) {
    const scorer = createImpactScorer({
      supabase,
      organizationId: orgId,
      verbose: VERBOSE,
    });

    scorableEvents = result.insights.map(insight => ({
      id: insight.id,
      type: 'insight' as const,
      domains: insight.domains,
      title: insight.title,
      description: insight.explanation,
      rawSeverity: insight.importance,
      source: 'dmn_engine',
      timestamp: insight.discoveredAt,
    }));

    impactResult = await scorer.scoreBatch(scorableEvents);

    console.log(`\n  ${label} — ${result.insights.length} insight${result.insights.length !== 1 ? 's' : ''} (${impactResult.alerts.length} actionable):`);
    for (let i = 0; i < result.insights.length; i++) {
      const insight = result.insights[i];
      const score = impactResult.scores.find((s: any) => s.eventId === insight.id);
      const emoji = {
        unexpected_correlation: '🔗',
        emerging_cascade: '⚡',
        what_changed: '📊',
        knowledge_gap: '🔍',
        prediction_opportunity: '🎯',
      }[insight.type] || '💡';
      const impactPct = score ? `${score.compositeScore}/100` : '?';
      const tier = score?.alertTier ? ` [${score.alertTier.toUpperCase()}]` : '';
      console.log(`    ${emoji} [impact: ${impactPct}]${tier} ${insight.title}`);
    }
  } else {
    console.log(`  ${label} — No new insights (brain is up to date)`);
  }

  // ── Phase 4 WIRING: Attention Manager (Thalamus) — route scored insights ──
  if (result.insights.length > 0 && impactResult.scores.length > 0) {
    try {
      const attention = createAttentionManager({
        supabase,
        organizationId: orgId,
        maxAlertsPerDay: 20,
        verbose: VERBOSE,
      });

      let immediateCount = 0;
      let batchedCount = 0;
      for (let i = 0; i < result.insights.length; i++) {
        const insight = result.insights[i];
        const score = impactResult.scores.find((s: any) => s.eventId === insight.id);
        if (score) {
          const decision = await attention.process(scorableEvents[i], score);
          if (decision.delivery === 'immediate') immediateCount++;
          if (decision.delivery === 'batch') batchedCount++;
        }
      }
      if (immediateCount > 0 || batchedCount > 0) {
        console.log(`    Thalamus: ${immediateCount} immediate, ${batchedCount} batched for digest`);
      }
    } catch (err: any) {
      log('DMN', `Attention routing failed: ${err.message}`);
    }
  }

  // ── Phase 5 WIRING: Active exploration — ask for food ──
  try {
    const explorer = createActiveExplorer({
      supabase,
      organizationId: orgId,
      maxRequests: 5,
      verbose: VERBOSE,
    });

    const exploration = await explorer.explore();
    if (exploration.requests.length > 0) {
      console.log(`  ${label} — Graph health: ${(exploration.graphHealth * 100).toFixed(0)}% | ${exploration.requests.length} data request${exploration.requests.length !== 1 ? 's' : ''}:`);
      for (const req of exploration.requests.slice(0, 3)) {
        console.log(`    🍽️ [${(req.priority * 100).toFixed(0)}%] ${req.description}`);
      }
    } else {
      console.log(`  ${label} — Graph health: ${(exploration.graphHealth * 100).toFixed(0)}% (no data gaps)`);
    }
  } catch (err: any) {
    log('DMN', `Active exploration failed: ${err.message}`);
  }

  // ── Phase 6 WIRING: What-If Simulator (Prefrontal Cortex) — simulate top insights ──
  if (result.insights.length > 0) {
    try {
      const simulator = createWhatIfSimulator({
        supabase,
        organizationId: orgId,
        maxCascadeDepth: 3, // Keep it light for background runs
        verbose: VERBOSE,
      });

      // Pick the most important insight that has domain data to simulate
      const topInsight = result.insights[0];
      if (topInsight.domains.length > 0) {
        const narrative = await simulator.whatIf(
          topInsight.domains[0],
          topInsight.importance > 0.5 ? 'increase' : 'decrease',
          Math.round(topInsight.importance * 30), // Scale importance to a magnitude %
        );
        console.log(`    PFC Simulation (${topInsight.domains[0]}): ${narrative.substring(0, 200)}...`);
      }
    } catch (err: any) {
      log('DMN', `What-If simulation failed: ${err.message}`);
    }
  }

  // ── Phase 7 WIRING: Anomaly Monitor (Insula) + Cascade Alert Pipeline (Thalamus) ──
  let cascadeAlertsGenerated = 0;
  try {
    const eventBus = createEventBus({ debounceMs: 0 });
    const anomalyMonitor = createAnomalyMonitor(eventBus, {
      threshold: 2.5,
      windowSize: 20,
      minWindowSize: 5,
    });

    // Build lightweight context enricher from causal graph
    const { data: causalEdges } = await supabase
      .from('causal_relationships_statistical')
      .select('source_domain, target_domain, effect_size, granger_p_value, granger_f_statistic, optimal_lag_days, natural_language')
      .eq('organization_id', orgId)
      .eq('is_significant', true)
      .order('effect_size', { ascending: false })
      .limit(100);

    const cachedRels: CachedRelationship[] = (causalEdges || []).map((e: any) => ({
      sourceDomain: e.source_domain,
      targetDomain: e.target_domain,
      effectSize: e.effect_size || 0,
      pValue: e.granger_p_value || 0,
      fStatistic: e.granger_f_statistic || 0,
      lagDays: e.optimal_lag_days || 0,
      naturalLanguage: e.natural_language || '',
      discoveredAt: new Date(),
    }));

    const contextEnricher = {
      getContextForAgent: (_orgId: string, domain?: string) => ({
        causalRelationships: domain
          ? cachedRels.filter(r => r.sourceDomain === domain || r.targetDomain === domain)
          : cachedRels,
        patterns: [],
      }),
    };

    // Create cascade alert pipeline — subscribes to cascade_trigger from anomaly monitor
    const cascadeAlerts: CascadeAlertPayload[] = [];
    createCascadeAlertPipeline(eventBus, contextEnricher, {
      minSeverity: 30,
      onAlert: async (alert) => {
        cascadeAlerts.push(alert);
        cascadeAlertsGenerated++;
        // Persist to DB
        try {
          await supabase.from('cascade_alerts').insert({
            organization_id: alert.organizationId, alert_id: alert.alertId,
            severity: alert.severity, trigger_domain: alert.triggerDomain,
            trigger_signal_type: alert.triggerSignalType, anomaly_score: alert.anomalyScore,
            predicted_path: alert.predictedPath, expected_impacts: alert.expectedImpacts,
            recommended_interventions: alert.recommendedInterventions,
          });
        } catch { /* non-critical */ }
        // ── GAP 2: LLM Anomaly Interpretation ──
        // For high-severity anomalies, ask Claude to explain in business context
        if (LLM_API_KEY && (alert.severity === 'critical' || alert.severity === 'high')) {
          try {
            const amplifier = createBrainAmplifier({
              provider: LLM_PROVIDER, apiKey: LLM_API_KEY, verbose: VERBOSE, costTracker,
            });
            const interpretation = await amplifier.interpretAnomaly({
              domain: alert.triggerDomain,
              signalType: alert.triggerSignalType,
              anomalyScore: alert.anomalyScore,
              signalValue: alert.anomalyScore,
              historicalMean: 0,
              historicalStd: 1,
              windowSize: 90,
            });
            if (interpretation.interpretation) {
              await supabase.from('cascade_alerts').update({
                llm_interpretation: interpretation.interpretation,
                llm_likely_causes: interpretation.likelyCauses,
                llm_suggested_actions: interpretation.suggestedActions,
              }).eq('alert_id', alert.alertId);
            }
          } catch { /* non-critical */ }
        }
        // Record as prediction for Bayesian loop
        try {
          const { data: predRow } = await supabase.from('prediction_records').insert({
            organization_id: alert.organizationId, domain: alert.triggerDomain,
            entity_type: 'cascade', entity_id: alert.predictedPath.join('→'),
            prediction_type: 'cascade_propagation', predicted_value: alert.anomalyScore,
            predicted_outcome: `Cascade: ${alert.predictedPath.join(' → ')} [${alert.severity}]`,
            confidence: alert.severity === 'critical' ? 0.9 : alert.severity === 'high' ? 0.7 : 0.5,
          }).select('id').single();
          if (predRow?.id) {
            const vDate = new Date(); vDate.setDate(vDate.getDate() + (alert.expectedImpacts[0]?.expectedLagDays || 14));
            await supabase.from('scheduled_verifications').insert({
              organization_id: alert.organizationId, prediction_id: predRow.id,
              verification_type: 'cascade_alert', scheduled_for: vDate.toISOString(), status: 'pending',
            });
          }
        } catch { /* non-critical */ }
        // Slack notification
        if (SLACK_WEBHOOK_URL) {
          const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[alert.severity];
          try {
            await fetch(SLACK_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ blocks: [
                { type: 'header', text: { type: 'plain_text', text: `${emoji} Cascade Alert: ${alert.severity.toUpperCase()}`, emoji: true } },
                { type: 'section', text: { type: 'mrkdwn', text: `*Trigger:* ${alert.triggerDomain} (${alert.triggerSignalType})\n*Predicted Path:* ${alert.predictedPath.join(' → ')}\n*Anomaly Score:* ${alert.anomalyScore.toFixed(1)}σ` } },
              ] }),
            });
          } catch { /* non-critical */ }
        }
      },
    });

    // Feed recent signals as CausalEvent objects
    const { data: recentSignals } = await supabase
      .from('cross_domain_signals')
      .select('signal_type, signal_value, source_domain, signal_timestamp, entity_type, entity_id')
      .eq('organization_id', orgId)
      .gte('signal_timestamp', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())
      .order('signal_timestamp', { ascending: true })
      .limit(200);

    if (recentSignals && recentSignals.length > 0) {
      for (const signal of recentSignals) {
        eventBus.emit({
          eventId: generateEventId(),
          organizationId: orgId,
          domain: signal.source_domain || 'unknown',
          entityType: signal.entity_type || 'metric',
          entityId: signal.entity_id || signal.signal_type || 'unknown',
          eventType: 'signal' as any,
          payload: { signal_type: signal.signal_type, signal_value: signal.signal_value },
          timestamp: new Date(signal.signal_timestamp || Date.now()),
        });
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      const stats = anomalyMonitor.getStats();
      if (stats.totalAnomaliesDetected > 0) {
        console.log(`    Insula: ${stats.totalAnomaliesDetected} anomalies detected in ${recentSignals.length} signals`);
      }
      if (cascadeAlerts.length > 0) {
        console.log(`    Thalamus: ${cascadeAlerts.length} cascade alert${cascadeAlerts.length !== 1 ? 's' : ''} generated`);
        for (const a of cascadeAlerts.slice(0, 3)) {
          console.log(`      ⚡ [${a.severity}] ${a.triggerDomain} → ${a.predictedPath.join(' → ')}`);
        }
      }
    }
  } catch (err: any) {
    log('DMN', `Anomaly/cascade detection failed: ${err.message}`);
  }

  // ── Phase 8 WIRING: Context Manager (Working Memory) — record insights for context ──
  try {
    const contextManager = createContextManager({
      supabase,
      organizationId: orgId,
    });

    // Record DMN insights into working memory so subsequent queries are context-aware
    for (const insight of result.insights) {
      contextManager.recordInsight(`[${insight.type}] ${insight.title}: ${insight.explanation.substring(0, 120)}`);
    }

    if (result.insights.length > 0) {
      const orgContext = contextManager.getOrgContext();
      const hotDomains = orgContext.hotDomains || [];
      if (hotDomains.length > 0) {
        console.log(`    Working Memory: ${result.insights.length} insights stored, hot domains: ${hotDomains.join(', ')}`);
      }
    }
  } catch (err: any) {
    log('DMN', `Context manager failed: ${err.message}`);
  }

  // ── Phase 9 WIRING: Prediction Recording — close the learning feedback loop ──
  try {
    const predictableInsights = result.insights.filter(
      i => i.importance >= 0.4 && (i.type === 'emerging_cascade' || i.type === 'prediction_opportunity' || i.type === 'unexpected_correlation')
    );
    if (predictableInsights.length > 0) {
      const predictions = predictableInsights.map(insight => {
        const score = impactResult.scores.find((s: any) => s.eventId === insight.id);
        return recordPrediction({
          organizationId: orgId, predictionType: insight.type,
          entityType: 'domain', entityId: insight.domains[0] || 'cross-domain',
          predictedProbability: insight.importance,
          predictionWindowDays: insight.type === 'emerging_cascade' ? 14 : 30,
          confidenceLower: Math.max(0, insight.importance - 0.2),
          confidenceUpper: Math.min(1, insight.importance + 0.2),
          modelVersion: 'dmn-v1',
          featureSnapshot: { title: insight.title, domains: insight.domains, impactScore: score?.compositeScore, cascadeAlerts: cascadeAlertsGenerated },
        });
      });
      const predRows = predictions.map(p => ({
        organization_id: p.organizationId, domain: p.entityId, entity_type: p.entityType,
        entity_id: p.entityId, prediction_type: p.predictionType,
        predicted_value: p.predictedProbability, predicted_outcome: `DMN insight: ${(p.featureSnapshot?.title as string) || 'unknown'}`,
        confidence: p.predictedProbability,
      }));
      const { data: insertedPreds, error: predError } = await supabase.from('prediction_records').insert(predRows).select('id');
      if (!predError && insertedPreds && insertedPreds.length > 0) {
        console.log(`    Predictions: ${insertedPreds.length} insight${insertedPreds.length !== 1 ? 's' : ''} recorded for future verification`);
        const verificationRows = insertedPreds.map((pred, idx) => {
          const p = predictions[idx];
          const vDate = new Date(); vDate.setDate(vDate.getDate() + (p?.predictionWindowDays || 30));
          return { organization_id: orgId, prediction_id: pred.id, verification_type: 'dmn_insight', scheduled_for: vDate.toISOString(), status: 'pending' };
        });
        const { error: verifError } = await supabase.from('scheduled_verifications').insert(verificationRows);
        if (!verifError) console.log(`    Verifications: ${verificationRows.length} scheduled (${predictions[0]?.predictionWindowDays || 30}d window)`);
      }
    }
  } catch (err: any) {
    log('DMN', `Prediction recording failed: ${err.message}`);
  }

  // ── GAP 1: LLM Insight Amplification ──────────────────────────────────
  // For top 3 insights, ask Claude to generate business narratives
  if (LLM_API_KEY && result.insights.length > 0) {
    try {
      const amplifier = createBrainAmplifier({
        provider: LLM_PROVIDER, apiKey: LLM_API_KEY, verbose: VERBOSE,
      });

      const topInsights = result.insights
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 3);

      log('LLM', `Amplifying top ${topInsights.length} insight(s) with Claude...`);

      for (const insight of topInsights) {
        try {
          const amplified = await amplifier.amplifyInsight({
            type: insight.type,
            title: insight.title,
            explanation: insight.explanation,
            domains: insight.domains,
            importance: insight.importance,
            surpriseScore: insight.surpriseScore,
            evidence: insight.evidence,
          });

          // Persist amplified insight to ai_memory
          if (amplified.explanation && amplified.confidence > 0) {
            await supabase.from('ai_memory')
              .update({
                llm_explanation: amplified.explanation,
                llm_business_impact: amplified.businessImpact,
                llm_recommended_actions: amplified.recommendedActions,
              })
              .eq('organization_id', orgId)
              .ilike('content', `%${insight.title.substring(0, 50)}%`)
              .order('created_at', { ascending: false })
              .limit(1);

            console.log(`    🧠 ${insight.title}`);
            console.log(`       Impact: ${amplified.businessImpact.substring(0, 100)}`);
            if (amplified.recommendedActions.length > 0) {
              console.log(`       Action: ${amplified.recommendedActions[0]}`);
            }
          }
        } catch { /* individual insight amplification failure is non-critical */ }
      }

      log('LLM', 'Insight amplification complete');
    } catch (err: any) {
      log('LLM', `Insight amplification failed (non-critical): ${err?.message}`);
    }
  }

  return result;
}

async function getActiveOrgIds(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  const { data: orgs } = await supabase
    .from('cross_domain_signals')
    .select('organization_id')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(500);

  if (!orgs) return [];

  const uniqueOrgs = [...new Set(orgs.map((o: any) => o.organization_id))];
  return uniqueOrgs.filter(id => id !== CORE_BRAIN_ORG_ID);
}

async function runOnce(supabase: ReturnType<typeof createClient>): Promise<void> {
  const overallStart = Date.now();
  const allResults: DMNScanResult[] = [];

  divider('NEXUSBRAIN DMN SCAN ("Background Insight Engine")');
  log('INIT', `Mode: ${DMN_MODE}`);
  log('INIT', `Min surprise threshold: ${MIN_SURPRISE_SCORE}`);
  log('INIT', `Max insights per scan: ${MAX_INSIGHTS_PER_SCAN}`);
  if (SLACK_WEBHOOK_URL) log('INIT', 'Slack notifications: ENABLED');

  if (SCAN_ALL_ORGS) {
    log('INIT', 'Scanning for active organizations...');
    const orgIds = await getActiveOrgIds(supabase);
    log('INIT', `Found ${orgIds.length} active org${orgIds.length !== 1 ? 's' : ''}`);

    for (const orgId of orgIds) {
      try {
        const result = await scanOrg(supabase, orgId);
        allResults.push(result);
      } catch (err) {
        logError('DMN', `Failed to scan org ${orgId.substring(0, 8)}`, err);
      }
    }

    // Always scan core brain
    try {
      const coreResult = await scanOrg(supabase, CORE_BRAIN_ORG_ID);
      allResults.push(coreResult);
    } catch (err) {
      logError('DMN', 'Failed to scan core brain', err);
    }
  } else {
    // Single org
    try {
      const result = await scanOrg(supabase, ORGANIZATION_ID);
      allResults.push(result);
    } catch (err) {
      logError('DMN', `Failed to scan org ${ORGANIZATION_ID.substring(0, 8)}`, err);
    }
  }

  // Final Summary
  const totalDuration = ((Date.now() - overallStart) / 1000).toFixed(1);
  const totalInsights = allResults.reduce((sum, r) => sum + r.insights.length, 0);

  divider('DMN SCAN COMPLETE');
  log('DONE', `Total time: ${totalDuration}s`);
  log('DONE', `Organizations scanned: ${allResults.length}`);
  log('DONE', `Total insights: ${totalInsights}`);

  // Print top insights across all orgs
  const allInsights: ProactiveInsight[] = [];
  for (const r of allResults) {
    for (const i of r.insights) {
      allInsights.push(i);
    }
  }
  allInsights.sort((a, b) => b.importance - a.importance);

  if (allInsights.length > 0) {
    console.log('\n  Top insights across all brains:');
    for (const insight of allInsights.slice(0, 5)) {
      const pct = (insight.importance * 100).toFixed(0);
      console.log(`    [${pct}%] ${insight.title}`);
      console.log(`           ${insight.explanation.substring(0, 120)}...`);
    }

    // Log insights to attention_decisions so the policy learner can learn from user feedback
    try {
      const decisions = allInsights.map(insight => ({
        organization_id: ORGANIZATION_ID,
        event_id: insight.id,
        action: 'surfaced',  // Initial state — updated when user acts/dismisses
        components: {
          cascadeReach: insight.importance * 0.7,
          dollarEffect: 0,
          strategicAlignment: insight.importance * 0.5,
          novelty: insight.importance,
        },
        insight_type: insight.type,
        title: insight.title,
        domains: insight.domains,
      }));
      await supabase.from('attention_decisions').insert(decisions);
    } catch {
      // Non-critical — attention_decisions table may not exist yet
    }
  }

  // Log the DMN run for observability
  try {
    await supabase.from('learning_runs').insert({
      organization_id: ORGANIZATION_ID,
      run_type: 'dmn',
      status: 'completed',
      started_at: new Date(overallStart).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - overallStart,
      signals_processed: 0,
      edges_updated: 0,
      metrics: {
        orgsScanned: allResults.length,
        totalInsights,
        topInsight: allInsights[0]?.title || null,
      },
    });
  } catch {
    // Non-critical
  }

  console.log('');
}

// ============================================================================
// MAIN
// ============================================================================

let shutdownRequested = false;

async function main(): Promise<void> {
  if (!SUPABASE_URL) {
    console.error('ERROR: SUPABASE_URL is not set.');
    process.exit(1);
  }
  if (!SUPABASE_KEY) {
    console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is not set.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  costTracker = createCostTracker(supabase, true);

  // Verify connection
  try {
    const { error } = await supabase
      .from('cross_domain_signals')
      .select('id', { count: 'exact', head: true });
    if (error) {
      console.error(`ERROR: Supabase connection failed: ${error.message}`);
      process.exit(1);
    }
    log('INIT', 'Supabase connection verified');
  } catch (err) {
    console.error('ERROR: Cannot connect to Supabase.');
    if (err instanceof Error) console.error(err.message);
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    if (shutdownRequested) {
      console.log('\nForce shutdown.');
      process.exit(1);
    }
    shutdownRequested = true;
    console.log('\nShutdown requested. Finishing current scan...');
  });

  process.on('SIGTERM', () => {
    shutdownRequested = true;
    console.log('\nSIGTERM received. Finishing current scan...');
  });

  // Execute based on mode
  switch (DMN_MODE) {
    case 'once':
      await runOnce(supabase);
      process.exit(0);
      break;

    case 'interval': {
      const intervalMs = DMN_INTERVAL_HOURS * 60 * 60 * 1000;
      log('INIT', `Running in interval mode — every ${DMN_INTERVAL_HOURS} hours`);

      let runCount = 0;
      while (!shutdownRequested) {
        runCount++;
        log('LOOP', `Starting DMN scan #${runCount}`);

        try {
          await runOnce(supabase);
        } catch (err) {
          logError('LOOP', `Scan #${runCount} failed`, err);
        }

        if (shutdownRequested) break;

        const nextRun = new Date(Date.now() + intervalMs);
        log('LOOP', `Next DMN scan at ${nextRun.toISOString().substring(11, 19)}. Press Ctrl+C to stop.`);

        // Sleep in small chunks for responsive shutdown
        const sleepChunkMs = 10_000;
        let slept = 0;
        while (slept < intervalMs && !shutdownRequested) {
          await new Promise(r => setTimeout(r, Math.min(sleepChunkMs, intervalMs - slept)));
          slept += sleepChunkMs;
        }
      }

      log('LOOP', `Completed ${runCount} DMN scan${runCount !== 1 ? 's' : ''}. Goodbye!`);
      break;
    }

    default:
      console.error(`ERROR: Unknown DMN_MODE "${DMN_MODE}". Use: once or interval.`);
      process.exit(1);
  }
}

// ── Entry Point ──
main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
