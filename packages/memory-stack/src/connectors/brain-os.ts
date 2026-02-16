/**
 * Brain-OS Connector for NexusBrain
 *
 * Ingests signals from Brain-OS (business logic discovery platform)
 * into NexusBrain's causal intelligence engine.
 *
 * Brain-OS events become engineering domain signals:
 *   - Rule deployments → track business logic governance velocity
 *   - Discovery conversions → track hardcoded-to-dynamic migration
 *   - Pipeline executions → track codebase analysis health
 *   - Agent completions → track AI agent reliability
 *   - Hook generations → track code generation output
 *
 * This connector enables NexusBrain to discover causal relationships
 * between engineering operations and business outcomes, e.g.:
 *   "Rule deployments ↑ → Production incidents ↓ (3 day lag)"
 *   "Pipeline failures ↑ → Developer velocity ↓"
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NexusConnector,
  ConnectorSignal,
  ConnectorSyncResult,
} from './connector-framework';

// ============================================================================
// TYPES
// ============================================================================

interface BrainOSConfig {
  /** Brain-OS Supabase project URL */
  supabaseUrl: string;
  /** Brain-OS Supabase service role key (for server-to-server sync) */
  serviceRoleKey: string;
}

interface BrainOSEvent {
  id: string;
  type: string;
  value: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

// Webhook payload from Brain-OS nexus-bridge
interface BrainOSWebhookPayload {
  event_type: string;
  signals: Array<{
    source_domain: string;
    signal_type: string;
    signal_value: number;
    signal_timestamp?: string;
    entity_type?: string;
    entity_id?: string;
    metadata?: Record<string, unknown>;
  }>;
  org_id?: string;
  transformer_id?: string;
  timestamp?: string;
}

// ============================================================================
// SIGNAL TYPE MAPPINGS
// ============================================================================

/**
 * Map Brain-OS event types to NexusBrain signal categories.
 * Each signal type gets a source_domain + signal_type for causal analysis.
 */
const SIGNAL_MAPPINGS: Record<string, {
  source_domain: string;
  signal_type: string;
  entity_type?: string;
}> = {
  // Rule lifecycle
  rule_deployed: {
    source_domain: 'engineering.brain-os',
    signal_type: 'rule_deployed',
    entity_type: 'brain_rule',
  },
  rule_updated: {
    source_domain: 'engineering.brain-os',
    signal_type: 'rule_updated',
    entity_type: 'brain_rule',
  },
  rule_deactivated: {
    source_domain: 'engineering.brain-os',
    signal_type: 'rule_deactivated',
    entity_type: 'brain_rule',
  },

  // Discovery lifecycle
  discovery_created: {
    source_domain: 'engineering.brain-os',
    signal_type: 'discovery_created',
    entity_type: 'discovery',
  },
  discovery_converted: {
    source_domain: 'engineering.brain-os',
    signal_type: 'discovery_converted',
    entity_type: 'discovery',
  },

  // Pipeline operations
  pipeline_started: {
    source_domain: 'engineering.brain-os',
    signal_type: 'pipeline_started',
    entity_type: 'pipeline',
  },
  pipeline_completed: {
    source_domain: 'engineering.brain-os',
    signal_type: 'pipeline_completed',
    entity_type: 'pipeline',
  },
  pipeline_failed: {
    source_domain: 'engineering.brain-os',
    signal_type: 'pipeline_failed',
    entity_type: 'pipeline',
  },

  // Agent operations
  agent_completed: {
    source_domain: 'engineering.brain-os',
    signal_type: 'agent_completed',
    entity_type: 'agent',
  },
  agent_failed: {
    source_domain: 'engineering.brain-os',
    signal_type: 'agent_failed',
    entity_type: 'agent',
  },

  // Code generation
  hook_generated: {
    source_domain: 'engineering.brain-os',
    signal_type: 'hook_generated',
    entity_type: 'hook',
  },
  hook_pr_merged: {
    source_domain: 'engineering.brain-os',
    signal_type: 'hook_pr_merged',
    entity_type: 'hook',
  },

  // Copilot usage
  copilot_query: {
    source_domain: 'engineering.brain-os',
    signal_type: 'copilot_query',
    entity_type: 'copilot',
  },

  // Evaluation
  evaluation_executed: {
    source_domain: 'engineering.brain-os',
    signal_type: 'evaluation_executed',
    entity_type: 'evaluation',
  },
};

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export function createBrainOSConnector(config?: BrainOSConfig): NexusConnector {
  return {
    id: 'brain-os',
    name: 'Brain-OS',
    domain: 'engineering',

    /**
     * Full sync: Pull all Brain-OS events from the audit_log table.
     * This is used for initial setup or catch-up syncs.
     */
    async fullSync(
      supabase: SupabaseClient,
      organizationId: string,
    ): Promise<ConnectorSyncResult> {
      const startTime = Date.now();
      const errors: string[] = [];
      let signalsGenerated = 0;
      let recordsProcessed = 0;

      if (!config) {
        return {
          success: false,
          signalsGenerated: 0,
          recordsProcessed: 0,
          errors: ['Brain-OS config not provided. Use webhook-based ingestion instead.'],
          duration_ms: Date.now() - startTime,
          lastSyncedAt: new Date(),
        };
      }

      try {
        // Connect to Brain-OS Supabase (separate project)
        const { createClient } = await import('@supabase/supabase-js');
        const brainOSClient = createClient(config.supabaseUrl, config.serviceRoleKey);

        // Fetch audit log entries that map to our signal types
        const { data: auditEntries, error: fetchError } = await brainOSClient
          .from('audit_log')
          .select('*')
          .in('action', Object.keys(SIGNAL_MAPPINGS))
          .order('created_at', { ascending: true })
          .limit(1000);

        if (fetchError) {
          errors.push(`Failed to fetch Brain-OS audit log: ${fetchError.message}`);
          return {
            success: false,
            signalsGenerated,
            recordsProcessed,
            errors,
            duration_ms: Date.now() - startTime,
            lastSyncedAt: new Date(),
          };
        }

        if (!auditEntries || auditEntries.length === 0) {
          return {
            success: true,
            signalsGenerated: 0,
            recordsProcessed: 0,
            errors: [],
            duration_ms: Date.now() - startTime,
            lastSyncedAt: new Date(),
          };
        }

        // Convert audit entries to NexusBrain signals
        const signals: ConnectorSignal[] = [];

        for (const entry of auditEntries) {
          recordsProcessed++;
          const mapping = SIGNAL_MAPPINGS[entry.action];
          if (!mapping) continue;

          signals.push({
            organization_id: organizationId,
            source_domain: mapping.source_domain,
            signal_type: mapping.signal_type,
            signal_value: 1,
            signal_timestamp: entry.created_at,
            entity_type: mapping.entity_type,
            entity_id: entry.entity_id,
            metadata: {
              brain_os_org_id: entry.org_id,
              brain_os_user_id: entry.user_id,
              entity_type: entry.entity_type,
              ...(entry.metadata || {}),
            },
          });
        }

        // Store signals in NexusBrain
        if (signals.length > 0) {
          const { storeConnectorSignals } = await import('./connector-framework');
          await storeConnectorSignals(supabase, signals, undefined, organizationId);
          signalsGenerated = signals.length;
        }
      } catch (err) {
        errors.push(
          `Full sync error: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }

      return {
        success: errors.length === 0,
        signalsGenerated,
        recordsProcessed,
        errors,
        duration_ms: Date.now() - startTime,
        lastSyncedAt: new Date(),
      };
    },

    /**
     * Incremental sync: Pull Brain-OS events since last sync.
     */
    async incrementalSync(
      supabase: SupabaseClient,
      organizationId: string,
      since: Date,
    ): Promise<ConnectorSyncResult> {
      const startTime = Date.now();
      const errors: string[] = [];
      let signalsGenerated = 0;
      let recordsProcessed = 0;

      if (!config) {
        return {
          success: false,
          signalsGenerated: 0,
          recordsProcessed: 0,
          errors: ['Brain-OS config not provided. Use webhook-based ingestion instead.'],
          duration_ms: Date.now() - startTime,
          lastSyncedAt: new Date(),
        };
      }

      try {
        const { createClient } = await import('@supabase/supabase-js');
        const brainOSClient = createClient(config.supabaseUrl, config.serviceRoleKey);

        const { data: auditEntries, error: fetchError } = await brainOSClient
          .from('audit_log')
          .select('*')
          .in('action', Object.keys(SIGNAL_MAPPINGS))
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: true })
          .limit(500);

        if (fetchError) {
          errors.push(`Incremental sync failed: ${fetchError.message}`);
          return {
            success: false,
            signalsGenerated,
            recordsProcessed,
            errors,
            duration_ms: Date.now() - startTime,
            lastSyncedAt: new Date(),
          };
        }

        const signals: ConnectorSignal[] = [];

        for (const entry of (auditEntries || [])) {
          recordsProcessed++;
          const mapping = SIGNAL_MAPPINGS[entry.action];
          if (!mapping) continue;

          signals.push({
            organization_id: organizationId,
            source_domain: mapping.source_domain,
            signal_type: mapping.signal_type,
            signal_value: 1,
            signal_timestamp: entry.created_at,
            entity_type: mapping.entity_type,
            entity_id: entry.entity_id,
            metadata: {
              brain_os_org_id: entry.org_id,
              brain_os_user_id: entry.user_id,
              entity_type: entry.entity_type,
              ...(entry.metadata || {}),
            },
          });
        }

        if (signals.length > 0) {
          const { storeConnectorSignals } = await import('./connector-framework');
          await storeConnectorSignals(supabase, signals, undefined, organizationId);
          signalsGenerated = signals.length;
        }
      } catch (err) {
        errors.push(
          `Incremental sync error: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }

      return {
        success: errors.length === 0,
        signalsGenerated,
        recordsProcessed,
        errors,
        duration_ms: Date.now() - startTime,
        lastSyncedAt: new Date(),
      };
    },

    /**
     * Handle webhook from Brain-OS nexus-bridge edge function.
     * This is the primary ingestion path — real-time, push-based.
     */
    handleWebhook(payload: unknown): ConnectorSignal[] {
      const data = payload as BrainOSWebhookPayload;

      if (!data.signals || !Array.isArray(data.signals)) {
        return [];
      }

      return data.signals.map((signal) => {
        const mapping = SIGNAL_MAPPINGS[signal.signal_type];

        return {
          organization_id: '', // Will be set by scopedOrganizationId in storeConnectorSignals
          source_domain: mapping?.source_domain || signal.source_domain || 'engineering',
          signal_type: mapping?.signal_type || signal.signal_type,
          signal_value: signal.signal_value,
          signal_timestamp: signal.signal_timestamp,
          entity_type: mapping?.entity_type || signal.entity_type,
          entity_id: signal.entity_id,
          metadata: {
            ...signal.metadata,
            brain_os_org_id: data.org_id,
            brain_os_transformer_id: data.transformer_id,
            event_type: data.event_type,
            origin: 'brain-os',
          },
        };
      });
    },
  };
}

// ============================================================================
// EXPORT DEFAULT INSTANCE
// ============================================================================

/**
 * Default Brain-OS connector instance for webhook-based ingestion.
 * For full/incremental sync, create with config:
 *   createBrainOSConnector({ supabaseUrl: '...', serviceRoleKey: '...' })
 */
export const brainOSConnector = createBrainOSConnector();
