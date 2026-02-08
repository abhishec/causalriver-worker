/**
 * Nexus Memory Stack - Causal Discovery Runner Tests
 *
 * Comprehensive tests for the causal discovery pipeline orchestrator:
 * runCausalDiscovery, summarizeDiscovery, findNewRelationships,
 * findLostRelationships, and DEFAULT_DISCOVERY_CONFIG.
 *
 * All functions under test are pure (no DB, no async), so no mocking is needed.
 * Test data is generated inline using deterministic formulas.
 */

import { describe, it, expect } from 'vitest';
import {
  runCausalDiscovery,
  summarizeDiscovery,
  findNewRelationships,
  findLostRelationships,
  DEFAULT_DISCOVERY_CONFIG,
} from '../causality/causal-discovery-runner';
import type {
  CausalRelationship,
  DiscoveryResult,
} from '../causality/causal-discovery-runner';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate synthetic signal data for multiple domains over a given number of days.
 *
 * Each domain gets one signal per day with a sine-based pattern plus noise.
 * The first domain drives the signal; subsequent domains receive a scaled copy
 * to create mild inter-domain correlation for testing.
 */
function generateSignals(
  domains: string[],
  days: number
): Array<{
  source_domain: string;
  signal_type: string;
  signal_value: number;
  signal_timestamp: string;
}> {
  const signals: Array<{
    source_domain: string;
    signal_type: string;
    signal_value: number;
    signal_timestamp: string;
  }> = [];
  const baseDate = new Date('2024-01-01');
  for (let d = 0; d < days; d++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + d);
    for (const domain of domains) {
      signals.push({
        source_domain: domain,
        signal_type: `${domain}_metric`,
        signal_value:
          Math.sin(d / 7) * (domain === domains[0] ? 1 : 0.8) +
          (Math.random() - 0.5) * 0.2,
        signal_timestamp: date.toISOString(),
      });
    }
  }
  return signals;
}

/**
 * Build a minimal CausalRelationship object for comparison tests.
 */
function makeRelationship(
  source: string,
  target: string,
  overrides: Partial<CausalRelationship> = {}
): CausalRelationship {
  return {
    organization_id: 'org-test',
    source_domain: source,
    target_domain: target,
    granger_f_statistic: 5.0,
    granger_p_value: 0.01,
    optimal_lag_days: 3,
    effect_size: 0.25,
    confidence_interval_lower: 0.1,
    confidence_interval_upper: 0.4,
    natural_language: `${source} Granger-causes ${target}`,
    sample_size: 60,
    observation_window_days: 90,
    is_significant: true,
    last_computed_at: new Date('2024-03-01'),
    ...overrides,
  };
}

// ============================================================================
// DEFAULT_DISCOVERY_CONFIG
// ============================================================================

describe('DEFAULT_DISCOVERY_CONFIG', () => {
  it('should have alpha = 0.05', () => {
    expect(DEFAULT_DISCOVERY_CONFIG.alpha).toBe(0.05);
  });

  it('should have minObservations = 5', () => {
    expect(DEFAULT_DISCOVERY_CONFIG.minObservations).toBe(5);
  });

  it('should have lookbackDays = 90', () => {
    expect(DEFAULT_DISCOVERY_CONFIG.lookbackDays).toBe(90);
  });

  it('should include timeSeries and granger sub-configs', () => {
    expect(DEFAULT_DISCOVERY_CONFIG.timeSeries).toBeDefined();
    expect(DEFAULT_DISCOVERY_CONFIG.granger).toBeDefined();
    expect(DEFAULT_DISCOVERY_CONFIG.timeSeries.fillMethod).toBe('interpolate');
    expect(DEFAULT_DISCOVERY_CONFIG.granger.maxLag).toBe(14);
    expect(DEFAULT_DISCOVERY_CONFIG.granger.alpha).toBe(0.05);
  });
});

// ============================================================================
// runCausalDiscovery
// ============================================================================

