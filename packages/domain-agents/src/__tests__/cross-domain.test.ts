/**
 * Nexus Domain Agents - Cross-Domain Coordination Tests
 *
 * Comprehensive tests for cross-domain query handling including:
 * - isCrossDomainQuery: detecting single vs multi-module intents
 * - analyzeCrossDomainQuery: relationship discovery and topological processing order
 * - getRelatedModules: bidirectional relationship lookup filtered to registry
 * - explainCrossDomainRelationships: human-readable relationship explanations
 * - suggestPrimaryModule: executive priority and processing-order fallback
 * - getCascadeEffects: outgoing cascade effects filtered to registry
 */

import { describe, it, expect } from 'vitest';
import {
  isCrossDomainQuery,
  analyzeCrossDomainQuery,
  getRelatedModules,
  explainCrossDomainRelationships,
  suggestPrimaryModule,
  getCascadeEffects,
} from '../routing/cross-domain';
import type {
  IntentClassification,
  ModuleRegistry,
  CrossDomainQuery,
} from '../types';

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Test registry containing all eight modules referenced by MODULE_RELATIONSHIPS.
 */
const testRegistry: ModuleRegistry = {
  finance: {
    id: 'finance',
    name: 'Finance',
    description: 'Financial',
    icon: '💰',
    keywords: [],
    capabilities: [],
    tables: [],
    personas: [],
  },
  revenue: {
    id: 'revenue',
    name: 'Revenue',
    description: 'Sales',
    icon: '📈',
    keywords: [],
    capabilities: [],
    tables: [],
    personas: [],
  },
  cs: {
    id: 'cs',
    name: 'Customer Success',
    description: 'CS',
    icon: '💚',
    keywords: [],
    capabilities: [],
    tables: [],
    personas: [],
  },
  am: {
    id: 'am',
    name: 'Account Management',
    description: 'AM',
    icon: '🤝',
    keywords: [],
    capabilities: [],
    tables: [],
    personas: [],
  },
  services: {
    id: 'services',
    name: 'Services',
    description: 'Delivery',
    icon: '🛠️',
    keywords: [],
    capabilities: [],
    tables: [],
    personas: [],
  },
  marketing: {
    id: 'marketing',
    name: 'Marketing',
    description: 'Marketing',
    icon: '📣',
    keywords: [],
    capabilities: [],
    tables: [],
    personas: [],
  },
  people: {
    id: 'people',
    name: 'People',
    description: 'HR',
    icon: '👥',
    keywords: [],
    capabilities: [],
    tables: [],
    personas: [],
  },
  executive: {
    id: 'executive',
    name: 'Executive',
    description: 'Strategic',
    icon: '👔',
    keywords: [],
    capabilities: [],
    tables: [],
    personas: [],
  },
};

/**
 * Creates a minimal IntentClassification for testing.
 */
function createTestIntent(
  overrides: Partial<IntentClassification> = {}
): IntentClassification {
  return {
    modules: overrides.modules ?? ['finance'],
    primaryModule: overrides.primaryModule ?? 'finance',
    confidence: overrides.confidence ?? 0.9,
    matchedKeywords: overrides.matchedKeywords ?? [],
    isCrossDomain: overrides.isCrossDomain ?? false,
    method: overrides.method ?? 'keyword',
    ...(overrides.suggestedPersona !== undefined
      ? { suggestedPersona: overrides.suggestedPersona }
      : {}),
  };
}

// =============================================================================
// isCrossDomainQuery TESTS
// =============================================================================

describe('Cross-Domain - isCrossDomainQuery', () => {
  it('returns true when isCrossDomain flag is true', () => {
    const intent = createTestIntent({
      modules: ['finance'],
      isCrossDomain: true,
    });

    expect(isCrossDomainQuery(intent)).toBe(true);
  });

  it('returns true when modules.length > 1', () => {
    const intent = createTestIntent({
      modules: ['finance', 'revenue'],
      isCrossDomain: false,
    });

    expect(isCrossDomainQuery(intent)).toBe(true);
  });

  it('returns false for single module with isCrossDomain: false', () => {
    const intent = createTestIntent({
      modules: ['finance'],
      isCrossDomain: false,
    });

    expect(isCrossDomainQuery(intent)).toBe(false);
  });
});

// =============================================================================
// analyzeCrossDomainQuery TESTS
// =============================================================================

