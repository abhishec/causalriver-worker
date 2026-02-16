/**
 * Event Bus Wiring for SE-aaS Domains
 *
 * Connects SE-aaS domains to the causal event bus to enable:
 * - Feedback loop (learn from user actions)
 * - Continuous learner (pattern updates)
 * - Threshold optimizer (anomaly threshold auto-tuning)
 *
 * @module lib/brain/event-bus-wiring
 */

import { CausalEventBus, type CausalEvent } from '@nexus-ai/memory-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * SE-aaS domain execution event
 */
export interface SeAaSExecutionEvent {
  domainType: string;
  organizationId: string;
  userId: string;
  request: Record<string, unknown>;
  result: Record<string, unknown>;
  confidence: number;
  claudePowered: boolean;
  executionTimeMs: number;
  timestamp: Date;
}

/**
 * Initialize event bus wiring for SE-aaS domains
 */
export function initializeSeAaSEventBusWiring(
  eventBus: CausalEventBus,
  supabase: SupabaseClient
): void {
  // Subscribe to SE-aaS domain execution events
  eventBus.subscribe(
    async (events: CausalEvent[]) => {
      await handleSeAaSExecutionEvents(events, supabase);
    },
    {
      domains: ['se-aas'],
      eventTypes: ['outcome', 'feedback'],
    }
  );

  // Subscribe for feedback loop learning
  eventBus.subscribe(
    async (events: CausalEvent[]) => {
      await handleFeedbackLoopEvents(events, supabase);
    },
    {
      eventTypes: ['feedback'],
    }
  );

  // Subscribe for continuous learning
  eventBus.subscribe(
    async (events: CausalEvent[]) => {
      await handleContinuousLearningEvents(events, supabase);
    },
    {
      eventTypes: ['observation', 'observation_rules_extracted'],
    }
  );

  // Subscribe for threshold optimization
  eventBus.subscribe(
    async (events: CausalEvent[]) => {
      await handleThresholdOptimizationEvents(events, supabase);
    },
    {
      eventTypes: ['signal', 'prediction'],
    }
  );
}

/**
 * Handle SE-aaS domain execution events
 */
async function handleSeAaSExecutionEvents(
  events: CausalEvent[],
  supabase: SupabaseClient
): Promise<void> {
  for (const event of events) {
    const { organizationId, domain, payload } = event;

    // Store execution metrics for analytics
    await supabase.from('se_aas_metrics').insert({
      organization_id: organizationId,
      domain_type: domain,
      confidence: payload.confidence as number,
      execution_time_ms: payload.executionTimeMs as number,
      claude_powered: payload.claudePowered as boolean,
      created_at: event.timestamp,
    });

    // Trigger downstream actions based on domain type
    switch (domain) {
      case 'incident-diagnosis':
        // If incident diagnosed with high confidence, create alert
        if ((payload.confidence as number) > 0.85) {
          await createIncidentAlert(organizationId, payload, supabase);
        }
        break;

      case 'impact-analysis':
        // If high-risk change detected, notify reviewers
        if (payload.riskScore && (payload.riskScore as number) > 0.7) {
          await notifyReviewers(organizationId, payload, supabase);
        }
        break;

      case 'log-query':
        // If error pattern detected, create monitoring rule
        if (payload.errorClusters && Array.isArray(payload.errorClusters) && payload.errorClusters.length > 0) {
          await createMonitoringRule(organizationId, payload, supabase);
        }
        break;
    }
  }
}

/**
 * Handle feedback loop events (learn from user actions)
 */
async function handleFeedbackLoopEvents(
  events: CausalEvent[],
  supabase: SupabaseClient
): Promise<void> {
  for (const event of events) {
    const { organizationId, payload } = event;

    // User feedback on domain results
    if (payload.feedbackType === 'domain_result') {
      await supabase.from('domain_feedback').insert({
        organization_id: organizationId,
        domain_type: payload.domainType as string,
        result_id: payload.resultId as string,
        feedback: payload.feedback as 'helpful' | 'not_helpful',
        comment: payload.comment as string | undefined,
        created_at: event.timestamp,
      });

      // Update domain confidence scores based on feedback
      if (payload.feedback === 'not_helpful') {
        await adjustDomainConfidence(
          organizationId,
          payload.domainType as string,
          -0.05,
          supabase
        );
      } else {
        await adjustDomainConfidence(
          organizationId,
          payload.domainType as string,
          +0.02,
          supabase
        );
      }
    }
  }
}

/**
 * Handle continuous learning events (pattern updates)
 */
async function handleContinuousLearningEvents(
  events: CausalEvent[],
  supabase: SupabaseClient
): Promise<void> {
  for (const event of events) {
    const { organizationId, payload } = event;

    // Extract new patterns from observations
    if (event.eventType === 'observation_rules_extracted') {
      const rules = payload.rules as Array<{ pattern: string; confidence: number }>;

      for (const rule of rules) {
        // Store discovered pattern
        await supabase.from('discovered_patterns').insert({
          organization_id: organizationId,
          pattern: rule.pattern,
          confidence: rule.confidence,
          discovered_at: event.timestamp,
          source: 'continuous_learner',
        });
      }
    }

    // Update existing patterns based on new observations
    if (event.eventType === 'observation') {
      // Trigger pattern re-evaluation
      await supabase.from('pattern_evaluation_queue').insert({
        organization_id: organizationId,
        trigger_event_id: event.eventId,
        status: 'pending',
        created_at: event.timestamp,
      });
    }
  }
}

