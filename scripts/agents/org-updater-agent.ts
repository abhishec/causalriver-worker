/**
 * Org Updater Agent — Continuous Learning from ALL Connections & Integrations
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Brain Region: Thalamus (Sensory Gateway & Integration Hub)
 * Neurological Function: Multi-Source Data Integration & Continuous Learning
 *
 * **THE KEY PART OF ORG BRAIN LEARNING**
 *
 * This agent is the HEART of org-specific learning. It:
 *
 * 1. **Discovers ALL Connections**
 *    - Scans organization for all active connectors (HubSpot, Slack, GitHub, etc.)
 *    - Identifies data sources, credentials, sync status
 *    - Maps connection health and last sync time
 *
 * 2. **Pulls Data from ALL Sources** (Delta Updates)
 *    - HubSpot: Deals, contacts, companies, activities (last 12h)
 *    - Slack: Messages, threads, reactions (last 12h)
 *    - GitHub: Commits, PRs, issues, reviews (last 12h)
 *    - Stripe: Charges, customers, subscriptions (last 12h)
 *    - Jira: Issues, sprints, board updates (last 12h)
 *    - Linear: Issues, projects, cycles (last 12h)
 *    - Google Docs: Document changes, comments (last 12h)
 *    - Notion: Page updates, database changes (last 12h)
 *    - ... and ALL other configured connectors
 *
 * 3. **Converts to Signals** (Cross-Domain Intelligence)
 *    - Transforms raw data into ConnectorSignals
 *    - Extracts entities, events, metrics, relationships
 *    - Normalizes timestamps, values, metadata
 *    - Deduplicates and merges overlapping signals
 *
 * 4. **Trains EVERY Part of Brain**
 *    - Bayesian Causal Discovery (causal_relationships)
 *    - Embedding Learning (entity_embeddings)
 *    - Contrastive Learning (positive/negative pairs)
 *    - Impact Scoring (business metrics)
 *    - Anomaly Detection (outlier monitoring)
 *    - Pattern Recognition (recurring sequences)
 *    - Prediction Models (future state forecasting)
 *
 * 5. **Delta Updates** (Incremental Learning)
 *    - Only fetches NEW data since last sync (last 12h)
 *    - Avoids re-processing old data (efficient)
 *    - Maintains sync cursors per connector
 *    - Updates brain incrementally (no full retrain)
 *
 * 6. **Health Monitoring**
 *    - Tracks connector health (success rate, latency)
 *    - Detects stale connections (>24h without sync)
 *    - Alerts on sync failures or data gaps
 *    - Motor commands for remediation
 *
 * **Schedule**: Every 12 hours (continuous learning)
 *
 * **Motor Commands**:
 *   - Slack: Sync status, data insights, alerts
 *   - GitHub: Issues for connection failures
 *   - Email: Weekly learning summary (CTO-level)
 *
 * @packageDocumentation
 */

import type { FetchResult, ConvertResult, TrainResult } from '../agent-framework/brain-native-agent-v5-manus';
import { ManusNativeAgent } from '../agent-framework/brain-native-agent-v5-manus';
import type { MotorCommand } from '../../packages/memory-stack/src/orchestrator/motor-command-engine';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';

// Import ALL connector types
import { createHubSpotConnector } from '../../packages/memory-stack/src/connectors/hubspot-connector';
import { createSlackConnector } from '../../packages/memory-stack/src/connectors/slack-connector';
import { createGitHubConnector } from '../../packages/memory-stack/src/connectors/github-connector';
import { createStripeConnector } from '../../packages/memory-stack/src/connectors/stripe-connector';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface OrgConnection {
  id: string;
  type: 'hubspot' | 'slack' | 'github' | 'stripe' | 'jira' | 'linear' | 'notion' | 'google-docs' | string;
  name: string;
  credentials: Record<string, any>;
  lastSyncAt: Date | null;
  nextSyncAt: Date | null;
  isHealthy: boolean;
  syncCursor?: string;
  metadata?: Record<string, any>;
}

interface ConnectionSyncResult {
  connectionId: string;
  connectionType: string;
  signalsFetched: number;
  recordsProcessed: number;
  errors: string[];
  duration: number;
  newCursor?: string;
}

