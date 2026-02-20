/**
 * OutcomeCollector — Polls scheduled_verifications, fetches actual metric values
 *
 * This is the critical missing piece in NexusBrain's reinforcement loop.
 * Predictions are recorded and verifications are scheduled, but nobody
 * ever measures the actual outcomes. This service does that automatically.
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
}

interface CollectedOutcome {
  verification: PendingVerification;
  actualValue: number;
  actualDirection: 'increase' | 'decrease' | 'stable';
  collectedAt: string;
}

// Helper to query Supabase REST API directly
async function querySupabase<T>(
  supabase: SupabaseConfig,
  table: string,
  filters: Record<string, string>,
  limit = 50,
): Promise<T[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    params.set(key, value);
  }
  params.set('limit', String(limit));
  params.set('order', 'scheduled_for.asc');

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
      100,
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

  // 2. For each, ask the brain for the current actual value
  const collected: CollectedOutcome[] = [];

  for (const v of pending) {
    try {
      const result = await client.query(
        `What is the current measured value of "${v.target_metric}" for entity "${v.entity_id}" (type: ${v.entity_type})? ` +
        `Return ONLY the numeric value and whether it increased, decreased, or stayed stable compared to baseline. ` +
        `This is for automated prediction verification — be precise.`,
        { domain: v.domain as 'finance' | 'engineering' | 'cs' | 'marketing' | 'people' | 'revenue' },
      );

      // Parse actual value from brain response
      const parsed = parseActualValue(result.answer, v);
      if (parsed) {
        collected.push({
          verification: v,
          actualValue: parsed.value,
          actualDirection: parsed.direction,
          collectedAt: new Date().toISOString(),
        });

        // Mark verification as collected in DB
        await updateSupabase(supabase, 'scheduled_verifications', v.id, {
          status: 'collected',
          actual_value: parsed.value,
          actual_direction: parsed.direction,
          collected_at: new Date().toISOString(),
        });

        log?.('info', `OutcomeCollector: collected outcome for prediction ${v.prediction_id}: ${parsed.direction} (${parsed.value})`);
      } else {
        log?.('debug', `OutcomeCollector: could not parse actual value for ${v.prediction_id}, will retry`);
      }
    } catch (err) {
      log?.('warn', `OutcomeCollector: failed to collect outcome for ${v.prediction_id}: ${err}`);
    }
  }

  log?.('info', `OutcomeCollector: collected ${collected.length}/${pending.length} outcomes`);
  return collected;
}

function parseActualValue(
  answer: string,
  verification: PendingVerification,
): { value: number; direction: 'increase' | 'decrease' | 'stable' } | null {
  // Try to extract a number from the brain's answer
  const numberMatch = answer.match(/-?\d+(?:\.\d+)?/);
  if (!numberMatch) return null;

  const value = parseFloat(numberMatch[0]);
  if (isNaN(value)) return null;

  // Determine direction
  const lowerAnswer = answer.toLowerCase();
  let direction: 'increase' | 'decrease' | 'stable';
  if (lowerAnswer.includes('increase') || lowerAnswer.includes('rose') || lowerAnswer.includes('grew') || lowerAnswer.includes('higher')) {
    direction = 'increase';
  } else if (lowerAnswer.includes('decrease') || lowerAnswer.includes('dropped') || lowerAnswer.includes('fell') || lowerAnswer.includes('lower') || lowerAnswer.includes('declined')) {
    direction = 'decrease';
  } else {
    direction = 'stable';
  }

  return { value, direction };
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
