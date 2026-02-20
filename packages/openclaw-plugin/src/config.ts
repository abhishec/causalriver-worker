/**
 * @nexusbrain/openclaw-plugin — Configuration & Client Creation
 *
 * Validates plugin config from openclaw.json, creates NexusClient,
 * and sets up Jira environment variables for handler compatibility.
 */

import { createNexusClient, type NexusClient } from '@nexus-ai/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReinforcementConfig {
  enabled: boolean;
  outcomeCollectorIntervalHours: number;
  anomalyWatchdogIntervalMinutes: number;
  consolidationCronHour: number;
  signalHarvestingEnabled: boolean;
}

export interface ProactiveConfig {
  techDebtAlarmEnabled: boolean;
  reconciliationRunnerEnabled: boolean;
  cashFlowProphetEnabled: boolean;
}

export interface AlertsConfig {
  engineeringChannel?: string;
  financeChannel?: string;
  adminChannel?: string;
}

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseKey: string;
  orgId: string;
}

export interface PluginConfig {
  client: NexusClient;
  supabase: SupabaseConfig;
  hasJira: boolean;
  reinforcement: ReinforcementConfig;
  proactive: ProactiveConfig;
  alerts: AlertsConfig;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_REINFORCEMENT: ReinforcementConfig = {
  enabled: true,
  outcomeCollectorIntervalHours: 6,
  anomalyWatchdogIntervalMinutes: 60,
  consolidationCronHour: 2,
  signalHarvestingEnabled: true,
};

const DEFAULT_PROACTIVE: ProactiveConfig = {
  techDebtAlarmEnabled: true,
  reconciliationRunnerEnabled: false,
  cashFlowProphetEnabled: false,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPluginConfig(rawConfig: Record<string, unknown>): PluginConfig {
  const supabaseUrl = rawConfig.supabaseUrl as string | undefined;
  const supabaseKey = rawConfig.supabaseKey as string | undefined;
  const orgId = rawConfig.orgId as string | undefined;

  if (!supabaseUrl || !supabaseKey || !orgId) {
    throw new Error(
      'NexusBrain plugin requires supabaseUrl, supabaseKey, and orgId in config. ' +
      'Add them to plugins.entries.nexusbrain.config in openclaw.json.',
    );
  }

  // Set Jira env vars so @nexus-ai/mcp-server's jira-client.ts picks them up.
  // Safe because OpenClaw runs in a single Node.js process.
  if (rawConfig.jiraBaseUrl) process.env.JIRA_BASE_URL = rawConfig.jiraBaseUrl as string;
  if (rawConfig.jiraEmail) process.env.JIRA_EMAIL = rawConfig.jiraEmail as string;
  if (rawConfig.jiraApiToken) process.env.JIRA_API_TOKEN = rawConfig.jiraApiToken as string;

  const client = createNexusClient({
    supabaseUrl,
    supabaseAnonKey: supabaseKey,
    organizationId: orgId,
  });

  const rawReinforcement = (rawConfig.reinforcement ?? {}) as Partial<ReinforcementConfig>;
  const rawProactive = (rawConfig.proactive ?? {}) as Partial<ProactiveConfig>;
  const rawAlerts = (rawConfig.alerts ?? {}) as Partial<AlertsConfig>;

  return {
    client,
    supabase: { supabaseUrl, supabaseKey, orgId },
    hasJira: !!(rawConfig.jiraBaseUrl && rawConfig.jiraEmail && rawConfig.jiraApiToken),
    reinforcement: { ...DEFAULT_REINFORCEMENT, ...rawReinforcement },
    proactive: { ...DEFAULT_PROACTIVE, ...rawProactive },
    alerts: { ...rawAlerts },
  };
}
