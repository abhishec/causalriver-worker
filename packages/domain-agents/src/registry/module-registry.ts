/**
 * Module Registry
 *
 * Factory functions for creating and managing module registries.
 * Supports extending the default modules with custom modules.
 */

import type { ModuleDefinition, ModuleRegistry } from '../types';
import { DEFAULT_MODULES } from './default-modules';

/**
 * Options for creating a module registry
 */
export interface CreateRegistryOptions {
  /** Start with default modules (default: true) */
  includeDefaults?: boolean;

  /** Additional modules to include */
  modules?: ModuleDefinition[];

  /** Modules to exclude from defaults */
  excludeModules?: string[];

  /** Override default module properties */
  overrides?: Partial<Record<string, Partial<ModuleDefinition>>>;
}

/**
 * Create a new module registry
 *
 * @example
 * // Use defaults only
 * const registry = createModuleRegistry();
 *
 * @example
 * // Add custom module
 * const registry = createModuleRegistry({
 *   modules: [{
 *     id: 'legal',
 *     name: 'Legal',
 *     keywords: ['contract', 'compliance'],
 *     // ...
 *   }]
 * });
 *
 * @example
 * // Exclude some defaults
 * const registry = createModuleRegistry({
 *   excludeModules: ['marketing', 'people']
 * });
 */
export function createModuleRegistry(options: CreateRegistryOptions = {}): ModuleRegistry {
  const {
    includeDefaults = true,
    modules = [],
    excludeModules = [],
    overrides = {}
  } = options;

  const registry: ModuleRegistry = {};

  // Add default modules (optionally filtered)
  if (includeDefaults) {
    for (const [id, module] of Object.entries(DEFAULT_MODULES)) {
      if (!excludeModules.includes(id)) {
        // Apply overrides if any
        const override = overrides[id];
        registry[id] = override ? { ...module, ...override } : module;
      }
    }
  }

  // Add custom modules
  for (const module of modules) {
    if (!module.id) {
      throw new Error('Module must have an id');
    }
    registry[module.id] = module;
  }

  return registry;
}

/**
 * Extend an existing registry with additional modules
 */
export function extendRegistry(
  base: ModuleRegistry,
  extensions: ModuleDefinition[]
): ModuleRegistry {
  const extended = { ...base };
  for (const module of extensions) {
    extended[module.id] = module;
  }
  return extended;
}

/**
 * Merge multiple registries (later registries override earlier ones)
 */
export function mergeRegistries(...registries: ModuleRegistry[]): ModuleRegistry {
  return Object.assign({}, ...registries);
}

/**
 * Filter a registry to only include specified modules
 */
export function filterRegistry(registry: ModuleRegistry, moduleIds: string[]): ModuleRegistry {
  const filtered: ModuleRegistry = {};
  for (const id of moduleIds) {
    if (registry[id]) {
      filtered[id] = registry[id];
    }
  }
  return filtered;
}

/**
 * Validate a module definition
 */
export function validateModule(module: Partial<ModuleDefinition>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!module.id) errors.push('Module must have an id');
  if (!module.name) errors.push('Module must have a name');
  if (!module.description) errors.push('Module must have a description');
  if (!module.keywords || module.keywords.length === 0) {
    errors.push('Module must have at least one keyword');
  }
  if (!module.capabilities || module.capabilities.length === 0) {
    errors.push('Module must have at least one capability');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get all keywords from a registry (for intent classification)
 */
export function getAllKeywords(registry: ModuleRegistry): Map<string, string[]> {
  const keywordMap = new Map<string, string[]>();

  for (const [moduleId, module] of Object.entries(registry)) {
    for (const keyword of module.keywords) {
      const normalized = keyword.toLowerCase();
      const existing = keywordMap.get(normalized) || [];
      if (!existing.includes(moduleId)) {
        existing.push(moduleId);
      }
      keywordMap.set(normalized, existing);
    }
  }

  return keywordMap;
}

/**
 * Find modules that match a search term
 */
export function searchModules(registry: ModuleRegistry, searchTerm: string): ModuleDefinition[] {
  const term = searchTerm.toLowerCase();

  return Object.values(registry).filter(module =>
    module.name.toLowerCase().includes(term) ||
    module.description.toLowerCase().includes(term) ||
    module.keywords.some(k => k.toLowerCase().includes(term)) ||
    module.capabilities.some(c => c.toLowerCase().includes(term))
  );
}

/**
 * Get modules that depend on a specific module
 */
export function getDependentModules(registry: ModuleRegistry, moduleId: string): ModuleDefinition[] {
  return Object.values(registry).filter(
    module => module.dependsOn?.includes(moduleId)
  );
}

/**
 * Get the dependency tree for a module
 */
export function getDependencyTree(registry: ModuleRegistry, moduleId: string): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function traverse(id: string) {
    if (visited.has(id)) return;
    visited.add(id);

    const module = registry[id];
    if (module?.dependsOn) {
      for (const dep of module.dependsOn) {
        traverse(dep);
      }
    }
    result.push(id);
  }

  traverse(moduleId);
  return result;
}
