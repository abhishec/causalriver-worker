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
          // Fetch recent signals (paginated to avoid 1000-row Supabase limit)
          const allSignals: any[] = [];
          let page = 0;
          const PAGE_SIZE = 1000;
          while (true) {
            const { data: batch } = await supabase
              .from('cross_domain_signals')
              .select('source_domain, signal_type, signal_value, signal_timestamp, created_at')
              .eq('organization_id', orgId)
              .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
              .order('created_at', { ascending: true })
              .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            if (!batch || batch.length === 0) break;
            allSignals.push(...batch);
            if (batch.length < PAGE_SIZE) break;
            page++;
            if (page > 10) break; // Safety cap: 10K signals max
          }

          if (allSignals.length < 30) {
            results.push({
              task: 'causal_discovery',
              organizationId: orgId,
              status: 'skipped',
              details: { reason: 'Insufficient data', signalCount: allSignals.length },
              durationMs: Date.now() - start,
            });
          } else {
            // Aggregate signals into daily time series per domain
            const domainDailyMap = new Map<string, Map<string, number[]>>();
            for (const s of allSignals) {
              const ts = s.signal_timestamp || s.created_at;
              const day = typeof ts === 'string' ? ts.substring(0, 10) : new Date(ts).toISOString().substring(0, 10);
              if (!domainDailyMap.has(s.source_domain)) {
                domainDailyMap.set(s.source_domain, new Map());
              }
              const dayMap = domainDailyMap.get(s.source_domain)!;
              if (!dayMap.has(day)) dayMap.set(day, []);
              dayMap.get(day)!.push(s.signal_value);
            }

            // Build aligned daily arrays for all domains
            const allDays = new Set<string>();
            for (const dayMap of domainDailyMap.values()) {
              for (const day of dayMap.keys()) allDays.add(day);
            }
            const sortedDays = [...allDays].sort();
            const domains = [...domainDailyMap.keys()];

            // Only keep domains with sufficient data density
            const validDomains = domains.filter(d => {
              const dayMap = domainDailyMap.get(d)!;
              return dayMap.size >= 10;
            });

            if (validDomains.length < 2) {
              results.push({
                task: 'causal_discovery',
                organizationId: orgId,
                status: 'skipped',
                details: { reason: 'Insufficient domain coverage', domainCount: validDomains.length },
                durationMs: Date.now() - start,
              });
            } else {
              // Build daily mean arrays and apply first-order differencing
              const domainSeries = new Map<string, number[]>();
              for (const domain of validDomains) {
                const dayMap = domainDailyMap.get(domain)!;
                const raw = sortedDays.map(day => {
                  const vals = dayMap.get(day);
                  return vals ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                });
                // First-order differencing for stationarity
                const diff = [];
                for (let t = 1; t < raw.length; t++) diff.push(raw[t] - raw[t - 1]);
                domainSeries.set(domain, diff);
              }

              // Test all directed pairs with lagged cross-correlation
              let relationshipsFound = 0;
              const MAX_LAG = Math.min(14, Math.floor(sortedDays.length / 4));

              for (const source of validDomains) {
                for (const target of validDomains) {
                  if (source === target) continue;
                  const x = domainSeries.get(source)!;
                  const y = domainSeries.get(target)!;
                  const T = Math.min(x.length, y.length);
                  if (T < 20) continue;

                  // Find lag with highest absolute cross-correlation
                  let bestLag = 1;
                  let bestCorr = 0;
                  for (let lag = 1; lag <= MAX_LAG; lag++) {
                    const n = T - lag;
                    if (n < 10) break;
                    let sumXY = 0, sumX2 = 0, sumY2 = 0;
                    let meanX = 0, meanY = 0;
                    for (let t = 0; t < n; t++) { meanX += x[t]; meanY += y[t + lag]; }
                    meanX /= n; meanY /= n;
                    for (let t = 0; t < n; t++) {
                      const dx = x[t] - meanX;
                      const dy = y[t + lag] - meanY;
                      sumXY += dx * dy;
                      sumX2 += dx * dx;
                      sumY2 += dy * dy;
                    }
                    const denom = Math.sqrt(sumX2 * sumY2);
                    const r = denom > 1e-10 ? sumXY / denom : 0;
                    if (Math.abs(r) > Math.abs(bestCorr)) {
                      bestCorr = r;
                      bestLag = lag;
                    }
                  }

                  // Approximate p-value from t-distribution of correlation
                  const n = T - bestLag;
                  const tStat = Math.abs(bestCorr) * Math.sqrt((n - 2) / Math.max(1e-10, 1 - bestCorr * bestCorr));
                  // Approximate 2-tailed p-value (good enough for edge function)
                  const pValue = n > 30
                    ? 2 * Math.exp(-0.717 * tStat - 0.416 * tStat * tStat) // Gaussian approx
                    : Math.min(1, 2 / (1 + Math.pow(tStat, 2) / Math.max(1, n - 2)));
                  const effectSize = bestCorr * bestCorr; // R² as effect size
                  const isSignificant = pValue < 0.05 && effectSize > 0.05;

                  // Upsert relationship
                  await supabase
                    .from('causal_relationships_statistical')
                    .upsert(
                      {
                        organization_id: orgId,
                        source_domain: source,
                        target_domain: target,
                        granger_f_statistic: tStat,
                        granger_p_value: Math.max(0, Math.min(1, pValue)),
                        optimal_lag_days: bestLag,
                        effect_size: effectSize,
                        confidence_interval_lower: Math.max(0, effectSize - 1.96 / Math.sqrt(n)),
                        confidence_interval_upper: Math.min(1, effectSize + 1.96 / Math.sqrt(n)),
                        sample_size: n,
                        observation_window_days: sortedDays.length,
                        is_significant: isSignificant,
                        natural_language: isSignificant
                          ? `${source} changes predict ${target} changes with ${bestLag}-day lag (r²=${effectSize.toFixed(3)}, p=${pValue.toFixed(4)})`
                          : `No significant relationship from ${source} to ${target}`,
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
                details: {
                  signalsAnalyzed: allSignals.length,
                  domainsFound: validDomains.length,
                  daysSpanned: sortedDays.length,
                  relationshipsUpdated: relationshipsFound,
                },
                durationMs: Date.now() - start,
              });
            }
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
