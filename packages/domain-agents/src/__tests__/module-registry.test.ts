/**
 * Nexus Domain Agents - Module Registry Tests
 *
 * Comprehensive tests for the module registry factory functions including:
 * - createModuleRegistry: defaults, custom modules, excludeModules, overrides, includeDefaults
 * - extendRegistry: adding new modules, overriding existing
 * - mergeRegistries: merging multiple registries, override precedence
 * - filterRegistry: filtering to specified IDs, handling unknown IDs
 * - validateModule: valid modules, missing fields
 * - getAllKeywords: keyword mapping and shared keywords
 * - searchModules: matching by name, description, keywords, capabilities
 * - getDependentModules: finding reverse dependencies
 * - getDependencyTree: topological ordering, cycle handling
 */

import { describe, it, expect } from 'vitest';
import {
  createModuleRegistry,
  extendRegistry,
  mergeRegistries,
  filterRegistry,
  validateModule,
  getAllKeywords,
  searchModules,
  getDependentModules,
  getDependencyTree,
} from '../registry/module-registry';
import type { ModuleDefinition, ModuleRegistry } from '../types';

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Creates a minimal valid ModuleDefinition for testing.
 * Override any field by passing partial properties.
 */
function createTestModule(overrides: Partial<ModuleDefinition> = {}): ModuleDefinition {
  return {
    id: overrides.id ?? 'test-module',
    name: overrides.name ?? 'Test Module',
    description: overrides.description ?? 'A test module for unit testing',
    icon: overrides.icon ?? 'T',
    keywords: overrides.keywords ?? ['test', 'unit'],
    capabilities: overrides.capabilities ?? ['testing things'],
    tables: overrides.tables ?? ['test_table'],
    personas: overrides.personas ?? ['Tester'],
    ...(overrides.dependsOn !== undefined ? { dependsOn: overrides.dependsOn } : {}),
    ...(overrides.category !== undefined ? { category: overrides.category } : {}),
  };
}

// =============================================================================
// createModuleRegistry TESTS
// =============================================================================

describe('Module Registry - createModuleRegistry', () => {
  it('returns all 9 default modules when called with no options', () => {
    const registry = createModuleRegistry();
    const keys = Object.keys(registry);
    expect(keys).toHaveLength(9);
    const expectedIds = [
      'finance', 'revenue', 'cs', 'am', 'services',
      'product', 'marketing', 'people', 'executive',
    ];
    expect(keys.sort()).toEqual(expectedIds.sort());
  });

  it('includes custom modules alongside defaults', () => {
    const custom = createTestModule({ id: 'legal', name: 'Legal', keywords: ['contract', 'compliance'] });
    const registry = createModuleRegistry({ modules: [custom] });

    expect(Object.keys(registry)).toHaveLength(10);
    expect(registry['legal']).toBeDefined();
    expect(registry['legal'].name).toBe('Legal');
    // defaults are still present
    expect(registry['finance']).toBeDefined();
  });

  it('excludes specified modules from defaults', () => {
    const registry = createModuleRegistry({ excludeModules: ['marketing', 'people'] });

    expect(Object.keys(registry)).toHaveLength(7);
    expect(registry['marketing']).toBeUndefined();
    expect(registry['people']).toBeUndefined();
    // remaining modules are still present
    expect(registry['finance']).toBeDefined();
    expect(registry['executive']).toBeDefined();
  });

  it('applies overrides to default module properties', () => {
    const registry = createModuleRegistry({
      overrides: {
        finance: { name: 'Finance & Accounting', icon: '$' },
      },
    });

    expect(registry['finance'].name).toBe('Finance & Accounting');
    expect(registry['finance'].icon).toBe('$');
    // non-overridden fields remain intact
    expect(registry['finance'].id).toBe('finance');
    expect(registry['finance'].keywords.length).toBeGreaterThan(0);
  });

  it('returns only custom modules when includeDefaults is false', () => {
    const custom = createTestModule({ id: 'analytics', name: 'Analytics' });
    const registry = createModuleRegistry({
      includeDefaults: false,
      modules: [custom],
    });

    expect(Object.keys(registry)).toHaveLength(1);
    expect(registry['analytics']).toBeDefined();
    expect(registry['finance']).toBeUndefined();
  });

  it('returns an empty registry when includeDefaults is false and no modules provided', () => {
    const registry = createModuleRegistry({ includeDefaults: false });
    expect(Object.keys(registry)).toHaveLength(0);
  });

  it('throws an error when a custom module has no id', () => {
    const invalid = { name: 'No ID' } as ModuleDefinition;
    expect(() => createModuleRegistry({ modules: [invalid] })).toThrow('Module must have an id');
  });
});

