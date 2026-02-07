/**
 * Nexus Domain Agents - Default Modules Tests
 *
 * Comprehensive tests for the default module definitions including:
 * - All 9 module constants and their required fields
 * - DEFAULT_MODULES registry completeness
 * - MODULE_IDS array correctness
 * - Lookup functions: getModule, getAllModules
 * - Category functions: getModulesByCategory, getCoreModules, getOperationalModules, getStrategicModules
 * - Special properties (executiveModule.dependsOn)
 * - Non-empty keywords and capabilities for all modules
 */

import { describe, it, expect } from 'vitest';
import {
  financeModule,
  revenueModule,
  csModule,
  amModule,
  servicesModule,
  productModule,
  marketingModule,
  peopleModule,
  executiveModule,
  DEFAULT_MODULES,
  MODULE_IDS,
  getModule,
  getAllModules,
  getModulesByCategory,
  getCoreModules,
  getOperationalModules,
  getStrategicModules,
} from '../registry/default-modules';

// ============================================================================
// ALL 9 MODULE CONSTANTS
// ============================================================================

const allModuleExports = [
  { ref: financeModule, expectedId: 'finance', expectedCategory: 'core' },
  { ref: revenueModule, expectedId: 'revenue', expectedCategory: 'core' },
  { ref: csModule, expectedId: 'cs', expectedCategory: 'operational' },
  { ref: amModule, expectedId: 'am', expectedCategory: 'operational' },
  { ref: servicesModule, expectedId: 'services', expectedCategory: 'operational' },
  { ref: productModule, expectedId: 'product', expectedCategory: 'operational' },
  { ref: marketingModule, expectedId: 'marketing', expectedCategory: 'operational' },
  { ref: peopleModule, expectedId: 'people', expectedCategory: 'operational' },
  { ref: executiveModule, expectedId: 'executive', expectedCategory: 'strategic' },
];

// ============================================================================
// MODULE STRUCTURE TESTS
// ============================================================================

describe('Default Modules - Module Structure', () => {
  it.each(allModuleExports)(
    '$expectedId module has all required fields',
    ({ ref, expectedId, expectedCategory }) => {
      expect(ref).toBeDefined();
      expect(ref.id).toBe(expectedId);
      expect(ref.name).toEqual(expect.any(String));
      expect(ref.name.length).toBeGreaterThan(0);
      expect(ref.description).toEqual(expect.any(String));
      expect(ref.description.length).toBeGreaterThan(0);
      expect(ref.icon).toEqual(expect.any(String));
      expect(ref.icon.length).toBeGreaterThan(0);
      expect(ref.category).toBe(expectedCategory);
      expect(Array.isArray(ref.keywords)).toBe(true);
      expect(Array.isArray(ref.capabilities)).toBe(true);
      expect(Array.isArray(ref.tables)).toBe(true);
      expect(Array.isArray(ref.personas)).toBe(true);
    },
  );

  it.each(allModuleExports)(
    '$expectedId module has non-empty keywords array',
    ({ ref }) => {
      expect(ref.keywords.length).toBeGreaterThan(0);
      ref.keywords.forEach((kw) => {
        expect(typeof kw).toBe('string');
        expect(kw.length).toBeGreaterThan(0);
      });
    },
  );

  it.each(allModuleExports)(
    '$expectedId module has non-empty capabilities array',
    ({ ref }) => {
      expect(ref.capabilities.length).toBeGreaterThan(0);
      ref.capabilities.forEach((cap) => {
        expect(typeof cap).toBe('string');
        expect(cap.length).toBeGreaterThan(0);
      });
    },
  );

  it.each(allModuleExports)(
    '$expectedId module has non-empty tables array',
    ({ ref }) => {
      expect(ref.tables.length).toBeGreaterThan(0);
    },
  );

  it.each(allModuleExports)(
    '$expectedId module has non-empty personas array',
    ({ ref }) => {
      expect(ref.personas.length).toBeGreaterThan(0);
    },
  );
});

// ============================================================================
// DEFAULT_MODULES REGISTRY TESTS
// ============================================================================

