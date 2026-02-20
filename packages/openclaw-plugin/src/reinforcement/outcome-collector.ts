/**
 * OutcomeCollector — Polls scheduled_verifications, fetches actual metric values
 *
 * REWIRED (Gap 3): Previously asked the brain "What is the current value?"
 * — circular, the brain verified its own predictions against its own memory.
 *
 * NOW: Queries cross_domain_signals from connector-ingested data (Jira, GitHub,
 * Xero, PagerDuty) for real ground truth. If no signal data exists, marks the
 * prediction for user verification (Gap 2: VerificationPromptCard).
 *
 * The full resolver registry (with direct API calls to Jira/GitHub/Xero/PagerDuty)
 * lives in @nexus-ai/memory-stack and is used server-side by feedback-loop.ts.
 * This plugin-side collector uses the simpler signal-based approach since it
 * has direct Supabase access but not connector API credentials.
 *
 * Schedule: Every 6 hours (configurable)
 */

import type { NexusClient } from '@nexus-ai/client';
import type { PluginConfig, SupabaseConfig } from '../config.js';

interface OpenClawApi {
  log?(level: string, message: string): void;
  registerService(def: { id: string; start(): Promise<void> | void; stop?(): Promise<void> | void }): void;
  on?(event: string, handler: (...args: unknown[]) => Promise<void> | void): void;
}

interface PendingVerification {
  id: string;
  prediction_id: string;
  target_metric: string;
  entity_id: string;
  entity_type: string;
  domain: string;
  scheduled_for: string;
  predicted_direction: string;
  predicted_value: number;
  confidence: number;
  organization_id?: string;
}

interface CollectedOutcome {
  verification: PendingVerification;
  actualValue: number;
  actualDirection: 'increase' | 'decrease' | 'stable';
  collectedAt: string;
  source: 'connector_signals' | 'brain_fallback' | 'user_verification_pending';
}

// Domains that have connector-backed signals for automated verification
const SIGNAL_BACKED_DOMAINS = new Set([
  'early-warning',       // Jira sprint signals
  'scope-creep',         // Jira sprint/issue signals
  'delivery-intelligence', // Jira+GitHub composite signals
  'pod-match',           // Jira+GitHub composite signals
  'pr-review',           // GitHub PR/CI signals
  'dead-code-detector',  // GitHub PR/CI signals
  'incident-diagnosis',  // PagerDuty incident signals
  'performance-profiler', // PagerDuty incident signals
  'bookkeeper',          // Xero transaction signals
  'reconciler',          // Xero transaction signals
  'anomaly',             // Xero transaction signals
]);

// Helper to query Supabase REST API directly
async function querySupabase<T>(
  supabase: SupabaseConfig,
  table: string,
  filters: Record<string, string>,
  options?: { limit?: number; order?: string; select?: string },
): Promise<T[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    params.set(key, value);
  }
  if (options?.select) params.set('select', options.select);
  params.set('limit', String(options?.limit ?? 50));
  params.set('order', options?.order ?? 'scheduled_for.asc');

  const url = `${supabase.supabaseUrl}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${supabase.supabaseKey}`,
      'apikey': supabase.supabaseKey,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) throw new Error(`Supabase query failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T[]>;
}

// Helper to update a row in Supabase
async function updateSupabase(
  supabase: SupabaseConfig,
  table: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const url = `${supabase.supabaseUrl}/rest/v1/${table}?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${supabase.supabaseKey}`,
      'apikey': supabase.supabaseKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase update failed: ${res.status}`);
}

/**
 * Resolve actual outcome from connector-ingested signals in Supabase.
 * This is the NON-CIRCULAR approach: reads real data that connectors
 * (Jira, GitHub, Xero, PagerDuty) have already synced into cross_domain_signals.
 */
async function resolveFromSignals(
  supabase: SupabaseConfig,
  v: PendingVerification,
  log?: (level: string, msg: string) => void,
): Promise<{ value: number; direction: 'increase' | 'decrease' | 'stable'; source: string } | null> {
  const orgId = v.organization_id || supabase.orgId;

  // Query cross_domain_signals for the target metric's actual values
  try {
    const signals = await querySupabase<{
      signal_value: number;
      signal_timestamp: string;
      signal_type: string;
      metadata: Record<string, unknown> | null;
    }>(
      supabase,
      'cross_domain_signals',
      {
        'organization_id': `eq.${orgId}`,
        'entity_type': `eq.${v.entity_type}`,
        'entity_id': `eq.${v.entity_id}`,
        'signal_type': `eq.${v.target_metric}`,
      },
      { limit: 5, order: 'signal_timestamp.desc', select: 'signal_value,signal_timestamp,signal_type,metadata' },
    );

    if (signals.length >= 2) {
      // We have before/after data — compute the actual change
      const current = signals[0].signal_value;
      const previous = signals[1].signal_value;
      const change = current - previous;
      const stableThreshold = 0.05;

      const direction: 'increase' | 'decrease' | 'stable' =
        change > stableThreshold ? 'increase' :
        change < -stableThreshold ? 'decrease' : 'stable';

      return { value: current, direction, source: 'connector_signals' };
    }

    // Try broader signal type match (e.g., sprint_completed contains velocity data)
    const broadSignals = await querySupabase<{
      signal_value: number;
      signal_type: string;
      metadata: Record<string, unknown> | null;
    }>(
      supabase,
      'cross_domain_signals',
      {
        'organization_id': `eq.${orgId}`,
        'source_domain': `eq.${mapDomainToSignalDomain(v.domain)}`,
      },
      { limit: 10, order: 'signal_timestamp.desc', select: 'signal_value,signal_type,metadata' },
    );

    if (broadSignals.length >= 2) {
      // Use the most recent signal values as a proxy
      const current = broadSignals[0].signal_value;
      const previous = broadSignals[1].signal_value;
      const change = current - previous;

      const direction: 'increase' | 'decrease' | 'stable' =
        change > 0.05 ? 'increase' :
        change < -0.05 ? 'decrease' : 'stable';

      return { value: current, direction, source: 'connector_signals_broad' };
    }
  } catch (err) {
    log?.('debug', `OutcomeCollector: signal query failed for ${v.prediction_id}: ${err}`);
  }

  return null;
}

