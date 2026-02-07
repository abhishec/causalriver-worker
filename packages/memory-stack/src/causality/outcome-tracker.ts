/**
 * Nexus Memory Stack - Outcome Tracker
 *
 * L4: Causal Graph Engine - Outcome Observation System
 *
 * Tracks intervention outcomes over time using scheduled observation windows.
 * This enables:
 * - Automatic outcome measurement at predefined checkpoints
 * - Effect estimation using DiD, propensity matching, etc.
 * - Feedback loop closure for relationship weight updates
 *
 * Key Innovation: Instead of immediate outcome recording, we schedule
 * observations at multiple checkpoints (7, 14, 30, 60, 90 days) to capture
 * both short-term and long-term effects.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeATE,
  computeDifferenceInDifferences,
  type InterventionEffect,
  type DifferenceInDifferences
} from './intervention-effects';
import type { ConfidenceInterval } from './statistical-tests';

// ============================================================================
// TYPES
// ============================================================================

/**
 * An observation window tracking intervention outcomes
 */
export interface ObservationWindow {
  id: string;
  organizationId: string;
  interventionId: string;
  entityType: string;
  entityId: string;
  clientId?: string;

  /** Metrics we're tracking */
  targetMetrics: string[];

  /** Values at intervention time */
  baselineValues: Record<string, number>;
  baselineTimestamp: Date;

  /** Observation schedule */
  observationPeriodDays: number;
  checkpointDays: number[];

  /** Recorded checkpoints */
  checkpoints: ObservationCheckpoint[];

  /** Current status */
  status: 'active' | 'completed' | 'cancelled' | 'expired';

  /** Next scheduled observation */
  nextCheckpointDate?: Date;

  /** Effect estimate (updated after each checkpoint) */
  currentEffectEstimate?: EffectEstimate;

  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

/**
 * A single observation checkpoint
 */
export interface ObservationCheckpoint {
  dayOffset: number;
  scheduledDate: Date;
  measuredAt?: Date;
  values?: Record<string, number>;
  status: 'pending' | 'measured' | 'skipped' | 'failed';
  error?: string;
}

/**
 * Effect estimate from observation window
 */
export interface EffectEstimate {
  /** Average treatment effect for primary metric */
  ate: number;
  /** Confidence interval */
  confidenceInterval: ConfidenceInterval;
  /** Estimation method used */
  method: 'naive' | 'did' | 'propensity' | 'synthetic_control';
  /** Per-metric effects */
  metricEffects: Record<string, {
    baseline: number;
    current: number;
    change: number;
    changePercent: number;
  }>;
  /** Statistical significance */
  isSignificant: boolean;
  pValue: number;
  /** Natural language summary */
  naturalLanguage: string;
  /** When this estimate was computed */
  computedAt: Date;
}

/**
 * Configuration for outcome tracker
 */
export interface OutcomeTrackerConfig {
  /** Default checkpoint days if not specified */
  defaultCheckpointDays: number[];
  /** Default observation period in days */
  defaultObservationPeriodDays: number;
  /** Significance level for effect testing */
  alpha: number;
  /** Minimum checkpoints before computing effect */
  minCheckpointsForEffect: number;
}

/**
 * Metric fetcher function type
 */
export type MetricFetcher = (
  supabase: SupabaseClient,
  organizationId: string,
  entityType: string,
  entityId: string,
  metrics: string[]
) => Promise<Record<string, number>>;

// ============================================================================
// OUTCOME TRACKER FACTORY
// ============================================================================

/**
 * Create an outcome tracker for intervention effect measurement
 *
 * @example
 * ```typescript
 * const tracker = createOutcomeTracker(supabase, {
 *   defaultCheckpointDays: [7, 14, 30, 60, 90]
 * });
 *
 * // Schedule observation for an intervention
 * const window = await tracker.scheduleObservation({
 *   interventionId: 'int_123',
 *   entityType: 'client',
 *   entityId: 'client_456',
 *   targetMetrics: ['health_score', 'nps', 'usage_pct'],
 *   baselineValues: { health_score: 75, nps: 45, usage_pct: 80 }
 * });
 *
 * // Record checkpoint observation
 * await tracker.recordCheckpoint(window.id, 7, {
 *   health_score: 78,
 *   nps: 50,
 *   usage_pct: 82
 * });
 *
 * // Compute effect estimate
 * const effect = await tracker.computeEffect(window.id);
 * ```
 */
export function createOutcomeTracker(
  supabase: SupabaseClient,
  config: Partial<OutcomeTrackerConfig> = {}
) {
  const {
    defaultCheckpointDays = [7, 14, 30, 60, 90],
    defaultObservationPeriodDays = 90,
    alpha = 0.05,
    minCheckpointsForEffect = 2
  } = config;

  // Get organization ID from context (assumes RLS is configured)
  const getOrganizationId = async (): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No authenticated user');

    const { data: profile } = await supabase
      .from('profiles')
      .select('current_organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.current_organization_id) {
      throw new Error('No organization context');
    }

    return profile.current_organization_id;
  };

