/**
 * Nexus Domain Agents
 *
 * Domain agent framework for AI-powered organizational intelligence.
 * Provides module registry, intent classification, persona management,
 * and access control for building intelligent copilots.
 *
 * @packageDocumentation
 */

// =============================================================================
// TYPES
// =============================================================================
export type {
  // Module types
  ModuleDefinition,
  ModuleRegistry,
  ModuleConfig,
  ModuleId,
  DomainCategory,

  // Persona types
  PersonaDefinition,
  PersonaRegistry,

  // Intent types
  IntentClassification,
  IntentClassifierConfig,

  // Access types
  ModuleAccessResult,
  ModuleSubscription,
  AccessControlConfig,

  // Routing types
  DomainRouterConfig,
  RoutingResult,
  RoutingBlocker,
  DisabledModuleResponse,
  CrossDomainQuery,
  ModuleRelationship,

  // Hook return types
  UseModuleAccessReturn,
  UseIntentRouterReturn,
  UseDomainContextReturn,

  // Adapter types
  SupabaseClientAdapter,
  AIClientAdapter,

  // Event types
  RoutingEvent
} from './types';

// =============================================================================
// REGISTRY
// =============================================================================
export {
  // Default modules
  DEFAULT_MODULES,
  MODULE_IDS,
  financeModule,
  revenueModule,
  csModule,
  amModule,
  servicesModule,
  productModule,
  marketingModule,
  peopleModule,
  executiveModule,

  // Module getters
  getModule,
  getAllModules,
  getModulesByCategory,
  getCoreModules,
  getOperationalModules,
  getStrategicModules,

  // Registry factory
  createModuleRegistry,
  extendRegistry,
  mergeRegistries,
  filterRegistry,
  validateModule,
  getAllKeywords,
  searchModules,
  getDependentModules,
  getDependencyTree,
  type CreateRegistryOptions
} from './registry';

// =============================================================================
// PERSONAS
// =============================================================================
export {
  // Default personas
  DEFAULT_PERSONAS,
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

  // Persona getters
  getPrimaryPersonaForDomain,
  getPersonasForDomain,
  getPersona,
  getAllPersonas,

  // Prompt building
  buildPersonaSystemPrompt,
  buildContextBlock,
  buildCompletePrompt,
  buildFollowUpPrompt,
  buildDisabledModulePrompt,
  getSampleQuestions,
  getSuggestedFollowUps,
  type PromptContext
} from './personas';

// =============================================================================
// INTENT CLASSIFICATION
// =============================================================================
export {
  // Intent classifier
  createIntentClassifier,
  createSimpleClassifier,
  type IntentClassifier,

  // Keyword matching
  buildKeywordIndex,
  tokenizeQuery,
  matchKeywords,
  quickModuleCheck,
  getMatchingKeywords,
  type KeywordIndex,
  type MatchingConfig
} from './intent';

// =============================================================================
// ACCESS CONTROL
// =============================================================================
export {
  // Module access checker
  createModuleAccessChecker,
  checkModuleAccessWithCapabilities,
  batchCheckAccess,
  type ModuleAccessChecker,

  // Graceful degradation
  buildDisabledModuleResponse,
  formatDisabledModuleMessage,
  getDisabledModuleOneLiner,
  suggestModulesToEnable,
  canPartiallyAnswer
} from './access';

// =============================================================================
// ROUTING
// =============================================================================
export {
  // Domain router
  createDomainRouter,
  createSimpleRouter,
  type DomainRouter,

  // Cross-domain
  isCrossDomainQuery,
  analyzeCrossDomainQuery,
  getRelatedModules,
  explainCrossDomainRelationships,
  suggestPrimaryModule,
  getCascadeEffects
} from './routing';

// =============================================================================
// REACT HOOKS
// =============================================================================
export {
  // Module access hook
  useModuleAccess,
  useIsModuleEnabled,
  type UseModuleAccessConfig,

  // Intent router hook
  useIntentRouter,
  useIntentClassifier,
  type UseIntentRouterConfig,

  // Domain context hook
  useDomainContext,
  useModulesByCategory,
  useModuleSuggestions,
  type UseDomainContextConfig
} from './hooks';
