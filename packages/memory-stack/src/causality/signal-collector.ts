/**
 * Nexus Memory Stack - Signal Collector
 *
 * L4: Causal Graph Engine
 * Cross-domain signal collection framework for predictive intelligence.
 *
 * The 10x Innovation: Instead of predefined rules, this system collects
 * signals from multiple domains and lets AI discover causal relationships.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A cross-domain signal captured by the collector
 */
export interface CrossDomainSignal {
  signal_type: string;
  source_domain: string;
  entity_type: string;
  entity_id: string;
  client_id?: string;
  signal_value: number; // -1 to 1, negative = risk, positive = opportunity
  feature_vector: Record<string, number>;
  signal_metadata: Record<string, any>;
  lookback_window_days: number;
}

/**
 * Configuration for a signal collector
 */
export interface SignalCollectorConfig {
  name: string;
  source_domain: string;
  collect: (supabase: SupabaseClient, organizationId: string) => Promise<CrossDomainSignal[]>;
}

/**
 * Result from signal collection run
 */
export interface SignalCollectionResult {
  success: boolean;
  signals_collected: number;
  organizations_processed: number;
  duration_ms: number;
  errors?: string[];
  signals_by_type?: Record<string, number>;
}

// ============================================================================
// SIGNAL COLLECTOR FRAMEWORK
// ============================================================================

/**
 * Create a signal collection engine
 *
 * @example
 * ```typescript
 * const engine = createSignalCollector({
 *   collectors: [paymentVelocityCollector, usageDeclineCollector],
 *   onSignalsCollected: async (signals) => {
 *     await supabase.from('cross_domain_signals').insert(signals);
 *   }
 * });
 *
 * const result = await engine.collectAll(supabase, organizationId);
 * ```
 */