// =============================================================================
// extendRegistry TESTS
// =============================================================================

describe('Module Registry - extendRegistry', () => {
  it('adds new modules to an existing registry', () => {
    const base = createModuleRegistry({ includeDefaults: false, modules: [
      createTestModule({ id: 'alpha', name: 'Alpha' }),
    ]});
    const extension = createTestModule({ id: 'beta', name: 'Beta' });

    const extended = extendRegistry(base, [extension]);

    expect(Object.keys(extended)).toHaveLength(2);
    expect(extended['alpha']).toBeDefined();
    expect(extended['beta']).toBeDefined();
  });

  it('overrides an existing module when extension has the same id', () => {
    const base = createModuleRegistry({ includeDefaults: false, modules: [
      createTestModule({ id: 'alpha', name: 'Alpha Original', keywords: ['original'] }),
    ]});
    const override = createTestModule({ id: 'alpha', name: 'Alpha Updated', keywords: ['updated'] });

    const extended = extendRegistry(base, [override]);

    expect(Object.keys(extended)).toHaveLength(1);
    expect(extended['alpha'].name).toBe('Alpha Updated');
    expect(extended['alpha'].keywords).toEqual(['updated']);
  });

  it('does not mutate the base registry', () => {
    const base = createModuleRegistry({ includeDefaults: false, modules: [
      createTestModule({ id: 'alpha', name: 'Alpha' }),
    ]});
    const extension = createTestModule({ id: 'beta', name: 'Beta' });

    extendRegistry(base, [extension]);

    expect(Object.keys(base)).toHaveLength(1);
    expect(base['beta']).toBeUndefined();
  });
});

// =============================================================================
// mergeRegistries TESTS
// =============================================================================

describe('Module Registry - mergeRegistries', () => {
  it('merges two registries into one', () => {
    const r1: ModuleRegistry = {
      alpha: createTestModule({ id: 'alpha', name: 'Alpha' }),
    };
    const r2: ModuleRegistry = {
      beta: createTestModule({ id: 'beta', name: 'Beta' }),
    };

    const merged = mergeRegistries(r1, r2);

    expect(Object.keys(merged)).toHaveLength(2);
    expect(merged['alpha']).toBeDefined();
    expect(merged['beta']).toBeDefined();
  });

  it('later registries override earlier ones for the same key', () => {
    const r1: ModuleRegistry = {
      shared: createTestModule({ id: 'shared', name: 'First Version' }),
    };
    const r2: ModuleRegistry = {
      shared: createTestModule({ id: 'shared', name: 'Second Version' }),
    };

    const merged = mergeRegistries(r1, r2);

    expect(merged['shared'].name).toBe('Second Version');
  });

  it('merges three registries with correct precedence', () => {
    const r1: ModuleRegistry = {
      a: createTestModule({ id: 'a', name: 'A-v1' }),
      b: createTestModule({ id: 'b', name: 'B-v1' }),
    };
    const r2: ModuleRegistry = {
      b: createTestModule({ id: 'b', name: 'B-v2' }),
      c: createTestModule({ id: 'c', name: 'C-v2' }),
    };
    const r3: ModuleRegistry = {
      c: createTestModule({ id: 'c', name: 'C-v3' }),
    };

    const merged = mergeRegistries(r1, r2, r3);

    expect(Object.keys(merged).sort()).toEqual(['a', 'b', 'c']);
    expect(merged['a'].name).toBe('A-v1');
    expect(merged['b'].name).toBe('B-v2');
    expect(merged['c'].name).toBe('C-v3');
  });
});

// =============================================================================
// filterRegistry TESTS
// =============================================================================

