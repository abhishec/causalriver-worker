/**
 * Scheduled Jobs
 *
 * Cron-compatible functions for periodic maintenance tasks.
 * Designed to be called from Supabase cron or pg_cron.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  runCausalDiscovery,
  findNewRelationships,
  findLostRelationships,
  type CausalRelationship,
} from '../causality/causal-discovery-runner';

// ============================================================================
// TYPES
// ============================================================================

export interface ScheduledJobsConfig {
  /** Lookback window for causal discovery (default: 90 days) */
  lookbackDays: number;
  /** Minimum observations per domain (default: 30) */
  minObservations: number;
}

const DEFAULT_CONFIG: ScheduledJobsConfig = {
  lookbackDays: 90,
  minObservations: 30,
};

// ============================================================================
// JOBS
// ============================================================================

/**
 * Create a scheduled jobs runner
 */
export function createScheduledJobs(
  supabase: SupabaseClient,
  config: Partial<ScheduledJobsConfig> = {}
) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    /**
     * Run full causal discovery for an organization.
     * Recommended: daily via cron.
     */
    async runDailyCausalDiscovery(organizationId: string): Promise<{
      newRelationships: CausalRelationship[];
      lostRelationships: CausalRelationship[];
      totalDiscovered: number;
    }> {
      // Fetch recent signals
      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - fullConfig.lookbackDays);

      const { data: signals, error } = await supabase
        .from('cross_domain_signals')
        .select('source_domain, signal_type, signal_value, created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', lookbackDate.toISOString())
        .order('created_at', { ascending: true });

      if (error || !signals || signals.length === 0) {
        return {
          newRelationships: [],
          lostRelationships: [],
          totalDiscovered: 0,
        };
      }

      // Run discovery
      const result = runCausalDiscovery(
        signals.map((s: any) => ({
          source_domain: s.source_domain,
          signal_type: s.signal_type,
          signal_value: s.signal_value,
          signal_timestamp: s.created_at,
        })),
        organizationId,
        {
          lookbackDays: fullConfig.lookbackDays,
          minObservations: fullConfig.minObservations,
        }
      );

      // Compare with previous run
      const { data: previousRelationships } = await supabase
        .from('causal_relationships_statistical')
        .select('*')
        .eq('organization_id', organizationId);

      const newRels = previousRelationships
        ? findNewRelationships(
            result.discovered_relationships,
            previousRelationships
          )
        : result.discovered_relationships;

      const lostRels = previousRelationships
        ? findLostRelationships(
            result.discovered_relationships,
            previousRelationships
          )
        : [];

      // Store new results
      if (result.discovered_relationships.length > 0) {
        await supabase.from('causal_relationships_statistical').upsert(
          result.discovered_relationships.map((r) => ({
            organization_id: r.organization_id,
            source_domain: r.source_domain,
            target_domain: r.target_domain,
            granger_f_statistic: r.granger_f_statistic,
            granger_p_value: r.granger_p_value,
            optimal_lag_days: r.optimal_lag_days,
            effect_size: r.effect_size,
            confidence_interval_lower: r.confidence_interval_lower,
            confidence_interval_upper: r.confidence_interval_upper,
            natural_language: r.natural_language,
            sample_size: r.sample_size,
            is_significant: r.is_significant,
            last_computed_at: new Date().toISOString(),
          })),
          { onConflict: 'organization_id,source_domain,target_domain' }
        );
      }

      return {
        newRelationships: newRels,
        lostRelationships: lostRels,
        totalDiscovered: result.discovered_relationships.length,
      };
    },
  };
}