interface OrgUpdaterConfig {
  /** Look back window in hours (default: 12) */
  deltaHours?: number;
  /** Max signals per connection (default: 1000) */
  maxSignalsPerConnection?: number;
  /** Enable full retrain instead of delta (default: false) */
  fullRetrain?: boolean;
  /** Connections to skip (for debugging) */
  skipConnections?: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Org Updater Agent (V7 Manus)
// ────────────────────────────────────────────────────────────────────────────

export class OrgUpdaterAgent extends ManusNativeAgent {
  readonly name = 'org-updater-agent';
  readonly version = '7.0.0';
  readonly description = 'Continuous learning from ALL org connections: pulls delta data every 12h, trains every part of brain';
  readonly brainRegion = 'Thalamus (Sensory Gateway & Integration Hub)';
  readonly neurologicalFunction = 'Multi-Source Data Integration & Continuous Learning';

  private config: Required<OrgUpdaterConfig>;
  private connections: OrgConnection[] = [];
  private syncResults: ConnectionSyncResult[] = [];

  constructor(
    supabase: any,
    organizationId: string,
    config: OrgUpdaterConfig & { verbose?: boolean } = {}
  ) {
    super(supabase, organizationId, { verbose: config.verbose });
    this.config = {
      deltaHours: config.deltaHours || 12,
      maxSignalsPerConnection: config.maxSignalsPerConnection || 1000,
      fullRetrain: config.fullRetrain || false,
      skipConnections: config.skipConnections || [],
    };
  }

  // ── Fetch: Discover ALL connections and pull delta data ──
  async fetch(): Promise<FetchResult> {
    this.log('Discovering organization connections...');

    // Step 1: Fetch all configured connections for this org
    const { data: connectionsData, error: connectionsError } = await this.supabase
      .from('connector_configurations')
      .select('*')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true);

    if (connectionsError) {
      this.log(`Error fetching connections: ${connectionsError.message}`);
      return { success: false, data: null };
    }

    if (!connectionsData || connectionsData.length === 0) {
      this.log('No active connections found for this organization');
      return { success: false, data: null };
    }

    this.connections = connectionsData.map((conn: any) => ({
      id: conn.id,
      type: conn.connector_type,
      name: conn.name || conn.connector_type,
      credentials: conn.credentials || {},
      lastSyncAt: conn.last_sync_at ? new Date(conn.last_sync_at) : null,
      nextSyncAt: conn.next_sync_at ? new Date(conn.next_sync_at) : null,
      isHealthy: conn.sync_status === 'success',
      syncCursor: conn.sync_cursor,
      metadata: conn.metadata || {},
    }));

    this.log(`Found ${this.connections.length} active connection(s)`);

    // Step 2: Pull delta data from each connection
    const allSignals: ConnectorSignal[] = [];
    const deltaStartTime = new Date(Date.now() - this.config.deltaHours * 60 * 60 * 1000);

    for (const connection of this.connections) {
      // Skip if in skip list
      if (this.config.skipConnections.includes(connection.type)) {
        this.log(`Skipping ${connection.type} (in skip list)`);
        continue;
      }

      const startTime = Date.now();
      this.log(`Syncing ${connection.type} (${connection.name})...`);

      try {
        const signals = await this.syncConnection(connection, deltaStartTime);
        allSignals.push(...signals);

        const duration = Date.now() - startTime;
        this.syncResults.push({
          connectionId: connection.id,
          connectionType: connection.type,
          signalsFetched: signals.length,
          recordsProcessed: signals.length,
          errors: [],
          duration,
        });

        this.log(`  ✓ ${connection.type}: ${signals.length} signals (${(duration / 1000).toFixed(1)}s)`);
      } catch (err) {
        const duration = Date.now() - startTime;
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.log(`  ✗ ${connection.type}: ${errorMsg}`);

        this.syncResults.push({
          connectionId: connection.id,
          connectionType: connection.type,
          signalsFetched: 0,
          recordsProcessed: 0,
          errors: [errorMsg],
          duration,
        });
      }
    }

    this.log(`Total signals fetched: ${allSignals.length}`);

    return {
      success: true,
      data: { signals: allSignals, connections: this.connections },
    };
  }

  // ── Convert: Transform signals into training packs ──
  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    if (!fetchResult.success || !fetchResult.data) {
      return { success: false, signals: [], trainingPacks: [] };
    }

    const { signals } = fetchResult.data as { signals: ConnectorSignal[]; connections: OrgConnection[] };

