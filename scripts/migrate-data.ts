/**
 * NexusBrain Data Migration Script
 *
 * Copies NexusBrain-related data from the shared NexusOS database
 * to the new dedicated NexusBrain Supabase project.
 *
 * Handles column differences between NexusOS (source) and NexusBrain (target)
 * by selecting only the columns that exist in the target schema.
 *
 * Usage:
 *   SOURCE_SUPABASE_KEY=xxx TARGET_SUPABASE_KEY=xxx pnpm exec tsx scripts/migrate-data.ts
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SOURCE_URL = process.env.SOURCE_SUPABASE_URL || 'https://lkdbjwyvjfyjjflpubdd.supabase.co';
const SOURCE_KEY = process.env.SOURCE_SUPABASE_KEY || '';

const TARGET_URL = process.env.TARGET_SUPABASE_URL || 'https://zmlqvuzoodcgmkgkivfw.supabase.co';
const TARGET_KEY = process.env.TARGET_SUPABASE_KEY || '';

const BATCH_SIZE = 500;

// ============================================================================
// COLUMN RENAMES — source column name → target column name
// When the NexusOS table uses a different column name than the NexusBrain schema.
// ============================================================================

const COLUMN_RENAMES: Record<string, Record<string, string>> = {
  entity_embeddings: {
    content_text: 'content',     // NexusOS uses content_text, NexusBrain uses content
  },
  ai_memory: {
    title: 'memory_type',        // NexusOS uses title → memory_type
    memory_text: 'content',      // NexusOS may use memory_text → content
  },
  agent_registry: {
    agent_name: 'display_name',  // NexusOS uses agent_name → display_name
  },
  ai_agent_activity: {
    activity_type: 'action_type', // NexusOS uses activity_type → action_type
  },
  org_cascade_rules: {
    name: 'rule_name',            // NexusOS uses name → rule_name
    source_domain: 'trigger_domain',
    source_signal_type: 'trigger_signal_type',
    threshold: 'trigger_threshold',
  },
  platform_cascade_rules: {
    name: 'rule_name',            // NexusOS uses name → rule_name
    source_domain: 'trigger_domain',
    source_signal_type: 'trigger_signal_type',
    threshold: 'trigger_threshold',
  },
};

// ============================================================================
// TARGET SCHEMA — columns that exist in the new NexusBrain database
// Source rows are filtered to only include these columns before inserting.
// ============================================================================

const TARGET_COLUMNS: Record<string, string[]> = {
  // L1
  cross_domain_signals: [
    'id', 'organization_id', 'source_domain', 'signal_type', 'signal_value',
    'entity_type', 'entity_id', 'client_id', 'feature_vector', 'signal_metadata',
    'lookback_window_days', 'created_at', 'updated_at',
  ],
  signal_thresholds: [
    'id', 'organization_id', 'domain', 'signal_type', 'threshold_value',
    'direction', 'confidence', 'last_optimized_at', 'created_at', 'updated_at',
  ],
  threshold_optimization_history: [
    'id', 'organization_id', 'domain', 'signal_type', 'old_threshold',
    'new_threshold', 'optimization_method', 'improvement_score', 'created_at',
  ],

  // L2
  resolved_entities: [
    'id', 'organization_id', 'canonical_name', 'entity_type', 'external_ids',
    'email_domains', 'aliases', 'metadata', 'confidence', 'created_at', 'updated_at',
  ],
  entity_relationships: [
    'id', 'organization_id', 'source_entity_id', 'target_entity_id',
    'relationship_type', 'context', 'confidence', 'created_at',
  ],

  // L3
  entity_embeddings: [
    'id', 'organization_id', 'entity_type', 'entity_id', 'content',
    'embedding', 'metadata', 'importance_score', 'created_at', 'updated_at',
  ],
  ai_memory: [
    'id', 'organization_id', 'domain', 'memory_type', 'content',
    'importance', 'access_count', 'last_accessed_at', 'metadata',
    'created_at', 'updated_at',
  ],

  // L4
  causal_event_stream: [
    'id', 'organization_id', 'event_type', 'domain', 'entity_type', 'entity_id',
    'client_id', 'payload', 'vector_clock', 'priority', 'processing_status', 'created_at',
  ],
  causal_relationships_statistical: [
    'id', 'organization_id', 'source_domain', 'target_domain', 'granger_f_statistic',
    'granger_p_value', 'optimal_lag_days', 'effect_size', 'sample_size',
    'confidence_interval_lower', 'confidence_interval_upper', 'is_significant',
    'natural_language', 'evidence_weight', 'last_validated_at', 'created_at', 'updated_at',
  ],
  prediction_records: [
    'id', 'organization_id', 'domain', 'prediction_type', 'entity_type', 'entity_id',
    'predicted_value', 'predicted_outcome', 'confidence', 'actual_value', 'actual_outcome',
    'was_correct', 'verified_at', 'source_rule_id', 'created_at',
  ],
  scheduled_verifications: [
    'id', 'organization_id', 'prediction_id', 'verification_type', 'scheduled_for',
    'status', 'result', 'completed_at', 'created_at',
  ],
  weight_update_history: [
    'id', 'organization_id', 'relationship_id', 'old_weight', 'new_weight',
    'update_reason', 'prediction_accuracy', 'created_at',
  ],
  outcome_observation_windows: [
    'id', 'organization_id', 'entity_type', 'entity_id', 'observation_type',
    'window_start', 'window_end', 'baseline_value', 'current_value', 'status',
    'metadata', 'created_at',
  ],

  // L5
  brain_grammar_rules: [
    'id', 'organization_id', 'domain', 'rule_type', 'condition_expression',
    'action_expression', 'confidence', 'support', 'lift', 'natural_language',
    'is_active', 'execution_count', 'last_executed_at', 'created_at', 'updated_at',
  ],
  ai_causal_chains: [
    'id', 'organization_id', 'chain_type', 'domains', 'hops', 'total_effect_size',
    'confidence', 'natural_language', 'is_validated', 'created_at', 'updated_at',
  ],
  pattern_feedback_log: [
    'id', 'organization_id', 'pattern_type', 'pattern_id', 'feedback_type',
    'feedback_value', 'user_id', 'created_at',
  ],
  brain_execution_log: [
    'id', 'organization_id', 'rule_id', 'rule_type', 'input_signals',
    'output_actions', 'execution_result', 'confidence_at_execution', 'duration_ms',
    'created_at',
  ],
  causal_chain_outcomes: [
    'id', 'organization_id', 'chain_id', 'trigger_signal_id', 'predicted_outcome',
    'actual_outcome', 'was_correct', 'created_at',
  ],
  ai_domain_relationships: [
    'id', 'organization_id', 'source_domain', 'target_domain', 'relationship_type',
    'strength', 'lag_days', 'metadata', 'created_at', 'updated_at',
  ],
  org_cascade_rules: [
    'id', 'organization_id', 'rule_name', 'trigger_domain', 'trigger_signal_type',
    'trigger_threshold', 'propagation_chain', 'actions', 'is_active', 'priority',
    'created_at', 'updated_at',
  ],
  platform_cascade_rules: [
    'id', 'rule_name', 'trigger_domain', 'trigger_signal_type', 'trigger_threshold',
    'propagation_chain', 'actions', 'is_active', 'priority', 'created_at', 'updated_at',
  ],

  // L6
  agent_registry: [
    'id', 'organization_id', 'agent_type', 'display_name', 'domain', 'is_enabled',
    'config', 'created_at', 'updated_at',
  ],
  agent_queue: [
    'id', 'organization_id', 'agent_type', 'task_type', 'priority', 'payload',
    'status', 'result', 'started_at', 'completed_at', 'error_message', 'created_at',
  ],
  ai_agent_activity: [
    'id', 'organization_id', 'agent_type', 'run_id', 'action_type', 'input_summary',
    'output_summary', 'tokens_used', 'duration_ms', 'status', 'metadata', 'created_at',
  ],

  // L7
  connector_sync_log: [
    'id', 'organization_id', 'connector_id', 'sync_type', 'status',
    'signals_generated', 'records_processed', 'errors', 'duration_ms',
    'started_at', 'completed_at',
  ],
  sync_cursors: [
    'id', 'organization_id', 'connector_id', 'last_synced_at', 'last_sync_type',
    'cursor_data', 'updated_at',
  ],

  // Persistence
  embedding_cache_state: [
    'id', 'organization_id', 'cache_key', 'cache_value', 'expires_at',
    'created_at', 'updated_at',
  ],
  temporal_memory_state: [
    'id', 'organization_id', 'memory_id', 'content', 'relevance',
    'reinforcement_score', 'created_at', 'updated_at',
  ],
  conversation_log: [
    'id', 'organization_id', 'conversation_id', 'role', 'content',
    'tokens_used', 'context_snapshot', 'created_at',
  ],
};

// ============================================================================
// TABLES TO MIGRATE (with priorities and estimated rows)
// ============================================================================

interface TableConfig {
  name: string;
  estimatedRows: number;
  priority: string;
}

const TABLES_TO_MIGRATE: TableConfig[] = [
  { name: 'cross_domain_signals', estimatedRows: 124, priority: 'HIGH' },
  { name: 'signal_thresholds', estimatedRows: 0, priority: 'LOW' },
  { name: 'threshold_optimization_history', estimatedRows: 0, priority: 'LOW' },
  { name: 'resolved_entities', estimatedRows: 0, priority: 'MEDIUM' },
  { name: 'entity_relationships', estimatedRows: 0, priority: 'MEDIUM' },
  { name: 'entity_embeddings', estimatedRows: 2403, priority: 'HIGH' },
  { name: 'ai_memory', estimatedRows: 2826, priority: 'HIGH' },
  { name: 'causal_event_stream', estimatedRows: 0, priority: 'LOW' },
  { name: 'causal_relationships_statistical', estimatedRows: 7, priority: 'HIGH' },
  { name: 'prediction_records', estimatedRows: 22, priority: 'MEDIUM' },
  { name: 'scheduled_verifications', estimatedRows: 0, priority: 'LOW' },
  { name: 'weight_update_history', estimatedRows: 0, priority: 'LOW' },
  { name: 'outcome_observation_windows', estimatedRows: 0, priority: 'LOW' },
  { name: 'brain_grammar_rules', estimatedRows: 0, priority: 'MEDIUM' },
  { name: 'ai_causal_chains', estimatedRows: 0, priority: 'MEDIUM' },
  { name: 'pattern_feedback_log', estimatedRows: 0, priority: 'LOW' },
  { name: 'brain_execution_log', estimatedRows: 1837, priority: 'HIGH' },
  { name: 'causal_chain_outcomes', estimatedRows: 0, priority: 'LOW' },
  { name: 'ai_domain_relationships', estimatedRows: 13, priority: 'MEDIUM' },
  { name: 'org_cascade_rules', estimatedRows: 66, priority: 'MEDIUM' },
  { name: 'platform_cascade_rules', estimatedRows: 12, priority: 'LOW' },
  { name: 'agent_registry', estimatedRows: 41, priority: 'MEDIUM' },
  { name: 'agent_queue', estimatedRows: 0, priority: 'LOW' },
  { name: 'ai_agent_activity', estimatedRows: 488, priority: 'HIGH' },
  { name: 'connector_sync_log', estimatedRows: 0, priority: 'LOW' },
  { name: 'sync_cursors', estimatedRows: 0, priority: 'LOW' },
  { name: 'embedding_cache_state', estimatedRows: 0, priority: 'LOW' },
  { name: 'temporal_memory_state', estimatedRows: 0, priority: 'LOW' },
  { name: 'conversation_log', estimatedRows: 0, priority: 'LOW' },
];

// ============================================================================
// MIGRATION LOGIC
// ============================================================================

interface MigrationResult {
  table: string;
  sourceRows: number;
  insertedRows: number;
  skipped: boolean;
  droppedColumns: string[];
  error?: string;
  durationMs: number;
}

/**
 * Strip source rows to only include columns that exist in the target schema.
 * Applies column renames (source name → target name) before filtering.
 * Fills missing NOT NULL columns with sensible defaults.
 * Returns the cleaned rows and a list of dropped column names.
 */
