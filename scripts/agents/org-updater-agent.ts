/**
 * Org Updater Agent — Organization Brain Heartbeat
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Brain Region: **Thalamus** (Sensory Relay Station)
 * Neurological Function: Routes external data from ALL connected integrations
 * into the organization's brain, then triggers learning cycles to process it.
 *
 * This agent is the **heartbeat** of each org's brain. Without it, an org's
 * brain would be alive (bootstrapped by org-creation-agent) but dormant —
 * no new data flowing in, no learning happening, no patterns discovered.
 *
 * What It Does:
 * ─────────────
 * 1. **FETCH**: Reads org_connectors → instantiates active connectors → syncs ALL
 *    via the existing SyncManager (incremental if cursor exists, full otherwise)
 * 2. **CONVERT**: Aggregates sync stats into an org heartbeat signal
 * 3. **TRAIN**: If enough new signals, triggers autonomous learning cycle
 *    + mini-consolidation for heavy signal volumes
 * 4. **VALIDATE**: Checks brain health (training logs, causal edge integrity)
 * 5. **REPORT**: Summary of connectors synced, signals generated, patterns discovered
 *
 * Schedule: Every 4 hours (staggered per org by the orchestrator)
 * Trigger: Also callable via the orchestrator's per-org scheduling
 *
 * Reuses:
 * - connector-framework.ts → NexusConnector interface
 * - sync-manager.ts → createSyncManager() for cursor-tracked sync
 * - All 13 createXxxConnector() factories
 * - autonomous-learner.ts → runLearningCycle() for pattern discovery
 * - consolidation-engine.ts → consolidate() for sleep-cycle learning
 *
 * @packageDocumentation
 */

import {
  ManusNativeAgent,
  type ManusCapabilitiesConfig,
} from '../agent-framework/brain-native-agent-v5-manus';
import type { BrainNativeAgentConfig } from '../agent-framework/brain-native-agent-template';
import type {
  FetchResult,
  ConvertResult,
  TrainResult,
} from '../agent-framework/base-training-agent';
// ── Memory-Stack imports via barrel (public API) ────────────────────────────
import {
  // Motor commands
  type MotorCommand,
  // Sync
  createSyncManager,
  storeConnectorSignals,
  type NexusConnector,
  type ConnectorSignal,
  type ConnectorSyncResult,
  // Training
  type TrainingPack,
  // Connector Factories (all 12)
  createHubSpotConnector,
  createStripeConnector,
  createGitHubConnector,
  type GitHubConnectorConfig,
  createJiraConnector,
  type JiraConnectorConfig,
  createSlackConnector,
  type SlackConnectorConfig,
  createPagerDutyConnector,
  type PagerDutyConnectorConfig,
  createGoogleCalendarConnector,
  type GoogleCalendarConnectorConfig,
  createGoogleChatConnector,
  type GoogleChatConnectorConfig,
  createVoiceConnector,
  type VoiceConnectorConfig,
  createSupportConnector,
  createDocumentConnector,
  type DocumentConnectorConfig,
  createGenericAppConnector,
  type GenericAppConnectorConfig,
  // Learning Systems
  createSupabaseRepository,
  createAutonomousLearner,
  createConsolidationEngine,
} from '@nexus-ai/memory-stack';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Minimum signals in last cycle to trigger autonomous learning */
const LEARNING_SIGNAL_THRESHOLD = 50;

/** Minimum signals in last cycle to trigger mini-consolidation */
const CONSOLIDATION_SIGNAL_THRESHOLD = 500;

/** Hours to look back for recent signals */
const SIGNAL_LOOKBACK_HOURS = 4;

// ============================================================================
// CONNECTOR FACTORY
// ============================================================================

/**
 * Create a NexusConnector instance from an org_connectors row.
 * Maps connector_type to the appropriate factory function.
 *
 * Returns null if the connector type is unknown or creation fails.
 */
