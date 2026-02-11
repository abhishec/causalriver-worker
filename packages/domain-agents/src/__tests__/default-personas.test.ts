/**
 * Nexus Domain Agents - Default Personas Tests
 *
 * Comprehensive tests for the default persona definitions including:
 * - All 14 persona constants and their required fields
 * - DEFAULT_PERSONAS registry completeness
 * - Personas with promptTemplate (cfo, cro, vpCS, vpAM, vpServices, ceo, nexusAI)
 * - Non-empty focusMetrics for all personas
 * - Lookup functions: getPersona, getAllPersonas
 * - Domain functions: getPrimaryPersonaForDomain, getPersonasForDomain
 * - Uniqueness constraints (IDs, roles)
 * - Domain coverage validation
 */

import { describe, it, expect } from 'vitest';
import {
  cfoPersona,
  vpFinancePersona,
  croPersona,
  vpSalesPersona,
  vpCSPersona,
  csmPersona,
  vpAMPersona,
  vpServicesPersona,
  vpProductPersona,
  vpMarketingPersona,
  vpPeoplePersona,
  ceoPersona,
  cooPersona,
  nexusAIPersona,
  DEFAULT_PERSONAS,
  getPrimaryPersonaForDomain,
  getPersonasForDomain,
  getPersona,
  getAllPersonas,
} from '../personas/default-personas';

// ============================================================================
// ALL 14 PERSONA CONSTANTS
// ============================================================================

const allPersonaExports = [
  { ref: cfoPersona, expectedId: 'cfo', expectedDomain: 'finance' },
  { ref: vpFinancePersona, expectedId: 'vp-finance', expectedDomain: 'finance' },
  { ref: croPersona, expectedId: 'cro', expectedDomain: 'revenue' },
  { ref: vpSalesPersona, expectedId: 'vp-sales', expectedDomain: 'revenue' },
  { ref: vpCSPersona, expectedId: 'vp-cs', expectedDomain: 'cs' },
  { ref: csmPersona, expectedId: 'csm', expectedDomain: 'cs' },
  { ref: vpAMPersona, expectedId: 'vp-am', expectedDomain: 'am' },
  { ref: vpServicesPersona, expectedId: 'vp-services', expectedDomain: 'services' },
  { ref: vpProductPersona, expectedId: 'vp-product', expectedDomain: 'product' },
  { ref: vpMarketingPersona, expectedId: 'vp-marketing', expectedDomain: 'marketing' },
  { ref: vpPeoplePersona, expectedId: 'vp-people', expectedDomain: 'people' },
  { ref: ceoPersona, expectedId: 'ceo', expectedDomain: 'executive' },
  { ref: cooPersona, expectedId: 'coo', expectedDomain: 'executive' },
  { ref: nexusAIPersona, expectedId: 'nexus-ai', expectedDomain: 'executive' },
];

// ============================================================================
// PERSONA STRUCTURE TESTS
// ============================================================================

