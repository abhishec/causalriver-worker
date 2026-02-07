/**
 * Nexus Domain Agents - Module Access Control Tests
 *
 * Comprehensive tests for the module access control system including:
 * - createModuleAccessChecker: factory shape, checkAccess, isModuleEnabled, getEnabledModules, clearCache
 * - checkModuleAccessWithCapabilities: capability enrichment from disabled modules
 * - batchCheckAccess: multi-org batch fetching, error handling
 */

import { describe, it, expect } from 'vitest';
import {
  createModuleAccessChecker,
  checkModuleAccessWithCapabilities,
  batchCheckAccess,
} from '../access/module-access';
import { createMockSupabase } from './helpers/mock-supabase';
import type { ModuleRegistry } from '../types';

// =============================================================================
// TEST DATA
// =============================================================================

const mockSubscriptions = [
  { id: 's1', organization_id: 'org-1', module_id: 'finance', enabled: true, enabled_at: '2024-01-01' },
  { id: 's2', organization_id: 'org-1', module_id: 'revenue', enabled: true, enabled_at: '2024-01-01' },
  { id: 's3', organization_id: 'org-1', module_id: 'cs', enabled: false, disabled_at: '2024-06-01' },
  { id: 's4', organization_id: 'org-1', module_id: 'marketing', enabled: false },
];

const testRegistry: ModuleRegistry = {
  finance: {
    id: 'finance',
    name: 'Finance',
    description: 'desc',
    icon: '\u{1F4B0}',
    keywords: ['invoice'],
    capabilities: ['Invoice tracking', 'Cash flow'],
    tables: [],
    personas: [],
  },
  revenue: {
    id: 'revenue',
    name: 'Revenue',
    description: 'desc',
    icon: '\u{1F4C8}',
    keywords: ['pipeline'],
    capabilities: ['Pipeline mgmt'],
    tables: [],
    personas: [],
  },
  cs: {
    id: 'cs',
    name: 'CS',
    description: 'desc',
    icon: '\u{1F49A}',
    keywords: ['health'],
    capabilities: ['Health scoring', 'Churn prevention'],
    tables: [],
    personas: [],
  },
  marketing: {
    id: 'marketing',
    name: 'Marketing',
    description: 'desc',
    icon: '\u{1F4E3}',
    keywords: ['campaign'],
    capabilities: ['Campaign tracking'],
    tables: [],
    personas: [],
  },
};

// =============================================================================
// HELPER
// =============================================================================

/**
 * Creates a module access checker wired to mock subscription data.
 */
function createTestChecker(subscriptions: Record<string, unknown>[] = mockSubscriptions, cacheTtl?: number) {
  const mockSupabase = createMockSupabase({
    org_module_subscriptions: subscriptions,
  });

  return createModuleAccessChecker({
    organizationId: 'org-1',
    supabaseClient: mockSupabase as never,
    ...(cacheTtl !== undefined ? { cacheTtl } : {}),
  });
}

// =============================================================================
// createModuleAccessChecker TESTS
// =============================================================================

describe('Module Access - createModuleAccessChecker', () => {
  it('returns an object with all expected methods', () => {
    const checker = createTestChecker();

    expect(typeof checker.checkAccess).toBe('function');
    expect(typeof checker.isModuleEnabled).toBe('function');
    expect(typeof checker.getEnabledModules).toBe('function');
    expect(typeof checker.getSubscriptions).toBe('function');
    expect(typeof checker.clearCache).toBe('function');
  });
});

// =============================================================================
// checkAccess TESTS
// =============================================================================

describe('Module Access - checkAccess', () => {
  it('returns enabled modules correctly', async () => {
    const checker = createTestChecker();
    const result = await checker.checkAccess(['finance', 'revenue']);

    expect(result.enabled).toContain('finance');
    expect(result.enabled).toContain('revenue');
    expect(result.enabled).toHaveLength(2);
  });

  it('returns disabled modules correctly', async () => {
    const checker = createTestChecker();
    const result = await checker.checkAccess(['cs', 'marketing']);

    expect(result.disabled).toContain('cs');
    expect(result.disabled).toContain('marketing');
    expect(result.disabled).toHaveLength(2);
  });

  it('sets partial=true when some modules are enabled and some are disabled', async () => {
    const checker = createTestChecker();
    const result = await checker.checkAccess(['finance', 'cs']);

    expect(result.enabled).toEqual(['finance']);
    expect(result.disabled).toEqual(['cs']);
    expect(result.partial).toBe(true);
  });

  it('sets partial=false when all requested modules are enabled', async () => {
    const checker = createTestChecker();
    const result = await checker.checkAccess(['finance', 'revenue']);

    expect(result.enabled).toHaveLength(2);
    expect(result.disabled).toHaveLength(0);
    expect(result.partial).toBe(false);
  });

  it('sets partial=false when all requested modules are disabled', async () => {
    const checker = createTestChecker();
    const result = await checker.checkAccess(['cs', 'marketing']);

    expect(result.enabled).toHaveLength(0);
    expect(result.disabled).toHaveLength(2);
    expect(result.partial).toBe(false);
  });
});

// =============================================================================
// isModuleEnabled TESTS
// =============================================================================

describe('Module Access - isModuleEnabled', () => {
  it('returns true for an enabled module', async () => {
    const checker = createTestChecker();
    const enabled = await checker.isModuleEnabled('finance');

    expect(enabled).toBe(true);
  });

  it('returns false for a disabled module', async () => {
    const checker = createTestChecker();
    const enabled = await checker.isModuleEnabled('cs');

    expect(enabled).toBe(false);
  });
});