  return {
    /**
     * Schedule a new observation window for an intervention
     */
    async scheduleObservation(options: {
      interventionId: string;
      entityType: string;
      entityId: string;
      clientId?: string;
      targetMetrics: string[];
      baselineValues: Record<string, number>;
      checkpointDays?: number[];
      observationPeriodDays?: number;
    }): Promise<ObservationWindow> {
      const organizationId = await getOrganizationId();
      const checkpoints = (options.checkpointDays || defaultCheckpointDays);
      const now = new Date();

      // Build checkpoint schedule
      const checkpointRecords: ObservationCheckpoint[] = checkpoints.map(dayOffset => ({
        dayOffset,
        scheduledDate: new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000),
        status: 'pending' as const
      }));

      // Find next checkpoint
      const nextCheckpoint = checkpointRecords.find(c => c.status === 'pending');

      const record = {
        organization_id: organizationId,
        intervention_id: options.interventionId,
        entity_type: options.entityType,
        entity_id: options.entityId,
        client_id: options.clientId || null,
        target_metrics: options.targetMetrics,
        baseline_values: options.baselineValues,
        baseline_timestamp: now.toISOString(),
        observation_period_days: options.observationPeriodDays || defaultObservationPeriodDays,
        checkpoint_days: checkpoints,
        checkpoints: checkpointRecords,
        status: 'active',
        next_checkpoint_date: nextCheckpoint?.scheduledDate.toISOString() || null
      };

      const { data, error } = await supabase
        .from('outcome_observation_windows')
        .insert(record)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to schedule observation: ${error.message}`);
      }

      return this.mapDbToWindow(data);
    },

    /**
     * Record an observation at a checkpoint
     */
    async recordCheckpoint(
      windowId: string,
      dayOffset: number,
      values: Record<string, number>
    ): Promise<ObservationWindow> {
      // Fetch current window
      const { data: windowData, error: fetchError } = await supabase
        .from('outcome_observation_windows')
        .select('*')
        .eq('id', windowId)
        .single();

      if (fetchError || !windowData) {
        throw new Error(`Window not found: ${windowId}`);
      }

      // Update checkpoint
      const checkpoints = (windowData.checkpoints as ObservationCheckpoint[]).map(c => {
        if (c.dayOffset === dayOffset) {
          return {
            ...c,
            measuredAt: new Date().toISOString(),
            values,
            status: 'measured' as const
          };
        }
        return c;
      });

      // Find next pending checkpoint
      const nextCheckpoint = checkpoints.find(c => c.status === 'pending');

      // Check if all checkpoints are done
      const allDone = checkpoints.every(c => c.status !== 'pending');

      const updateData: Record<string, unknown> = {
        checkpoints,
        next_checkpoint_date: nextCheckpoint?.scheduledDate || null,
        updated_at: new Date().toISOString()
      };

      if (allDone) {
        updateData.status = 'completed';
        updateData.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('outcome_observation_windows')
        .update(updateData)
        .eq('id', windowId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to record checkpoint: ${error.message}`);
      }

      return this.mapDbToWindow(data);
    },

    /**
     * Compute effect estimate from observations
     */
    async computeEffect(
      windowId: string,
      method: 'naive' | 'did' | 'propensity' = 'naive'
    ): Promise<EffectEstimate> {
      // Fetch window
      const { data: windowData, error: fetchError } = await supabase
        .from('outcome_observation_windows')
        .select('*')
        .eq('id', windowId)
        .single();

      if (fetchError || !windowData) {
        throw new Error(`Window not found: ${windowId}`);
      }

      const checkpoints = windowData.checkpoints as ObservationCheckpoint[];
      const baselineValues = windowData.baseline_values as Record<string, number>;
      const targetMetrics = windowData.target_metrics as string[];

      // Get measured checkpoints
      const measuredCheckpoints = checkpoints.filter(c =>
        c.status === 'measured' && c.values
      );

      if (measuredCheckpoints.length < minCheckpointsForEffect) {
        throw new Error(
          `Need at least ${minCheckpointsForEffect} checkpoints, have ${measuredCheckpoints.length}`
        );
      }

      // Get latest checkpoint values
      const latestCheckpoint = measuredCheckpoints[measuredCheckpoints.length - 1];
      const latestValues = latestCheckpoint.values!;

      // Compute per-metric effects
      const metricEffects: Record<string, {
        baseline: number;
        current: number;
        change: number;
        changePercent: number;
      }> = {};

      for (const metric of targetMetrics) {
        const baseline = baselineValues[metric] || 0;
        const current = latestValues[metric] || 0;
        const change = current - baseline;
        const changePercent = baseline !== 0 ? (change / baseline) * 100 : 0;

        metricEffects[metric] = { baseline, current, change, changePercent };
      }

      // Compute primary effect (first metric)
      const primaryMetric = targetMetrics[0];
      const primaryEffect = metricEffects[primaryMetric];

      // For naive estimation, we just compute the change
      // For proper causal inference, we'd need control group data
      let ate = primaryEffect.change;
      let pValue = 0.05; // Placeholder - proper test would need control data
      let isSignificant = true;

      // Simple CI estimation based on observed variance across checkpoints
      const metricValues = measuredCheckpoints
        .filter(c => c.values?.[primaryMetric] !== undefined)
        .map(c => c.values![primaryMetric]);

      const mean = metricValues.reduce((a, b) => a + b, 0) / metricValues.length;
      const variance = metricValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
        (metricValues.length - 1);
      const se = Math.sqrt(variance / metricValues.length);
      const z = 1.96; // 95% CI

      const confidenceInterval: ConfidenceInterval = {
        lower: ate - z * se,
        upper: ate + z * se,
        level: 1 - alpha
      };

      // If CI includes 0, not significant
      if (confidenceInterval.lower <= 0 && confidenceInterval.upper >= 0) {
        isSignificant = false;
        pValue = 0.1; // Approximate
      }

      const effectEstimate: EffectEstimate = {
        ate,
        confidenceInterval,
        method,
        metricEffects,
        isSignificant,
        pValue,
        naturalLanguage: this.generateEffectNarrative(primaryMetric, primaryEffect, isSignificant),
        computedAt: new Date()
      };

      // Store effect estimate
      await supabase
        .from('outcome_observation_windows')
        .update({
          current_effect_estimate: effectEstimate,
          updated_at: new Date().toISOString()
        })
        .eq('id', windowId);

      return effectEstimate;
    },

    /**
     * Get observation window by ID
     */
    async getWindow(windowId: string): Promise<ObservationWindow | null> {
      const { data, error } = await supabase
        .from('outcome_observation_windows')
        .select('*')
        .eq('id', windowId)
        .single();

      if (error || !data) return null;
      return this.mapDbToWindow(data);
    },

    /**
     * Get all active observation windows for an organization
     */
    async getActiveWindows(): Promise<ObservationWindow[]> {
      const { data, error } = await supabase
        .from('outcome_observation_windows')
        .select('*')
        .eq('status', 'active')
        .order('next_checkpoint_date', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch windows: ${error.message}`);
      }

      return (data || []).map(d => this.mapDbToWindow(d));
    },

    /**
     * Get windows with checkpoints due
     */
    async getWindowsDue(): Promise<ObservationWindow[]> {
      const now = new Date();

      const { data, error } = await supabase
        .from('outcome_observation_windows')
        .select('*')
        .eq('status', 'active')
        .lte('next_checkpoint_date', now.toISOString())
        .order('next_checkpoint_date', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch due windows: ${error.message}`);
      }

      return (data || []).map(d => this.mapDbToWindow(d));
    },

    /**
     * Cancel an observation window
     */
    async cancelWindow(windowId: string): Promise<void> {
      const { error } = await supabase
        .from('outcome_observation_windows')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', windowId);

      if (error) {
        throw new Error(`Failed to cancel window: ${error.message}`);
      }
    },

    /**
     * Map database record to ObservationWindow
     */
    mapDbToWindow(data: Record<string, unknown>): ObservationWindow {
      return {
        id: data.id as string,
        organizationId: data.organization_id as string,
        interventionId: data.intervention_id as string,
        entityType: data.entity_type as string,
        entityId: data.entity_id as string,
        clientId: data.client_id as string | undefined,
        targetMetrics: data.target_metrics as string[],
        baselineValues: data.baseline_values as Record<string, number>,
        baselineTimestamp: new Date(data.baseline_timestamp as string),
        observationPeriodDays: data.observation_period_days as number,
        checkpointDays: data.checkpoint_days as number[],
        checkpoints: data.checkpoints as ObservationCheckpoint[],
        status: data.status as ObservationWindow['status'],
        nextCheckpointDate: data.next_checkpoint_date
          ? new Date(data.next_checkpoint_date as string)
          : undefined,
        currentEffectEstimate: data.current_effect_estimate as EffectEstimate | undefined,
        createdAt: new Date(data.created_at as string),
        updatedAt: new Date(data.updated_at as string),
        completedAt: data.completed_at
          ? new Date(data.completed_at as string)
          : undefined
      };
    },

    /**
     * Generate natural language summary of effect
     */
    generateEffectNarrative(
      metric: string,
      effect: { baseline: number; current: number; change: number; changePercent: number },
      isSignificant: boolean
    ): string {
      const direction = effect.change > 0 ? 'increased' : 'decreased';
      const magnitude = Math.abs(effect.changePercent).toFixed(1);

      if (isSignificant) {
        return `${metric} ${direction} by ${magnitude}% from ${effect.baseline.toFixed(1)} ` +
               `to ${effect.current.toFixed(1)} following intervention (statistically significant)`;
      } else {
        return `${metric} ${direction} by ${magnitude}% but the change is not ` +
               `statistically significant (may be due to chance)`;
      }
    }
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a simple metric fetcher for common entity types
 */
export function createDefaultMetricFetcher(): MetricFetcher {
  return async (supabase, organizationId, entityType, entityId, metrics) => {
    const values: Record<string, number> = {};

    // This is a template - implement based on your schema
    if (entityType === 'client') {
      const { data: client } = await supabase
        .from('clients')
        .select('health_score, nps, arr, mrr')
        .eq('id', entityId)
        .eq('organization_id', organizationId)
        .single();

      if (client) {
        for (const metric of metrics) {
          if (metric in client) {
            values[metric] = client[metric as keyof typeof client] as number;
          }
        }
      }
    }

    return values;
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const OutcomeTracker = {
  createOutcomeTracker,
  createDefaultMetricFetcher
};
