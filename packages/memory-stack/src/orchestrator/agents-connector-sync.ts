/**
 * Connector Sync Agents — Brain ↔ External System Data Bridge
 * =============================================================
 *
 * Brain Analog: **Thalamus Relay Nuclei** (specialized sensory relay stations)
 *
 * Each agent groups connectors by business domain and syncs them into the
 * org's brain via the existing SyncManager + NexusConnector framework.
 *
 * These agents bridge the connector framework into the `defineAgent()` registry,
 * making connectors callable from:
 *   - Brain Commander (user queries like "sync my revenue data")
 *   - Jarvis Orchestrator (multi-agent goal decomposition)
 *   - Org Updater Agent (automated per-org sync cycles)
 *   - Manual invocation via API
 *
 * Architecture:
 * ─────────────
 *   org_connectors (DB) → createConnectorFromConfig() → NexusConnector[]
 *                       → createSyncManager({ connectors })
 *                       → syncManager.syncAll(supabase, orgId)
 *                       → Signals stored in cross_domain_signals
 *
 * 5 Domain-Grouped Sync Agents:
 *   1. brain-revenue-sync       — HubSpot, Stripe       → revenue, finance
 *   2. brain-engineering-sync   — GitHub, Jira           → engineering
 *   3. brain-communication-sync — Slack, Google Chat, Voice → communication, cs
 *   4. brain-operations-sync    — PagerDuty, Support     → operations, cs
 *   5. brain-productivity-sync  — Google Calendar, Document, Generic App → product, strategy
 *
 * @packageDocumentation
 */

import { defineAgent, type AgentDefinition } from './agent-registry';
import { createSyncManager } from '../connectors/sync-manager';
import type { NexusConnector, ConnectorSyncResult } from '../connectors/connector-framework';
import type { SupabaseClient } from '@supabase/supabase-js';

// ── Connector Factories ────────────────────────────────────────────────────
import { createHubSpotConnector } from '../connectors/hubspot';
import { createStripeConnector } from '../connectors/stripe';
import { createGitHubConnector, type GitHubConnectorConfig } from '../connectors/github';
import { createJiraConnector, type JiraConnectorConfig } from '../connectors/jira';
import { createSlackConnector, type SlackConnectorConfig } from '../connectors/slack';
import { createPagerDutyConnector, type PagerDutyConnectorConfig } from '../connectors/pagerduty';
import { createGoogleCalendarConnector, type GoogleCalendarConnectorConfig } from '../connectors/google-calendar';
import { createGoogleChatConnector, type GoogleChatConnectorConfig } from '../connectors/google-chat';
import { createVoiceConnector, type VoiceConnectorConfig } from '../connectors/voice';
import { createSupportConnector } from '../connectors/support';
import { createDocumentConnector, type DocumentConnectorConfig } from '../connectors/document';
import { createGenericAppConnector, type GenericAppConnectorConfig } from '../connectors/generic-app';

// ============================================================================
// TYPES
// ============================================================================

export interface ConnectorSyncInput {
  organizationId: string;
  /** Filter to specific connector types (e.g., ['hubspot', 'stripe']) */
  connectorTypes?: string[];
  /** Force full sync instead of incremental */
  fullSync?: boolean;
}

export interface ConnectorSyncOutput {
  connectorsProcessed: number;
  signalsGenerated: number;
  errors: string[];
  domainsCovered: string[];
  duration_ms: number;
}

// ============================================================================
// CONNECTOR FACTORY — Maps connector_type → NexusConnector instance
// ============================================================================

/**
 * Connector type → factory function mapping.
 * Each domain agent uses this to resolve connector types it cares about.
 */
const CONNECTOR_FACTORIES: Record<
  string,
  (config: Record<string, unknown>) => NexusConnector | null
> = {
  hubspot: (config) => {
    if (!config.apiKey) return null;
    return createHubSpotConnector(config.apiKey as string);
  },
  stripe: (config) => {
    if (!config.apiKey) return null;
    return createStripeConnector(config.apiKey as string);
  },
  github: (config) => createGitHubConnector(config as unknown as GitHubConnectorConfig),
  jira: (config) => createJiraConnector(config as unknown as JiraConnectorConfig),
  slack: (config) => createSlackConnector(config as unknown as SlackConnectorConfig),
  pagerduty: (config) => createPagerDutyConnector(config as unknown as PagerDutyConnectorConfig),
  'google-calendar': (config) => createGoogleCalendarConnector(config as unknown as GoogleCalendarConnectorConfig),
  'google-chat': (config) => createGoogleChatConnector(config as unknown as GoogleChatConnectorConfig),
  voice: (config) => createVoiceConnector(config as unknown as VoiceConnectorConfig),
  support: (config) => {
    if (!config.baseUrl) return null;
    return createSupportConnector(config as unknown as Parameters<typeof createSupportConnector>[0]);
  },
  document: (config) => createDocumentConnector(config as unknown as DocumentConnectorConfig),
  'generic-app': (config) => createGenericAppConnector(config as unknown as GenericAppConnectorConfig),
};