describe('Cross-Domain - analyzeCrossDomainQuery', () => {
  it('returns the correct modules from the intent', () => {
    const intent = createTestIntent({
      modules: ['revenue', 'finance'],
    });

    const result = analyzeCrossDomainQuery(
      'How does deal revenue affect cash flow?',
      intent,
      testRegistry
    );

    expect(result.modules).toEqual(['revenue', 'finance']);
    expect(result.query).toBe('How does deal revenue affect cash flow?');
  });

  it('finds the depends_on relationship between revenue and finance', () => {
    const intent = createTestIntent({
      modules: ['revenue', 'finance'],
    });

    const result = analyzeCrossDomainQuery(
      'revenue to finance',
      intent,
      testRegistry
    );

    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]).toMatchObject({
      source: 'revenue',
      target: 'finance',
      type: 'depends_on',
    });
  });

  it('computes processingOrder with finance before revenue for depends_on', () => {
    const intent = createTestIntent({
      modules: ['revenue', 'finance'],
    });

    const result = analyzeCrossDomainQuery(
      'revenue depends on finance',
      intent,
      testRegistry
    );

    const financeIndex = result.processingOrder.indexOf('finance');
    const revenueIndex = result.processingOrder.indexOf('revenue');

    expect(financeIndex).toBeGreaterThanOrEqual(0);
    expect(revenueIndex).toBeGreaterThanOrEqual(0);
    expect(financeIndex).toBeLessThan(revenueIndex);
  });

  it('finds enriches and validates relationships between cs and am', () => {
    const intent = createTestIntent({
      modules: ['cs', 'am'],
    });

    const result = analyzeCrossDomainQuery(
      'CS and AM relationship',
      intent,
      testRegistry
    );

    expect(result.relationships).toHaveLength(2);

    const types = result.relationships.map((r) => r.type).sort();
    expect(types).toEqual(['enriches', 'validates']);

    const enriches = result.relationships.find((r) => r.type === 'enriches');
    expect(enriches).toMatchObject({ source: 'cs', target: 'am' });

    const validates = result.relationships.find((r) => r.type === 'validates');
    expect(validates).toMatchObject({ source: 'am', target: 'cs' });
  });

  it('handles three modules with a dependency chain (marketing, revenue, finance)', () => {
    const intent = createTestIntent({
      modules: ['marketing', 'revenue', 'finance'],
    });

    const result = analyzeCrossDomainQuery(
      'marketing to revenue to finance pipeline',
      intent,
      testRegistry
    );

    // Should find: marketing->revenue (depends_on), revenue->finance (depends_on)
    expect(result.relationships).toHaveLength(2);

    const sources = result.relationships.map((r) => r.source).sort();
    expect(sources).toEqual(['marketing', 'revenue']);

    // All three modules should appear in processingOrder
    expect(result.processingOrder).toHaveLength(3);
    expect(result.processingOrder).toContain('marketing');
    expect(result.processingOrder).toContain('revenue');
    expect(result.processingOrder).toContain('finance');
  });

  it('respects dependency chain ordering: finance, then revenue, then marketing', () => {
    const intent = createTestIntent({
      modules: ['marketing', 'revenue', 'finance'],
    });

    const result = analyzeCrossDomainQuery(
      'full pipeline chain',
      intent,
      testRegistry
    );

    const financeIdx = result.processingOrder.indexOf('finance');
    const revenueIdx = result.processingOrder.indexOf('revenue');
    const marketingIdx = result.processingOrder.indexOf('marketing');

    // finance should come before revenue (revenue depends_on finance)
    expect(financeIdx).toBeLessThan(revenueIdx);
    // revenue should come before marketing (marketing depends_on revenue)
    expect(revenueIdx).toBeLessThan(marketingIdx);
  });
});

// =============================================================================
// getRelatedModules TESTS
// =============================================================================

describe('Cross-Domain - getRelatedModules', () => {
  it('returns finance, am, and executive as related to revenue', () => {
    const related = getRelatedModules('revenue', testRegistry);

    // revenue -> finance (depends_on)
    // revenue -> am (depends_on)
    // revenue -> executive (aggregates)
    // marketing -> revenue (depends_on) - so marketing is also related
    expect(related).toContain('finance');
    expect(related).toContain('am');
    expect(related).toContain('executive');
    expect(related).toContain('marketing');
  });

  it('returns empty array for an unknown module', () => {
    const related = getRelatedModules('unknown-module', testRegistry);

    expect(related).toEqual([]);
  });

  it('filters results to only modules present in the registry', () => {
    // Create a partial registry that only includes finance
    const partialRegistry: ModuleRegistry = {
      finance: testRegistry.finance,
    };

    const related = getRelatedModules('revenue', partialRegistry);

    // revenue has relationships with finance, am, executive, marketing
    // but only finance is in the partial registry
    expect(related).toContain('finance');
    expect(related).not.toContain('am');
    expect(related).not.toContain('executive');
    expect(related).not.toContain('marketing');
  });
});