// =============================================================================
// getEnabledModules TESTS
// =============================================================================

describe('Module Access - getEnabledModules', () => {
  it('returns only the IDs of enabled modules', async () => {
    const checker = createTestChecker();
    const enabledModules = await checker.getEnabledModules();

    expect(enabledModules).toHaveLength(2);
    expect(enabledModules).toContain('finance');
    expect(enabledModules).toContain('revenue');
    expect(enabledModules).not.toContain('cs');
    expect(enabledModules).not.toContain('marketing');
  });
});

// =============================================================================
// clearCache TESTS
// =============================================================================

describe('Module Access - clearCache', () => {
  it('clears the cache so subsequent calls re-query the database', async () => {
    // Use a very long TTL so the cache would normally persist
    const mockSupabase = createMockSupabase({
      org_module_subscriptions: mockSubscriptions,
    });

    let callCount = 0;
    const originalFrom = mockSupabase.from.bind(mockSupabase);
    mockSupabase.from = (table: string) => {
      callCount++;
      return originalFrom(table);
    };

    const checker = createModuleAccessChecker({
      organizationId: 'org-1',
      supabaseClient: mockSupabase as never,
      cacheTtl: 600000, // 10 minutes
    });

    // First call populates the cache
    await checker.getEnabledModules();
    const firstCallCount = callCount;

    // Second call should use the cache (no new query)
    await checker.getEnabledModules();
    expect(callCount).toBe(firstCallCount);

    // Clear cache and call again - should trigger a new query
    checker.clearCache();
    await checker.getEnabledModules();
    expect(callCount).toBeGreaterThan(firstCallCount);
  });
});

// =============================================================================
// checkModuleAccessWithCapabilities TESTS
// =============================================================================

describe('Module Access - checkModuleAccessWithCapabilities', () => {
  it('adds missing capabilities from disabled modules', async () => {
    const checker = createTestChecker();
    const result = await checkModuleAccessWithCapabilities(
      checker,
      ['finance', 'cs', 'marketing'],
      testRegistry
    );

    // cs and marketing are disabled, so their capabilities should appear as missing
    expect(result.missingCapabilities).toContain('Health scoring');
    expect(result.missingCapabilities).toContain('Churn prevention');
    expect(result.missingCapabilities).toContain('Campaign tracking');
    expect(result.missingCapabilities).toHaveLength(3);
  });

  it('preserves the enabled and disabled lists from the underlying checker', async () => {
    const checker = createTestChecker();
    const result = await checkModuleAccessWithCapabilities(
      checker,
      ['finance', 'revenue', 'cs'],
      testRegistry
    );

    expect(result.enabled).toEqual(['finance', 'revenue']);
    expect(result.disabled).toEqual(['cs']);
    expect(result.partial).toBe(true);
  });
});

// =============================================================================
// batchCheckAccess TESTS
// =============================================================================

describe('Module Access - batchCheckAccess', () => {
  it('returns results for multiple organizations', async () => {
    const batchSubscriptions = [
      { id: 'b1', organization_id: 'org-A', module_id: 'finance', enabled: true },
      { id: 'b2', organization_id: 'org-A', module_id: 'revenue', enabled: false },
      { id: 'b3', organization_id: 'org-B', module_id: 'finance', enabled: false },
      { id: 'b4', organization_id: 'org-B', module_id: 'cs', enabled: true },
    ];

    const mockSupabase = createMockSupabase({
      org_module_subscriptions: batchSubscriptions,
    });

    const results = await batchCheckAccess(mockSupabase as never, [
      { organizationId: 'org-A', moduleIds: ['finance', 'revenue'] },
      { organizationId: 'org-B', moduleIds: ['finance', 'cs'] },
    ]);

    expect(results).toBeInstanceOf(Map);

    // org-A: finance enabled, revenue disabled
    const orgA = results.get('org-A');
    expect(orgA).toBeDefined();
    expect(orgA!.enabled).toEqual(['finance']);
    expect(orgA!.disabled).toEqual(['revenue']);
    expect(orgA!.partial).toBe(true);

    // org-B: finance disabled, cs enabled
    const orgB = results.get('org-B');
    expect(orgB).toBeDefined();
    expect(orgB!.enabled).toEqual(['cs']);
    expect(orgB!.disabled).toEqual(['finance']);
    expect(orgB!.partial).toBe(true);
  });

  it('handles errors gracefully by marking all modules as disabled', async () => {
    // Create a mock supabase that returns an error for the batch query
    const errorSupabase = {
      from: () => ({
        select: () => ({
          in: () => ({
            data: null,
            error: { message: 'Database connection failed', code: 'PGRST301' },
          }),
        }),
      }),
    };

    const results = await batchCheckAccess(errorSupabase as never, [
      { organizationId: 'org-X', moduleIds: ['finance', 'revenue'] },
      { organizationId: 'org-Y', moduleIds: ['cs'] },
    ]);

    // On error, all requested modules should be disabled
    const orgX = results.get('org-X');
    expect(orgX).toBeDefined();
    expect(orgX!.enabled).toHaveLength(0);
    expect(orgX!.disabled).toEqual(['finance', 'revenue']);
    expect(orgX!.partial).toBe(false);

    const orgY = results.get('org-Y');
    expect(orgY).toBeDefined();
    expect(orgY!.enabled).toHaveLength(0);
    expect(orgY!.disabled).toEqual(['cs']);
    expect(orgY!.partial).toBe(false);
  });
});