function filterColumns(
  rows: any[],
  targetColumns: string[],
  tableName: string
): { cleaned: any[]; droppedColumns: string[] } {
  if (rows.length === 0) return { cleaned: [], droppedColumns: [] };

  const renames = COLUMN_RENAMES[tableName] || {};
  // Build reverse map: target_col → source_col
  const reverseRenames: Record<string, string> = {};
  for (const [srcCol, tgtCol] of Object.entries(renames)) {
    reverseRenames[tgtCol] = srcCol;
  }

  const targetSet = new Set(targetColumns);
  const sourceColumns = Object.keys(rows[0]);

  // Figure out which source columns map to target (either direct or via rename)
  const mappedSourceCols = new Set<string>();
  for (const col of targetColumns) {
    if (sourceColumns.includes(col)) {
      mappedSourceCols.add(col);
    } else if (reverseRenames[col] && sourceColumns.includes(reverseRenames[col])) {
      mappedSourceCols.add(reverseRenames[col]);
    }
  }
  const droppedColumns = sourceColumns.filter((col) => !mappedSourceCols.has(col) && !targetSet.has(col));

  const cleaned = rows.map((row) => {
    const filtered: Record<string, any> = {};
    for (const col of targetColumns) {
      if (col in row) {
        // Direct match
        filtered[col] = row[col];
      } else if (reverseRenames[col] && reverseRenames[col] in row) {
        // Renamed column
        filtered[col] = row[reverseRenames[col]];
      } else {
        // Column doesn't exist in source — set sensible default to avoid NOT NULL violations
        filtered[col] = getDefaultValue(tableName, col);
      }
    }
    return filtered;
  });

  return { cleaned, droppedColumns };
}