/**
 * Load active connectors from the org_connectors table, filtered by type.
 * Resolves each row into a NexusConnector instance via the factory.
 */
async function loadOrgConnectors(
  supabase: SupabaseClient,
  organizationId: string,
  allowedTypes: string[],
): Promise<NexusConnector[]> {
  const { data: rows, error } = await supabase
    .from('org_connectors')
    .select('id, connector_type, config, status')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .in('connector_type', allowedTypes);

  if (error || !rows) return [];

  const connectors: NexusConnector[] = [];
  for (const row of rows) {
    const factory = CONNECTOR_FACTORIES[row.connector_type];
    if (!factory) continue;
    try {
      const connector = factory(row.config || {});
      if (connector) connectors.push(connector);
    } catch {
      // Skip connectors that fail to instantiate (bad config)
    }
  }

  return connectors;
}

/**
 * Core sync execution — shared by all 5 domain agents.
 *
 * 1. Loads connectors from org_connectors for the given types
 * 2. Creates a SyncManager
 * 3. Runs syncAll() (incremental if cursor exists, full otherwise)
 * 4. Aggregates results into ConnectorSyncOutput
 */
async function executeDomainSync(
  supabase: SupabaseClient,
  organizationId: string,
  connectorTypes: string[],
  filterTypes?: string[],
): Promise<ConnectorSyncOutput> {
  const startMs = Date.now();

  // If caller provided a filter, intersect with the domain's allowed types
  const typesToLoad = filterTypes
    ? connectorTypes.filter(t => filterTypes.includes(t))
    : connectorTypes;

  if (typesToLoad.length === 0) {
    return {
      connectorsProcessed: 0,
      signalsGenerated: 0,
      errors: [],
      domainsCovered: [],
      duration_ms: Date.now() - startMs,
    };
  }

  const connectors = await loadOrgConnectors(supabase, organizationId, typesToLoad);

  if (connectors.length === 0) {
    return {
      connectorsProcessed: 0,
      signalsGenerated: 0,
      errors: [],
      domainsCovered: [],
      duration_ms: Date.now() - startMs,
    };
  }

  const syncManager = createSyncManager({ connectors });
  const results: ConnectorSyncResult[] = await syncManager.syncAll(supabase, organizationId);

  // Aggregate
  const errors: string[] = [];
  let totalSignals = 0;
  const domainSet = new Set<string>();

  for (const result of results) {
    totalSignals += result.signalsGenerated;
    if (!result.success) {
      errors.push(...result.errors);
    }
  }
  for (const c of connectors) {
    domainSet.add(c.domain);
  }

  return {
    connectorsProcessed: connectors.length,
    signalsGenerated: totalSignals,
    errors,
    domainsCovered: Array.from(domainSet),
    duration_ms: Date.now() - startMs,
  };
}

// ============================================================================
// AGENT 1: BRAIN-REVENUE-SYNC — HubSpot + Stripe
// ============================================================================

/**
 * Revenue Sync Agent — Pulls deals, payments, and revenue signals
 *
 * Connectors: HubSpot (deals, pipeline stages), Stripe (payments, subscriptions, MRR)
 * Domains: revenue, finance
 * Trigger: org-updater heartbeat, manual command, or autonomous schedule
 */
export const brainRevenueSyncAgent: AgentDefinition<ConnectorSyncInput, ConnectorSyncOutput> = defineAgent({
  name: 'brain-revenue-sync',
  description: 'Syncs revenue data (HubSpot deals, Stripe payments/subscriptions) into the org brain',
  level: 'task',
  version: '1.0.0',
  domains: ['revenue', 'finance'],
  triggers: ['agent:org-updater', 'command:sync_revenue', 'manual'],
  tools: [],
  timeoutMs: 300_000,
  tags: ['brain-native', 'connector', 'sync', 'revenue', 'v8'],

  execute: async (input: ConnectorSyncInput, ctx) => {
    ctx.reportProgress(0.1, 'Loading revenue connectors (HubSpot, Stripe)...');

    // Access supabase from the execution context
    const supabase = (ctx as unknown as { supabase: SupabaseClient }).supabase;
    if (!supabase) {
      return {
        connectorsProcessed: 0,
        signalsGenerated: 0,
        errors: ['Supabase client not available in execution context'],
        domainsCovered: [],
        duration_ms: 0,
      };
    }

    ctx.reportProgress(0.3, 'Syncing revenue connectors...');
    const result = await executeDomainSync(
      supabase,
      input.organizationId,
      ['hubspot', 'stripe'],
      input.connectorTypes,
    );

    ctx.reportProgress(1.0, `Revenue sync complete: ${result.signalsGenerated} signals from ${result.connectorsProcessed} connectors`);
    return result;
  },
});