/**
 * Map NexusBrain domain IDs to cross_domain_signals source_domain values.
 */
function mapDomainToSignalDomain(domain: string): string {
  const map: Record<string, string> = {
    'early-warning': 'engineering',
    'scope-creep': 'engineering',
    'delivery-intelligence': 'engineering',
    'pod-match': 'engineering',
    'pr-review': 'engineering',
    'dead-code-detector': 'engineering',
    'incident-diagnosis': 'engineering',
    'performance-profiler': 'engineering',
    'bookkeeper': 'finance',
    'reconciler': 'finance',
    'anomaly': 'finance',
  };
  return map[domain] || domain;
}

export async function collectOutcomes(
  client: NexusClient,
  supabase: SupabaseConfig,
  log?: (level: string, msg: string) => void,
): Promise<CollectedOutcome[]> {
  const now = new Date().toISOString();

  // 1. Fetch pending verifications whose time has come
  let pending: PendingVerification[];
  try {
    pending = await querySupabase<PendingVerification>(
      supabase,
      'scheduled_verifications',
      {
        'status': 'eq.pending',
        'scheduled_for': `lte.${now}`,
        'organization_id': `eq.${supabase.orgId}`,
      },
      { limit: 100 },
    );
  } catch (err) {
    log?.('warn', `OutcomeCollector: failed to fetch pending verifications: ${err}`);
    return [];
  }

  if (pending.length === 0) {
    log?.('debug', 'OutcomeCollector: no pending verifications due');
    return [];
  }

  log?.('info', `OutcomeCollector: found ${pending.length} pending verification(s)`);

  // 2. For each verification, try to resolve from connector signals (NOT the brain)
  const collected: CollectedOutcome[] = [];

  for (const v of pending) {
    try {
      // ── Strategy 1: Signal-based resolution (from connector data) ──────
      if (SIGNAL_BACKED_DOMAINS.has(v.domain)) {
        const result = await resolveFromSignals(supabase, v, log);

        if (result) {
          collected.push({
            verification: v,
            actualValue: result.value,
            actualDirection: result.direction,
            collectedAt: new Date().toISOString(),
            source: 'connector_signals',
          });

          // Mark verification as collected in DB
          await updateSupabase(supabase, 'scheduled_verifications', v.id, {
            status: 'collected',
            actual_value: result.value,
            actual_direction: result.direction,
            collected_at: new Date().toISOString(),
            resolution_source: result.source,
          });

          log?.('info',
            `OutcomeCollector: ✓ resolved from signals — prediction ${v.prediction_id}: ` +
            `${result.direction} (${result.value}) [source: ${result.source}]`,
          );
          continue;
        }

        // No signal data available — mark for user verification
        log?.('info',
          `OutcomeCollector: no signal data for ${v.prediction_id} (${v.domain}), ` +
          `marking for user verification`,
        );
        await updateSupabase(supabase, 'scheduled_verifications', v.id, {
          status: 'awaiting_user_verification',
          resolution_note: 'No connector signals available for automated resolution',
        });
        continue;
      }

      // ── Strategy 2: Domains without connectors → user verification ─────
      // These domains (tdd, design-doc, test-cases, etc.) have no external API
      // to verify against. They MUST be verified by the user via
      // VerificationPromptCard (Gap 2).
      log?.('debug',
        `OutcomeCollector: ${v.domain} has no automated resolver, ` +
        `flagging for user verification`,
      );
      await updateSupabase(supabase, 'scheduled_verifications', v.id, {
        status: 'awaiting_user_verification',
        resolution_note: `Domain "${v.domain}" requires user verification — no automated resolver`,
      });

    } catch (err) {
      log?.('warn', `OutcomeCollector: failed to collect outcome for ${v.prediction_id}: ${err}`);
    }
  }

  log?.('info',
    `OutcomeCollector: collected ${collected.length}/${pending.length} outcomes ` +
    `(${pending.length - collected.length} deferred to user verification)`,
  );
  return collected;
}

export function registerOutcomeCollector(
  api: OpenClawApi,
  config: PluginConfig,
): void {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  const intervalMs = config.reinforcement.outcomeCollectorIntervalHours * 60 * 60 * 1000;

  api.registerService({
    id: 'nexusbrain-outcome-collector',

    async start() {
      api.log?.('info', `OutcomeCollector: starting (every ${config.reinforcement.outcomeCollectorIntervalHours}h)`);

      // Run immediately on start
      await collectOutcomes(config.client, config.supabase, api.log?.bind(api));

      // Then on interval
      intervalId = setInterval(async () => {
        try {
          await collectOutcomes(config.client, config.supabase, api.log?.bind(api));
        } catch (err) {
          api.log?.('error', `OutcomeCollector: unhandled error: ${err}`);
        }
      }, intervalMs);
    },

    stop() {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
      api.log?.('info', 'OutcomeCollector: stopped');
    },
  });
}