/**
 * Get a sensible default value for a missing column to avoid NOT NULL violations.
 */
function getDefaultValue(tableName: string, columnName: string): any {
  // Table-specific defaults
  if (tableName === 'ai_memory' && columnName === 'domain') return 'general';
  if (tableName === 'prediction_records' && columnName === 'prediction_type') return 'general';
  if (tableName === 'prediction_records' && columnName === 'domain') return 'general';

  // Common patterns
  if (columnName === 'domain') return 'general';
  if (columnName === 'memory_type') return 'general';
  if (columnName === 'content') return '';
  if (columnName === 'display_name') return 'Unknown';
  if (columnName === 'agent_type') return 'unknown';
  if (columnName === 'action_type') return 'unknown';
  if (columnName === 'rule_name') return 'Unnamed Rule';
  if (columnName === 'trigger_domain') return 'general';
  if (columnName === 'trigger_signal_type') return 'unknown';
  if (columnName === 'trigger_threshold') return 0;
  if (columnName === 'prediction_type') return 'general';
  if (columnName === 'propagation_chain') return '[]';
  if (columnName === 'actions') return '[]';
  if (columnName === 'run_id') return null;
  if (columnName.includes('count')) return 0;
  if (columnName.includes('score')) return 0;
  if (columnName.includes('confidence')) return 0.5;
  if (columnName.includes('is_')) return true;
  if (columnName.includes('priority')) return 0;
  return null;
}