// ============================================================================
// AGENT 2: BRAIN-ENGINEERING-SYNC — GitHub + Jira
// ============================================================================

/**
 * Engineering Sync Agent — Pulls commits, PRs, issues, and velocity metrics
 *
 * Connectors: GitHub (commits, PRs, CI), Jira (issues, sprints, velocity)
 * Domains: engineering
 * Trigger: org-updater heartbeat, manual command
 */
export const brainEngineeringSyncAgent: AgentDefinition<ConnectorSyncInput, ConnectorSyncOutput> = defineAgent({
  name: 'brain-engineering-sync',
  description: 'Syncs engineering data (GitHub commits/PRs, Jira issues/sprints) into the org brain',
  level: 'task',
  version: '1.0.0',
  domains: ['engineering'],
  triggers: ['agent:org-updater', 'command:sync_engineering', 'manual'],
  tools: [],
  timeoutMs: 300_000,
  tags: ['brain-native', 'connector', 'sync', 'engineering', 'v8'],

  execute: async (input: ConnectorSyncInput, ctx) => {
    ctx.reportProgress(0.1, 'Loading engineering connectors (GitHub, Jira)...');

    const supabase = (ctx as unknown as { supabase: SupabaseClient }).supabase;
    if (!supabase) {
      return {
        connectorsProcessed: 0,
        signalsGenerated: 0,
        errors: ['Supabase client not available in execution context'],
        domainsCovered: [],
        duration_ms: 0,
      };
    }

    ctx.reportProgress(0.3, 'Syncing engineering connectors...');
    const result = await executeDomainSync(
      supabase,
      input.organizationId,
      ['github', 'jira'],
      input.connectorTypes,
    );

    ctx.reportProgress(1.0, `Engineering sync complete: ${result.signalsGenerated} signals from ${result.connectorsProcessed} connectors`);
    return result;
  },
});

// ============================================================================
// AGENT 3: BRAIN-COMMUNICATION-SYNC — Slack + Google Chat + Voice
// ============================================================================

/**
 * Communication Sync Agent — Pulls messaging, call, and collaboration signals
 *
 * Connectors: Slack (messages, reactions, threads), Google Chat (messages), Voice (calls)
 * Domains: communication, cs
 * Trigger: org-updater heartbeat, manual command
 */
export const brainCommunicationSyncAgent: AgentDefinition<ConnectorSyncInput, ConnectorSyncOutput> = defineAgent({
  name: 'brain-communication-sync',
  description: 'Syncs communication data (Slack, Google Chat, Voice calls) into the org brain',
  level: 'task',
  version: '1.0.0',
  domains: ['communication', 'cs'],
  triggers: ['agent:org-updater', 'command:sync_communication', 'manual'],
  tools: [],
  timeoutMs: 300_000,
  tags: ['brain-native', 'connector', 'sync', 'communication', 'v8'],

  execute: async (input: ConnectorSyncInput, ctx) => {
    ctx.reportProgress(0.1, 'Loading communication connectors (Slack, Google Chat, Voice)...');

    const supabase = (ctx as unknown as { supabase: SupabaseClient }).supabase;
    if (!supabase) {
      return {
        connectorsProcessed: 0,
        signalsGenerated: 0,
        errors: ['Supabase client not available in execution context'],
        domainsCovered: [],
        duration_ms: 0,
      };
    }

    ctx.reportProgress(0.3, 'Syncing communication connectors...');
    const result = await executeDomainSync(
      supabase,
      input.organizationId,
      ['slack', 'google-chat', 'voice'],
      input.connectorTypes,
    );

    ctx.reportProgress(1.0, `Communication sync complete: ${result.signalsGenerated} signals from ${result.connectorsProcessed} connectors`);
    return result;
  },
});

// ============================================================================
// AGENT 4: BRAIN-OPERATIONS-SYNC — PagerDuty + Support
// ============================================================================

