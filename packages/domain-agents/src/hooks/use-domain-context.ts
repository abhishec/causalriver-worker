/**
 * useDomainContext Hook
 *
 * React hook for managing domain context in the UI.
 */

import { useState, useCallback, useMemo } from 'react';
import type {
  UseDomainContextReturn,
  ModuleDefinition,
  PersonaDefinition,
  ModuleRegistry,
  PersonaRegistry
} from '../types';
import { DEFAULT_MODULES } from '../registry/default-modules';
import { DEFAULT_PERSONAS, getPrimaryPersonaForDomain } from '../personas/default-personas';

/**
 * Hook configuration
 */
export interface UseDomainContextConfig {
  /** Module registry (defaults to DEFAULT_MODULES) */
  modules?: ModuleRegistry;

  /** Persona registry (defaults to DEFAULT_PERSONAS) */
  personas?: PersonaRegistry;

  /** Initially selected module */
  initialModule?: string;

  /** Enabled modules (filters available modules) */
  enabledModules?: string[];
}

/**
 * React hook for domain context management
 */
export function useDomainContext(config: UseDomainContextConfig = {}): UseDomainContextReturn {
  const {
    modules = DEFAULT_MODULES,
    personas = DEFAULT_PERSONAS,
    initialModule = null,
    enabledModules
  } = config;

  const [currentModule, setCurrentModule] = useState<string | null>(initialModule);

  /**
   * Get available modules (filtered by enabled if provided)
   */
  const availableModules = useMemo<ModuleDefinition[]>(() => {
    const allModules = Object.values(modules);
    if (!enabledModules) return allModules;
    return allModules.filter(m => enabledModules.includes(m.id));
  }, [modules, enabledModules]);

  /**
   * Get current persona
   */
  const currentPersona = useMemo<PersonaDefinition | null>(() => {
    if (!currentModule) return null;
    return getPersonaForModuleInternal(currentModule, personas) || null;
  }, [currentModule, personas]);

  /**
   * Set the current module
   */
  const setModule = useCallback((moduleId: string) => {
    if (modules[moduleId]) {
      setCurrentModule(moduleId);
    } else {
      console.warn(`[useDomainContext] Unknown module: ${moduleId}`);
    }
  }, [modules]);

  /**
   * Get persona for a specific module
   */
  const getPersonaForModule = useCallback(
    (moduleId: string): PersonaDefinition | undefined => {
      return getPersonaForModuleInternal(moduleId, personas);
    },
    [personas]
  );

  return {
    currentModule,
    currentPersona,
    setModule,
    availableModules,
    getPersonaForModule
  };
}

/**
 * Internal helper to get persona for module
 */
function getPersonaForModuleInternal(
  moduleId: string,
  personas: PersonaRegistry
): PersonaDefinition | undefined {
  // First check custom personas
  const customPersona = Object.values(personas).find(p => p.domain === moduleId);
  if (customPersona) return customPersona;

  // Fall back to default
  return getPrimaryPersonaForDomain(moduleId);
}

/**
 * Hook for getting all modules by category
 */
export function useModulesByCategory(modules: ModuleRegistry = DEFAULT_MODULES) {
  return useMemo(() => {
    const core: ModuleDefinition[] = [];
    const operational: ModuleDefinition[] = [];
    const strategic: ModuleDefinition[] = [];

    for (const module of Object.values(modules)) {
      switch (module.category) {
        case 'core':
          core.push(module);
          break;
        case 'strategic':
          strategic.push(module);
          break;
        default:
          operational.push(module);
      }
    }

    return { core, operational, strategic };
  }, [modules]);
}

/**
 * Hook for getting module suggestions based on query
 */
export function useModuleSuggestions(
  query: string,
  modules: ModuleRegistry = DEFAULT_MODULES,
  maxSuggestions: number = 3
) {
  return useMemo(() => {
    if (!query || query.length < 2) return [];

    const normalizedQuery = query.toLowerCase();
    const scores = new Map<string, number>();

    for (const [moduleId, module] of Object.entries(modules)) {
      let score = 0;

      // Check name
      if (module.name.toLowerCase().includes(normalizedQuery)) {
        score += 10;
      }

      // Check keywords
      for (const keyword of module.keywords) {
        if (keyword.toLowerCase().includes(normalizedQuery)) {
          score += 5;
        }
        if (normalizedQuery.includes(keyword.toLowerCase())) {
          score += 3;
        }
      }

      // Check capabilities
      for (const cap of module.capabilities) {
        if (cap.toLowerCase().includes(normalizedQuery)) {
          score += 2;
        }
      }

      if (score > 0) {
        scores.set(moduleId, score);
      }
    }

    // Sort by score and return top suggestions
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxSuggestions)
      .map(([moduleId]) => modules[moduleId]);
  }, [query, modules, maxSuggestions]);
}
