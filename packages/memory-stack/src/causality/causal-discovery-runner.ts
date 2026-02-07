/**
 * Causal Discovery Runner
 *
 * Orchestrates the full Granger causality discovery pipeline:
 * 1. Fetch cross_domain_signals for an organization
 * 2. Convert to aligned time series per domain
 * 3. Run pairwise Granger causality tests
 * 4. Store significant relationships with statistical evidence
 *
 * This enables the system to automatically discover which domain
 * changes precede others (e.g., "Finance delays → CS escalations").
 */

import {
  signalsToTimeSeries,
  differenceTimeSeries,
  computeTimeSeriesStats,
  type DailyTimeSeries,
  type TimeSeriesConfig,
  DEFAULT_TIMESERIES_CONFIG,
} from './signal-to-timeseries';

import {
  computeGrangerCausality,
  testAllPairs,
  interpretResult,
  type GrangerResult,
  type GrangerTestConfig,
} from './granger-causality';

// ============================================================================
// TYPES
// ============================================================================

export interface CausalRelationship {
  id?: string;
  organization_id: string;
  source_domain: string;
  target_domain: string;
  
  // Statistical evidence
  granger_f_statistic: number;
  granger_p_value: number;
  optimal_lag_days: number;
  effect_size: number;
  confidence_interval_lower: number;
  confidence_interval_upper: number;
  
  // Interpretable output
  natural_language: string;
  
  // Metadata
  sample_size: number;
  observation_window_days: number;
  is_significant: boolean;
  last_computed_at: Date;
}

export interface DiscoveryConfig {
  /** Time series configuration */
  timeSeries: TimeSeriesConfig;
  
  /** Granger test configuration */
  granger: GrangerTestConfig;
  
  /** Minimum observations per domain */
  minObservations: number;
  
  /** Lookback window in days */
  lookbackDays: number;
  
  /** Significance threshold (alpha) */
  alpha: number;
}

export const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfig = {
  timeSeries: {
    ...DEFAULT_TIMESERIES_CONFIG,
    fillMethod: 'interpolate',
  },
  granger: {
    maxLag: 14,
    alpha: 0.05,
  },
  minObservations: 30,
  lookbackDays: 90,
  alpha: 0.05,
};

export interface DiscoveryResult {
  organization_id: string;
  discovered_relationships: CausalRelationship[];
  domains_analyzed: string[];
  pairs_tested: number;
  significant_count: number;
  run_timestamp: Date;
  config_used: DiscoveryConfig;
  warnings: string[];
}

// ============================================================================
// DISCOVERY PIPELINE
// ============================================================================

/**
 * Run full causal discovery on cross_domain_signals
 * 
 * This is the main entry point for the discovery pipeline.
 * In production, this is called from an edge function.
 */
