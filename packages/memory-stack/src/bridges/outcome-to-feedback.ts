/**
 * Bridge 5: Outcomes → Feedback Loop Closure
 *
 * Subscribes to 'outcome' events on the event bus.
 * Closes the learning loop by:
 *   1. Matching outcomes to pending predictions
 *   2. Tracking per-rule accuracy
 *   3. Emitting 'feedback' events for downstream consumers
 *
 * This makes the system self-improving:
 * correct predictions → stronger weights, incorrect → weaker.
 */

import type { CausalEvent } from '../causality/event-bus';
import { generateEventId } from '../causality/event-bus';

type EventBusInstance = {
  emit: (event: any) => boolean;
  subscribe: (options: {
    filter: any;
    handler: (events: CausalEvent[]) => Promise<void>;
  }) => string;
};

interface PendingPrediction {
  predictionId: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  predictionType: string;
  confidence: number;
  predictedAt: Date;
  ruleId: string;
}

interface RuleAccuracy {
  correct: number;
  incorrect: number;
  total: number;
  currentConfidence: number;
}

/**
 * Subscribe to outcome events and close the feedback loop
 */
export function createFeedbackBridge(eventBus: EventBusInstance) {
  const pendingPredictions = new Map<string, PendingPrediction[]>();
  const ruleAccuracy = new Map<string, RuleAccuracy>();

  let totalOutcomesProcessed = 0;
  let totalFeedbackEmitted = 0;

  // Listen for predictions to track
  eventBus.subscribe({
    filter: { eventTypes: ['prediction'] as any },
    handler: async (events: CausalEvent[]) => {
      for (const event of events) {
        const orgId = event.organizationId;
        if (!pendingPredictions.has(orgId)) {
          pendingPredictions.set(orgId, []);
        }

        pendingPredictions.get(orgId)!.push({
          predictionId: event.eventId,
          organizationId: orgId,
          entityType: event.entityType,
          entityId: event.entityId,
          predictionType: (event.payload.type as string) || 'unknown',
          confidence: (event.payload.confidence as number) || 0.5,
          predictedAt: event.timestamp,
          ruleId: event.entityId,
        });
      }
    },
  });

  // Listen for outcomes and match to predictions
  const subscriptionId = eventBus.subscribe({
    filter: { eventTypes: ['outcome'] as any },
    handler: async (events: CausalEvent[]) => {
      for (const event of events) {
        totalOutcomesProcessed++;
        const orgId = event.organizationId;
        const pending = pendingPredictions.get(orgId) || [];

        // Find matching predictions for this outcome
        const matching = pending.filter(
          (p) =>
            p.entityType === event.entityType && p.entityId === event.entityId
        );

        if (matching.length === 0) continue;

        // Remove matched predictions from pending
        pendingPredictions.set(
          orgId,
          pending.filter(
            (p) => !matching.some((m) => m.predictionId === p.predictionId)
          )
        );

        // Update accuracy tracking for each matched prediction
        for (const prediction of matching) {
          const outcomeValue =
            (event.payload.metric_value as number) || 0;
          const wasCorrect = Math.abs(outcomeValue) > 0.1;

          if (!ruleAccuracy.has(prediction.ruleId)) {
            ruleAccuracy.set(prediction.ruleId, {
              correct: 0,
              incorrect: 0,
              total: 0,
              currentConfidence: prediction.confidence,
            });
          }

          const accuracy = ruleAccuracy.get(prediction.ruleId)!;
          accuracy.total++;
          if (wasCorrect) {
            accuracy.correct++;
          } else {
            accuracy.incorrect++;
          }

          // Bayesian confidence update
          const accuracyRate = accuracy.correct / accuracy.total;
          const newConfidence =
            accuracy.currentConfidence * 0.7 + accuracyRate * 0.3;
          accuracy.currentConfidence = Math.max(0.05, Math.min(0.95, newConfidence));

          // Emit feedback event
          totalFeedbackEmitted++;
          eventBus.emit({
            eventId: generateEventId('fb'),
            organizationId: orgId,
            domain: 'learning',
            entityType: 'rule',
            entityId: prediction.ruleId,
            eventType: 'feedback' as any,
            payload: {
              predictionId: prediction.predictionId,
              wasCorrect,
              previousConfidence: prediction.confidence,
              newConfidence: accuracy.currentConfidence,
              accuracy: accuracyRate,
              totalPredictions: accuracy.total,
            },
            timestamp: new Date(),
            priority: 4,
          });
        }
      }
    },
  });

  return {
    subscriptionId,
    getStats() {
      return {
        totalOutcomesProcessed,
        totalFeedbackEmitted,
        pendingPredictions: Array.from(pendingPredictions.values()).reduce(
          (sum, p) => sum + p.length,
          0
        ),
        ruleAccuracies: Object.fromEntries(
          Array.from(ruleAccuracy.entries()).map(([k, v]) => [
            k,
            {
              accuracy: v.total > 0 ? v.correct / v.total : 0,
              total: v.total,
              confidence: v.currentConfidence,
            },
          ])
        ),
      };
    },
  };
}
