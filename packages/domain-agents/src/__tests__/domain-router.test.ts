/**
 * Nexus Domain Agents - Domain Router Tests
 *
 * Comprehensive tests for the domain router module including:
 * - createDomainRouter: factory returns object with all expected methods
 * - classifyIntent: delegates to intent classifier for keyword-based queries
 * - checkAccess: delegates to module access checker, enriches with adminContact
 * - getPersona: custom persona lookup with default persona fallback
 * - buildDisabledResponse: delegates to buildDisabledModuleResponse
 * - route: full flow (classify -> check access -> blockers -> persona -> disabled response)
 * - getModule / getAllModules: module registry lookups
 * - createSimpleRouter: lightweight sync-only variant (no access checking)
 */

import { describe, it, expect } from 'vitest';
import { createDomainRouter, createSimpleRouter } from '../routing/domain-router';
import { createMockSupabase } from './helpers/mock-supabase';
import type { ModuleRegistry, PersonaRegistry } from '../types';

// =============================================================================
// TEST DATA
// =============================================================================

const testModules: ModuleRegistry = {
  finance: {
    id: 'finance',
    name: 'Finance',
    description: 'Financial',
    icon: '\u{1F4B0}',
    keywords: ['invoice', 'cash flow'],
    capabilities: ['Invoice tracking', 'Cash flow'],
    tables: [],
    personas: ['CFO'],
  },
  revenue: {
    id: 'revenue',
    name: 'Revenue',
    description: 'Sales',
    icon: '\u{1F4C8}',
    keywords: ['pipeline', 'deal', 'sales'],
    capabilities: ['Pipeline management'],
    tables: [],
    personas: ['VP Sales'],
  },
  cs: {
    id: 'cs',
    name: 'Customer Success',
    description: 'CS',
    icon: '\u{1F49A}',
    keywords: ['health', 'churn'],
    capabilities: ['Health scoring'],
    tables: [],
    personas: ['CSM'],
  },
  executive: {
    id: 'executive',
    name: 'Executive',
    description: 'Strategic',
    icon: '\u{1F454}',
    keywords: ['strategy', 'board'],
    capabilities: ['Cross-domain'],
    tables: [],
    personas: ['CEO'],
  },
};

// Mock subscriptions: finance and revenue enabled, cs disabled, executive enabled
const mockSubscriptions = [
  { id: 's1', organization_id: 'org-1', module_id: 'finance', enabled: true },
  { id: 's2', organization_id: 'org-1', module_id: 'revenue', enabled: true },
  { id: 's3', organization_id: 'org-1', module_id: 'cs', enabled: false },
  { id: 's4', organization_id: 'org-1', module_id: 'executive', enabled: true },
];

/**
 * Create a standard domain router for tests.
 * Uses mock Supabase seeded with the test subscriptions.
 */
function createTestRouter(overrides?: {
  personas?: PersonaRegistry;
  adminContact?: string;
}) {
  const mockSupabase = createMockSupabase({
    org_module_subscriptions: mockSubscriptions,
  });

  return createDomainRouter({
    modules: testModules,
    personas: overrides?.personas,
    organizationId: 'org-1',
    supabaseClient: mockSupabase as never,
    adminContact: overrides?.adminContact,
  });
}

// =============================================================================
// createDomainRouter - FACTORY TESTS
// =============================================================================

describe('Domain Router - createDomainRouter', () => {
  it('returns an object with all expected methods', () => {
    const router = createTestRouter();

    expect(router).toBeDefined();
    expect(typeof router.classifyIntent).toBe('function');
    expect(typeof router.checkAccess).toBe('function');
    expect(typeof router.getPersona).toBe('function');
    expect(typeof router.buildDisabledResponse).toBe('function');
    expect(typeof router.route).toBe('function');
    expect(typeof router.getModule).toBe('function');
    expect(typeof router.getAllModules).toBe('function');
  });
});

// =============================================================================
// classifyIntent TESTS
// =============================================================================