function createConnectorFromConfig(
  connectorType: string,
  config: Record<string, unknown>,
): NexusConnector | null {
  try {
    switch (connectorType) {
      case 'hubspot':
        return createHubSpotConnector(config.apiKey as string);
      case 'stripe':
        return createStripeConnector(config.apiKey as string);
      case 'github':
        return createGitHubConnector(config as unknown as GitHubConnectorConfig);
      case 'jira':
        return createJiraConnector(config as unknown as JiraConnectorConfig);
      case 'slack':
        return createSlackConnector(config as unknown as SlackConnectorConfig) as unknown as NexusConnector;
      case 'pagerduty':
        return createPagerDutyConnector(config as unknown as PagerDutyConnectorConfig);
      case 'google-calendar':
        return createGoogleCalendarConnector(config as unknown as GoogleCalendarConnectorConfig) as unknown as NexusConnector;
      case 'google-chat':
        return createGoogleChatConnector(config as unknown as GoogleChatConnectorConfig) as unknown as NexusConnector;
      case 'voice':
        return createVoiceConnector(config as unknown as VoiceConnectorConfig) as unknown as NexusConnector;
      case 'support':
        return createSupportConnector(config as any);
      case 'document':
        return createDocumentConnector(config as unknown as DocumentConnectorConfig);
      case 'generic-app':
        return createGenericAppConnector(config as unknown as GenericAppConnectorConfig) as unknown as NexusConnector;
      default:
        return null;
    }
  } catch (err) {
    console.warn(`[OrgUpdater] Failed to create connector "${connectorType}":`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ============================================================================
// FETCH DATA SHAPE
// ============================================================================

interface OrgUpdaterFetchData {
  syncResults: ConnectorSyncResult[];
  activeConnectors: number;
  connectorTypes: string[];
  domainsCovered: string[];
}

// ============================================================================
// ORG UPDATER AGENT
// ============================================================================

class OrgUpdaterAgent extends ManusNativeAgent {
  readonly name = 'org-updater';
  readonly version = '7.0.0';
  readonly description = 'Org Heartbeat — Syncs connected integrations, triggers learning cycles, ensures per-org brain health';
  readonly brainRegion = 'Thalamus';
  readonly neurologicalFunction = 'Sensory relay — routes integration data into org brain, triggers learning cycles';

  constructor(config: BrainNativeAgentConfig & ManusCapabilitiesConfig) {
    super({
      ...config,
      enableMotorCommands: true,
      enableCalibration: true,
      enableAgentRegistry: true,
      motorCommandAutoExecuteThreshold: 0.95,  // High confidence for org heartbeat notifications
    });
  }

  // Store last fetch result for motor command generation
  private lastFetchResult?: FetchResult;

  // ──────────────────────────────────────────────────────────────────────────
  // FETCH: Read org_connectors → create connectors → sync all via SyncManager
  // ──────────────────────────────────────────────────────────────────────────
  async fetch(): Promise<FetchResult> {
    this._log('FETCH', `Fetching connectors for org ${this.organizationId}`);

    // 1. Get active connectors for this org
    const { data: connectorRows, error } = await this.supabase
      .from('org_connectors')
      .select('id, connector_type, config, status, signals_count')
      .eq('organization_id', this.organizationId)
      .eq('status', 'active');

    if (error) {
      this.errors.push(`Failed to fetch org_connectors: ${error.message}`);
      const emptyData: OrgUpdaterFetchData = { syncResults: [], activeConnectors: 0, connectorTypes: [], domainsCovered: [] };
      return { data: emptyData, sources: [], recordCount: 0 };
    }

    if (!connectorRows || connectorRows.length === 0) {
      this._log('FETCH', 'No active connectors configured for this org');
      const emptyData: OrgUpdaterFetchData = { syncResults: [], activeConnectors: 0, connectorTypes: [], domainsCovered: [] };
      return { data: emptyData, sources: ['org_connectors'], recordCount: 0 };
    }

    this._log('FETCH', `Found ${connectorRows.length} active connector(s): ${connectorRows.map((c: any) => c.connector_type).join(', ')}`);

    // 2. Create connector instances
    const connectors: NexusConnector[] = [];
    const connectorTypes: string[] = [];
    const domainsCovered = new Set<string>();

    for (const row of connectorRows) {
      const connector = createConnectorFromConfig(row.connector_type, row.config || {});
      if (connector) {
        connectors.push(connector);
        connectorTypes.push(row.connector_type);
        domainsCovered.add(connector.domain);
      } else {
        this._log('FETCH', `  - Skipped "${row.connector_type}" — factory returned null or failed`);
      }
    }

    if (connectors.length === 0) {
      this._log('FETCH', 'No connectors could be instantiated (check configs)');
      const emptyData: OrgUpdaterFetchData = { syncResults: [], activeConnectors: 0, connectorTypes, domainsCovered: [...domainsCovered] };
      return { data: emptyData, sources: ['org_connectors'], recordCount: 0 };
    }

    // 3. Create sync manager and run sync for all connectors
    // SyncManager handles cursor tracking: uses incremental sync if cursor exists, full sync otherwise
    const syncManager = createSyncManager({ connectors });
    this._log('FETCH', `Syncing ${connectors.length} connector(s) via SyncManager...`);

    const syncResults = await syncManager.syncAll(this.supabase, this.organizationId);

    // 4. Update org_connectors with sync results
    let totalSignals = 0;
    for (let i = 0; i < connectorRows.length && i < syncResults.length; i++) {
      const row = connectorRows[i];
      const result = syncResults[i];
      if (result) {
        totalSignals += result.signalsGenerated;
        try {
          await this.supabase
            .from('org_connectors')
            .update({
              last_sync_at: new Date().toISOString(),
              signals_count: (row.signals_count || 0) + result.signalsGenerated,
              status: result.success ? 'active' : 'error',
            })
            .eq('id', row.id);
        } catch {
          // Non-fatal: continue even if update fails
        }
      }
    }

    this._log('FETCH', `Sync complete: ${totalSignals} total signals generated across ${connectors.length} connectors`);

    const fetchData: OrgUpdaterFetchData = {
      syncResults,
      activeConnectors: connectors.length,
      connectorTypes,
      domainsCovered: [...domainsCovered],
    };

    const result = {
      data: fetchData,
      sources: connectorTypes.map(t => `connector:${t}`),
      recordCount: totalSignals,
    };

    // Store for motor command generation
    this.lastFetchResult = result;

    return result;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CONVERT: Signals already stored by connectors — emit heartbeat signal
  // ──────────────────────────────────────────────────────────────────────────
  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    const data = fetchResult.data as OrgUpdaterFetchData;
    const signals: ConnectorSignal[] = [];
    const packs: TrainingPack[] = [];

    // Calculate success rate
    const successCount = data.syncResults.filter(r => r.success).length;
    const successRate = data.activeConnectors > 0 ? successCount / data.activeConnectors : 0;

    // Total signals generated
    const totalSignals = data.syncResults.reduce((sum, r) => sum + r.signalsGenerated, 0);
    const totalErrors = data.syncResults.reduce((sum, r) => sum + r.errors.length, 0);

    // Emit org heartbeat signal (tracks org brain vitality over time)
    signals.push({
      organization_id: this.organizationId,
      source_domain: 'system',
      signal_type: 'org_heartbeat',
      signal_value: successRate,
      entity_type: 'organization',
      entity_id: this.organizationId,
      metadata: {
        connectorsSynced: data.activeConnectors,
        totalSignals,
        totalErrors,
        domainsCovered: data.domainsCovered,
        connectorTypes: data.connectorTypes,
        timestamp: new Date().toISOString(),
      },
    });

    // If we had errors, emit an error signal for monitoring
    if (totalErrors > 0) {
      signals.push({
        organization_id: this.organizationId,
        source_domain: 'system',
        signal_type: 'connector_sync_errors',
        signal_value: totalErrors,
        entity_type: 'organization',
        entity_id: this.organizationId,
        metadata: {
          errors: data.syncResults
            .filter(r => r.errors.length > 0)
            .flatMap(r => r.errors),
        },
      });
    }

    this._log('CONVERT', `Generated ${signals.length} system signals (heartbeat${totalErrors > 0 ? ' + error alerts' : ''})`);
    return { signals, packs };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TRAIN: Trigger autonomous learning if enough new signals
  // ──────────────────────────────────────────────────────────────────────────
  async train(signals: ConnectorSignal[], packs: TrainingPack[]): Promise<TrainResult> {
    // First, store the heartbeat signals via the base class
    const baseResult = await super.train(signals, packs);

    // Now check if we should trigger autonomous learning
    const lookbackTime = new Date(Date.now() - SIGNAL_LOOKBACK_HOURS * 60 * 60 * 1000);

    const { count, error: countError } = await this.supabase
      .from('cross_domain_signals')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', this.organizationId)
      .gte('created_at', lookbackTime.toISOString());

    const recentSignalCount = count || 0;

    if (countError) {
      this._log('TRAIN', `Warning: Could not count recent signals: ${countError.message}`);
      return baseResult;
    }

    this._log('TRAIN', `Recent signals (last ${SIGNAL_LOOKBACK_HOURS}h): ${recentSignalCount}`);

    // Trigger autonomous learning if we have enough signals
    if (recentSignalCount >= LEARNING_SIGNAL_THRESHOLD) {
      this._log('TRAIN', `Signal count ${recentSignalCount} >= ${LEARNING_SIGNAL_THRESHOLD} — triggering autonomous learning cycle`);
      try {
        const repo = createSupabaseRepository(this.supabase);
        const learner = createAutonomousLearner({
          repository: repo,
          organizationId: this.organizationId,
          config: {
            minPatternObservations: 5,
            anomalyThreshold: 2.5,
            maxPatternsPerCycle: 50,
          },
        });

        const learningResult = await learner.runLearningCycle();
        baseResult.discoveries += learningResult?.memoriesCreated ?? 0;
        this._log('TRAIN', `Learning cycle complete: ${learningResult?.memoriesCreated ?? 0} memories, ${learningResult?.patternsRegistered ?? 0} patterns`);
      } catch (err) {
        this._logError('TRAIN', 'Autonomous learning cycle failed', err);
        this.errors.push(`Learning cycle failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      this._log('TRAIN', `Signal count ${recentSignalCount} < ${LEARNING_SIGNAL_THRESHOLD} — skipping learning cycle`);
    }

    // Trigger mini-consolidation if we have lots of signals
    if (recentSignalCount >= CONSOLIDATION_SIGNAL_THRESHOLD) {
      this._log('TRAIN', `Signal count ${recentSignalCount} >= ${CONSOLIDATION_SIGNAL_THRESHOLD} — triggering mini-consolidation`);
      try {
        const repo = createSupabaseRepository(this.supabase);
        const engine = createConsolidationEngine(repo, this.organizationId);
        const consolidationResult = await engine.consolidate();
        this._log('TRAIN', `Mini-consolidation complete: ${consolidationResult?.report?.summary ?? 'OK'}`);
      } catch (err) {
        this._logError('TRAIN', 'Mini-consolidation failed', err);
        this.errors.push(`Consolidation failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return baseResult;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MOTOR COMMANDS: Notify via Slack when org heartbeat completes
  // ──────────────────────────────────────────────────────────────────────────
  protected async generateMotorCommands(trainResult: TrainResult): Promise<MotorCommand[]> {
    const commands: MotorCommand[] = [];

    // Get sync summary from last fetch
    const fetchData = this.lastFetchResult?.data as OrgUpdaterFetchData | undefined;

    if (!fetchData) {
      return commands;
    }

    const totalSignals = fetchData.syncResults.reduce((sum, r) => sum + r.signalsGenerated, 0);
    const totalErrors = fetchData.syncResults.reduce((sum, r) => sum + r.errors.length, 0);
    const successCount = fetchData.syncResults.filter(r => r.success).length;

    // Only notify if we have significant activity or errors
    if (totalSignals > 0 || totalErrors > 0) {
      // Slack notification
      if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID) {
        const message = totalErrors > 0
          ? `🔄 Org Heartbeat: Synced ${fetchData.activeConnectors} connectors, ${totalSignals} signals, ⚠️ ${totalErrors} errors`
          : `✅ Org Heartbeat: Synced ${fetchData.activeConnectors} connectors, ${totalSignals} new signals across ${fetchData.domainsCovered.length} domains`;

        commands.push({
          commandId: `org-heartbeat-slack-${Date.now()}`,
          organizationId: this.organizationId,
          actionType: 'slack_send_message',
          target: process.env.SLACK_CHANNEL_ID,
          payload: {
            text: message,
            metadata: {
              connectorTypes: fetchData.connectorTypes,
              domainsCovered: fetchData.domainsCovered,
              discoveries: trainResult.discoveries,
            },
          },
          priority: totalErrors > 0 ? 'high' : 'normal',
          requiresApproval: false,
          createdAt: new Date(),
        });
      }
    }

    return commands;
  }

  // ── Logging helpers ─────────────────────────────────────────────────────
  private _log(stage: string, message: string): void {
    const time = new Date().toISOString().substring(11, 19);
    const orgLabel = this.organizationId.substring(0, 8);
    console.log(`[${time}] [OrgUpdater:${orgLabel}] [${stage}] ${message}`);
  }

  private _logError(stage: string, message: string, err?: unknown): void {
    const time = new Date().toISOString().substring(11, 19);
    const orgLabel = this.organizationId.substring(0, 8);
    console.error(`[${time}] [OrgUpdater:${orgLabel}] [${stage}] ERROR: ${message}`);
    if (err instanceof Error) {
      console.error(`  ${err.message}`);
    }
  }
}

// ============================================================================
// SELF-REGISTRATION: Auto-register to globalRegistry on import
// ============================================================================

import { globalRegistry } from '../agent-framework/agent-registry';

globalRegistry.register({
  name: 'org-updater',
  description: 'Org Heartbeat — Syncs all connected integrations, triggers learning cycles, ensures per-org brain health',
  version: '7.0.0',
  factory: (config) => {
    return new OrgUpdaterAgent(config) as any;
  },
  schedule: '0 */4 * * *',  // Every 4 hours
  resourceRequirements: { cpu: '1024', memory: '4096' },
  tags: ['org-maintenance', 'thalamus', 'connector-sync', 'learning-trigger', 'heartbeat'],
});