describe('Default Modules - DEFAULT_MODULES Registry', () => {
  it('contains exactly 9 modules', () => {
    const keys = Object.keys(DEFAULT_MODULES);
    expect(keys).toHaveLength(9);
  });

  it('contains all expected module IDs as keys', () => {
    const expectedKeys = [
      'finance', 'revenue', 'cs', 'am', 'services',
      'product', 'marketing', 'people', 'executive',
    ];
    expect(Object.keys(DEFAULT_MODULES).sort()).toEqual(expectedKeys.sort());
  });

  it('maps each key to the corresponding module constant', () => {
    expect(DEFAULT_MODULES['finance']).toBe(financeModule);
    expect(DEFAULT_MODULES['revenue']).toBe(revenueModule);
    expect(DEFAULT_MODULES['cs']).toBe(csModule);
    expect(DEFAULT_MODULES['am']).toBe(amModule);
    expect(DEFAULT_MODULES['services']).toBe(servicesModule);
    expect(DEFAULT_MODULES['product']).toBe(productModule);
    expect(DEFAULT_MODULES['marketing']).toBe(marketingModule);
    expect(DEFAULT_MODULES['people']).toBe(peopleModule);
    expect(DEFAULT_MODULES['executive']).toBe(executiveModule);
  });
});

// ============================================================================
// MODULE_IDS TESTS
// ============================================================================

describe('Default Modules - MODULE_IDS', () => {
  it('contains exactly 9 entries', () => {
    expect(MODULE_IDS).toHaveLength(9);
  });

  it('contains all expected IDs', () => {
    const expected = [
      'finance', 'revenue', 'cs', 'am', 'services',
      'product', 'marketing', 'people', 'executive',
    ];
    expect([...MODULE_IDS].sort()).toEqual(expected.sort());
  });

  it('matches the keys of DEFAULT_MODULES', () => {
    const registryKeys = Object.keys(DEFAULT_MODULES).sort();
    expect([...MODULE_IDS].sort()).toEqual(registryKeys);
  });
});

// ============================================================================
// getModule TESTS
// ============================================================================