/**
 * Fetch all rows from a source table with pagination (1000 rows/page).
 * Selects only columns that exist in the target schema.
 */
async function fetchAllRows(
  client: SupabaseClient,
  tableName: string,
  columns: string
): Promise<{ data: any[]; error?: string }> {
  const allRows: any[] = [];
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    // Try with ordering by id first
    const { data, error } = await client
      .from(tableName)
      .select(columns)
      .range(offset, offset + pageSize - 1)
      .order('id' as any, { ascending: true });

    if (error) {
      // If ordering by 'id' fails or column not found, try without ordering
      const msg = error.message || '';
      if (msg.includes('id') || msg.includes('column') || msg.includes('does not exist')) {
        // Might be a table-not-found error
        if (msg.includes('relation') || msg.includes('42P01')) {
          return { data: allRows, error: msg };
        }

        const { data: d2, error: e2 } = await client
          .from(tableName)
          .select(columns)
          .range(offset, offset + pageSize - 1);

        if (e2) return { data: allRows, error: e2.message };
        if (d2 && d2.length > 0) {
          allRows.push(...d2);
          offset += pageSize;
          hasMore = d2.length === pageSize;
        } else {
          hasMore = false;
        }
      } else {
        return { data: allRows, error: msg };
      }
    } else if (data && data.length > 0) {
      allRows.push(...data);
      offset += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  return { data: allRows };
}

/**
 * Insert rows into target table in batches via upsert (idempotent re-runs).
 */
async function insertBatch(
  client: SupabaseClient,
  tableName: string,
  rows: any[]
): Promise<{ inserted: number; error?: string }> {
  let totalInserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const { error } = await client
      .from(tableName)
      .upsert(batch, { onConflict: 'id', ignoreDuplicates: true });

    if (error) {
      // Fallback to plain insert
      const { error: insertError } = await client
        .from(tableName)
        .insert(batch);

      if (insertError) {
        return {
          inserted: totalInserted,
          error: `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${insertError.message}`,
        };
      }
    }

    totalInserted += batch.length;

    if (rows.length > BATCH_SIZE) {
      console.log(`  ... ${tableName}: ${totalInserted}/${rows.length} rows`);
    }
  }

  return { inserted: totalInserted };
}

