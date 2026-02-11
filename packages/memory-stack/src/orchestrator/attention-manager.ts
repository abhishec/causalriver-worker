/**
 * Attention Manager — "Thalamus"
 *
 * Like the brain's thalamus that routes sensory signals to the right
 * cortical areas, the attention manager decides:
 *   - What gets through to human attention (and to whom)
 *   - What gets logged but suppressed
 *   - What gets escalated vs. batched
 *
 * It sits AFTER the impact scorer and BEFORE notification:
 *   Signal → Impact Score → Attention Manager → Notification / Dashboard
 *
 * Key behaviors:
 *   1. **Alert deduplication**: Same event type + domain within 1 hour → suppress
 *   2. **Batching**: Low-priority alerts collected and sent as a daily digest
 *   3. **Escalation**: Critical alerts go immediately to Slack/webhook
 *   4. **Routing**: Different alerts go to different stakeholders by domain
 *   5. **Fatigue prevention**: Max N alerts per stakeholder per day
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImpactScore, ScorableEvent } from './impact-scorer';
import { createSupabaseRepository } from '../persistence/supabase-repository';

// ============================================================================
// TYPES
// ============================================================================

/** How an alert should be delivered */
export type DeliveryMethod = 'immediate' | 'batched' | 'suppressed' | 'digest';

/** A routing rule for alerts */
export interface AttentionRoute {
  /** Route ID */
  id: string;
  /** Domains this route applies to */
  domains: string[];
  /** Alert tiers this route applies to */
  tiers: Array<'critical' | 'high' | 'medium' | 'low'>;
  /** Delivery method */
  delivery: DeliveryMethod;
  /** Notification target (Slack channel, webhook URL, email) */
  target: string;
  /** Max alerts per day for this route (default: 20) */
  maxPerDay?: number;
  /** Stakeholder name (for logging) */
  stakeholder?: string;
}

/** Result of attention processing */
export interface AttentionDecision {
  /** The impact score that was evaluated */
  score: ImpactScore;
  /** The original event */
  event: ScorableEvent;
  /** Decision made */
  delivery: DeliveryMethod;
  /** Why this decision was made */
  reason: string;
  /** Which route matched (if any) */
  routeId?: string;
  /** When this should be delivered (for batched) */
  deliverAt?: string;
}

/** Attention manager configuration */
export interface AttentionManagerConfig {
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Alert routing rules */
  routes?: AttentionRoute[];
  /** Deduplication window in minutes (default: 60) */
  deduplicationWindowMinutes?: number;
  /** Max alerts per day globally (default: 50) */
  maxAlertsPerDay?: number;
  /** Batch delivery hour (0-23, default: 9 = 9 AM) */
  batchDeliveryHour?: number;
  /** Verbose logging */
  verbose?: boolean;
}

/** Daily digest summary */
export interface DigestSummary {
  /** Total events processed today */
  totalEvents: number;
  /** Events that triggered immediate alerts */
  immediateAlerts: number;
  /** Events batched for this digest */
  batchedEvents: number;
  /** Events suppressed (duplicates, fatigue) */
  suppressedEvents: number;
  /** Top events by score */
  topEvents: Array<{ title: string; score: number; tier: string }>;
  /** Generated at */
  generatedAt: string;
}

// ============================================================================
// ATTENTION MANAGER
// ============================================================================

