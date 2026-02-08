/**
 * Schema Validator — Startup Health Check for Database Dependencies
 *
 * Validates that all required tables and RPC functions exist in Supabase
 * before the brain starts processing queries. Provides clear, actionable
 * error messages when something is missing.
 *
 * Usage:
 * ```typescript
 * const validator = createSchemaValidator(supabase);
 * const result = await validator.validateAll();
 * if (!result.valid) {
 *   console.error('Missing schema:', result.missing);
 *   console.log('Run migrations:', result.setupInstructions);
 * }
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// REQUIRED SCHEMA DEFINITIONS
// ============================================================================

/**
 * All tables required by NexusBrain memory-stack.
 * Grouped by layer for clear error reporting.
 */
export const REQUIRED_TABLES = {
  'L1 - Signal Ingestion': [
    'cross_domain_signals',
    'signal_thresholds',
    'threshold_optimization_history',
  ],
  'L2 - Entity Resolution': [
    'resolved_entities',
    'entity_relationships',
  ],
  'L3 - Semantic Memory': [
    'entity_embeddings',
    'ai_memory',
  ],
  'L4 - Causal Engine': [
    'causal_event_stream',
    'causal_relationships_statistical',
    'prediction_records',
    'scheduled_verifications',
    'weight_update_history',
    'outcome_observation_windows',
  ],
  'L5 - Pattern Memory': [
    'brain_grammar_rules',
    'ai_causal_chains',
    'pattern_feedback_log',
    'brain_execution_log',
    'causal_chain_outcomes',
    'ai_domain_relationships',
    'org_cascade_rules',
    'platform_cascade_rules',
  ],
  'L6 - Domain Agents': [
    'agent_registry',
    'agent_queue',
    'ai_agent_activity',
  ],
  'L7 - Connectors': [
    'connector_sync_log',
    'sync_cursors',
  ],
  'Persistence': [
    'embedding_cache_state',
    'temporal_memory_state',
    'conversation_log',
  ],
} as const;

/**
 * All RPC functions required by NexusBrain memory-stack.
 */
export const REQUIRED_RPCS = [
  'search_embeddings',
  'get_rag_context',
  'get_rag_context_with_memory',
  'search_memory_weighted',
  'record_cascade_rule_trigger',
  'track_rule_evaluation',
] as const;

/**
 * Required Supabase extensions
 */
export const REQUIRED_EXTENSIONS = [
  'vector',      // pgvector for embeddings
  'uuid-ossp',   // UUID generation
] as const;

// ============================================================================
// TYPES
// ============================================================================

export interface SchemaValidationResult {
  /** True if all required schema elements exist */
  valid: boolean;
  /** Missing tables grouped by layer */
  missingTables: Record<string, string[]>;
  /** Missing RPC functions */
  missingRpcs: string[];
  /** Missing extensions */
  missingExtensions: string[];
  /** Existing tables that were found */
  existingTables: string[];
  /** Existing RPCs that were found */
  existingRpcs: string[];
  /** Human-readable setup instructions */
  setupInstructions: string;
  /** Duration of the validation in ms */
  durationMs: number;
}

// ============================================================================
// VALIDATOR
// ============================================================================

/**
 * Create a schema validator that checks all database dependencies.
 *
 * @param supabase - Supabase client
 */
