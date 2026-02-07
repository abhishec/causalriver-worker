/**
 * Domain Router
 *
 * Main orchestration layer that combines intent classification,
 * access control, and persona selection.
 */

import type {
  DomainRouterConfig,
  IntentClassification,
  ModuleAccessResult,
  PersonaDefinition,
  RoutingResult,
  RoutingBlocker,
  DisabledModuleResponse,
  ModuleDefinition
} from '../types';
import { createIntentClassifier, type IntentClassifier } from '../intent/classifier';
import { createModuleAccessChecker, type ModuleAccessChecker } from '../access/module-access';
import { buildDisabledModuleResponse } from '../access/graceful-degrade';
import { getPrimaryPersonaForDomain } from '../personas/default-personas';

/**
 * Domain router instance
 */
export interface DomainRouter {
  /** Classify user intent */
  classifyIntent(query: string): Promise<IntentClassification>;

  /** Check module access for required modules */
  checkAccess(moduleIds: string[]): Promise<ModuleAccessResult>;

  /** Get persona for a module */
  getPersona(moduleId: string): PersonaDefinition | undefined;

  /** Build disabled module response */
  buildDisabledResponse(access: ModuleAccessResult): DisabledModuleResponse;

  /** Full routing flow: classify → check access → select persona */
  route(query: string): Promise<RoutingResult>;

  /** Get module definition */
  getModule(moduleId: string): ModuleDefinition | undefined;

  /** Get all available modules */
  getAllModules(): ModuleDefinition[];
}

/**
 * Create a domain router
 */
export function createDomainRouter(config: DomainRouterConfig): DomainRouter {
  const {
    modules,
    personas,
    organizationId,
    supabaseClient,
    aiClient,
    adminContact
  } = config;

  // Create sub-components
  const classifier: IntentClassifier = createIntentClassifier({
    modules,
    aiClient,
    keywordConfidenceThreshold: 0.6,
    useAIFallback: !!aiClient
  });

  const accessChecker: ModuleAccessChecker = createModuleAccessChecker({
    organizationId,
    supabaseClient,
    cacheTtl: 60000
  });

  /**
   * Classify user intent
   */
  async function classifyIntent(query: string): Promise<IntentClassification> {
    return classifier.classify(query);
  }

  /**
   * Check module access
   */
  async function checkAccess(moduleIds: string[]): Promise<ModuleAccessResult> {
    const result = await accessChecker.checkAccess(moduleIds);

    // Add admin contact if configured
    if (adminContact) {
      result.adminContact = adminContact;
    }

    return result;
  }

  /**
   * Get persona for a module
   */
  function getPersona(moduleId: string): PersonaDefinition | undefined {
    // First check custom personas
    if (personas) {
      const customPersona = Object.values(personas).find(p => p.domain === moduleId);
      if (customPersona) return customPersona;
    }

    // Fall back to default personas
    return getPrimaryPersonaForDomain(moduleId);
  }

  /**
   * Build disabled module response
   */
  function buildDisabledResponse(access: ModuleAccessResult): DisabledModuleResponse {
    return buildDisabledModuleResponse(access, modules, { adminContact });
  }

  /**
   * Get module definition
   */
  function getModule(moduleId: string): ModuleDefinition | undefined {
    return modules[moduleId];
  }

  /**
   * Get all modules
   */
  function getAllModules(): ModuleDefinition[] {
    return Object.values(modules);
  }

  /**
   * Full routing flow
   */
  async function route(query: string): Promise<RoutingResult> {
    // Step 1: Classify intent
    const intent = await classifyIntent(query);

    // Step 2: Check access
    const access = await checkAccess(intent.modules);

    // Step 3: Determine blockers
    const blockers: RoutingBlocker[] = [];

    for (const moduleId of access.disabled) {
      const module = modules[moduleId];
      blockers.push({
        type: 'module_disabled',
        moduleId,
        message: module
          ? `The ${module.name} module is not enabled for your organization.`
          : `Module ${moduleId} is not enabled.`
      });
    }

    // Step 4: Can we handle this?
    const canHandle = access.disabled.length === 0;

    // Step 5: Select persona
    let persona: PersonaDefinition | undefined;
    if (canHandle || access.partial) {
      // Use persona for primary module if enabled, otherwise use executive
      if (access.enabled.includes(intent.primaryModule)) {
        persona = getPersona(intent.primaryModule);
      } else if (access.enabled.length > 0) {
        persona = getPersona(access.enabled[0]);
      } else {
        persona = getPersona('executive');
      }
    }

    // Step 6: Build disabled response if needed
    let disabledModuleResponse: DisabledModuleResponse | undefined;
    if (!canHandle) {
      disabledModuleResponse = buildDisabledResponse(access);
    }

    return {
      intent,
      access,
      persona,
      canHandle,
      blockers: blockers.length > 0 ? blockers : undefined,
      disabledModuleResponse
    };
  }

  return {
    classifyIntent,
    checkAccess,
    getPersona,
    buildDisabledResponse,
    route,
    getModule,
    getAllModules
  };
}

/**
 * Create a simple router that only classifies (no access check)
 * Useful for testing or when access control is not needed
 */
export function createSimpleRouter(config: {
  modules: DomainRouterConfig['modules'];
  personas?: DomainRouterConfig['personas'];
}): {
  classifyIntent: (query: string) => IntentClassification;
  getPersona: (moduleId: string) => PersonaDefinition | undefined;
  getModule: (moduleId: string) => ModuleDefinition | undefined;
} {
  const { modules, personas } = config;

  const classifier = createIntentClassifier({
    modules,
    useAIFallback: false
  });

  return {
    classifyIntent: (query: string) => classifier.classifyByKeywords(query),
    getPersona: (moduleId: string) => {
      if (personas) {
        const custom = Object.values(personas).find(p => p.domain === moduleId);
        if (custom) return custom;
      }
      return getPrimaryPersonaForDomain(moduleId);
    },
    getModule: (moduleId: string) => modules[moduleId]
  };
}