describe('Module Registry - filterRegistry', () => {
  it('filters registry to only the specified module IDs', () => {
    const registry = createModuleRegistry();
    const filtered = filterRegistry(registry, ['finance', 'revenue']);

    expect(Object.keys(filtered)).toHaveLength(2);
    expect(filtered['finance']).toBeDefined();
    expect(filtered['revenue']).toBeDefined();
    expect(filtered['cs']).toBeUndefined();
  });

  it('silently ignores unknown module IDs', () => {
    const registry = createModuleRegistry();
    const filtered = filterRegistry(registry, ['finance', 'nonexistent', 'ghost']);

    expect(Object.keys(filtered)).toHaveLength(1);
    expect(filtered['finance']).toBeDefined();
  });

  it('returns an empty registry when no IDs match', () => {
    const registry = createModuleRegistry();
    const filtered = filterRegistry(registry, ['nonexistent']);

    expect(Object.keys(filtered)).toHaveLength(0);
  });
});

// =============================================================================
// validateModule TESTS
// =============================================================================

describe('Module Registry - validateModule', () => {
  it('returns valid: true for a fully defined module', () => {
    const module = createTestModule();
    const result = validateModule(module);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns errors for a module missing all required fields', () => {
    const result = validateModule({});

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Module must have an id');
    expect(result.errors).toContain('Module must have a name');
    expect(result.errors).toContain('Module must have a description');
    expect(result.errors).toContain('Module must have at least one keyword');
    expect(result.errors).toContain('Module must have at least one capability');
    expect(result.errors).toHaveLength(5);
  });

  it('returns an error when keywords array is empty', () => {
    const module = createTestModule({ keywords: [] });
    const result = validateModule(module);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Module must have at least one keyword');
  });

  it('returns an error when capabilities array is empty', () => {
    const module = createTestModule({ capabilities: [] });
    const result = validateModule(module);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Module must have at least one capability');
  });
});

// =============================================================================
// getAllKeywords TESTS
// =============================================================================

describe('Module Registry - getAllKeywords', () => {
  it('returns a Map instance', () => {
    const registry = createModuleRegistry({ includeDefaults: false, modules: [
      createTestModule({ id: 'a', keywords: ['alpha'] }),
    ]});
    const result = getAllKeywords(registry);

    expect(result).toBeInstanceOf(Map);
  });

  it('maps keywords to their owning module IDs', () => {
    const registry: ModuleRegistry = {
      modA: createTestModule({ id: 'modA', keywords: ['billing', 'invoice'] }),
      modB: createTestModule({ id: 'modB', keywords: ['pipeline', 'deal'] }),
    };

    const keywordMap = getAllKeywords(registry);

    expect(keywordMap.get('billing')).toEqual(['modA']);
    expect(keywordMap.get('invoice')).toEqual(['modA']);
    expect(keywordMap.get('pipeline')).toEqual(['modB']);
    expect(keywordMap.get('deal')).toEqual(['modB']);
  });

  it('maps a shared keyword to multiple module IDs', () => {
    const registry: ModuleRegistry = {
      modA: createTestModule({ id: 'modA', keywords: ['shared', 'unique-a'] }),
      modB: createTestModule({ id: 'modB', keywords: ['shared', 'unique-b'] }),
    };

    const keywordMap = getAllKeywords(registry);

    const sharedModules = keywordMap.get('shared');
    expect(sharedModules).toBeDefined();
    expect(sharedModules).toHaveLength(2);
    expect(sharedModules).toContain('modA');
    expect(sharedModules).toContain('modB');
  });

  it('normalizes keywords to lowercase', () => {
    const registry: ModuleRegistry = {
      modA: createTestModule({ id: 'modA', keywords: ['Invoice', 'BILLING'] }),
    };

    const keywordMap = getAllKeywords(registry);

    expect(keywordMap.get('invoice')).toEqual(['modA']);
    expect(keywordMap.get('billing')).toEqual(['modA']);
    // original casing should not be a separate key
    expect(keywordMap.has('Invoice')).toBe(false);
    expect(keywordMap.has('BILLING')).toBe(false);
  });
});

// =============================================================================
// searchModules TESTS
// =============================================================================