/**
 * Operations Sync Agent — Pulls incident, alert, and support ticket signals
 *
 * Connectors: PagerDuty (incidents, alerts, on-call), Support (tickets, CSAT)
 * Domains: operations, cs
 * Trigger: org-updater heartbeat, manual command
 */
export const brainOperationsSyncAgent: AgentDefinition<ConnectorSyncInput, ConnectorSyncOutput> = defineAgent({
  name: 'brain-operations-sync',
  description: 'Syncs operations data (PagerDuty incidents, Support tickets) into the org brain',
  level: 'task',
  version: '1.0.0',
  domains: ['operations', 'cs'],
  triggers: ['agent:org-updater', 'command:sync_operations', 'manual'],
  tools: [],
  timeoutMs: 300_000,
  tags: ['brain-native', 'connector', 'sync', 'operations', 'v8'],

  execute: async (input: ConnectorSyncInput, ctx) => {
    ctx.reportProgress(0.1, 'Loading operations connectors (PagerDuty, Support)...');

    const supabase = (ctx as unknown as { supabase: SupabaseClient }).supabase;
    if (!supabase) {
      return {
        connectorsProcessed: 0,
        signalsGenerated: 0,
        errors: ['Supabase client not available in execution context'],
        domainsCovered: [],
        duration_ms: 0,
      };
    }

    ctx.reportProgress(0.3, 'Syncing operations connectors...');
    const result = await executeDomainSync(
      supabase,
      input.organizationId,
      ['pagerduty', 'support'],
      input.connectorTypes,
    );

    ctx.reportProgress(1.0, `Operations sync complete: ${result.signalsGenerated} signals from ${result.connectorsProcessed} connectors`);
    return result;
  },
});

// ============================================================================
// AGENT 5: BRAIN-PRODUCTIVITY-SYNC — Google Calendar + Document + Generic App
// ============================================================================

/**
 * Productivity Sync Agent — Pulls calendar, document, and custom app signals
 *
 * Connectors: Google Calendar (events, meetings), Document (file changes), Generic App (custom)
 * Domains: product, strategy
 * Trigger: org-updater heartbeat, manual command
 */
export const brainProductivitySyncAgent: AgentDefinition<ConnectorSyncInput, ConnectorSyncOutput> = defineAgent({
  name: 'brain-productivity-sync',
  description: 'Syncs productivity data (Google Calendar, Documents, custom apps) into the org brain',
  level: 'task',
  version: '1.0.0',
  domains: ['product', 'strategy'],
  triggers: ['agent:org-updater', 'command:sync_productivity', 'manual'],
  tools: [],
  timeoutMs: 300_000,
  tags: ['brain-native', 'connector', 'sync', 'productivity', 'v8'],

  execute: async (input: ConnectorSyncInput, ctx) => {
    ctx.reportProgress(0.1, 'Loading productivity connectors (Calendar, Document, Generic)...');

    const supabase = (ctx as unknown as { supabase: SupabaseClient }).supabase;
    if (!supabase) {
      return {
        connectorsProcessed: 0,
        signalsGenerated: 0,
        errors: ['Supabase client not available in execution context'],
        domainsCovered: [],
        duration_ms: 0,
      };
    }

    ctx.reportProgress(0.3, 'Syncing productivity connectors...');
    const result = await executeDomainSync(
      supabase,
      input.organizationId,
      ['google-calendar', 'document', 'generic-app'],
      input.connectorTypes,
    );

    ctx.reportProgress(1.0, `Productivity sync complete: ${result.signalsGenerated} signals from ${result.connectorsProcessed} connectors`);
    return result;
  },
});

// ============================================================================
// ALL CONNECTOR SYNC AGENTS
// ============================================================================

/** All 5 connector sync agents for brain-agent registry */
export const ALL_CONNECTOR_SYNC_AGENTS: AgentDefinition[] = [
  brainRevenueSyncAgent as AgentDefinition,
  brainEngineeringSyncAgent as AgentDefinition,
  brainCommunicationSyncAgent as AgentDefinition,
  brainOperationsSyncAgent as AgentDefinition,
  brainProductivitySyncAgent as AgentDefinition,
];

/**
 * Register all 5 connector sync agents into an agent registry.
 *
 * @example
 * ```typescript
 * const agentRegistry = createAgentRegistry({ verbose: true });
 * registerConnectorSyncAgents(agentRegistry);
 * // 5 connector sync agents now registered
 * ```
 */
export function registerConnectorSyncAgents(
  registry: { register: (def: AgentDefinition) => void },
): void {
  for (const agent of ALL_CONNECTOR_SYNC_AGENTS) {
    registry.register(agent);
  }
}