/**
 * Migrate a single table: fetch from source, filter columns, insert into target.
 */
async function migrateTable(
  source: SupabaseClient,
  target: SupabaseClient,
  config: TableConfig
): Promise<MigrationResult> {
  const start = Date.now();
  const targetCols = TARGET_COLUMNS[config.name];

  if (!targetCols) {
    return {
      table: config.name,
      sourceRows: 0,
      insertedRows: 0,
      skipped: true,
      droppedColumns: [],
      error: 'No target column definition found',
      durationMs: Date.now() - start,
    };
  }

  // Fetch from source using target columns (only select what we need)
  // This avoids fetching columns that don't exist in target
  const selectStr = targetCols.join(',');
  const { data: sourceRows, error: fetchError } = await fetchAllRows(
    source,
    config.name,
    selectStr
  );

  if (fetchError) {
    // Check for actual table-not-found (must be relation/42P01 but NOT just "column does not exist")
    const isTableMissing =
      (fetchError.includes('42P01') || fetchError.includes('relation')) &&
      !fetchError.includes('column');

    if (isTableMissing) {
      return {
        table: config.name,
        sourceRows: 0,
        insertedRows: 0,
        skipped: true,
        droppedColumns: [],
        error: 'Table not found in source (new NexusBrain table)',
        durationMs: Date.now() - start,
      };
    }

    // Column doesn't exist in source, or other schema mismatch
    // Fall back to select *, then filter to target columns
    {
      // Fetch all columns from source, then filter to target columns
      const { data: allRows, error: fallbackError } = await fetchAllRows(
        source,
        config.name,
        '*'
      );

      if (fallbackError) {
        return {
          table: config.name,
          sourceRows: 0,
          insertedRows: 0,
          skipped: false,
          droppedColumns: [],
          error: `Fallback fetch error: ${fallbackError}`,
          durationMs: Date.now() - start,
        };
      }

      if (!allRows || allRows.length === 0) {
        return {
          table: config.name,
          sourceRows: 0,
          insertedRows: 0,
          skipped: true,
          droppedColumns: [],
          durationMs: Date.now() - start,
        };
      }

      // Filter to only target columns
      const { cleaned, droppedColumns } = filterColumns(allRows, targetCols, config.name);
      const { inserted, error: insertError } = await insertBatch(target, config.name, cleaned);

      return {
        table: config.name,
        sourceRows: allRows.length,
        insertedRows: inserted,
        skipped: false,
        droppedColumns,
        error: insertError,
        durationMs: Date.now() - start,
      };
    }

    return {
      table: config.name,
      sourceRows: 0,
      insertedRows: 0,
      skipped: false,
      droppedColumns: [],
      error: `Fetch error: ${fetchError}`,
      durationMs: Date.now() - start,
    };
  }

  if (!sourceRows || sourceRows.length === 0) {
    return {
      table: config.name,
      sourceRows: 0,
      insertedRows: 0,
      skipped: true,
      droppedColumns: [],
      durationMs: Date.now() - start,
    };
  }

  // Insert into target (columns already match)
  const { inserted, error: insertError } = await insertBatch(target, config.name, sourceRows);

  return {
    table: config.name,
    sourceRows: sourceRows.length,
    insertedRows: inserted,
    skipped: false,
    droppedColumns: [],
    error: insertError,
    durationMs: Date.now() - start,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('');
  console.log('='.repeat(70));
  console.log('  NexusBrain Data Migration');
  console.log('  Source: NexusOS   (lkdbjwyvjfyjjflpubdd)');
  console.log('  Target: NexusBrain (zmlqvuzoodcgmkgkivfw)');
  console.log('='.repeat(70));
  console.log('');

  if (!SOURCE_KEY) {
    console.error('ERROR: SOURCE_SUPABASE_KEY not set.');
    process.exit(1);
  }
  if (!TARGET_KEY) {
    console.error('ERROR: TARGET_SUPABASE_KEY not set.');
    process.exit(1);
  }

  const source = createClient(SOURCE_URL, SOURCE_KEY);
  const target = createClient(TARGET_URL, TARGET_KEY);

  // Test connections
  console.log('Testing connections...');
  const { error: srcErr } = await source.from('cross_domain_signals').select('id').limit(0);
  if (srcErr) {
    console.error('  Source FAILED:', srcErr.message);
    process.exit(1);
  }
  console.log('  Source (NexusOS):    Connected');

  const { error: tgtErr } = await target.from('cross_domain_signals').select('id').limit(0);
  if (tgtErr) {
    console.error('  Target FAILED:', tgtErr.message);
    process.exit(1);
  }
  console.log('  Target (NexusBrain): Connected');
  console.log('');

  // Migrate
  const results: MigrationResult[] = [];
  const totalStart = Date.now();

  for (const tableConfig of TABLES_TO_MIGRATE) {
    const label = `[${tableConfig.priority}] ${tableConfig.name}`;
    process.stdout.write(`Migrating ${label}...`);

    const result = await migrateTable(source, target, tableConfig);
    results.push(result);

    if (result.skipped) {
      console.log(` SKIP (${result.error || 'empty'})`);
    } else if (result.error) {
      console.log(` ERROR: ${result.error}`);
    } else {
      const dropped = result.droppedColumns.length > 0
        ? ` (dropped ${result.droppedColumns.length} extra cols)`
        : '';
      console.log(` OK ${result.insertedRows} rows${dropped} [${result.durationMs}ms]`);
    }
  }

  // Summary
  const totalDuration = Date.now() - totalStart;
  const migrated = results.filter((r) => !r.skipped && !r.error);
  const skipped = results.filter((r) => r.skipped);
  const errors = results.filter((r) => r.error && !r.skipped);
  const totalRows = results.reduce((sum, r) => sum + r.insertedRows, 0);

  console.log('');
  console.log('='.repeat(70));
  console.log('  Migration Summary');
  console.log('='.repeat(70));
  console.log(`  Total tables:    ${TABLES_TO_MIGRATE.length}`);
  console.log(`  Migrated:        ${migrated.length} tables (${totalRows} rows)`);
  console.log(`  Skipped (empty): ${skipped.length} tables`);
  console.log(`  Errors:          ${errors.length} tables`);
  console.log(`  Duration:        ${(totalDuration / 1000).toFixed(1)}s`);

  if (errors.length > 0) {
    console.log('');
    console.log('  Failed tables:');
    for (const err of errors) {
      console.log(`    - ${err.table}: ${err.error}`);
    }
  }

  if (migrated.length > 0) {
    console.log('');
    console.log('  Successfully migrated:');
    for (const m of migrated) {
      const dropped = m.droppedColumns.length > 0
        ? ` (dropped: ${m.droppedColumns.join(', ')})`
        : '';
      console.log(`    - ${m.table}: ${m.insertedRows} rows${dropped}`);
    }
  }

  console.log('');
  console.log('Done!');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