describe('Domain Router - classifyIntent', () => {
  it('returns IntentClassification for a keyword like "invoice"', async () => {
    const router = createTestRouter();
    const result = await router.classifyIntent('Show me the latest invoice');

    expect(result).toBeDefined();
    expect(result.primaryModule).toBe('finance');
    expect(result.modules).toContain('finance');
    expect(result.matchedKeywords).toContain('invoice');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.method).toBe('keyword');
    expect(typeof result.isCrossDomain).toBe('boolean');
  });
});

// =============================================================================
// checkAccess TESTS
// =============================================================================

describe('Domain Router - checkAccess', () => {
  it('returns enabled and disabled lists based on subscriptions', async () => {
    const router = createTestRouter();
    const result = await router.checkAccess(['finance', 'cs']);

    expect(result.enabled).toContain('finance');
    expect(result.disabled).toContain('cs');
    expect(result.partial).toBe(true);
  });

  it('includes adminContact when configured', async () => {
    const router = createTestRouter({ adminContact: 'admin@acme.com' });
    const result = await router.checkAccess(['finance', 'cs']);

    expect(result.adminContact).toBe('admin@acme.com');
  });
});

// =============================================================================
// getPersona TESTS
// =============================================================================

describe('Domain Router - getPersona', () => {
  it('returns default persona for a known module', () => {
    const router = createTestRouter();
    const persona = router.getPersona('finance');

    expect(persona).toBeDefined();
    expect(persona!.domain).toBe('finance');
    expect(persona!.role).toBe('CFO');
  });

  it('checks custom personas first, falling back to defaults', () => {
    const customPersonas: PersonaRegistry = {
      'custom-finance': {
        id: 'custom-finance',
        role: 'Custom CFO',
        domain: 'finance',
        description: 'A custom finance persona',
        icon: '\u{1F4B5}',
        color: '#00FF00',
      },
    };

    const router = createTestRouter({ personas: customPersonas });
    const persona = router.getPersona('finance');

    expect(persona).toBeDefined();
    expect(persona!.id).toBe('custom-finance');
    expect(persona!.role).toBe('Custom CFO');
  });

  it('returns undefined for an unknown module with no default persona', () => {
    const router = createTestRouter();
    const persona = router.getPersona('nonexistent-module');

    expect(persona).toBeUndefined();
  });
});

// =============================================================================
// getModule / getAllModules TESTS
// =============================================================================

describe('Domain Router - getModule', () => {
  it('returns the module definition for a known module ID', () => {
    const router = createTestRouter();
    const module = router.getModule('finance');

    expect(module).toBeDefined();
    expect(module!.id).toBe('finance');
    expect(module!.name).toBe('Finance');
  });

  it('returns undefined for an unknown module ID', () => {
    const router = createTestRouter();
    const module = router.getModule('unknown');

    expect(module).toBeUndefined();
  });
});

describe('Domain Router - getAllModules', () => {
  it('returns all module definitions from the registry', () => {
    const router = createTestRouter();
    const modules = router.getAllModules();

    expect(modules).toHaveLength(4);
    const ids = modules.map(m => m.id);
    expect(ids).toContain('finance');
    expect(ids).toContain('revenue');
    expect(ids).toContain('cs');
    expect(ids).toContain('executive');
  });
});

// =============================================================================
// buildDisabledResponse TESTS
// =============================================================================

describe('Domain Router - buildDisabledResponse', () => {
  it('returns a DisabledModuleResponse with explanation and capabilities', () => {
    const router = createTestRouter({ adminContact: 'admin@acme.com' });

    const access = {
      enabled: ['finance'],
      disabled: ['cs'],
      partial: true,
      missingCapabilities: [],
    };

    const response = router.buildDisabledResponse(access);

    expect(response).toBeDefined();
    expect(response.explanation).toContain('Customer Success');
    expect(response.capabilities).toContain('Health scoring');
    expect(response.ctaText).toContain('admin@acme.com');
    expect(response.adminContact).toBe('admin@acme.com');
    expect(typeof response.hasPartialData).toBe('boolean');
  });
});

