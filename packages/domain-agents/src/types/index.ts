/**
 * Nexus Domain Agents - Type Definitions
 *
 * Core types for the domain agent framework including:
 * - Module definitions and registry
 * - Persona definitions
 * - Intent classification
 * - Access control
 * - Routing
 */

// =============================================================================
// MODULE DEFINITIONS
// =============================================================================

/**
 * Definition of a domain module (e.g., Finance, Revenue, CS)
 */
export interface ModuleDefinition {
  /** Unique identifier (e.g., 'finance', 'revenue', 'cs') */
  id: string;

  /** Display name (e.g., 'Finance', 'Revenue (Sales)') */
  name: string;

  /** Brief description of what this module does */
  description: string;

  /** Emoji icon for UI display */
  icon: string;

  /** Keywords that indicate user intent relates to this module */
  keywords: string[];

  /** What this module can do */
  capabilities: string[];

  /** Database tables this module primarily uses */
  tables: string[];

  /** Job roles that typically use this module */
  personas: string[];

  /** Other modules this depends on (optional) */
  dependsOn?: string[];

  /** Module category for grouping */
  category?: 'core' | 'operational' | 'strategic';
}

/**
 * Registry of all available modules
 */
export type ModuleRegistry = Record<string, ModuleDefinition>;

/**
 * Minimal module config for quick lookups
 */
export interface ModuleConfig {
  id: string;
  name: string;
  icon: string;
  enabled: boolean;
}

// =============================================================================
// PERSONA DEFINITIONS
// =============================================================================

/**
 * Definition of an AI persona (e.g., VP Sales, CFO)
 */
export interface PersonaDefinition {
  /** Unique identifier */
  id: string;

  /** Role title (e.g., 'VP Sales', 'CFO') */
  role: string;

  /** Associated domain module */
  domain: string;

  /** What this persona focuses on */
  description: string;

  /** Emoji icon */
  icon: string;

  /** UI color (hex or CSS color name) */
  color: string;

  /** Base prompt template for this persona (can be overridden at app level) */
  promptTemplate?: string;

  /** Key metrics this persona cares about */
  focusMetrics?: string[];

  /** Typical questions this persona asks */
  sampleQuestions?: string[];
}

/**
 * Registry of all personas
 */
export type PersonaRegistry = Record<string, PersonaDefinition>;

// =============================================================================
// INTENT CLASSIFICATION
// =============================================================================

/**
 * Result of classifying user intent
 */
export interface IntentClassification {
  /** All modules that could handle this intent */
  modules: string[];

  /** Most relevant module */
  primaryModule: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Which keywords matched */
  matchedKeywords: string[];

  /** Recommended persona for responding */
  suggestedPersona?: string;

  /** Whether this is a cross-domain query */
  isCrossDomain: boolean;

  /** Classification method used */
  method: 'keyword' | 'ai' | 'hybrid';
}

/**
 * Configuration for the intent classifier
 */
export interface IntentClassifierConfig {
  /** Module registry to classify against */
  modules: ModuleRegistry;

  /** AI client for fallback classification (optional) */
  aiClient?: AIClientAdapter;

  /** Minimum confidence to accept keyword match (default: 0.6) */
  keywordConfidenceThreshold?: number;

  /** Whether to use AI fallback when keywords have low confidence */
  useAIFallback?: boolean;
}

// =============================================================================
// ACCESS CONTROL
// =============================================================================

/**
 * Result of checking module access for an organization
 */
export interface ModuleAccessResult {
  /** Modules the organization has access to */
  enabled: string[];

  /** Modules not enabled for this organization */
  disabled: string[];

  /** True if some but not all required modules are enabled */
  partial: boolean;

  /** Specific capabilities that are missing */
  missingCapabilities: string[];

  /** Suggested admin contact for enabling modules */
  adminContact?: string;
}

/**
 * Module subscription record from database
 */
export interface ModuleSubscription {
  id: string;
  organizationId: string;
  moduleId: string;
  enabled: boolean;
  enabledAt?: Date;
  disabledAt?: Date;
  config?: Record<string, unknown>;
}

/**
 * Configuration for access control
 */
export interface AccessControlConfig {
  /** Organization ID to check access for */
  organizationId: string;

  /** Supabase client for database queries */
  supabaseClient: SupabaseClientAdapter;

  /** Cache TTL in milliseconds (default: 60000 = 1 minute) */
  cacheTtl?: number;
}

// =============================================================================
// ROUTING
// =============================================================================

/**
 * Result of routing a user query
 */
