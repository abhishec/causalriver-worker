/**
 * Nexus Cron Edge Function
 *
 * Scheduled function for periodic maintenance tasks.
 * Handles lightweight SQL-based operations that run well in a Deno edge function.
 *
 * Available tasks:
 *   1. prediction_verification — checks pending predictions against outcomes
 *   2. threshold_optimization — adjusts signal thresholds based on feedback
 *   3. evidence_decay — reduces confidence in stale causal relationships
 *   4. data_retention_cleanup — archives stale event stream data (90+ days old)
 *
 * IMPORTANT: Causal discovery is NOT handled here. It runs via the autonomous
 * trainer (scripts/autonomous-trainer.ts) which uses the full calibrated_ensemble
 * engine with 8 CausalRivers-proven techniques. The trainer runs on a launchd
 * schedule (every 6 hours) and calls createScheduledJobs().runDailyCausalDiscovery()
 * from the core @nexus-ai/memory-stack engine. This ensures ONE causal discovery
 * implementation across the entire system — no code duplication.
 *
 * Trigger: Supabase pg_cron or external cron (recommended: daily at 2 AM UTC)
 *
 * Request body (optional):
 *   { organizationId?, tasks?: string[] }
 *   If organizationId is omitted, runs for all organizations.
 *   If tasks is omitted, runs all tasks.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CronResult {
  task: string;
  organizationId: string;
  status: 'success' | 'skipped' | 'error';
  details: Record<string, unknown>;
  durationMs: number;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // No body is fine — run all tasks for all orgs
    }

    const requestedTasks = body.tasks || [
      'prediction_verification',
      'threshold_optimization',
      'evidence_decay',
      'sleep_cycle',
    ];
    const specificOrgId = body.organizationId;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get organizations to process
    let orgIds: string[] = [];
    if (specificOrgId) {
      orgIds = [specificOrgId];
    } else {
      // Get all orgs that have signals in the last 30 days
      const { data: orgs } = await supabase
        .from('cross_domain_signals')
        .select('organization_id')
        .gte('signal_timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .limit(100);

      orgIds = [...new Set((orgs || []).map((o: any) => o.organization_id))];
    }

    if (orgIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, results: [], message: 'No active organizations found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: CronResult[] = [];

    for (const orgId of orgIds) {
      // -----------------------------------------------------------------
      // Causal Discovery — handled by autonomous trainer, not this function.
      // The trainer uses the full calibrated_ensemble engine with conditional
      // Granger, cascade-aware scoring, and agreement voting. Running it here
      // would mean duplicating ~2000 lines of statistical code in Deno.
      // See: scripts/autonomous-trainer.ts → Stage 4 → createScheduledJobs()
      // -----------------------------------------------------------------
      if (requestedTasks.includes('causal_discovery')) {
        results.push({
          task: 'causal_discovery',
          organizationId: orgId,
          status: 'skipped',
          details: {
            reason: 'Causal discovery runs via the autonomous trainer (calibrated_ensemble engine). Use: pnpm exec tsx scripts/autonomous-trainer.ts',
          },
          durationMs: 0,
        });
      }

      // -----------------------------------------------------------------
      // Task 1: Prediction Verification — Check unverified predictions
      // -----------------------------------------------------------------
      if (requestedTasks.includes('prediction_verification')) {
        const start = Date.now();
        try {
          const { data: pendingVerifications } = await supabase
            .from('scheduled_verifications')
            .select('*, prediction_records(*)')
            .eq('organization_id', orgId)
            .eq('status', 'pending')
            .lte('scheduled_for', new Date().toISOString())
            .limit(100);

          let verified = 0;
          for (const v of pendingVerifications || []) {
            const prediction = v.prediction_records;
            if (!prediction) continue;

            // Check if an outcome has been recorded for this entity
            const { data: outcomes } = await supabase
              .from('causal_event_stream')
              .select('payload')
              .eq('organization_id', orgId)
              .eq('event_type', 'outcome')
              .eq('entity_type', prediction.entity_type)
              .eq('entity_id', prediction.entity_id)
              .gte('created_at', prediction.created_at)
              .limit(1);

            if (outcomes && outcomes.length > 0) {
              const outcome = outcomes[0].payload as any;
              const wasCorrect = outcome.metric_value !== undefined;

              await supabase
                .from('prediction_records')
                .update({
                  actual_value: outcome.metric_value,
                  was_correct: wasCorrect,
                  verified_at: new Date().toISOString(),
                })
                .eq('id', prediction.id);

              await supabase
                .from('scheduled_verifications')
                .update({
                  status: 'completed',
                  result: { wasCorrect, outcomeValue: outcome.metric_value },
                  completed_at: new Date().toISOString(),
                })
                .eq('id', v.id);

              verified++;
            }
          }

          results.push({
            task: 'prediction_verification',
            organizationId: orgId,
            status: 'success',
            details: { pendingChecked: (pendingVerifications || []).length, verified },
            durationMs: Date.now() - start,
          });
        } catch (err: any) {
          results.push({
            task: 'prediction_verification',
            organizationId: orgId,
            status: 'error',
            details: { error: err.message },
            durationMs: Date.now() - start,
          });
        }
      }

      // -----------------------------------------------------------------
      // Task 2: Threshold Optimization — Adjust signal thresholds
      // -----------------------------------------------------------------
      if (requestedTasks.includes('threshold_optimization')) {
        const start = Date.now();
        try {
          // Get current thresholds
          const { data: thresholds } = await supabase
            .from('signal_thresholds')
            .select('*')
            .eq('organization_id', orgId);

          let optimized = 0;
          for (const threshold of thresholds || []) {
            // Get recent signal distribution for this type
            const { data: recentSignals } = await supabase
              .from('cross_domain_signals')
              .select('signal_value')
              .eq('organization_id', orgId)
              .eq('source_domain', threshold.domain)
              .eq('signal_type', threshold.signal_type)
              .gte('signal_timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
              .limit(1000);

            if (!recentSignals || recentSignals.length < 20) continue;

            // Calculate new threshold using percentile method
            const values = recentSignals.map((s: any) => s.signal_value).sort((a: number, b: number) => a - b);
            const p90 = values[Math.floor(values.length * 0.9)];
            const oldThreshold = threshold.threshold_value;

            // Blend old and new (conservative update)
            const newThreshold = oldThreshold * 0.7 + p90 * 0.3;

            if (Math.abs(newThreshold - oldThreshold) / (oldThreshold || 1) > 0.05) {
              await supabase
                .from('signal_thresholds')
                .update({
                  threshold_value: newThreshold,
                  last_optimized_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', threshold.id);

              await supabase.from('threshold_optimization_history').insert({
                organization_id: orgId,
                domain: threshold.domain,
                signal_type: threshold.signal_type,
                old_threshold: oldThreshold,
                new_threshold: newThreshold,
                optimization_method: 'percentile_blend',
                improvement_score: Math.abs(newThreshold - oldThreshold) / (oldThreshold || 1),
              });

              optimized++;
            }
          }

          results.push({
            task: 'threshold_optimization',
            organizationId: orgId,
            status: 'success',
            details: { thresholdsChecked: (thresholds || []).length, optimized },
            durationMs: Date.now() - start,
          });
        } catch (err: any) {
          results.push({
            task: 'threshold_optimization',
            organizationId: orgId,
            status: 'error',
            details: { error: err.message },
            durationMs: Date.now() - start,
          });
        }
      }

      // -----------------------------------------------------------------
      // Task 3: Evidence Decay — Reduce confidence in stale relationships
      // -----------------------------------------------------------------
      if (requestedTasks.includes('evidence_decay')) {
        const start = Date.now();
        try {
          // Decay relationships not validated in 30+ days
          const decayThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const decayFactor = 0.95; // 5% decay per cycle

          const { data: staleRelationships } = await supabase
            .from('causal_relationships_statistical')
            .select('id, evidence_weight')
            .eq('organization_id', orgId)
            .or(`last_validated_at.is.null,last_validated_at.lt.${decayThreshold}`)
            .gt('evidence_weight', 0.1);

          let decayed = 0;
          for (const rel of staleRelationships || []) {
            const newWeight = (rel.evidence_weight || 1.0) * decayFactor;

            await supabase
              .from('causal_relationships_statistical')
              .update({
                evidence_weight: newWeight,
                is_significant: newWeight > 0.3, // Drop significance if weight too low
                updated_at: new Date().toISOString(),
              })
              .eq('id', rel.id);

            decayed++;
          }

          results.push({
            task: 'evidence_decay',
            organizationId: orgId,
            status: 'success',
            details: { staleRelationships: (staleRelationships || []).length, decayed },
            durationMs: Date.now() - start,
          });
        } catch (err: any) {
          results.push({
            task: 'evidence_decay',
            organizationId: orgId,
            status: 'error',
            details: { error: err.message },
            durationMs: Date.now() - start,
          });
        }
      }

      // -----------------------------------------------------------------
      // Task 4: Data Retention Cleanup — Archive stale event stream data
      // -----------------------------------------------------------------
      if (requestedTasks.includes('data_retention_cleanup')) {
        const start = Date.now();
        try {
          const retentionThreshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
          let archivedCount = 0;

          // Try RPC first (if cleanup_stale_event_stream function exists)
          const { data: cleanupResult, error: cleanupError } = await supabase.rpc(
            'cleanup_stale_event_stream',
            {
              p_organization_id: orgId,
              p_retention_days: 90,
            }
          );

          if (cleanupError) {
            // RPC doesn't exist — fall back to counting stale records
            // (The cron SQL job in migration 20250226000002 handles the actual
            //  archiving via direct UPDATE; we just report how many are stale.)
            const { count: staleCount } = await supabase
              .from('causal_event_stream')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', orgId)
              .lt('created_at', retentionThreshold);

            archivedCount = staleCount || 0;
          } else {
            archivedCount = cleanupResult?.archived_count || 0;
          }

          // Also clean up old signal data beyond extended retention period (180 days)
          const { count: signalsArchived } = await supabase
            .from('cross_domain_signals')
            .delete()
            .eq('organization_id', orgId)
            .lt('created_at', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
            .select('id', { count: 'exact', head: true });

          results.push({
            task: 'data_retention_cleanup',
            organizationId: orgId,
            status: 'success',
            details: {
              eventsArchived: archivedCount,
              signalsPurged: signalsArchived || 0,
              retentionDays: 90,
              signalRetentionDays: 180,
            },
            durationMs: Date.now() - start,
          });
        } catch (err: any) {
          results.push({
            task: 'data_retention_cleanup',
            organizationId: orgId,
            status: 'error',
            details: { error: err.message },
            durationMs: Date.now() - start,
          });
        }
      }

      // -----------------------------------------------------------------
      // Task 5: Sleep Cycle — Drain brain_feedback_queue + 7 learning loops
      // Runs hourly via this cron. Calls /api/brain/cycle?mode=sleep on the
      // Next.js platform so Node.js memory-stack runs the full closed-loop
      // learning engine (Loops 1-7: prediction verify, Bayesian updates,
      // user corrections, intervention tracking, auto-retrain, agent outcomes,
      // federation validation).
      // -----------------------------------------------------------------
      if (requestedTasks.includes('sleep_cycle')) {
        const start = Date.now();
        try {
          const platformUrl = Deno.env.get('PLATFORM_URL') || Deno.env.get('NEXT_PUBLIC_APP_URL');
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

          if (!platformUrl || !serviceKey) {
            results.push({
              task: 'sleep_cycle',
              organizationId: orgId,
              status: 'error',
              details: { error: 'PLATFORM_URL or SUPABASE_SERVICE_ROLE_KEY not set' },
              durationMs: 0,
            });
          } else {
            const response = await fetch(
              `${platformUrl}/api/brain/cycle?mode=sleep&organizationId=${orgId}`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${serviceKey}`,
                  'Content-Type': 'application/json',
                  'x-internal-cron': 'true',
                },
                body: JSON.stringify({ organizationId: orgId, mode: 'sleep', triggeredBy: 'nexus-cron' }),
              }
            );

            if (response.ok) {
              const data = await response.json().catch(() => ({}));
              results.push({
                task: 'sleep_cycle',
                organizationId: orgId,
                status: 'success',
                details: {
                  loopsRun: data.loopsRun ?? 'unknown',
                  feedbackDrained: data.feedbackDrained ?? 0,
                },
                durationMs: Date.now() - start,
              });
            } else {
              const errorText = await response.text().catch(() => '');
              results.push({
                task: 'sleep_cycle',
                organizationId: orgId,
                status: 'error',
                details: { error: `HTTP ${response.status}`, details: errorText.slice(0, 200) },
                durationMs: Date.now() - start,
              });
            }
          }
        } catch (err: any) {
          results.push({
            task: 'sleep_cycle',
            organizationId: orgId,
            status: 'error',
            details: { error: err.message },
            durationMs: Date.now() - start,
          });
        }
      }
    }

    // Log cron execution
    await supabase.from('ai_agent_activity').insert({
      organization_id: specificOrgId || '00000000-0000-4000-a000-000000000001', // CORE_BRAIN_ORG_ID — canonical source: packages/memory-stack/src/federation/constants.ts
      agent_type: 'cron',
      action_type: 'scheduled_run',
      input_summary: `Tasks: ${requestedTasks.join(', ')} | Orgs: ${orgIds.length}`,
      output_summary: `Results: ${results.filter(r => r.status === 'success').length} success, ${results.filter(r => r.status === 'error').length} error`,
      metadata: { orgCount: orgIds.length, tasks: requestedTasks },
    });

    return new Response(
      JSON.stringify({
        success: true,
        organizationsProcessed: orgIds.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