// =============================================================================
// route TESTS (full flow)
// =============================================================================

describe('Domain Router - route', () => {
  it('returns canHandle=true for a query targeting an enabled module', async () => {
    const router = createTestRouter();
    const result = await router.route('Show me the latest invoice');

    expect(result.canHandle).toBe(true);
    expect(result.intent.primaryModule).toBe('finance');
    expect(result.access.enabled).toContain('finance');
    expect(result.blockers).toBeUndefined();
    expect(result.disabledModuleResponse).toBeUndefined();
  });

  it('returns canHandle=false with blockers for a query targeting a disabled module', async () => {
    const router = createTestRouter();
    const result = await router.route('What is the customer health score?');

    // "health" keyword maps to the cs module, which is disabled
    expect(result.canHandle).toBe(false);
    expect(result.intent.primaryModule).toBe('cs');
    expect(result.access.disabled).toContain('cs');
    expect(result.blockers).toBeDefined();
    expect(result.blockers!.length).toBeGreaterThan(0);
  });

  it('includes disabledModuleResponse when canHandle is false', async () => {
    const router = createTestRouter();
    const result = await router.route('What is our churn rate?');

    expect(result.canHandle).toBe(false);
    expect(result.disabledModuleResponse).toBeDefined();
    expect(result.disabledModuleResponse!.explanation).toContain('Customer Success');
    expect(result.disabledModuleResponse!.capabilities).toContain('Health scoring');
  });

  it('selects the appropriate persona for an enabled primary module', async () => {
    const router = createTestRouter();
    const result = await router.route('How is the sales pipeline looking?');

    // "pipeline" keyword maps to revenue, which is enabled
    expect(result.canHandle).toBe(true);
    expect(result.persona).toBeDefined();
    expect(result.persona!.domain).toBe('revenue');
  });

  it('creates blockers with type module_disabled for each disabled module', async () => {
    const router = createTestRouter();
    const result = await router.route('What is the customer health score?');

    expect(result.blockers).toBeDefined();
    for (const blocker of result.blockers!) {
      expect(blocker.type).toBe('module_disabled');
      expect(blocker.moduleId).toBeDefined();
      expect(blocker.message).toBeDefined();
    }
  });
});

// =============================================================================
// createSimpleRouter TESTS
// =============================================================================

describe('Domain Router - createSimpleRouter', () => {
  it('returns an object with classifyIntent, getPersona, and getModule', () => {
    const router = createSimpleRouter({ modules: testModules });

    expect(router).toBeDefined();
    expect(typeof router.classifyIntent).toBe('function');
    expect(typeof router.getPersona).toBe('function');
    expect(typeof router.getModule).toBe('function');
  });

  it('classifyIntent returns a synchronous IntentClassification', () => {
    const router = createSimpleRouter({ modules: testModules });
    const result = router.classifyIntent('Show me the latest invoice');

    // Result is returned synchronously (not a Promise)
    expect(result).toBeDefined();
    expect(result.primaryModule).toBe('finance');
    expect(result.modules).toContain('finance');
    expect(result.matchedKeywords).toContain('invoice');
    expect(result.method).toBe('keyword');
    expect(typeof result.confidence).toBe('number');
  });

  it('getPersona returns persona for a known module', () => {
    const router = createSimpleRouter({ modules: testModules });
    const persona = router.getPersona('finance');

    expect(persona).toBeDefined();
    expect(persona!.domain).toBe('finance');
    expect(persona!.role).toBe('CFO');
  });

  it('getModule returns module definition for a known module', () => {
    const router = createSimpleRouter({ modules: testModules });
    const module = router.getModule('revenue');

    expect(module).toBeDefined();
    expect(module!.id).toBe('revenue');
    expect(module!.name).toBe('Revenue');
  });
});
