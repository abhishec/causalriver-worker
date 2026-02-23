/**
 * Nexus Memory Stack - Core Types
 *
 * Type definitions for NexusBrain's 11-region brain-inspired memory architecture.
 */

// ============================================================================
// EMBEDDING TYPES
// ============================================================================

/**
 * Entity formatter function - converts any entity to embeddable text
 */
export type EntityFormatter<T = any> = (entity: T) => string;

/**
 * Configuration for the embedding engine
 */
export interface EmbeddingConfig {
  /** Map of entity type to formatter function */
  entityFormatters: Record<string, EntityFormatter>;
  /** Embedding dimensions (default: 384) */
  dimensions?: number;
  /** Whether to use AI-enhanced semantic extraction for richer embeddings */
  useAIEnhancement?: boolean;
  /** API key for the AI provider (required if useAIEnhancement is true) */
  aiApiKey?: string;
  /** AI model for semantic extraction (defaults to MODEL_FAST from smart-model-router) */
  aiModel?: string;
  /**
   * Neural embedding provider to use for real semantic embeddings.
   * When set with a valid apiKey, the engine uses transformer-based models
   * instead of n-gram hashing. Falls back to n-gram on API failure.
   *
   * Options: 'openai-text-embedding-3-small' | 'openai-text-embedding-ada-002' | 'mxbai-embed-large-v1'
   */
  embeddingModel?: string;
  /** API key for embedding model provider (OpenAI or Mixedbread) */
  embeddingApiKey?: string;
  /** Custom API endpoint (for self-hosted models) */
  embeddingApiEndpoint?: string;
}

/**
 * Result of embedding synchronization
 */
export interface SyncResult {
  synced: number;
  skipped: number;
  errors: number;
}

/**
 * Embedding metadata stored alongside vectors
 */
export interface EmbeddingMetadata {
  name?: string;
  synced_at: string;
  confidence?: number;
  access_count?: number;
  memory_type?: string;
  severity?: string;
  [key: string]: any;
}

// ============================================================================
// MEMORY TYPES
// ============================================================================

/**
 * Memory types supported by the system
 */
export type MemoryType =
  | 'pattern'
  | 'insight'
  | 'prediction'
  | 'rule'
  | 'discovery'
  | 'outcome_pattern'
  | 'preference';

/**
 * Severity levels for memory items
 */
export type Severity = 'info' | 'warning' | 'critical';

/**
 * AI Memory item stored in the system
 */
export interface AIMemoryItem {
  id: string;
  organization_id: string;
  memory_type: MemoryType;
  entity_type?: string;
  entity_id?: string;
  title: string;
  content: Record<string, any>;
  confidence: number;
  severity?: Severity;
  domain?: string;
  access_count: number;
  last_accessed?: string;
  wiring_status?: string;
  expires_at?: string;
  is_active: boolean;
  created_at: string;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  totalPatterns: number;
  totalInsights: number;
  totalPredictions: number;
  avgConfidence: number;
  recentLearnings: number;
}

// ============================================================================
// CAUSALITY TYPES
// ============================================================================

/**
 * Relationship types between domains
 */
export type RelationshipType =
  | 'blocks'
  | 'enables'
  | 'correlates'
  | 'triggers'
  | 'depends_on';

/**
 * Domain relationship discovered by the system
 */
export interface DomainRelationship {
  id: string;
  organization_id: string;
  source_domain: string;
  target_domain: string;
  relationship_type: RelationshipType;
  strength: number;
  evidence: string[];
  observation_count: number;
  discovered_pattern?: string;
  last_observed_at?: string;
  is_active: boolean;
  created_at: string;
}

/**
 * Cross-domain signal for pattern detection
 */
export interface CrossDomainSignal {
  id: string;
  organization_id: string;
  signal_type: string;
  source_domain: string;
  entity_type?: string;
  entity_id?: string;
  client_id?: string;
  feature_vector: Record<string, number>;
  signal_value?: number;
  signal_metadata?: Record<string, any>;
  cascade_occurred?: boolean;
  cascade_impact?: number;
  cascade_domains?: string[];
  is_processed: boolean;
  created_at: string;
}

/**
 * Causal chain outcome for model training
 */
export interface CausalChainOutcome {
  id: string;
  organization_id?: string;
  causal_chain_id?: string;
  predicted_impact?: number;
  predicted_probability?: number;
  predicted_domains?: string[];
  predicted_timeline_days?: number;
  actual_impact?: number;
  actual_domains?: string[];
  actual_timeline_days?: number;
  resolution_type?: 'prevented' | 'partial_cascade' | 'full_cascade' | 'false_positive';
  model_version?: string;
  accuracy_score?: number;
  intervention_taken: boolean;
  intervention_effectiveness?: number;
  created_at: string;
}

