/**
 * FeedbackAgent — Verifies predictions with collected outcomes
 *
 * After OutcomeCollector gathers actual values, FeedbackAgent calls
 * NexusBrain's verification endpoint to trigger weight adjustment:
 * - Correct prediction: edge weight *= 1.05 (+5%)
 * - Wrong prediction: edge weight *= 0.90 (-10%)
 *
 * This is what makes the brain learn from its own predictions.
 *
 * Schedule: Runs after OutcomeCollector (chained, every 6h)
 */

import type { NexusClient } from '@nexus-ai/client';
import type { PluginConfig, SupabaseConfig } from '../config.js';

interface OpenClawApi {
  log?(level: string, message: string): void;
  registerService(def: { id: string; start(): Promise<void> | void; stop?(): Promise<void> | void }): void;
  on?(event: string, handler: (...args: unknown[]) => Promise<void> | void): void;
}

interface VerificationResult {
  predictionId: string;
  wasCorrect: boolean;
  directionCorrect: boolean;
  magnitudeError: number;
  weightBefore: number;
  weightAfter: number;
  edgeId: string;
}

interface FeedbackSummary {
  totalVerified: number;
  correct: number;
  incorrect: number;
  edgesStrengthened: number;
  edgesWeakened: number;
  results: VerificationResult[];
}

// Query Supabase for collected (unverified) outcomes
async function fetchCollectedOutcomes(supabase: SupabaseConfig): Promise<Array<{
  id: string;
  prediction_id: string;
  actual_value: number;
  actual_direction: string;
}>> {
  const url = `${supabase.supabaseUrl}/rest/v1/scheduled_verifications?` +
    `status=eq.collected&organization_id=eq.${supabase.orgId}&limit=100&order=collected_at.asc`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${supabase.supabaseKey}`,
      'apikey': supabase.supabaseKey,
    },
  });
  if (!res.ok) throw new Error(`FeedbackAgent: fetch failed: ${res.status}`);
  return res.json();
}

// Mark a verification as verified
async function markVerified(supabase: SupabaseConfig, id: string, result: VerificationResult): Promise<void> {
  const url = `${supabase.supabaseUrl}/rest/v1/scheduled_verifications?id=eq.${id}`;
  await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${supabase.supabaseKey}`,
      'apikey': supabase.supabaseKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      status: 'verified',
      was_correct: result.wasCorrect,
      direction_correct: result.directionCorrect,
      magnitude_error: result.magnitudeError,
      verified_at: new Date().toISOString(),
    }),
  });
}

export async function runFeedbackLoop(
  client: NexusClient,
  supabase: SupabaseConfig,
  log?: (level: string, msg: string) => void,
): Promise<FeedbackSummary> {
  const summary: FeedbackSummary = {
    totalVerified: 0,
    correct: 0,
    incorrect: 0,
    edgesStrengthened: 0,
    edgesWeakened: 0,
    results: [],
  };

  let outcomes: Awaited<ReturnType<typeof fetchCollectedOutcomes>>;
  try {
    outcomes = await fetchCollectedOutcomes(supabase);
  } catch (err) {
    log?.('warn', `FeedbackAgent: failed to fetch collected outcomes: ${err}`);
    return summary;
  }

  if (outcomes.length === 0) {
    log?.('debug', 'FeedbackAgent: no collected outcomes pending verification');
    return summary;
  }

  log?.('info', `FeedbackAgent: verifying ${outcomes.length} collected outcome(s)`);

  for (const outcome of outcomes) {
    try {
      // Call the brain to verify this prediction
      const result = await client.query(
        `SYSTEM: Verify prediction ${outcome.prediction_id}. ` +
        `The actual measured value is ${outcome.actual_value} with direction "${outcome.actual_direction}". ` +
        `Execute prediction verification: compare predicted vs actual, compute direction correctness ` +
        `and magnitude error, then update the causal edge weight accordingly ` +
        `(+5% for correct, -10% for incorrect). Return the verification result as JSON.`,
        { domain: 'engineering' },
      );

      // Parse verification result from brain response
      const verification = parseVerificationResult(result.answer, outcome.prediction_id);

      if (verification) {
        summary.totalVerified++;
        summary.results.push(verification);

        if (verification.wasCorrect) {
          summary.correct++;
          if (verification.weightAfter > verification.weightBefore) summary.edgesStrengthened++;
        } else {
          summary.incorrect++;
          if (verification.weightAfter < verification.weightBefore) summary.edgesWeakened++;
        }

        await markVerified(supabase, outcome.id, verification);
        log?.('info', `FeedbackAgent: prediction ${outcome.prediction_id} → ${verification.wasCorrect ? 'CORRECT' : 'INCORRECT'} (weight: ${verification.weightBefore.toFixed(3)} → ${verification.weightAfter.toFixed(3)})`);
      }
    } catch (err) {
      log?.('warn', `FeedbackAgent: failed to verify prediction ${outcome.prediction_id}: ${err}`);
    }
  }

  log?.('info', `FeedbackAgent: verified ${summary.totalVerified} predictions — ${summary.correct} correct, ${summary.incorrect} incorrect, ${summary.edgesStrengthened} edges strengthened, ${summary.edgesWeakened} weakened`);
  return summary;
}

function parseVerificationResult(answer: string, predictionId: string): VerificationResult | null {
  // Try JSON parse first
  const jsonMatch = answer.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        predictionId,
        wasCorrect: !!(parsed.wasCorrect || parsed.was_correct),
        directionCorrect: !!(parsed.directionCorrect || parsed.direction_correct),
        magnitudeError: parsed.magnitudeError ?? parsed.magnitude_error ?? 0,
        weightBefore: parsed.weightBefore ?? parsed.weight_before ?? 0,
        weightAfter: parsed.weightAfter ?? parsed.weight_after ?? 0,
        edgeId: parsed.edgeId ?? parsed.edge_id ?? '',
      };
    } catch { /* fall through to heuristic */ }
  }

  // Heuristic fallback
  const lower = answer.toLowerCase();
  const wasCorrect = lower.includes('correct') && !lower.includes('incorrect');
  return {
    predictionId,
    wasCorrect,
    directionCorrect: wasCorrect,
    magnitudeError: 0,
    weightBefore: 0,
    weightAfter: 0,
    edgeId: '',
  };
}

export function registerFeedbackAgent(
  api: OpenClawApi,
  config: PluginConfig,
): void {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  // Run 5 minutes after outcome collector (offset to avoid race)
  const intervalMs = config.reinforcement.outcomeCollectorIntervalHours * 60 * 60 * 1000;
  const offsetMs = 5 * 60 * 1000;

  api.registerService({
    id: 'nexusbrain-feedback-agent',

    async start() {
      api.log?.('info', `FeedbackAgent: starting (every ${config.reinforcement.outcomeCollectorIntervalHours}h, offset +5m)`);

      // Run after offset
      setTimeout(async () => {
        await runFeedbackLoop(config.client, config.supabase, api.log?.bind(api));

        intervalId = setInterval(async () => {
          try {
            await runFeedbackLoop(config.client, config.supabase, api.log?.bind(api));
          } catch (err) {
            api.log?.('error', `FeedbackAgent: unhandled error: ${err}`);
          }
        }, intervalMs);
      }, offsetMs);
    },

    stop() {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
      api.log?.('info', 'FeedbackAgent: stopped');
    },
  });
}