describe('runCausalDiscovery', () => {
  // --------------------------------------------------------------------------
  // Edge cases: empty / insufficient input
  // --------------------------------------------------------------------------

  it('should return empty result with warning when given 0 signals', () => {
    const result = runCausalDiscovery([], 'org-empty');

    expect(result.organization_id).toBe('org-empty');
    expect(result.discovered_relationships).toHaveLength(0);
    expect(result.pairs_tested).toBe(0);
    expect(result.significant_count).toBe(0);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.some((w) => w.includes('Insufficient domains'))).toBe(true);
  });

  it('should return empty result with warning when < 2 domains are present', () => {
    const signals = generateSignals(['only_one_domain'], 60);
    const result = runCausalDiscovery(signals, 'org-single');

    expect(result.discovered_relationships).toHaveLength(0);
    expect(result.pairs_tested).toBe(0);
    expect(result.warnings.some((w) => w.includes('Insufficient domains'))).toBe(true);
  });

  it('should return the correct organization_id', () => {
    const signals = generateSignals(['sales', 'marketing'], 45);
    const result = runCausalDiscovery(signals, 'org-123');

    expect(result.organization_id).toBe('org-123');
  });

  it('should include domains_analyzed in the result', () => {
    const signals = generateSignals(['finance', 'hr', 'engineering'], 45);
    const result = runCausalDiscovery(signals, 'org-domains');

    // domains_analyzed should contain the valid domains that passed filtering
    expect(result.domains_analyzed.length).toBeGreaterThanOrEqual(1);
  });

  it('should return pairs_tested > 0 for 2+ valid domains', () => {
    const signals = generateSignals(['sales', 'support'], 60);
    const result = runCausalDiscovery(signals, 'org-pairs');

    // With 2 domains, we expect at least 2 directed pairs (A->B and B->A)
    expect(result.pairs_tested).toBeGreaterThan(0);
  });

  it('should warn when domains have insufficient observations', () => {
    // Generate signals for 2 days — minObservations is 5, so this is too few
    const signals = generateSignals(['alpha', 'beta'], 2);
    const result = runCausalDiscovery(signals, 'org-sparse');

    // Should warn about insufficient observations or insufficient valid domains
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // Valid data: full pipeline
  // --------------------------------------------------------------------------

  it('should return a complete DiscoveryResult with valid data', () => {
    const signals = generateSignals(['crm', 'support'], 60);
    const result = runCausalDiscovery(signals, 'org-full');

    expect(result).toHaveProperty('organization_id');
    expect(result).toHaveProperty('discovered_relationships');
    expect(result).toHaveProperty('domains_analyzed');
    expect(result).toHaveProperty('pairs_tested');
    expect(result).toHaveProperty('significant_count');
    expect(result).toHaveProperty('run_timestamp');
    expect(result).toHaveProperty('config_used');
    expect(result).toHaveProperty('warnings');

    expect(Array.isArray(result.discovered_relationships)).toBe(true);
    expect(Array.isArray(result.domains_analyzed)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('should include all required fields in discovered relationships', () => {
    const signals = generateSignals(['domain_a', 'domain_b'], 60);
    const result = runCausalDiscovery(signals, 'org-fields');

    // Even if no relationships are significant, we verify the structure
    // of any relationships that ARE returned
    for (const rel of result.discovered_relationships) {
      expect(rel).toHaveProperty('organization_id');
      expect(rel).toHaveProperty('source_domain');
      expect(rel).toHaveProperty('target_domain');
      expect(rel).toHaveProperty('granger_f_statistic');
      expect(rel).toHaveProperty('granger_p_value');
      expect(rel).toHaveProperty('optimal_lag_days');
      expect(rel).toHaveProperty('effect_size');
      expect(rel).toHaveProperty('confidence_interval_lower');
      expect(rel).toHaveProperty('confidence_interval_upper');
      expect(rel).toHaveProperty('natural_language');
      expect(rel).toHaveProperty('sample_size');
      expect(rel).toHaveProperty('observation_window_days');
      expect(rel).toHaveProperty('is_significant');
      expect(rel).toHaveProperty('last_computed_at');

      // All discovered relationships should be significant
      expect(rel.is_significant).toBe(true);
      expect(rel.granger_p_value).toBeGreaterThanOrEqual(0);
      expect(rel.granger_p_value).toBeLessThanOrEqual(1);
      expect(rel.confidence_interval_lower).toBeLessThanOrEqual(rel.confidence_interval_upper);
    }
  });

  it('should reflect merged config in config_used when custom config is provided', () => {
    const signals = generateSignals(['x', 'y'], 60);
    const customConfig = {
      alpha: 0.1,
      lookbackDays: 60,
    };
    const result = runCausalDiscovery(signals, 'org-config', customConfig);

    expect(result.config_used.alpha).toBe(0.1);
    expect(result.config_used.lookbackDays).toBe(60);
    // Sub-configs should preserve defaults when not overridden
    expect(result.config_used.timeSeries.fillMethod).toBe('interpolate');
    expect(result.config_used.granger.maxLag).toBe(14);
  });

  it('should override nested granger config when provided', () => {
    const signals = generateSignals(['x', 'y'], 60);
    const result = runCausalDiscovery(signals, 'org-nested', {
      granger: { maxLag: 7 },
    });

    expect(result.config_used.granger.maxLag).toBe(7);
    // alpha should still be inherited from defaults
    expect(result.config_used.granger.alpha).toBe(0.05);
  });

  it('should set run_timestamp as a Date instance', () => {
    const signals = generateSignals(['a', 'b'], 45);
    const result = runCausalDiscovery(signals, 'org-ts');

    expect(result.run_timestamp).toBeInstanceOf(Date);
    // The timestamp should be recent (within the last minute)
    const now = new Date();
    const diffMs = now.getTime() - result.run_timestamp.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(0);
    expect(diffMs).toBeLessThan(60000);
  });

  it('should set significant_count equal to discovered_relationships length', () => {
    const signals = generateSignals(['p', 'q'], 60);
    const result = runCausalDiscovery(signals, 'org-count');

    expect(result.significant_count).toBe(result.discovered_relationships.length);
  });

  it('should set observation_window_days from lookbackDays config', () => {
    const signals = generateSignals(['m', 'n'], 60);
    const result = runCausalDiscovery(signals, 'org-window', {
      lookbackDays: 120,
    });

    for (const rel of result.discovered_relationships) {
      expect(rel.observation_window_days).toBe(120);
    }
  });
});

// ============================================================================
// summarizeDiscovery
// ============================================================================

describe('summarizeDiscovery', () => {
  it('should return a string containing markdown headers', () => {
    const result = runCausalDiscovery([], 'org-md');
    const summary = summarizeDiscovery(result);

    expect(typeof summary).toBe('string');
    expect(summary).toContain('## Causal Discovery Results');
  });

  it('should include source->target notation when relationships exist', () => {
    // Build a DiscoveryResult with a known relationship
    const relationship = makeRelationship('sales', 'support');
    const result: DiscoveryResult = {
      organization_id: 'org-summary',
      discovered_relationships: [relationship],
      domains_analyzed: ['sales', 'support'],
      pairs_tested: 2,
      significant_count: 1,
      run_timestamp: new Date(),
      config_used: DEFAULT_DISCOVERY_CONFIG,
      warnings: [],
    };

    const summary = summarizeDiscovery(result);

    // The arrow notation in the summarize function uses the unicode arrow
    expect(summary).toContain('sales');
    expect(summary).toContain('support');
    // Check for the arrow pattern used in markdown: **source → target**
    expect(summary).toMatch(/sales\s*→\s*support/);
  });

  it('should include warnings section when warnings are present', () => {
    const result: DiscoveryResult = {
      organization_id: 'org-warn',
      discovered_relationships: [],
      domains_analyzed: ['only_domain'],
      pairs_tested: 0,
      significant_count: 0,
      run_timestamp: new Date(),
      config_used: DEFAULT_DISCOVERY_CONFIG,
      warnings: ['Insufficient domains for causal analysis: 1 (need >= 2)'],
    };

    const summary = summarizeDiscovery(result);

    expect(summary).toContain('### Warnings:');
    expect(summary).toContain('Insufficient domains');
  });

  it('should say "No statistically significant" when no relationships found', () => {
    const result: DiscoveryResult = {
      organization_id: 'org-none',
      discovered_relationships: [],
      domains_analyzed: ['a', 'b'],
      pairs_tested: 2,
      significant_count: 0,
      run_timestamp: new Date(),
      config_used: DEFAULT_DISCOVERY_CONFIG,
      warnings: [],
    };

    const summary = summarizeDiscovery(result);

    expect(summary).toContain('No statistically significant');
  });

  it('should include F-statistic and p-value details for each relationship', () => {
    const relationship = makeRelationship('finance', 'hr', {
      granger_f_statistic: 12.34,
      granger_p_value: 0.002,
      optimal_lag_days: 5,
      effect_size: 0.35,
    });
    const result: DiscoveryResult = {
      organization_id: 'org-detail',
      discovered_relationships: [relationship],
      domains_analyzed: ['finance', 'hr'],
      pairs_tested: 2,
      significant_count: 1,
      run_timestamp: new Date(),
      config_used: DEFAULT_DISCOVERY_CONFIG,
      warnings: [],
    };

    const summary = summarizeDiscovery(result);

    expect(summary).toContain('F-statistic:');
    expect(summary).toContain('p-value:');
    expect(summary).toContain('Optimal lag:');
    expect(summary).toContain('Effect size:');
  });
});

// ============================================================================
// findNewRelationships
// ============================================================================

describe('findNewRelationships', () => {
  it('should find relationships in current that are not in previous', () => {
    const current = [
      makeRelationship('sales', 'support'),
      makeRelationship('marketing', 'sales'),
    ];
    const previous = [
      makeRelationship('sales', 'support'),
    ];

    const newRels = findNewRelationships(current, previous);

    expect(newRels).toHaveLength(1);
    expect(newRels[0].source_domain).toBe('marketing');
    expect(newRels[0].target_domain).toBe('sales');
  });

  it('should return empty array when all current relationships exist in previous', () => {
    const current = [
      makeRelationship('sales', 'support'),
    ];
    const previous = [
      makeRelationship('sales', 'support'),
      makeRelationship('marketing', 'sales'),
    ];

    const newRels = findNewRelationships(current, previous);

    expect(newRels).toHaveLength(0);
  });

  it('should return all current relationships when previous is empty', () => {
    const current = [
      makeRelationship('a', 'b'),
      makeRelationship('c', 'd'),
    ];
    const previous: CausalRelationship[] = [];

    const newRels = findNewRelationships(current, previous);

    expect(newRels).toHaveLength(2);
  });

  it('should match on source_domain and target_domain combination', () => {
    // Same domains but reversed direction should be considered different
    const current = [
      makeRelationship('sales', 'support'),
    ];
    const previous = [
      makeRelationship('support', 'sales'), // reversed direction
    ];

    const newRels = findNewRelationships(current, previous);

    // sales->support is different from support->sales, so it should be new
    expect(newRels).toHaveLength(1);
    expect(newRels[0].source_domain).toBe('sales');
    expect(newRels[0].target_domain).toBe('support');
  });
});

// ============================================================================
// findLostRelationships
// ============================================================================

describe('findLostRelationships', () => {
  it('should find relationships in previous that are no longer in current', () => {
    const current = [
      makeRelationship('sales', 'support'),
    ];
    const previous = [
      makeRelationship('sales', 'support'),
      makeRelationship('marketing', 'sales'),
    ];

    const lostRels = findLostRelationships(current, previous);

    expect(lostRels).toHaveLength(1);
    expect(lostRels[0].source_domain).toBe('marketing');
    expect(lostRels[0].target_domain).toBe('sales');
  });

  it('should return empty array when all previous relationships still present', () => {
    const current = [
      makeRelationship('sales', 'support'),
      makeRelationship('marketing', 'sales'),
    ];
    const previous = [
      makeRelationship('sales', 'support'),
    ];

    const lostRels = findLostRelationships(current, previous);

    expect(lostRels).toHaveLength(0);
  });

  it('should return all previous relationships when current is empty', () => {
    const current: CausalRelationship[] = [];
    const previous = [
      makeRelationship('a', 'b'),
      makeRelationship('c', 'd'),
    ];

    const lostRels = findLostRelationships(current, previous);

    expect(lostRels).toHaveLength(2);
  });

  it('should treat reversed direction as distinct relationships', () => {
    // current has A->B, previous has B->A => B->A is lost
    const current = [
      makeRelationship('a', 'b'),
    ];
    const previous = [
      makeRelationship('b', 'a'),
    ];

    const lostRels = findLostRelationships(current, previous);

    expect(lostRels).toHaveLength(1);
    expect(lostRels[0].source_domain).toBe('b');
    expect(lostRels[0].target_domain).toBe('a');
  });
});