export function createSignalCollector(options: {
  collectors: SignalCollectorConfig[];
  onSignalsCollected?: (signals: CrossDomainSignal[], organizationId: string) => Promise<void>;
}) {
  const { collectors, onSignalsCollected } = options;

  return {
    /**
     * Run all collectors for an organization
     */
    collectAll: async (
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<SignalCollectionResult> => {
      const startTime = Date.now();
      const allSignals: CrossDomainSignal[] = [];
      const errors: string[] = [];
      const signalsByType: Record<string, number> = {};

      // Run all collectors in parallel
      const results = await Promise.allSettled(
        collectors.map(async (collector) => {
          try {
            const signals = await collector.collect(supabase, organizationId);
            return { name: collector.name, signals };
          } catch (e) {
            throw new Error(`${collector.name}: ${e instanceof Error ? e.message : 'Unknown error'}`);
          }
        })
      );

      // Aggregate results
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { name, signals } = result.value;
          allSignals.push(...signals);
          signalsByType[name] = signals.length;
        } else {
          errors.push(result.reason.message);
        }
      }

      // Store signals if callback provided
      if (onSignalsCollected && allSignals.length > 0) {
        try {
          await onSignalsCollected(allSignals, organizationId);
        } catch (e) {
          errors.push(`Storage failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
      }

      return {
        success: errors.length === 0,
        signals_collected: allSignals.length,
        organizations_processed: 1,
        duration_ms: Date.now() - startTime,
        errors: errors.length > 0 ? errors : undefined,
        signals_by_type: signalsByType,
      };
    },

    /**
     * Run a specific collector by name
     */
    collectByName: async (
      supabase: SupabaseClient,
      organizationId: string,
      collectorName: string
    ): Promise<CrossDomainSignal[]> => {
      const collector = collectors.find((c) => c.name === collectorName);
      if (!collector) {
        throw new Error(`Collector not found: ${collectorName}`);
      }
      return collector.collect(supabase, organizationId);
    },

    /**
     * Get list of registered collectors
     */
    getCollectors: () => collectors.map((c) => ({ name: c.name, source_domain: c.source_domain })),
  };
}

// ============================================================================
// SIGNAL BUILDER UTILITIES
// ============================================================================

/**
 * Helper to create a normalized signal value
 * Converts any numeric value to a -1 to 1 range
 */
export function normalizeSignalValue(
  value: number,
  options: {
    min?: number;
    max?: number;
    invert?: boolean;
  } = {}
): number {
  const { min = -1, max = 1, invert = false } = options;
  let normalized = Math.max(min, Math.min(max, value));
  return invert ? -normalized : normalized;
}

/**
 * Helper to determine severity from signal value
 */
export function getSeverityFromSignal(
  signalValue: number,
  thresholds: { critical?: number; high?: number; medium?: number } = {}
): 'critical' | 'high' | 'medium' | 'low' {
  const { critical = -0.8, high = -0.5, medium = -0.2 } = thresholds;

  if (signalValue <= critical) return 'critical';
  if (signalValue <= high) return 'high';
  if (signalValue <= medium) return 'medium';
  return 'low';
}

/**
 * Create a signal builder for consistent signal creation
 */
export function createSignalBuilder(domain: string) {
  return {
    /**
     * Build a risk signal (negative value)
     */
    risk: (options: {
      type: string;
      entityType: string;
      entityId: string;
      clientId?: string;
      value: number;
      features: Record<string, number>;
      metadata?: Record<string, any>;
      lookbackDays?: number;
    }): CrossDomainSignal => ({
      signal_type: options.type,
      source_domain: domain,
      entity_type: options.entityType,
      entity_id: options.entityId,
      client_id: options.clientId,
      signal_value: Math.max(-1, Math.min(0, options.value)),
      feature_vector: options.features,
      signal_metadata: {
        severity: getSeverityFromSignal(options.value),
        ...options.metadata,
      },
      lookback_window_days: options.lookbackDays || 30,
    }),

    /**
     * Build an opportunity signal (positive value)
     */
    opportunity: (options: {
      type: string;
      entityType: string;
      entityId: string;
      clientId?: string;
      value: number;
      features: Record<string, number>;
      metadata?: Record<string, any>;
      lookbackDays?: number;
    }): CrossDomainSignal => ({
      signal_type: options.type,
      source_domain: domain,
      entity_type: options.entityType,
      entity_id: options.entityId,
      client_id: options.clientId,
      signal_value: Math.max(0, Math.min(1, options.value)),
      feature_vector: options.features,
      signal_metadata: {
        opportunity_level: options.value > 0.7 ? 'high' : options.value > 0.4 ? 'medium' : 'low',
        ...options.metadata,
      },
      lookback_window_days: options.lookbackDays || 30,
    }),
  };
}

// ============================================================================
// EXAMPLE COLLECTOR TEMPLATES
// ============================================================================

/**
 * Example: Payment velocity collector template
 * Detects clients with slowing/accelerating payment patterns
 */
export const paymentVelocityCollectorTemplate: SignalCollectorConfig = {
  name: 'payment_velocity',
  source_domain: 'finance',
  collect: async (supabase, organizationId) => {
    const signals: CrossDomainSignal[] = [];
    const builder = createSignalBuilder('finance');

    // Get invoices from last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, client_id, amount, invoice_date, due_date, paid_date, status')
      .eq('organization_id', organizationId)
      .gte('invoice_date', ninetyDaysAgo.toISOString())
      .order('invoice_date', { ascending: false });

    if (!invoices || invoices.length === 0) return signals;

    // Group by client and calculate velocity
    const clientInvoices = new Map<string, typeof invoices>();
    for (const inv of invoices) {
      if (!inv.client_id) continue;
      if (!clientInvoices.has(inv.client_id)) {
        clientInvoices.set(inv.client_id, []);
      }
      clientInvoices.get(inv.client_id)!.push(inv);
    }

    for (const [clientId, invs] of clientInvoices) {
      const paidInvoices = invs.filter((i: any) => i.paid_date && i.due_date);
      if (paidInvoices.length < 2) continue;

      // Compare recent vs older payment speed
      const recent = paidInvoices.slice(0, Math.ceil(paidInvoices.length / 2));
      const older = paidInvoices.slice(Math.ceil(paidInvoices.length / 2));

      const avgRecentDays = recent.reduce((sum: number, i: any) => {
        const due = new Date(i.due_date);
        const paid = new Date(i.paid_date);
        return sum + (paid.getTime() - due.getTime()) / (1000 * 60 * 60 * 24);
      }, 0) / recent.length;

      const avgOlderDays = older.reduce((sum: number, i: any) => {
        const due = new Date(i.due_date);
        const paid = new Date(i.paid_date);
        return sum + (paid.getTime() - due.getTime()) / (1000 * 60 * 60 * 24);
      }, 0) / older.length;

      // Velocity change: negative = slowing down
      const velocityChange = avgOlderDays - avgRecentDays;
      const normalizedValue = normalizeSignalValue(velocityChange / 30);

      if (Math.abs(normalizedValue) > 0.1) {
        if (normalizedValue < 0) {
          signals.push(
            builder.risk({
              type: 'payment_velocity_declining',
              entityType: 'client',
              entityId: clientId,
              clientId,
              value: normalizedValue,
              features: {
                avg_recent_days_to_pay: avgRecentDays,
                avg_older_days_to_pay: avgOlderDays,
                velocity_change_days: velocityChange,
                invoice_count: paidInvoices.length,
              },
              metadata: {
                alert_reason: 'payment_slowing',
                recommended_action: 'collections_review',
              },
              lookbackDays: 90,
            })
          );
        } else {
          signals.push(
            builder.opportunity({
              type: 'payment_velocity_improving',
              entityType: 'client',
              entityId: clientId,
              clientId,
              value: normalizedValue,
              features: {
                avg_recent_days_to_pay: avgRecentDays,
                avg_older_days_to_pay: avgOlderDays,
                velocity_change_days: velocityChange,
              },
              metadata: {
                opportunity_type: 'healthy_payment_pattern',
              },
              lookbackDays: 90,
            })
          );
        }
      }
    }

    return signals;
  },
};

/**
 * Example: Usage growth/decline collector template
 */
export const usageSignalCollectorTemplate: SignalCollectorConfig = {
  name: 'usage_signals',
  source_domain: 'client_success',
  collect: async (supabase, organizationId) => {
    const signals: CrossDomainSignal[] = [];
    const builder = createSignalBuilder('client_success');

    // This is a template - implement based on your usage data schema
    const { data: usageData } = await supabase
      .from('client_module_usage')
      .select('id, client_id, module_code, snapshot_month, usage_pct, threshold_status')
      .order('snapshot_month', { ascending: false })
      .limit(500);

    if (!usageData) return signals;

    // Group by client + module
    const clientModuleUsage = new Map<string, typeof usageData>();
    for (const usage of usageData) {
      if (!usage.client_id) continue;
      const key = `${usage.client_id}:${usage.module_code || 'default'}`;
      if (!clientModuleUsage.has(key)) {
        clientModuleUsage.set(key, []);
      }
      clientModuleUsage.get(key)!.push(usage);
    }

    for (const [key, usages] of clientModuleUsage) {
      const [clientId] = key.split(':');

      // Sort by date descending
      usages.sort(
        (a: any, b: any) =>
          new Date(b.snapshot_month).getTime() - new Date(a.snapshot_month).getTime()
      );

      if (usages.length < 2) continue;

      const current = usages[0];
      const previous = usages[1];

      // Usage exceeded cap - expansion opportunity
      if (current.threshold_status === 'exceeded' && current.usage_pct > 100) {
        const overageFactor = current.usage_pct / 100;

        signals.push(
          builder.opportunity({
            type: 'usage_exceeded_cap',
            entityType: 'client',
            entityId: clientId,
            clientId,
            value: Math.min(1, overageFactor / 5), // Normalize: 500% overage = 1.0
            features: {
              current_usage_pct: current.usage_pct,
              overage_factor: overageFactor,
            },
            metadata: {
              opportunity_type: 'expansion',
              alert_reason: 'cap_exceeded',
            },
          })
        );
      }

      // Usage decline
      if (previous.usage_pct > 0 && current.usage_pct < previous.usage_pct) {
        const declineRatio = (previous.usage_pct - current.usage_pct) / previous.usage_pct;

        if (declineRatio > 0.2) {
          signals.push(
            builder.risk({
              type: 'usage_decline',
              entityType: 'client',
              entityId: clientId,
              clientId,
              value: -declineRatio,
              features: {
                current_usage_pct: current.usage_pct,
                previous_usage_pct: previous.usage_pct,
                decline_ratio: declineRatio,
              },
              metadata: {
                alert_reason: 'usage_declining',
                recommended_action: 'engagement_outreach',
              },
            })
          );
        }
      }
    }

    return signals;
  },
};