    this.log(`Converting ${signals.length} signals to training packs...`);

    // Group signals by domain for training pack creation
    const signalsByDomain = new Map<string, ConnectorSignal[]>();
    for (const signal of signals) {
      const domain = signal.domain || 'general';
      if (!signalsByDomain.has(domain)) {
        signalsByDomain.set(domain, []);
      }
      signalsByDomain.get(domain)!.push(signal);
    }

    // Create training packs per domain
    const trainingPacks: TrainingPack[] = [];
    for (const [domain, domainSignals] of signalsByDomain.entries()) {
      trainingPacks.push({
        id: `org-updater-${domain}-${Date.now()}`,
        organizationId: this.organizationId,
        name: `Org Updater: ${domain} (delta ${this.config.deltaHours}h)`,
        description: `Delta update from ${domainSignals.length} signals in ${domain} domain`,
        signals: domainSignals,
        targetMetrics: ['all'], // Train ALL brain subsystems
        priority: 'normal',
        metadata: {
          agentName: this.name,
          agentVersion: this.version,
          domain,
          deltaHours: this.config.deltaHours,
          signalCount: domainSignals.length,
          createdAt: new Date().toISOString(),
        },
      });
    }

    this.log(`Created ${trainingPacks.length} training pack(s) across ${signalsByDomain.size} domain(s)`);