export function createAttentionManager(config: AttentionManagerConfig) {
  const {
    supabase,
    organizationId,
    routes = [],
    deduplicationWindowMinutes = 60,
    maxAlertsPerDay = 50,
    batchDeliveryHour = 9,
    verbose = false,
  } = config;

  const repository = createSupabaseRepository(supabase, organizationId);

  // In-memory state for current session
  const recentAlerts: Array<{ domains: string[]; type: string; timestamp: number }> = [];
  let alertsToday = 0;
  let lastResetDay = new Date().toDateString();
  const batchQueue: AttentionDecision[] = [];

  function log(msg: string): void {
    if (verbose) {
      const time = new Date().toISOString().substring(11, 19);
      console.log(`[${time}] [THALAMUS] ${msg}`);
    }
  }

  function resetDailyCounterIfNeeded(): void {
    const today = new Date().toDateString();
    if (today !== lastResetDay) {
      alertsToday = 0;
      lastResetDay = today;
      log('Daily alert counter reset');
    }
  }

  // ── Deduplication ─────────────────────────────────────────────────

  function isDuplicate(event: ScorableEvent): boolean {
    const cutoff = Date.now() - deduplicationWindowMinutes * 60 * 1000;

    // Clean old entries
    while (recentAlerts.length > 0 && recentAlerts[0].timestamp < cutoff) {
      recentAlerts.shift();
    }

    // Check for matching domain + type combination
    for (const recent of recentAlerts) {
      if (recent.type !== event.type) continue;
      const domainOverlap = event.domains.some(d => recent.domains.includes(d));
      if (domainOverlap) return true;
    }

    return false;
  }

  function recordAlert(event: ScorableEvent): void {
    recentAlerts.push({
      domains: event.domains,
      type: event.type,
      timestamp: Date.now(),
    });
  }

  // ── Route Matching ────────────────────────────────────────────────

  function findMatchingRoute(
    score: ImpactScore,
    event: ScorableEvent,
  ): AttentionRoute | null {
    for (const route of routes) {
      // Check tier match
      if (score.alertTier && !route.tiers.includes(score.alertTier)) continue;

      // Check domain match
      const domainMatch = event.domains.some(d => {
        const lower = d.toLowerCase();
        return route.domains.some(rd => lower.includes(rd.toLowerCase()) || rd === '*');
      });
      if (!domainMatch && !route.domains.includes('*')) continue;

      return route;
    }

    return null;
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════

  return {
    /**
     * Process a scored event and decide what to do with it.
     */
    process(event: ScorableEvent, score: ImpactScore): AttentionDecision {
      resetDailyCounterIfNeeded();

      // If score is below alert threshold → suppress
      if (!score.shouldAlert) {
        return {
          score,
          event,
          delivery: 'suppressed',
          reason: `Score ${score.compositeScore}/100 below alert threshold`,
        };
      }

      // Deduplication check
      if (isDuplicate(event)) {
        return {
          score,
          event,
          delivery: 'suppressed',
          reason: `Duplicate: similar ${event.type} for ${event.domains.join(',')} within ${deduplicationWindowMinutes}min window`,
        };
      }

      // Alert fatigue check
      if (alertsToday >= maxAlertsPerDay && score.alertTier !== 'critical') {
        log(`Alert fatigue: ${alertsToday} alerts today, batching non-critical`);
        const decision: AttentionDecision = {
          score,
          event,
          delivery: 'batched',
          reason: `Daily alert limit (${maxAlertsPerDay}) reached — batching for digest`,
          deliverAt: getNextBatchTime(),
        };
        batchQueue.push(decision);
        return decision;
      }

      // Find matching route
      const route = findMatchingRoute(score, event);

      if (route) {
        const delivery = route.delivery;
        const decision: AttentionDecision = {
          score,
          event,
          delivery,
          reason: `Matched route "${route.id}" → ${delivery} to ${route.stakeholder || route.target}`,
          routeId: route.id,
          deliverAt: delivery === 'batched' ? getNextBatchTime() : undefined,
        };

        if (delivery === 'immediate') {
          alertsToday++;
          recordAlert(event);
        } else if (delivery === 'batched') {
          batchQueue.push(decision);
        }

        log(`${score.alertTier?.toUpperCase()}: ${event.title} → ${delivery} (route: ${route.id})`);
        return decision;
      }

      // Default behavior based on tier
      if (score.alertTier === 'critical' || score.alertTier === 'high') {
        alertsToday++;
        recordAlert(event);
        log(`${score.alertTier.toUpperCase()}: ${event.title} → immediate (no route, default escalation)`);
        return {
          score,
          event,
          delivery: 'immediate',
          reason: `${score.alertTier} tier defaults to immediate delivery`,
        };
      }

      // Medium/Low → batch
      const decision: AttentionDecision = {
        score,
        event,
        delivery: 'batched',
        reason: `${score.alertTier} tier defaults to batched delivery`,
        deliverAt: getNextBatchTime(),
      };
      batchQueue.push(decision);
      return decision;
    },

    /**
     * Get the current batch queue (pending digest items).
     */
    getBatchQueue(): AttentionDecision[] {
      return [...batchQueue];
    },

    /**
     * Flush the batch queue (e.g., when generating a digest).
     */
    flushBatchQueue(): AttentionDecision[] {
      const flushed = [...batchQueue];
      batchQueue.length = 0;
      return flushed;
    },

    /**
     * Generate a daily digest summary.
     */
    async generateDigest(): Promise<DigestSummary> {
      const batched = batchQueue.length;
      const topEvents = batchQueue
        .sort((a, b) => b.score.compositeScore - a.score.compositeScore)
        .slice(0, 10)
        .map(d => ({
          title: d.event.title,
          score: d.score.compositeScore,
          tier: d.score.alertTier || 'low',
        }));

      const digest: DigestSummary = {
        totalEvents: alertsToday + batched,
        immediateAlerts: alertsToday,
        batchedEvents: batched,
        suppressedEvents: 0, // Would need external tracking
        topEvents,
        generatedAt: new Date().toISOString(),
      };

      // Persist digest as memory
      try {
        await repository.upsertMemory({
          memoryType: 'daily_digest',
          domain: 'cross_domain',
          content: `Daily digest: ${digest.immediateAlerts} immediate alerts, ${digest.batchedEvents} batched, top score: ${topEvents.length > 0 ? topEvents[0].score : 0}/100`,
          importance: 0.3,
          metadata: digest as unknown as Record<string, unknown>,
        });
      } catch {
        // Non-critical
      }

      // Flush the batch queue
      batchQueue.length = 0;

      log(`Digest generated: ${digest.immediateAlerts} immediate, ${digest.batchedEvents} batched`);
      return digest;
    },

    /**
     * Get today's alert count.
     */
    getAlertCount(): number {
      resetDailyCounterIfNeeded();
      return alertsToday;
    },

    /**
     * Add a routing rule.
     */
    addRoute(route: AttentionRoute): void {
      routes.push(route);
      log(`Added route: ${route.id} (${route.domains.join(',')} → ${route.delivery})`);
    },
  };

  function getNextBatchTime(): string {
    const now = new Date();
    const batchTime = new Date(now);
    batchTime.setHours(batchDeliveryHour, 0, 0, 0);
    if (batchTime <= now) {
      batchTime.setDate(batchTime.getDate() + 1);
    }
    return batchTime.toISOString();
  }
}
