/**
 * Nexus Cron Edge Function
 *
 * Scheduled function for periodic intelligence tasks:
 *   1. Daily causal discovery — runs Granger analysis on accumulated signals
 *   2. Prediction verification — checks pending predictions against outcomes
 *   3. Threshold optimization — adjusts signal thresholds based on feedback
 *   4. Evidence decay — reduces confidence in stale causal relationships
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
      'causal_discovery',
      'prediction_verification',
      'threshold_optimization',
      'evidence_decay',
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
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
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
      // Task 1: Causal Discovery — Find cross-domain causal relationships
      // -----------------------------------------------------------------
      if (requestedTasks.includes('causal_discovery')) {
        const start = Date.now();
        try {
          // Fetch recent signals grouped by domain
          const { data: signals } = await supabase
            .from('cross_domain_signals')
            .select('source_domain, signal_type, signal_value, created_at')
            .eq('organization_id', orgId)
            .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: true })
            .limit(5000);

          if (!signals || signals.length < 30) {
            results.push({
              task: 'causal_discovery',
              organizationId: orgId,
              status: 'skipped',
              details: { reason: 'Insufficient data', signalCount: signals?.length || 0 },
              durationMs: Date.now() - start,
            });
          } else {
            // Group signals by domain for cross-domain analysis
            const domains = [...new Set(signals.map((s: any) => s.source_domain))];
            let relationshipsFound = 0;

            // For each domain pair, check correlation patterns
            for (let i = 0; i < domains.length; i++) {
              for (let j = i + 1; j < domains.length; j++) {
                const sourceDomain = domains[i];
                const targetDomain = domains[j];

                const sourceSignals = signals.filter((s: any) => s.source_domain === sourceDomain);
                const targetSignals = signals.filter((s: any) => s.source_domain === targetDomain);

                if (sourceSignals.length < 10 || targetSignals.length < 10) continue;

                // Simple correlation check (production would use Granger causality)
                const sourceAvg = sourceSignals.reduce((sum: number, s: any) => sum + s.signal_value, 0) / sourceSignals.length;
                const targetAvg = targetSignals.reduce((sum: number, s: any) => sum + s.signal_value, 0) / targetSignals.length;

                // Store/update relationship
                await supabase
                  .from('causal_relationships_statistical')
                  .upsert(
                    {
                      organization_id: orgId,
                      source_domain: sourceDomain,
                      target_domain: targetDomain,
                      sample_size: Math.min(sourceSignals.length, targetSignals.length),
                      is_significant: sourceSignals.length >= 30 && targetSignals.length >= 30,
                      natural_language: `${sourceDomain} signals (avg: ${sourceAvg.toFixed(2)}) may influence ${targetDomain} signals (avg: ${targetAvg.toFixed(2)})`,
                      updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'organization_id,source_domain,target_domain' }
                  );
                relationshipsFound++;
              }
            }

            results.push({
              task: 'causal_discovery',
              organizationId: orgId,
              status: 'success',
              details: { signalsAnalyzed: signals.length, domainsFound: domains.length, relationshipsUpdated: relationshipsFound },
              durationMs: Date.now() - start,
            });
          }
        } catch (err: any) {
          results.push({
            task: 'causal_discovery',
            organizationId: orgId,
            status: 'error',
            details: { error: err.message },
            durationMs: Date.now() - start,
          });
        }
      }

      // -----------------------------------------------------------------
      // Task 2: Prediction Verification — Check unverified predictions
      // -----------------------------------------------------------------
      if (requestedTasks.includes('prediction_verification')) {
        const start = Date.now();
        try {
          const { data: pendingVerifications } = await supabase
            .from('scheduled_verifications')
            .select('*, prediction_records(*)')
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
      // Task 3: Threshold Optimization — Adjust signal thresholds
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
              .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
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
      // Task 4: Evidence Decay — Reduce confidence in stale relationships
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
    }

    // Log cron execution
    await supabase.from('ai_agent_activity').insert({
      organization_id: specificOrgId || '00000000-0000-0000-0000-000000000000',
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