describe('Module Registry - searchModules', () => {
  const searchRegistry: ModuleRegistry = {
    finance: createTestModule({
      id: 'finance',
      name: 'Finance',
      description: 'Manage cash flow and invoicing',
      keywords: ['invoice', 'billing', 'cash'],
      capabilities: ['Invoice tracking', 'Cash flow forecasting'],
    }),
    sales: createTestModule({
      id: 'sales',
      name: 'Sales Pipeline',
      description: 'Track deals and revenue',
      keywords: ['deal', 'pipeline', 'quota'],
      capabilities: ['Deal tracking', 'Revenue forecasting'],
    }),
  };

  it('matches modules by name', () => {
    const results = searchModules(searchRegistry, 'Finance');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('finance');
  });

  it('matches modules by description', () => {
    const results = searchModules(searchRegistry, 'cash flow');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('finance');
  });

  it('matches modules by keyword', () => {
    const results = searchModules(searchRegistry, 'pipeline');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('sales');
  });

  it('matches modules by capability', () => {
    const results = searchModules(searchRegistry, 'Revenue forecasting');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('sales');
  });

  it('performs case-insensitive search', () => {
    const results = searchModules(searchRegistry, 'INVOICE');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('finance');
  });

  it('returns empty array when no modules match', () => {
    const results = searchModules(searchRegistry, 'nonexistent-xyz');
    expect(results).toHaveLength(0);
  });
});

// =============================================================================
// getDependentModules TESTS
// =============================================================================

describe('Module Registry - getDependentModules', () => {
  it('finds executive as a dependent of finance in default registry', () => {
    const registry = createModuleRegistry();
    const dependents = getDependentModules(registry, 'finance');

    const dependentIds = dependents.map(m => m.id);
    expect(dependentIds).toContain('executive');
  });

  it('finds executive as a dependent of each of its dependency modules', () => {
    const registry = createModuleRegistry();
    const executiveDeps = ['finance', 'revenue', 'cs', 'am', 'services'];

    for (const depId of executiveDeps) {
      const dependents = getDependentModules(registry, depId);
      const dependentIds = dependents.map(m => m.id);
      expect(dependentIds).toContain('executive');
    }
  });

  it('returns an empty array for a module with no dependents', () => {
    const registry: ModuleRegistry = {
      standalone: createTestModule({ id: 'standalone' }),
    };

    const dependents = getDependentModules(registry, 'standalone');
    expect(dependents).toHaveLength(0);
  });
});

// =============================================================================
// getDependencyTree TESTS
// =============================================================================

describe('Module Registry - getDependencyTree', () => {
  it('returns topological order with dependencies before the dependent module', () => {
    const registry = createModuleRegistry();
    const tree = getDependencyTree(registry, 'executive');

    // executive should be the last element (it depends on the others)
    expect(tree[tree.length - 1]).toBe('executive');
    // all five dependencies should appear before executive
    const executiveIndex = tree.indexOf('executive');
    for (const dep of ['finance', 'revenue', 'cs', 'am', 'services']) {
      const depIndex = tree.indexOf(dep);
      expect(depIndex).toBeGreaterThanOrEqual(0);
      expect(depIndex).toBeLessThan(executiveIndex);
    }
  });

  it('returns a single-element array for a module with no dependencies', () => {
    const registry = createModuleRegistry();
    const tree = getDependencyTree(registry, 'finance');

    expect(tree).toEqual(['finance']);
  });

  it('handles cycles gracefully via the visited set', () => {
    const registry: ModuleRegistry = {
      a: createTestModule({ id: 'a', dependsOn: ['b'] }),
      b: createTestModule({ id: 'b', dependsOn: ['a'] }),
    };

    // should not throw or loop infinitely
    const treeA = getDependencyTree(registry, 'a');

    // both modules should appear exactly once
    expect(treeA).toHaveLength(2);
    expect(treeA).toContain('a');
    expect(treeA).toContain('b');
  });

  it('returns a single-element array for a module not in the registry', () => {
    const registry = createModuleRegistry();
    const tree = getDependencyTree(registry, 'nonexistent');

    // the module itself is pushed even if not in registry (traverse pushes id before checking registry)
    // actually: traverse checks registry[id], if undefined, dependsOn is skipped, then id is pushed
    expect(tree).toEqual(['nonexistent']);
  });
});