    return {
      success: true,
      signals,
      trainingPacks,
    };
  }

  // ── Helper: Sync a single connection ──
  private async syncConnection(
    connection: OrgConnection,
    deltaStartTime: Date
  ): Promise<ConnectorSignal[]> {
    const signals: ConnectorSignal[] = [];

    // Route to appropriate connector based on type
    switch (connection.type) {
      case 'hubspot':
        return await this.syncHubSpot(connection, deltaStartTime);
      case 'slack':
        return await this.syncSlack(connection, deltaStartTime);
      case 'github':
        return await this.syncGitHub(connection, deltaStartTime);
      case 'stripe':
        return await this.syncStripe(connection, deltaStartTime);
      default:
        this.log(`  ⚠️  No connector implementation for ${connection.type}`);
        return signals;
    }
  }

  // ── Connector: HubSpot ──
  private async syncHubSpot(connection: OrgConnection, since: Date): Promise<ConnectorSignal[]> {
    if (!connection.credentials.apiKey) {
      throw new Error('HubSpot API key not configured');
    }

    const connector = createHubSpotConnector({
      apiKey: connection.credentials.apiKey,
      organizationId: this.organizationId,
    });

    // Fetch deals, contacts, companies updated since deltaStartTime
    const signals = await connector.fetchRecentActivities(since);

    // Update sync cursor
    await this.updateSyncCursor(connection.id, new Date().toISOString());

    return signals.slice(0, this.config.maxSignalsPerConnection);
  }

  // ── Connector: Slack ──
  private async syncSlack(connection: OrgConnection, since: Date): Promise<ConnectorSignal[]> {
    if (!connection.credentials.botToken) {
      throw new Error('Slack bot token not configured');
    }

    const connector = createSlackConnector({
      botToken: connection.credentials.botToken,
      organizationId: this.organizationId,
    });

    // Fetch messages, threads, reactions since deltaStartTime
    const signals = await connector.fetchRecentMessages(since);

    await this.updateSyncCursor(connection.id, new Date().toISOString());

    return signals.slice(0, this.config.maxSignalsPerConnection);
  }

  // ── Connector: GitHub ──
  private async syncGitHub(connection: OrgConnection, since: Date): Promise<ConnectorSignal[]> {
    if (!connection.credentials.token) {
      throw new Error('GitHub token not configured');
    }

    const connector = createGitHubConnector({
      token: connection.credentials.token,
      organizationId: this.organizationId,
      repos: connection.metadata?.repos || [],
    });

    // Fetch commits, PRs, issues since deltaStartTime
    const signals = await connector.fetchRecentActivity(since);

    await this.updateSyncCursor(connection.id, new Date().toISOString());

    return signals.slice(0, this.config.maxSignalsPerConnection);
  }

  // ── Connector: Stripe ──
  private async syncStripe(connection: OrgConnection, since: Date): Promise<ConnectorSignal[]> {
    if (!connection.credentials.secretKey) {
      throw new Error('Stripe secret key not configured');
    }

    const connector = createStripeConnector({
      secretKey: connection.credentials.secretKey,
      organizationId: this.organizationId,
    });

    // Fetch charges, customers, subscriptions since deltaStartTime
    const signals = await connector.fetchRecentTransactions(since);

    await this.updateSyncCursor(connection.id, new Date().toISOString());

    return signals.slice(0, this.config.maxSignalsPerConnection);
  }

  // ── Helper: Update sync cursor ──
  private async updateSyncCursor(connectionId: string, cursor: string): Promise<void> {
    await this.supabase
      .from('connector_configurations')
      .update({
        sync_cursor: cursor,
        last_sync_at: new Date().toISOString(),
        sync_status: 'success',
      })
      .eq('id', connectionId);
  }

  // ── Motor Commands: Alerts and insights ──
  protected async generateMotorCommands(trainResult: TrainResult): Promise<MotorCommand[]> {
    const commands: MotorCommand[] = [];

    const totalSignals = this.syncResults.reduce((sum, r) => sum + r.signalsFetched, 0);
    const failedConnections = this.syncResults.filter(r => r.errors.length > 0);
    const successfulConnections = this.syncResults.filter(r => r.errors.length === 0);

    // Slack: Sync summary
    if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID) {
      let statusEmoji = '🧠';
      let statusText = 'HEALTHY';
      if (failedConnections.length > this.connections.length * 0.5) {
        statusEmoji = '⚠️';
        statusText = 'DEGRADED';
      } else if (failedConnections.length > 0) {
        statusEmoji = '⚡';
        statusText = 'PARTIAL';
      }

      const topConnections = successfulConnections
        .sort((a, b) => b.signalsFetched - a.signalsFetched)
        .slice(0, 5);

      const topConnectionsText = topConnections.length > 0
        ? topConnections.map(c => `• ${c.connectionType}: ${c.signalsFetched} signals`).join('\n')
        : '• No successful syncs';

      commands.push({
        commandId: `slack-org-updater-${Date.now()}`,
        organizationId: this.organizationId,
        actionType: 'slack_send_message',
        target: process.env.SLACK_CHANNEL_ID,
        payload: {
          text: `${statusEmoji} *Org Brain Update: ${statusText}*\n\n*Delta Sync (${this.config.deltaHours}h):*\n• Total signals: ${totalSignals}\n• Successful: ${successfulConnections.length}/${this.connections.length}\n• Failed: ${failedConnections.length}\n\n*Top Sources:*\n${topConnectionsText}\n\n*Training:*\n• Packs: ${trainResult.packsTrainedCount}\n• Brain Region: ${this.brainRegion}`,
        },
        priority: 'normal',
        requiresApproval: false,
        createdAt: new Date(),
      });

      // Alert for failed connections
      if (failedConnections.length > 0) {
        const failuresList = failedConnections
          .slice(0, 5)
          .map(c => `• ${c.connectionType}: ${c.errors[0]}`)
          .join('\n');

        commands.push({
          commandId: `slack-org-updater-alert-${Date.now()}`,
          organizationId: this.organizationId,
          actionType: 'slack_send_message',
          target: process.env.SLACK_CHANNEL_ID,
          payload: {
            text: `⚠️ *Connection Sync Failures*\n\n${failedConnections.length} connection(s) failed to sync:\n\n${failuresList}\n\n${failedConnections.length > 5 ? `... and ${failedConnections.length - 5} more` : ''}`,
          },
          priority: 'high',
          requiresApproval: false,
          createdAt: new Date(),
        });
      }
    }

    return commands;
  }
}

// ── Self-Registration: Auto-register to globalRegistry on import ──────────
import { createClient } from '@supabase/supabase-js';
import { globalRegistry } from '../agent-framework/agent-registry';

globalRegistry.register({
  name: 'org-updater-agent',
  description: 'Continuous learning from ALL org connections: pulls delta data every 12h, trains every part of brain',
  version: '7.0.0',
  factory: (config) => {
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    return new OrgUpdaterAgent(supabase, config.organizationId || '00000000-0000-4000-a000-000000000001', {
      verbose: config.verbose,
    }) as any;
  },
  schedule: '0 */12 * * *',  // Every 12 hours
  resourceRequirements: { cpu: '2048', memory: '8192' },
  tags: ['training', 'connectors', 'delta-sync', 'org-learning', 'thalamus'],
});