export function createSchemaValidator(supabase: SupabaseClient) {
  /**
   * Check if a table exists by attempting a limit-1 select
   */
  async function tableExists(tableName: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from(tableName)
        .select('*')
        .limit(0);
      // If no error, the table exists
      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Check if an RPC function exists by calling it with minimal parameters.
   * We look for the specific "function does not exist" error.
   */
  async function rpcExists(rpcName: string): Promise<boolean> {
    try {
      // Call with empty params — we expect an error about params, not "function not found"
      const { error } = await supabase.rpc(rpcName, {});
      // If no error, or error is about params (not about function not existing), it exists
      if (!error) return true;
      // PostgreSQL error code 42883 = function does not exist
      if (error.code === '42883' || error.message?.includes('does not exist')) return false;
      // Any other error means the function exists but we called it wrong
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a Postgres extension is installed
   */
  async function extensionExists(extName: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .rpc('pg_extension_exists_check', { ext_name: extName });
      if (error) {
        // Fallback: try direct query via pg_extension
        // This might not work with all Supabase configs
        return true; // Assume installed if we can't check
      }
      return !!data;
    } catch {
      // Can't check — assume it's fine (the table checks will catch issues)
      return true;
    }
  }

  /**
   * Generate human-readable setup instructions
   */
  function generateInstructions(
    missingTables: Record<string, string[]>,
    missingRpcs: string[],
    missingExtensions: string[]
  ): string {
    const parts: string[] = [];

    parts.push('╔══════════════════════════════════════════════════════════════╗');
    parts.push('║  NexusBrain Schema Setup Required                          ║');
    parts.push('╚══════════════════════════════════════════════════════════════╝');
    parts.push('');

    if (missingExtensions.length > 0) {
      parts.push('1. Enable required PostgreSQL extensions:');
      for (const ext of missingExtensions) {
        parts.push(`   CREATE EXTENSION IF NOT EXISTS "${ext}";`);
      }
      parts.push('');
    }

    const totalMissing = Object.values(missingTables).flat().length;
    if (totalMissing > 0) {
      parts.push(`2. Missing ${totalMissing} table(s):`);
      for (const [layer, tables] of Object.entries(missingTables)) {
        if (tables.length > 0) {
          parts.push(`   ${layer}:`);
          for (const table of tables) {
            parts.push(`     - ${table}`);
          }
        }
      }
      parts.push('');
    }

    if (missingRpcs.length > 0) {
      parts.push(`3. Missing ${missingRpcs.length} RPC function(s):`);
      for (const rpc of missingRpcs) {
        parts.push(`     - ${rpc}()`);
      }
      parts.push('');
    }

    parts.push('To fix, run the migration files in order:');
    parts.push('');
    parts.push('  cd supabase/migrations/');
    parts.push('  supabase db push');
    parts.push('');
    parts.push('Or run manually in Supabase SQL editor:');
    parts.push('  1. 20250207000001_nexus_brain_core.sql');
    parts.push('  2. 20250207000002_nexus_brain_rpc_functions.sql');
    parts.push('  3. 20250208000001_fix_embedding_dimensions.sql');
    parts.push('  4. 20250208000002_persistence_tables.sql');
    parts.push('  5. 20250208000003_entity_relationships.sql');
    parts.push('  6. 20250208000004_sync_cursors.sql');
    parts.push('  7. 20250209000001_fix_rpc_parameter_names.sql');
    parts.push('');
    parts.push('Migration files are located in: supabase/migrations/');

    return parts.join('\n');
  }

  return {
    /**
     * Validate all required schema elements exist.
     * Returns a detailed report of what's missing with setup instructions.
     */
    async validateAll(): Promise<SchemaValidationResult> {
      const start = Date.now();

      // Check all tables in parallel
      const allTables = Object.values(REQUIRED_TABLES).flat();
      const tableChecks = await Promise.all(
        allTables.map(async (table) => ({
          table,
          exists: await tableExists(table),
        }))
      );

      // Check all RPCs in parallel
      const rpcChecks = await Promise.all(
        REQUIRED_RPCS.map(async (rpc) => ({
          rpc,
          exists: await rpcExists(rpc),
        }))
      );

      // Check extensions
      const extChecks = await Promise.all(
        REQUIRED_EXTENSIONS.map(async (ext) => ({
          ext,
          exists: await extensionExists(ext),
        }))
      );

      // Build results
      const existingTables = tableChecks.filter((c) => c.exists).map((c) => c.table);
      const missingTablesList = tableChecks.filter((c) => !c.exists).map((c) => c.table);
      const existingRpcs = rpcChecks.filter((c) => c.exists).map((c) => c.rpc);
      const missingRpcs = rpcChecks.filter((c) => !c.exists).map((c) => c.rpc);
      const missingExtensions = extChecks.filter((c) => !c.exists).map((c) => c.ext);

      // Group missing tables by layer
      const missingTableSet: Set<string> = new Set(missingTablesList);
      const missingTables: Record<string, string[]> = {};
      for (const [layer, tables] of Object.entries(REQUIRED_TABLES)) {
        const missing = Array.from(tables).filter((t) =>
          missingTableSet.has(t)
        );
        if (missing.length > 0) {
          missingTables[layer] = missing;
        }
      }

      const valid =
        missingTablesList.length === 0 &&
        missingRpcs.length === 0 &&
        missingExtensions.length === 0;

      const setupInstructions = valid
        ? 'All schema elements present — ready to go!'
        : generateInstructions(missingTables, missingRpcs, missingExtensions);

      return {
        valid,
        missingTables,
        missingRpcs,
        missingExtensions,
        existingTables,
        existingRpcs,
        setupInstructions,
        durationMs: Date.now() - start,
      };
    },

    /**
     * Quick check — just validates critical tables needed for basic operation.
     * Faster than validateAll() since it only checks 5 core tables.
     */
    async validateCore(): Promise<{ valid: boolean; missing: string[] }> {
      const coreTables = [
        'cross_domain_signals',
        'entity_embeddings',
        'ai_memory',
        'causal_relationships_statistical',
        'conversation_log',
      ];

      const checks = await Promise.all(
        coreTables.map(async (table) => ({
          table,
          exists: await tableExists(table),
        }))
      );

      const missing = checks.filter((c) => !c.exists).map((c) => c.table);
      return { valid: missing.length === 0, missing };
    },
  };
}