describe('Default Personas - Persona Structure', () => {
  it.each(allPersonaExports)(
    '$expectedId persona has all required fields (id, role, domain, description, icon, color)',
    ({ ref, expectedId, expectedDomain }) => {
      expect(ref).toBeDefined();
      expect(ref.id).toBe(expectedId);
      expect(ref.domain).toBe(expectedDomain);
      expect(ref.role).toEqual(expect.any(String));
      expect(ref.role.length).toBeGreaterThan(0);
      expect(ref.description).toEqual(expect.any(String));
      expect(ref.description.length).toBeGreaterThan(0);
      expect(ref.icon).toEqual(expect.any(String));
      expect(ref.icon.length).toBeGreaterThan(0);
      expect(ref.color).toEqual(expect.any(String));
      expect(ref.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    },
  );

  it.each(allPersonaExports)(
    '$expectedId persona has non-empty focusMetrics array',
    ({ ref }) => {
      expect(Array.isArray(ref.focusMetrics)).toBe(true);
      expect(ref.focusMetrics!.length).toBeGreaterThan(0);
      ref.focusMetrics!.forEach((metric) => {
        expect(typeof metric).toBe('string');
        expect(metric.length).toBeGreaterThan(0);
      });
    },
  );

  it.each(allPersonaExports)(
    '$expectedId persona has sampleQuestions array when present',
    ({ ref }) => {
      if (ref.sampleQuestions) {
        expect(Array.isArray(ref.sampleQuestions)).toBe(true);
        expect(ref.sampleQuestions.length).toBeGreaterThan(0);
        ref.sampleQuestions.forEach((q) => {
          expect(typeof q).toBe('string');
          expect(q.length).toBeGreaterThan(0);
        });
      }
    },
  );
});

// ============================================================================
// PROMPT TEMPLATE TESTS
// ============================================================================

describe('Default Personas - promptTemplate', () => {
  const personasWithPromptTemplate = [
    { ref: cfoPersona, expectedId: 'cfo' },
    { ref: croPersona, expectedId: 'cro' },
    { ref: vpCSPersona, expectedId: 'vp-cs' },
    { ref: vpAMPersona, expectedId: 'vp-am' },
    { ref: vpServicesPersona, expectedId: 'vp-services' },
    { ref: ceoPersona, expectedId: 'ceo' },
    { ref: nexusAIPersona, expectedId: 'nexus-ai' },
  ];

  const personasWithoutPromptTemplate = [
    { ref: vpFinancePersona, expectedId: 'vp-finance' },
    { ref: vpSalesPersona, expectedId: 'vp-sales' },
    { ref: csmPersona, expectedId: 'csm' },
    { ref: vpProductPersona, expectedId: 'vp-product' },
    { ref: vpMarketingPersona, expectedId: 'vp-marketing' },
    { ref: vpPeoplePersona, expectedId: 'vp-people' },
    { ref: cooPersona, expectedId: 'coo' },
  ];

  it.each(personasWithPromptTemplate)(
    '$expectedId persona has a non-empty promptTemplate',
    ({ ref }) => {
      expect(ref.promptTemplate).toBeDefined();
      expect(typeof ref.promptTemplate).toBe('string');
      expect(ref.promptTemplate!.length).toBeGreaterThan(0);
    },
  );

  it.each(personasWithoutPromptTemplate)(
    '$expectedId persona does not have a promptTemplate',
    ({ ref }) => {
      expect(ref.promptTemplate).toBeUndefined();
    },
  );

  it('exactly 8 personas have promptTemplate defined', () => {
    const allPersonas = getAllPersonas();
    const withTemplate = allPersonas.filter((p) => p.promptTemplate !== undefined);
    expect(withTemplate).toHaveLength(8);
  });
});

// ============================================================================
// DEFAULT_PERSONAS REGISTRY TESTS
// ============================================================================

describe('Default Personas - DEFAULT_PERSONAS Registry', () => {
  it('contains exactly 15 entries', () => {
    const keys = Object.keys(DEFAULT_PERSONAS);
    expect(keys).toHaveLength(15);
  });

  it('contains all expected persona IDs as keys', () => {
    const expectedKeys = [
      'cfo', 'vp-finance',
      'cro', 'vp-sales',
      'vp-cs', 'csm',
      'vp-am',
      'vp-services',
      'vp-product',
      'vp-marketing',
      'vp-people',
      'vp-engineering-ops',
      'ceo', 'coo', 'nexus-ai',
    ];
    expect(Object.keys(DEFAULT_PERSONAS).sort()).toEqual(expectedKeys.sort());
  });

  it('maps each key to the corresponding persona constant', () => {
    expect(DEFAULT_PERSONAS['cfo']).toBe(cfoPersona);
    expect(DEFAULT_PERSONAS['vp-finance']).toBe(vpFinancePersona);
    expect(DEFAULT_PERSONAS['cro']).toBe(croPersona);
    expect(DEFAULT_PERSONAS['vp-sales']).toBe(vpSalesPersona);
    expect(DEFAULT_PERSONAS['vp-cs']).toBe(vpCSPersona);
    expect(DEFAULT_PERSONAS['csm']).toBe(csmPersona);
    expect(DEFAULT_PERSONAS['vp-am']).toBe(vpAMPersona);
    expect(DEFAULT_PERSONAS['vp-services']).toBe(vpServicesPersona);
    expect(DEFAULT_PERSONAS['vp-product']).toBe(vpProductPersona);
    expect(DEFAULT_PERSONAS['vp-marketing']).toBe(vpMarketingPersona);
    expect(DEFAULT_PERSONAS['vp-people']).toBe(vpPeoplePersona);
    expect(DEFAULT_PERSONAS['ceo']).toBe(ceoPersona);
    expect(DEFAULT_PERSONAS['coo']).toBe(cooPersona);
    expect(DEFAULT_PERSONAS['nexus-ai']).toBe(nexusAIPersona);
  });
});

// ============================================================================
// getPrimaryPersonaForDomain TESTS
// ============================================================================

describe('Default Personas - getPrimaryPersonaForDomain', () => {
  it.each([
    { domain: 'finance', expectedId: 'cfo' },
    { domain: 'revenue', expectedId: 'vp-sales' },
    { domain: 'cs', expectedId: 'vp-cs' },
    { domain: 'am', expectedId: 'vp-am' },
    { domain: 'services', expectedId: 'vp-services' },
    { domain: 'product', expectedId: 'vp-product' },
    { domain: 'marketing', expectedId: 'vp-marketing' },
    { domain: 'people', expectedId: 'vp-people' },
    { domain: 'executive', expectedId: 'nexus-ai' },
  ])(
    'returns $expectedId for domain "$domain"',
    ({ domain, expectedId }) => {
      const persona = getPrimaryPersonaForDomain(domain);
      expect(persona).toBeDefined();
      expect(persona!.id).toBe(expectedId);
    },
  );

  it('returns undefined for an unknown domain', () => {
    expect(getPrimaryPersonaForDomain('nonexistent')).toBeUndefined();
  });

  it('returns undefined for an empty string domain', () => {
    expect(getPrimaryPersonaForDomain('')).toBeUndefined();
  });
});

// ============================================================================
// getPersonasForDomain TESTS
// ============================================================================

describe('Default Personas - getPersonasForDomain', () => {
  it.each([
    { domain: 'finance', expectedCount: 2, expectedIds: ['cfo', 'vp-finance'] },
    { domain: 'revenue', expectedCount: 2, expectedIds: ['cro', 'vp-sales'] },
    { domain: 'cs', expectedCount: 2, expectedIds: ['vp-cs', 'csm'] },
    { domain: 'am', expectedCount: 1, expectedIds: ['vp-am'] },
    { domain: 'services', expectedCount: 1, expectedIds: ['vp-services'] },
    { domain: 'product', expectedCount: 1, expectedIds: ['vp-product'] },
    { domain: 'marketing', expectedCount: 1, expectedIds: ['vp-marketing'] },
    { domain: 'people', expectedCount: 1, expectedIds: ['vp-people'] },
    { domain: 'executive', expectedCount: 3, expectedIds: ['ceo', 'coo', 'nexus-ai'] },
  ])(
    'returns $expectedCount persona(s) for domain "$domain"',
    ({ domain, expectedCount, expectedIds }) => {
      const personas = getPersonasForDomain(domain);
      expect(personas).toHaveLength(expectedCount);
      const ids = personas.map((p) => p.id).sort();
      expect(ids).toEqual(expectedIds.sort());
    },
  );

  it('returns an empty array for an unknown domain', () => {
    const personas = getPersonasForDomain('nonexistent');
    expect(personas).toEqual([]);
  });

  it('all returned personas have the requested domain', () => {
    const domains = ['finance', 'revenue', 'cs', 'am', 'services', 'product', 'marketing', 'people', 'executive'];
    for (const domain of domains) {
      const personas = getPersonasForDomain(domain);
      personas.forEach((p) => {
        expect(p.domain).toBe(domain);
      });
    }
  });
});

// ============================================================================
// getPersona TESTS
// ============================================================================

describe('Default Personas - getPersona', () => {
  it('returns the correct persona for each valid ID', () => {
    for (const key of Object.keys(DEFAULT_PERSONAS)) {
      const persona = getPersona(key);
      expect(persona).toBeDefined();
      expect(persona!.id).toBe(key);
    }
  });

  it('returns undefined for an unknown ID', () => {
    expect(getPersona('nonexistent')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(getPersona('')).toBeUndefined();
  });

  it('returns the same reference as the exported constant', () => {
    expect(getPersona('cfo')).toBe(cfoPersona);
    expect(getPersona('nexus-ai')).toBe(nexusAIPersona);
  });
});

// ============================================================================
// getAllPersonas TESTS
// ============================================================================

describe('Default Personas - getAllPersonas', () => {
  it('returns an array of exactly 15 personas', () => {
    const personas = getAllPersonas();
    expect(personas).toHaveLength(15);
  });

  it('returns all persona IDs without duplicates', () => {
    const personas = getAllPersonas();
    const ids = personas.map((p) => p.id);
    const uniqueIds = [...new Set(ids)];
    expect(uniqueIds).toHaveLength(15);
  });

  it('includes every expected persona by ID', () => {
    const personas = getAllPersonas();
    const ids = personas.map((p) => p.id).sort();
    const expected = [
      'cfo', 'vp-finance',
      'cro', 'vp-sales',
      'vp-cs', 'csm',
      'vp-am',
      'vp-services',
      'vp-product',
      'vp-marketing',
      'vp-people',
      'vp-engineering-ops',
      'ceo', 'coo', 'nexus-ai',
    ].sort();
    expect(ids).toEqual(expected);
  });
});

// ============================================================================
// CROSS-CUTTING CONSISTENCY TESTS
// ============================================================================

describe('Default Personas - Cross-cutting Consistency', () => {
  it('all persona IDs are unique', () => {
    const allPersonas = getAllPersonas();
    const ids = allPersonas.map((p) => p.id);
    const uniqueIds = [...new Set(ids)];
    expect(uniqueIds).toHaveLength(ids.length);
  });

  it('all persona roles are unique', () => {
    const allPersonas = getAllPersonas();
    const roles = allPersonas.map((p) => p.role);
    const uniqueRoles = [...new Set(roles)];
    expect(uniqueRoles).toHaveLength(roles.length);
  });

  it('every domain has at least one persona', () => {
    const expectedDomains = ['finance', 'revenue', 'cs', 'am', 'services', 'product', 'marketing', 'people', 'executive'];
    for (const domain of expectedDomains) {
      const personas = getPersonasForDomain(domain);
      expect(personas.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('domain persona counts sum to 14', () => {
    const domains = ['finance', 'revenue', 'cs', 'am', 'services', 'product', 'marketing', 'people', 'executive'];
    const total = domains.reduce((sum, domain) => sum + getPersonasForDomain(domain).length, 0);
    expect(total).toBe(14);
  });

  it('every persona in DEFAULT_PERSONAS is accessible via getPersona', () => {
    Object.keys(DEFAULT_PERSONAS).forEach((key) => {
      expect(getPersona(key)).toBeDefined();
      expect(getPersona(key)).toBe(DEFAULT_PERSONAS[key]);
    });
  });

  it('primary persona for each domain is included in getPersonasForDomain results', () => {
    const domains = ['finance', 'revenue', 'cs', 'am', 'services', 'product', 'marketing', 'people', 'executive'];
    for (const domain of domains) {
      const primary = getPrimaryPersonaForDomain(domain);
      const allForDomain = getPersonasForDomain(domain);
      expect(primary).toBeDefined();
      expect(allForDomain.map((p) => p.id)).toContain(primary!.id);
    }
  });
});