// ============================================================================
// BRAIN RULES TYPES
// ============================================================================

/**
 * Comparison operators for rule conditions
 */
export type ComparisonOperator =
  | 'equals' | 'not_equals'
  | 'greater_than' | 'less_than'
  | 'greater_than_or_equals' | 'less_than_or_equals'
  | 'in' | 'not_in'
  | 'contains' | 'not_contains'
  | 'is_null' | 'is_not_null'
  | 'starts_with' | 'ends_with';

/**
 * Logical operators for condition groups
 */
export type LogicalOperator = 'AND' | 'OR' | 'NOT';

/**
 * Single rule condition
 */
export interface RuleCondition {
  field: string;
  operator: ComparisonOperator;
  value: string | number | boolean | string[] | number[] | null;
}

/**
 * Group of conditions with logical operator
 */
export interface ConditionGroup {
  logic: LogicalOperator;
  conditions: (RuleCondition | ConditionGroup)[];
}

/**
 * Action types that rules can trigger
 */
export type ActionType =
  | 'set_eligibility' | 'set_flag' | 'require_approval'
  | 'trigger_alert' | 'escalate' | 'set_priority'
  | 'exclude_from' | 'include_in' | 'set_threshold' | 'set_status';

/**
 * Action to execute when rule matches
 */
export interface RuleAction {
  type: ActionType;
  params: Record<string, unknown>;
}

/**
 * Complete brain grammar rule
 */
export interface BrainGrammarRule {
  id: string;
  version: number;
  title: string;
  description: string;
  entity_type: string;
  when: ConditionGroup;
  then: RuleAction[];
  otherwise?: RuleAction[];
  priority: number;
  is_active: boolean;
  created_by: 'human' | 'ai';
  natural_language: string;
  reasoning: string;
}

/**
 * Context for rule evaluation
 */
export interface EvaluationContext {
  client?: Record<string, unknown>;
  health?: Record<string, unknown>;
  deal?: Record<string, unknown>;
  invoice?: Record<string, unknown>;
  user?: Record<string, unknown>;
  cadence?: Record<string, unknown>;
  service?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Result of evaluating a single rule
 */
export interface EvaluationResult {
  matched: boolean;
  rule_id: string;
  rule_title: string;
  actions_applied: RuleAction[];
  eligibility: Record<string, boolean>;
  flags: Record<string, boolean>;
  approvals_required: Array<{ level: string; reason: string }>;
  exclusions: string[];
  inclusions: string[];
  alerts: Array<{ severity: string; message: string }>;
  thresholds: Record<string, number>;
}

/**
 * Aggregated result of evaluating multiple rules
 */
export interface AggregatedEvaluationResult {
  matched_rules: EvaluationResult[];
  eligibility: Record<string, boolean>;
  flags: Record<string, boolean>;
  approvals_required: Array<{ level: string; reason: string }>;
  exclusions: string[];
  inclusions: string[];
  alerts: Array<{ severity: string; message: string }>;
  thresholds: Record<string, number>;
  rules_evaluated: number;
  evaluated_at: string;
}

// ============================================================================
// RESOLUTION TYPES
// ============================================================================

/**
 * Resolution source tier
 */
export type ResolutionSource = 'organization' | 'template' | 'platform' | 'default';

/**
 * Result of a resolution operation
 */
export interface ResolutionResult<T> {
  value: T;
  source: ResolutionSource;
  templateName?: string;
}

/**
 * Owner candidate for disambiguation
 */
export interface OwnerCandidate {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  score: number;
  matchedOn: 'exact' | 'alias' | 'first_name' | 'last_name' | 'partial' | 'nickname';
}

/**
 * Department candidate for disambiguation
 */
export interface DepartmentCandidate {
  id: string;
  name: string;
  score: number;
  matchedOn: 'exact' | 'partial' | 'domain_key';
}

// ============================================================================
// SEARCH TYPES
// ============================================================================

/**
 * Search result from semantic search
 */
export interface SearchResult {
  entity_type: string;
  entity_id: string;
  content_text: string;
  similarity: number;
  metadata?: EmbeddingMetadata;
}

/**
 * RAG context result
 */
export interface RAGContext {
  query: string;
  results: SearchResult[];
  context_string: string;
  count: number;
}

/**
 * Memory-weighted RAG context
 */
export interface MemoryWeightedRAGContext {
  query: string;
  memory_results: SearchResult[];
  entity_results: SearchResult[];
  context_string: string;
  memory_count: number;
  entity_count: number;
}