// =============================================================================
// explainCrossDomainRelationships TESTS
// =============================================================================

describe('Cross-Domain - explainCrossDomainRelationships', () => {
  it('returns a bullet list when relationships exist', () => {
    const crossDomainQuery: CrossDomainQuery = {
      query: 'revenue and finance overview',
      modules: ['revenue', 'finance'],
      relationships: [
        {
          source: 'revenue',
          target: 'finance',
          type: 'depends_on',
          description:
            'Deal value flows into revenue recognition and cash projections',
        },
      ],
      processingOrder: ['finance', 'revenue'],
    };

    const explanation = explainCrossDomainRelationships(
      crossDomainQuery,
      testRegistry
    );

    expect(explanation).toContain('Cross-domain relationships:');
    expect(explanation).toContain('Revenue');
    expect(explanation).toContain('Finance');
    expect(explanation).toContain(
      'Deal value flows into revenue recognition and cash projections'
    );
  });

  it('returns independent message when no relationships exist', () => {
    const crossDomainQuery: CrossDomainQuery = {
      query: 'marketing and people overview',
      modules: ['marketing', 'people'],
      relationships: [],
      processingOrder: ['marketing', 'people'],
    };

    const explanation = explainCrossDomainRelationships(
      crossDomainQuery,
      testRegistry
    );

    expect(explanation).toContain('Marketing');
    expect(explanation).toContain('People');
    expect(explanation).toContain('independently');
  });
});

// =============================================================================
// suggestPrimaryModule TESTS
// =============================================================================

describe('Cross-Domain - suggestPrimaryModule', () => {
  it('returns executive when executive is in the modules list', () => {
    const crossDomainQuery: CrossDomainQuery = {
      query: 'executive overview with revenue',
      modules: ['revenue', 'executive'],
      relationships: [],
      processingOrder: ['revenue', 'executive'],
    };

    const result = suggestPrimaryModule(crossDomainQuery, testRegistry);

    expect(result.moduleId).toBe('executive');
  });

  it('returns the first module in processingOrder when executive is not present', () => {
    const crossDomainQuery: CrossDomainQuery = {
      query: 'revenue and finance',
      modules: ['revenue', 'finance'],
      relationships: [
        {
          source: 'revenue',
          target: 'finance',
          type: 'depends_on',
          description:
            'Deal value flows into revenue recognition and cash projections',
        },
      ],
      processingOrder: ['finance', 'revenue'],
    };

    const result = suggestPrimaryModule(crossDomainQuery, testRegistry);

    expect(result.moduleId).toBe('finance');
  });

  it('includes a reason string in the result', () => {
    const crossDomainQuery: CrossDomainQuery = {
      query: 'executive summary',
      modules: ['executive', 'finance'],
      relationships: [],
      processingOrder: ['finance', 'executive'],
    };

    const result = suggestPrimaryModule(crossDomainQuery, testRegistry);

    expect(result.reason).toBeDefined();
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// getCascadeEffects TESTS
// =============================================================================

describe('Cross-Domain - getCascadeEffects', () => {
  it('returns cascade effects for revenue (finance, am, executive)', () => {
    const effects = getCascadeEffects('revenue', testRegistry);

    const targets = effects.map((e) => e.targetModule);
    // revenue -> finance (depends_on)
    // revenue -> am (depends_on)
    // revenue -> executive (aggregates)
    expect(targets).toContain('finance');
    expect(targets).toContain('am');
    expect(targets).toContain('executive');
    expect(effects).toHaveLength(3);
  });

  it('returns empty array for a module with no outgoing relationships', () => {
    const effects = getCascadeEffects('executive', testRegistry);

    // executive is only a target, never a source in MODULE_RELATIONSHIPS
    expect(effects).toEqual([]);
  });

  it('filters cascade effects to only modules in the registry', () => {
    // Create a registry that only has finance (not am or executive)
    const partialRegistry: ModuleRegistry = {
      finance: testRegistry.finance,
      revenue: testRegistry.revenue,
    };

    const effects = getCascadeEffects('revenue', partialRegistry);

    const targets = effects.map((e) => e.targetModule);
    expect(targets).toContain('finance');
    expect(targets).not.toContain('am');
    expect(targets).not.toContain('executive');
    expect(effects).toHaveLength(1);
  });

  it('includes effect description strings for each cascade', () => {
    const effects = getCascadeEffects('revenue', testRegistry);

    for (const effect of effects) {
      expect(typeof effect.effect).toBe('string');
      expect(effect.effect.length).toBeGreaterThan(0);
    }
  });
});