export interface RoutingResult {
  /** Intent classification */
  intent: IntentClassification;

  /** Module access check result */
  access: ModuleAccessResult;

  /** Selected persona for response */
  persona?: PersonaDefinition;

  /** Whether the query can be fully handled */
  canHandle: boolean;

  /** If can't fully handle, what's missing */
  blockers?: RoutingBlocker[];

  /** Suggested response if modules are disabled */
  disabledModuleResponse?: DisabledModuleResponse;
}

/**
 * A blocker preventing full query handling
 */
export interface RoutingBlocker {
  type: 'module_disabled' | 'capability_missing' | 'permission_denied';
  moduleId?: string;
  capability?: string;
  message: string;
}

/**
 * Response structure when required modules are disabled
 */
export interface DisabledModuleResponse {
  /** The module(s) that would handle this query */
  modules: ModuleDefinition[];

  /** Human-readable explanation */
  explanation: string;

  /** What capabilities the user would get */
  capabilities: string[];

  /** Call-to-action text */
  ctaText: string;

  /** Admin contact for enabling */
  adminContact?: string;

  /** Whether partial data from other modules is available */
  hasPartialData: boolean;

  /** What can be answered with available modules */
  partialCapabilities?: string[];
}

/**
 * Configuration for the domain router
 */
export interface DomainRouterConfig {
  /** Module registry */
  modules: ModuleRegistry;

  /** Persona registry */
  personas?: PersonaRegistry;

  /** Organization ID */
  organizationId: string;

  /** Supabase client */
  supabaseClient: SupabaseClientAdapter;

  /** AI client for fallback classification */
  aiClient?: AIClientAdapter;

  /** Admin contact email for disabled module responses */
  adminContact?: string;
}

// =============================================================================
// CROSS-DOMAIN COORDINATION
// =============================================================================

/**
 * A cross-domain query that spans multiple modules
 */
export interface CrossDomainQuery {
  /** Original query */
  query: string;

  /** All relevant modules */
  modules: string[];

  /** How modules relate to each other for this query */
  relationships: ModuleRelationship[];

  /** Suggested order to process modules */
  processingOrder: string[];
}

/**
 * Relationship between modules for a cross-domain query
 */
export interface ModuleRelationship {
  source: string;
  target: string;
  type: 'depends_on' | 'enriches' | 'validates' | 'aggregates';
  description: string;
}

// =============================================================================
// ADAPTERS (for dependency injection)
// =============================================================================

/**
 * Adapter interface for Supabase client
 * Allows different Supabase versions/implementations
 */
export interface SupabaseClientAdapter {
  from(table: string): {
    select(columns?: string): {
      eq(column: string, value: unknown): Promise<{ data: unknown[] | null; error: unknown }>;
      in(column: string, values: unknown[]): Promise<{ data: unknown[] | null; error: unknown }>;
    };
  };
}

/**
 * Adapter interface for AI client (Claude)
 * Allows different AI providers
 */
export interface AIClientAdapter {
  complete(prompt: string, options?: {
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ content: string }>;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Module ID type for type safety
 */
export type ModuleId =
  | 'finance'
  | 'revenue'
  | 'cs'
  | 'am'
  | 'services'
  | 'product'
  | 'marketing'
  | 'people'
  | 'executive'
  | string; // Allow custom modules

/**
 * Domain category
 */
export type DomainCategory =
  | 'core'        // Finance, Revenue
  | 'operational' // CS, AM, Services
  | 'strategic';  // Executive, Product

/**
 * Event emitted when routing completes
 */
export interface RoutingEvent {
  type: 'route_complete' | 'route_blocked' | 'intent_classified';
  timestamp: Date;
  query: string;
  result: RoutingResult | IntentClassification;
  durationMs: number;
}

/**
 * Hook return type for useModuleAccess
 */
export interface UseModuleAccessReturn {
  enabledModules: string[];
  disabledModules: string[];
  isLoading: boolean;
  error: Error | null;
  checkModule: (moduleId: string) => boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook return type for useIntentRouter
 */
export interface UseIntentRouterReturn {
  route: (query: string) => Promise<RoutingResult>;
  lastResult: RoutingResult | null;
  isRouting: boolean;
  error: Error | null;
}

/**
 * Hook return type for useDomainContext
 */
export interface UseDomainContextReturn {
  currentModule: string | null;
  currentPersona: PersonaDefinition | null;
  setModule: (moduleId: string) => void;
  availableModules: ModuleDefinition[];
  getPersonaForModule: (moduleId: string) => PersonaDefinition | undefined;
}