/**
 * Handle threshold optimization events
 */
async function handleThresholdOptimizationEvents(
  events: CausalEvent[],
  supabase: SupabaseClient
): Promise<void> {
  for (const event of events) {
    const { organizationId, payload } = event;

    // Optimize anomaly detection thresholds based on signals
    if (event.eventType === 'signal' && payload.anomalyScore) {
      const anomalyScore = payload.anomalyScore as number;
      const domain = event.domain;

      // Get current threshold
      const { data: currentThreshold } = await supabase
        .from('anomaly_thresholds')
        .select('threshold')
        .eq('organization_id', organizationId)
        .eq('domain', domain)
        .single();

      if (currentThreshold) {
        // Adjust threshold based on anomaly score
        const newThreshold = optimizeThreshold(
          currentThreshold.threshold,
          anomalyScore,
          payload.falsePositive as boolean | undefined
        );

        await supabase
          .from('anomaly_thresholds')
          .update({
            threshold: newThreshold,
            updated_at: event.timestamp,
            update_reason: 'auto_optimization',
          })
          .eq('organization_id', organizationId)
          .eq('domain', domain);
      }
    }
  }
}

/**
 * Create incident alert
 */
async function createIncidentAlert(
  organizationId: string,
  payload: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<void> {
  await supabase.from('alerts').insert({
    organization_id: organizationId,
    alert_type: 'incident',
    severity: 'high',
    title: `Incident detected: ${payload.rootCause || 'Unknown'}`,
    description: payload.narrative as string,
    metadata: payload,
    status: 'open',
  });
}

/**
 * Notify reviewers of high-risk changes
 */
async function notifyReviewers(
  organizationId: string,
  payload: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<void> {
  // Get reviewers for this org
  const { data: members } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('organization_id', organizationId)
    .in('role', ['admin', 'owner']);

  if (!members) return;

  // Create notifications for reviewers
  for (const member of members) {
    await supabase.from('notifications').insert({
      user_id: member.user_id,
      organization_id: organizationId,
      notification_type: 'high_risk_change',
      title: 'High-risk code change detected',
      message: `Risk score: ${payload.riskScore}. ${payload.summary || 'Review required.'}`,
      metadata: payload,
      read: false,
    });
  }
}

/**
 * Create monitoring rule from log patterns
 */
async function createMonitoringRule(
  organizationId: string,
  payload: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<void> {
  const errorClusters = payload.errorClusters as Array<{
    pattern: string;
    count: number;
    severity: string;
  }>;

  for (const cluster of errorClusters) {
    if (cluster.severity === 'high' || cluster.count > 10) {
      await supabase.from('monitoring_rules').insert({
        organization_id: organizationId,
        rule_type: 'log_pattern',
        pattern: cluster.pattern,
        threshold: cluster.count,
        severity: cluster.severity,
        auto_created: true,
        created_from: 'log-query-domain',
      });
    }
  }
}

/**
 * Adjust domain confidence score
 */
async function adjustDomainConfidence(
  organizationId: string,
  domainType: string,
  adjustment: number,
  supabase: SupabaseClient
): Promise<void> {
  const { data: current } = await supabase
    .from('domain_confidence_scores')
    .select('score')
    .eq('organization_id', organizationId)
    .eq('domain_type', domainType)
    .single();

  const newScore = Math.max(0, Math.min(1, (current?.score || 0.8) + adjustment));

  await supabase
    .from('domain_confidence_scores')
    .upsert({
      organization_id: organizationId,
      domain_type: domainType,
      score: newScore,
      updated_at: new Date(),
    });
}

/**
 * Optimize anomaly threshold
 */
function optimizeThreshold(
  currentThreshold: number,
  anomalyScore: number,
  falsePositive?: boolean
): number {
  if (falsePositive) {
    // Increase threshold to reduce false positives
    return Math.min(1.0, currentThreshold * 1.1);
  } else if (anomalyScore > currentThreshold * 1.5) {
    // Decrease threshold to catch more anomalies
    return Math.max(0.1, currentThreshold * 0.95);
  }
  return currentThreshold;
}

/**
 * Emit SE-aaS execution event to event bus
 */
export function emitSeAaSExecutionEvent(
  eventBus: CausalEventBus,
  execution: SeAaSExecutionEvent
): void {
  eventBus.emit({
    eventId: `seaas_${execution.domainType}_${Date.now()}`,
    organizationId: execution.organizationId,
    domain: 'se-aas',
    entityType: 'domain_execution',
    entityId: execution.domainType,
    eventType: 'outcome',
    payload: {
      domainType: execution.domainType,
      userId: execution.userId,
      request: execution.request,
      result: execution.result,
      confidence: execution.confidence,
      claudePowered: execution.claudePowered,
      executionTimeMs: execution.executionTimeMs,
    },
    timestamp: execution.timestamp,
    vectorClock: Date.now(),
    priority: execution.confidence > 0.9 ? 1 : 3,
  });
}
