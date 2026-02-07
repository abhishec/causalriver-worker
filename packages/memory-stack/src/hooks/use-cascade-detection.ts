/**
 * Nexus Memory Stack - Cascade Detection Hook
 *
 * React hook for real-time cross-domain cascade monitoring.
 * Detects and alerts on cascading effects across business domains.
 *
 * CRITICAL: All queries are organization-scoped for multi-tenant isolation.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrossDomainSignal, DomainRelationship, CausalChainOutcome } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface UseCascadeDetectionOptions {
  supabase: SupabaseClient;
  organizationId: string | null;
  /** Poll interval in ms (default: 30000 = 30 seconds, 0 = disabled) */
  pollInterval?: number;
  /** Minimum cascade impact to alert (default: 0.3) */
  impactThreshold?: number;
  /** Domains to monitor (default: all) */
  domains?: string[];
}

export interface CascadeAlert {
  id: string;
  sourceDomain: string;
  targetDomains: string[];
  signal: CrossDomainSignal;
  predictedImpact: number;
  relationships: DomainRelationship[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
}

export interface CascadeDetectionResult {
  /** Active cascade alerts */
  alerts: CascadeAlert[];
  /** Recent cross-domain signals */
  recentSignals: CrossDomainSignal[];
  /** Known domain relationships */
  relationships: DomainRelationship[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Manually check for cascades */
  checkNow: () => Promise<void>;
  /** Dismiss an alert */
  dismissAlert: (alertId: string) => void;
  /** Record cascade outcome (for model training) */
  recordOutcome: (outcome: Partial<CausalChainOutcome>) => Promise<void>;
  /** Refresh all data */
  refresh: () => void;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for cascade detection and monitoring
 *
 * @example
 * ```typescript
 * const { alerts, checkNow, recordOutcome } = useCascadeDetection({
 *   supabase,
 *   organizationId,
 *   pollInterval: 30000,
 *   impactThreshold: 0.3,
 * });
 *
 * // Check for alerts
 * if (alerts.length > 0) {
 *   console.log('Cascade detected:', alerts[0]);
 * }
 *
 * // Record outcome after intervention
 * await recordOutcome({
 *   causal_chain_id: alerts[0].id,
 *   resolution_type: 'prevented',
 *   intervention_taken: true,
 * });
 * ```
 */
export function useCascadeDetection(options: UseCascadeDetectionOptions): CascadeDetectionResult {
  const {
    supabase,
    organizationId,
    pollInterval = 30000,
    impactThreshold = 0.3,
    domains,
  } = options;

  const queryClient = useQueryClient();

  // Fetch recent cross-domain signals
  const signalsQuery = useQuery({
    queryKey: ['cascade-signals', organizationId, domains],
    queryFn: async (): Promise<CrossDomainSignal[]> => {
      if (!organizationId) return [];

      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      let query = supabase
        .from('cross_domain_signals')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('created_at', oneDayAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      if (domains && domains.length > 0) {
        query = query.in('source_domain', domains);
      }

      const { data, error } = await query;

      if (error) {
        console.warn('[useCascadeDetection] Signals error:', error.message);
        return [];
      }

      return (data || []).map((item: any) => ({
        id: item.id,
        organization_id: item.organization_id,
        signal_type: item.signal_type,
        source_domain: item.source_domain,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        client_id: item.client_id,
        feature_vector: item.feature_vector || {},
        signal_value: item.signal_value,
        signal_metadata: item.signal_metadata,
        cascade_occurred: item.cascade_occurred,
        cascade_impact: item.cascade_impact,
        cascade_domains: item.cascade_domains,
        is_processed: item.is_processed,
        created_at: item.created_at,
      }));
    },
    enabled: !!organizationId,
    refetchInterval: pollInterval > 0 ? pollInterval : undefined,
    staleTime: 10000,
  });

  // Fetch domain relationships
  const relationshipsQuery = useQuery({
    queryKey: ['domain-relationships', organizationId],
    queryFn: async (): Promise<DomainRelationship[]> => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from('ai_domain_relationships')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('strength', { ascending: false });

      if (error) {
        console.warn('[useCascadeDetection] Relationships error:', error.message);
        return [];
      }

      return (data || []).map((item: any) => ({
        id: item.id,
        organization_id: item.organization_id,
        source_domain: item.source_domain,
        target_domain: item.target_domain,
        relationship_type: item.relationship_type,
        strength: item.strength || 0.5,
        evidence: item.evidence || [],
        observation_count: item.observation_count || 0,
        discovered_pattern: item.discovered_pattern,
        last_observed_at: item.last_observed_at,
        is_active: item.is_active,
        created_at: item.created_at,
      }));
    },
    enabled: !!organizationId,
    staleTime: 300000, // 5 minutes
  });

  // Build alerts from signals and relationships
  const alerts: CascadeAlert[] = (signalsQuery.data || [])
    .filter((signal) => {
      // Only include signals that indicate potential cascade
      return (
        signal.cascade_occurred ||
        (signal.cascade_impact && signal.cascade_impact >= impactThreshold)
      );
    })
    .map((signal): CascadeAlert => {
      // Find related relationships
      const relatedRelationships = (relationshipsQuery.data || []).filter(
        (rel) => rel.source_domain === signal.source_domain
      );

      const targetDomains = signal.cascade_domains ||
        relatedRelationships.map((r) => r.target_domain);

      // Calculate severity
      const impact = signal.cascade_impact || 0;
      let severity: CascadeAlert['severity'] = 'low';
      if (impact >= 0.7) severity = 'critical';
      else if (impact >= 0.5) severity = 'high';
      else if (impact >= 0.3) severity = 'medium';

      return {
        id: signal.id,
        sourceDomain: signal.source_domain,
        targetDomains,
        signal,
        predictedImpact: impact,
        relationships: relatedRelationships,
        severity,
        createdAt: new Date(signal.created_at),
      };
    });

  // Manual cascade check
  const checkMutation = useMutation({
    mutationFn: async () => {
      // Invalidate and refetch signals
      await queryClient.invalidateQueries({
        queryKey: ['cascade-signals', organizationId],
      });
    },
  });

  // Record outcome mutation
  const recordOutcomeMutation = useMutation({
    mutationFn: async (outcome: Partial<CausalChainOutcome>) => {
      if (!organizationId) throw new Error('Organization ID required');

      const { error } = await supabase.from('causal_chain_outcomes').insert({
        organization_id: organizationId,
        ...outcome,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['cascade-signals', organizationId],
      });
    },
  });

  // Dismiss alert (mark signal as processed)
  const dismissAlert = async (alertId: string) => {
    await supabase
      .from('cross_domain_signals')
      .update({ is_processed: true })
      .eq('id', alertId);

    queryClient.invalidateQueries({
      queryKey: ['cascade-signals', organizationId],
    });
  };

  return {
    alerts,
    recentSignals: signalsQuery.data || [],
    relationships: relationshipsQuery.data || [],
    isLoading: signalsQuery.isLoading || relationshipsQuery.isLoading,
    error: signalsQuery.error || relationshipsQuery.error,
    checkNow: checkMutation.mutateAsync,
    dismissAlert,
    recordOutcome: recordOutcomeMutation.mutateAsync,
    refresh: () => {
      queryClient.invalidateQueries({ queryKey: ['cascade-signals', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['domain-relationships', organizationId] });
    },
  };
}

/**
 * Hook for monitoring a specific domain's cascade risk
 */
export function useDomainCascadeRisk(
  options: UseCascadeDetectionOptions & { domain: string }
) {
  const { domain, ...restOptions } = options;
  const result = useCascadeDetection({
    ...restOptions,
    domains: [domain],
  });

  // Calculate domain-specific risk score
  const riskScore = result.alerts.reduce((score, alert) => {
    if (alert.sourceDomain === domain) {
      return score + alert.predictedImpact;
    }
    return score;
  }, 0);

  const normalizedRisk = Math.min(riskScore, 1);

  return {
    ...result,
    domain,
    riskScore: normalizedRisk,
    riskLevel: normalizedRisk >= 0.7 ? 'high' : normalizedRisk >= 0.4 ? 'medium' : 'low',
  };
}