describe('Default Modules - getModule', () => {
  it('returns the correct module for a valid ID', () => {
    const result = getModule('finance');
    expect(result).toBe(financeModule);
    expect(result?.id).toBe('finance');
    expect(result?.name).toBe('Finance');
  });

  it('returns each module by its ID', () => {
    for (const id of MODULE_IDS) {
      const mod = getModule(id);
      expect(mod).toBeDefined();
      expect(mod!.id).toBe(id);
    }
  });

  it('returns undefined for an invalid ID', () => {
    expect(getModule('nonexistent')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(getModule('')).toBeUndefined();
  });
});

// ============================================================================
// getAllModules TESTS
// ============================================================================

describe('Default Modules - getAllModules', () => {
  it('returns an array of 9 modules', () => {
    const modules = getAllModules();
    expect(modules).toHaveLength(9);
  });

  it('returns all module IDs without duplicates', () => {
    const modules = getAllModules();
    const ids = modules.map((m) => m.id);
    const uniqueIds = [...new Set(ids)];
    expect(uniqueIds).toHaveLength(9);
  });

  it('includes every expected module by ID', () => {
    const modules = getAllModules();
    const ids = modules.map((m) => m.id).sort();
    const expected = [
      'finance', 'revenue', 'cs', 'am', 'services',
      'product', 'marketing', 'people', 'executive',
    ].sort();
    expect(ids).toEqual(expected);
  });
});

// ============================================================================
// getModulesByCategory TESTS
// ============================================================================

describe('Default Modules - getModulesByCategory', () => {
  it('returns finance and revenue for category "core"', () => {
    const coreModules = getModulesByCategory('core');
    const ids = coreModules.map((m) => m.id).sort();
    expect(ids).toEqual(['finance', 'revenue']);
  });

  it('returns 6 operational modules for category "operational"', () => {
    const operationalModules = getModulesByCategory('operational');
    expect(operationalModules).toHaveLength(6);
    const ids = operationalModules.map((m) => m.id).sort();
    expect(ids).toEqual(['am', 'cs', 'marketing', 'people', 'product', 'services']);
  });

  it('returns executive for category "strategic"', () => {
    const strategicModules = getModulesByCategory('strategic');
    expect(strategicModules).toHaveLength(1);
    expect(strategicModules[0].id).toBe('executive');
  });

  it('all returned modules have the requested category', () => {
    for (const category of ['core', 'operational', 'strategic'] as const) {
      const modules = getModulesByCategory(category);
      modules.forEach((m) => {
        expect(m.category).toBe(category);
      });
    }
  });
});

// ============================================================================
// SHORTCUT FUNCTIONS TESTS
// ============================================================================

describe('Default Modules - getCoreModules', () => {
  it('returns the same result as getModulesByCategory("core")', () => {
    const fromShortcut = getCoreModules();
    const fromCategory = getModulesByCategory('core');
    expect(fromShortcut).toEqual(fromCategory);
  });

  it('returns exactly 2 modules (finance and revenue)', () => {
    const core = getCoreModules();
    expect(core).toHaveLength(2);
    const ids = core.map((m) => m.id).sort();
    expect(ids).toEqual(['finance', 'revenue']);
  });
});

describe('Default Modules - getOperationalModules', () => {
  it('returns the same result as getModulesByCategory("operational")', () => {
    const fromShortcut = getOperationalModules();
    const fromCategory = getModulesByCategory('operational');
    expect(fromShortcut).toEqual(fromCategory);
  });

  it('returns exactly 6 modules', () => {
    const operational = getOperationalModules();
    expect(operational).toHaveLength(6);
    const ids = operational.map((m) => m.id).sort();
    expect(ids).toEqual(['am', 'cs', 'marketing', 'people', 'product', 'services']);
  });
});

describe('Default Modules - getStrategicModules', () => {
  it('returns the same result as getModulesByCategory("strategic")', () => {
    const fromShortcut = getStrategicModules();
    const fromCategory = getModulesByCategory('strategic');
    expect(fromShortcut).toEqual(fromCategory);
  });

  it('returns exactly 1 module (executive)', () => {
    const strategic = getStrategicModules();
    expect(strategic).toHaveLength(1);
    expect(strategic[0].id).toBe('executive');
  });
});

// ============================================================================
// EXECUTIVE MODULE - dependsOn TESTS
// ============================================================================

describe('Default Modules - executiveModule special properties', () => {
  it('has a dependsOn array', () => {
    expect(executiveModule.dependsOn).toBeDefined();
    expect(Array.isArray(executiveModule.dependsOn)).toBe(true);
  });

  it('dependsOn contains expected module IDs', () => {
    const expected = ['finance', 'revenue', 'cs', 'am', 'services'];
    expect(executiveModule.dependsOn!.sort()).toEqual(expected.sort());
  });

  it('dependsOn references only valid module IDs', () => {
    const validIds = Object.keys(DEFAULT_MODULES);
    executiveModule.dependsOn!.forEach((depId) => {
      expect(validIds).toContain(depId);
    });
  });

  it('is the only module with dependsOn defined', () => {
    const allModules = getAllModules();
    const modulesWithDeps = allModules.filter((m) => m.dependsOn !== undefined);
    expect(modulesWithDeps).toHaveLength(1);
    expect(modulesWithDeps[0].id).toBe('executive');
  });
});

// ============================================================================
// CROSS-CUTTING CONSISTENCY TESTS
// ============================================================================

describe('Default Modules - Cross-cutting Consistency', () => {
  it('all module IDs are unique', () => {
    const allModules = getAllModules();
    const ids = allModules.map((m) => m.id);
    const uniqueIds = [...new Set(ids)];
    expect(uniqueIds).toHaveLength(ids.length);
  });

  it('all module names are unique', () => {
    const allModules = getAllModules();
    const names = allModules.map((m) => m.name);
    const uniqueNames = [...new Set(names)];
    expect(uniqueNames).toHaveLength(names.length);
  });

  it('category counts sum to 9 (2 core + 6 operational + 1 strategic)', () => {
    const core = getCoreModules().length;
    const operational = getOperationalModules().length;
    const strategic = getStrategicModules().length;
    expect(core + operational + strategic).toBe(9);
  });

  it('every module in DEFAULT_MODULES has a matching entry in MODULE_IDS', () => {
    Object.keys(DEFAULT_MODULES).forEach((key) => {
      expect(MODULE_IDS).toContain(key);
    });
  });

  it('every MODULE_IDS entry has a matching entry in DEFAULT_MODULES', () => {
    MODULE_IDS.forEach((id) => {
      expect(DEFAULT_MODULES[id]).toBeDefined();
    });
  });
});