export function runCausalDiscovery(
  signals: Array<{
    source_domain: string;
    signal_type: string;
    signal_value: number;
    signal_timestamp: string | Date;
  }>,
  organizationId: string,
  config: Partial<DiscoveryConfig> = {}
): DiscoveryResult {
  const fullConfig: DiscoveryConfig = {
    ...DEFAULT_DISCOVERY_CONFIG,
    ...config,
    timeSeries: { ...DEFAULT_DISCOVERY_CONFIG.timeSeries, ...config.timeSeries },
    granger: { ...DEFAULT_DISCOVERY_CONFIG.granger, ...config.granger },
  };
  
  const warnings: string[] = [];
  const runTimestamp = new Date();
  
  // Convert signals to standardized format
  const normalizedSignals = signals.map(s => ({
    organization_id: organizationId,
    source_domain: s.source_domain,
    signal_type: s.signal_type,
    signal_value: s.signal_value,
    signal_timestamp: s.signal_timestamp,
  }));
  
  // Step 1: Convert to time series
  const timeSeriesMap = signalsToTimeSeries(normalizedSignals, fullConfig.timeSeries);
  const domains = Array.from(timeSeriesMap.keys());
  
  if (domains.length < 2) {
    warnings.push(`Insufficient domains for causal analysis: ${domains.length} (need >= 2)`);
    return {
      organization_id: organizationId,
      discovered_relationships: [],
      domains_analyzed: domains,
      pairs_tested: 0,
      significant_count: 0,
      run_timestamp: runTimestamp,
      config_used: fullConfig,
      warnings,
    };
  }
  
  // Step 2: Validate each time series has enough data
  const validDomains: string[] = [];
  for (const [domain, series] of timeSeriesMap) {
    const nonZeroCount = series.values.filter(v => v !== 0).length;
    
    if (series.values.length < fullConfig.minObservations) {
      warnings.push(`${domain}: Insufficient observations (${series.values.length} < ${fullConfig.minObservations})`);
      continue;
    }
    
    if (nonZeroCount < fullConfig.minObservations / 2) {
      warnings.push(`${domain}: Too sparse (${nonZeroCount} non-zero values)`);
      continue;
    }
    
    validDomains.push(domain);
  }
  
  if (validDomains.length < 2) {
    warnings.push(`Insufficient valid domains after filtering: ${validDomains.length}`);
    return {
      organization_id: organizationId,
      discovered_relationships: [],
      domains_analyzed: domains,
      pairs_tested: 0,
      significant_count: 0,
      run_timestamp: runTimestamp,
      config_used: fullConfig,
      warnings,
    };
  }
  
  // Step 3: Prepare data for Granger tests
  // Apply first-order differencing for stationarity
  const differenced = new Map<string, DailyTimeSeries>();
  for (const domain of validDomains) {
    const series = timeSeriesMap.get(domain)!;
    differenced.set(domain, differenceTimeSeries(series));
  }
  
  // Step 4: Run pairwise Granger tests
  const grangerData: Record<string, number[]> = {};
  for (const [domain, series] of differenced) {
    grangerData[domain] = series.values;
  }
  
  const grangerResults = testAllPairs(grangerData, fullConfig.granger);
  
  // Step 5: Convert significant results to CausalRelationship format
  const relationships: CausalRelationship[] = [];
  
  for (const result of grangerResults) {
    if (!result.isSignificant) continue;
    
    // Get observation count from source series
    const sourceSeries = timeSeriesMap.get(result.sourceDomain);
    const observationDays = sourceSeries?.metadata.dayCount || 0;

    // Compute basic confidence interval (approximate)
    const marginOfError = 1.96 * (1 / Math.sqrt(observationDays)); // 95% CI

    relationships.push({
      organization_id: organizationId,
      source_domain: result.sourceDomain,
      target_domain: result.targetDomain,
      granger_f_statistic: result.fStatistic,
      granger_p_value: result.pValue,
      optimal_lag_days: result.optimalLag,
      effect_size: result.effectSize,
      confidence_interval_lower: Math.max(0, result.effectSize - marginOfError),
      confidence_interval_upper: Math.min(1, result.effectSize + marginOfError),
      natural_language: interpretResult(result),
      sample_size: observationDays,
      observation_window_days: fullConfig.lookbackDays,
      is_significant: true,
      last_computed_at: runTimestamp,
    });
  }
  
  return {
    organization_id: organizationId,
    discovered_relationships: relationships,
    domains_analyzed: validDomains,
    pairs_tested: grangerResults.length,
    significant_count: relationships.length,
    run_timestamp: runTimestamp,
    config_used: fullConfig,
    warnings,
  };
}

/**
 * Generate natural language summary of discovery results
 */
export function summarizeDiscovery(result: DiscoveryResult): string {
  const lines = [
    `## Causal Discovery Results`,
    ``,
    `**${result.domains_analyzed.length} domains analyzed** over ${result.config_used.lookbackDays} days`,
    `**${result.pairs_tested} domain pairs tested** with Granger causality`,
    `**${result.significant_count} significant relationships discovered** (p < ${result.config_used.alpha})`,
    ``,
  ];
  
  if (result.discovered_relationships.length > 0) {
    lines.push(`### Discovered Relationships:`);
    lines.push(``);
    
    // Sort by effect size
    const sorted = [...result.discovered_relationships].sort((a, b) => b.effect_size - a.effect_size);
    
    for (const rel of sorted) {
      lines.push(`**${rel.source_domain} → ${rel.target_domain}**`);
      lines.push(`- ${rel.natural_language}`);
      lines.push(`- F-statistic: ${rel.granger_f_statistic.toFixed(2)}, p-value: ${rel.granger_p_value.toFixed(4)}`);
      lines.push(`- Optimal lag: ${rel.optimal_lag_days} days, Effect size: ${(rel.effect_size * 100).toFixed(1)}%`);
      lines.push(``);
    }
  } else {
    lines.push(`No statistically significant causal relationships were found.`);
    lines.push(`This could mean domain signals are independent, or more data is needed.`);
  }
  
  if (result.warnings.length > 0) {
    lines.push(``);
    lines.push(`### Warnings:`);
    for (const w of result.warnings) {
      lines.push(`- ${w}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Compare discovery results to find new relationships
 */
export function findNewRelationships(
  current: CausalRelationship[],
  previous: CausalRelationship[]
): CausalRelationship[] {
  const previousKeys = new Set(
    previous.map(r => `${r.source_domain}|${r.target_domain}`)
  );
  
  return current.filter(r => !previousKeys.has(`${r.source_domain}|${r.target_domain}`));
}

/**
 * Find relationships that are no longer significant
 */
export function findLostRelationships(
  current: CausalRelationship[],
  previous: CausalRelationship[]
): CausalRelationship[] {
  const currentKeys = new Set(
    current.map(r => `${r.source_domain}|${r.target_domain}`)
  );
  
  return previous.filter(r => !currentKeys.has(`${r.source_domain}|${r.target_domain}`));
}
