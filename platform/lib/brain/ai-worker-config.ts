/**
 * AI Worker Config — Canonical per-workspace configuration
 *
 * One row per AI Worker (organization). Stored in ai_worker_config table.
 * Provides brain config, enabled domains, orchestrator config, context agent
 * config, and recovery config for each AI Worker in isolation.
 *
 * All functions are safe by default: never throw, always return a usable config.
 */

import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// ── Types ───────────────────────────────────────────────────────────────────

export interface AIWorkerBrainConfig {
  maxIQ: number;
  learningRate: number;
  minQualityThreshold: number;
  enableFederation: boolean;
  contextWindowTokens: number;
}

export interface AIWorkerOrchestratorConfig {
  maxConcurrentJobs: number;
  enableRLPriority: boolean;
  enableRecovery: boolean;
  brainReadinessMinIQ: number;
  autoStartWaitingJobs: boolean;
}

export interface AIWorkerContextAgentConfig {
  enableStrategicReasoning: boolean;
  enableCausalInference: boolean;
  maxContextAssemblyMs: number;
  cacheValidityMs: number;
}

export interface AIWorkerRecoveryConfig {
  enableAutoRecovery: boolean;
  maxRecoveryAttempts: number;
  consultClaudeOnFailure: boolean;
  claudeModel: string;
}

export interface AIWorkerConfig {
  organizationId: string;
  displayName: string;
  brainConfig: AIWorkerBrainConfig;
  enabledDomains: string[];
  availableConnectors: string[];
  orchestratorConfig: AIWorkerOrchestratorConfig;
  contextAgentConfig: AIWorkerContextAgentConfig;
  recoveryConfig: AIWorkerRecoveryConfig;
  status: "active" | "paused" | "archived";
  /** Extended fields stored in ai_worker_config — optional (not all rows have them) */
  activatedServices?: string[];
  aaasConfig?: { enabled: boolean };
  writebackEnabled?: boolean;
}

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_BRAIN_CONFIG: AIWorkerBrainConfig = {
  maxIQ: 100,
  learningRate: 0.1,
  minQualityThreshold: 0.4,
  enableFederation: true,
  contextWindowTokens: 8000,
};

const DEFAULT_ORCHESTRATOR_CONFIG: AIWorkerOrchestratorConfig = {
  maxConcurrentJobs: 3,
  enableRLPriority: true,
  enableRecovery: true,
  brainReadinessMinIQ: 10,
  autoStartWaitingJobs: true,
};

const DEFAULT_CONTEXT_AGENT_CONFIG: AIWorkerContextAgentConfig = {
  enableStrategicReasoning: true,
  enableCausalInference: true,
  maxContextAssemblyMs: 5000,
  cacheValidityMs: 30000,
};

const DEFAULT_RECOVERY_CONFIG: AIWorkerRecoveryConfig = {
  enableAutoRecovery: true,
  maxRecoveryAttempts: 3,
  consultClaudeOnFailure: true,
  claudeModel: "claude-haiku-4-5-20251001",
};

const DEFAULT_ENABLED_DOMAINS: string[] = [
  "pod-match",
  "early-warning",
  "scope-creep",
  "delivery-intelligence",
  "pr-review",
  "tdd-code-generator",
  "incident-diagnosis",
  "impact-analysis",
  "sql-analyzer",
  "test-data-generator",
  "design-doc-generator",
  "codebase-qa",
  "architecture-extractor",
];

function buildDefaultConfig(orgId: string, displayName?: string): AIWorkerConfig {
  return {
    organizationId: orgId,
    displayName: displayName ?? "",
    brainConfig: { ...DEFAULT_BRAIN_CONFIG },
    enabledDomains: [...DEFAULT_ENABLED_DOMAINS],
    availableConnectors: [],
    orchestratorConfig: { ...DEFAULT_ORCHESTRATOR_CONFIG },
    contextAgentConfig: { ...DEFAULT_CONTEXT_AGENT_CONFIG },
    recoveryConfig: { ...DEFAULT_RECOVERY_CONFIG },
    status: "active",
  };
}

// ── DB Row → Config mapper ──────────────────────────────────────────────────

function rowToConfig(row: Record<string, any>): AIWorkerConfig {
  return {
    organizationId: row.organization_id,
    displayName: row.display_name ?? "",
    brainConfig: {
      ...DEFAULT_BRAIN_CONFIG,
      ...(row.brain_config ?? {}),
    },
    enabledDomains: row.enabled_domains ?? [...DEFAULT_ENABLED_DOMAINS],
    availableConnectors: row.available_connectors ?? [],
    orchestratorConfig: {
      ...DEFAULT_ORCHESTRATOR_CONFIG,
      ...(row.orchestrator_config ?? {}),
    },
    contextAgentConfig: {
      ...DEFAULT_CONTEXT_AGENT_CONFIG,
      ...(row.context_agent_config ?? {}),
    },
    recoveryConfig: {
      ...DEFAULT_RECOVERY_CONFIG,
      ...(row.recovery_config ?? {}),
    },
    status: row.status ?? "active",
    // H2: Extended fields added in migration 20260330000050
    activatedServices: row.activated_services ?? undefined,
    aaasConfig: row.aaas_config ?? undefined,
    writebackEnabled: row.writeback_enabled ?? undefined,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Read the AI Worker config for an organisation.
 *
 * If no row exists yet, creates one with defaults (upsert on missing).
 * Never throws — returns a safe default config if DB fails.
 */
export async function getAIWorkerConfig(orgId: string): Promise<AIWorkerConfig> {
  try {
    // Admin client bypasses RLS — ai_worker_config has no user-scoped RLS; called from
    // background brain init and server-side config resolution without an active user session.
    const admin = getAdminClient();

    const { data, error } = await admin
      .from("ai_worker_config")
      .select("*")
      .eq("organization_id", orgId)
      .maybeSingle();

    if (error) {
      logger.warn("[ai-worker-config] read failed:", error.message);
      return buildDefaultConfig(orgId);
    }

    if (!data) {
      // No row yet — upsert defaults and return them
      await ensureAIWorkerConfig(orgId);
      return buildDefaultConfig(orgId);
    }

    return rowToConfig(data);
  } catch (err) {
    logger.warn("[ai-worker-config] getAIWorkerConfig unexpected error:", err);
    return buildDefaultConfig(orgId);
  }
}

/**
 * Update specific fields of the AI Worker config for an organisation.
 * Uses a partial patch — only provided fields are updated.
 */
export async function updateAIWorkerConfig(
  orgId: string,
  patch: Partial<Omit<AIWorkerConfig, "organizationId">>
): Promise<void> {
  try {
    // Admin client bypasses RLS — ai_worker_config has no user-scoped RLS; server-side update.
    const admin = getAdminClient();

    // Map patch fields to DB column names
    const dbPatch: Record<string, unknown> = {};
    if (patch.displayName !== undefined) dbPatch.display_name = patch.displayName;
    if (patch.brainConfig !== undefined) dbPatch.brain_config = patch.brainConfig;
    if (patch.enabledDomains !== undefined) dbPatch.enabled_domains = patch.enabledDomains;
    if (patch.availableConnectors !== undefined) dbPatch.available_connectors = patch.availableConnectors;
    if (patch.orchestratorConfig !== undefined) dbPatch.orchestrator_config = patch.orchestratorConfig;
    if (patch.contextAgentConfig !== undefined) dbPatch.context_agent_config = patch.contextAgentConfig;
    if (patch.recoveryConfig !== undefined) dbPatch.recovery_config = patch.recoveryConfig;
    if (patch.status !== undefined) dbPatch.status = patch.status;

    if (Object.keys(dbPatch).length === 0) return;

    const { error } = await admin
      .from("ai_worker_config")
      .update(dbPatch)
      .eq("organization_id", orgId);

    if (error) {
      logger.warn("[ai-worker-config] update failed:", error.message);
    }
  } catch (err) {
    logger.warn("[ai-worker-config] updateAIWorkerConfig unexpected error:", err);
  }
}

/**
 * Ensure an AI Worker config row exists for this org.
 * Called on workspace creation or first use.
 * Upserts with defaults — safe to call multiple times.
 */
export async function ensureAIWorkerConfig(
  orgId: string,
  displayName?: string
): Promise<void> {
  try {
    // Admin client bypasses RLS — ai_worker_config upsert during workspace provisioning (no user session context).
    const admin = getAdminClient();

    const { error } = await admin.from("ai_worker_config").upsert(
      {
        organization_id: orgId,
        display_name: displayName ?? "",
        brain_config: DEFAULT_BRAIN_CONFIG,
        enabled_domains: DEFAULT_ENABLED_DOMAINS,
        available_connectors: [],
        orchestrator_config: DEFAULT_ORCHESTRATOR_CONFIG,
        context_agent_config: DEFAULT_CONTEXT_AGENT_CONFIG,
        recovery_config: DEFAULT_RECOVERY_CONFIG,
        status: "active",
      },
      { onConflict: "organization_id", ignoreDuplicates: true }
    );

    if (error) {
      logger.warn("[ai-worker-config] ensureAIWorkerConfig upsert failed:", error.message);
    }
  } catch (err) {
    logger.warn("[ai-worker-config] ensureAIWorkerConfig unexpected error:", err);
  }
}

/**
 * Return the activated_services array for an org.
 * Defaults to ['SE-aaS'] if the row doesn't exist or has no value.
 */
export async function getActivatedServices(orgId: string): Promise<string[]> {
  try {
    const config = await getAIWorkerConfig(orgId);
    return config.activatedServices ?? ["SE-aaS"];
  } catch {
    return ["SE-aaS"];
  }
}

/**
 * Add a service to the activated_services list for an org (idempotent).
 */
export async function activateServiceInConfig(
  orgId: string,
  service: string
): Promise<void> {
  try {
    const admin = getAdminClient();
    const current = await getActivatedServices(orgId);
    if (current.includes(service)) return; // already present
    const updated = [...current, service];
    await admin
      .from("ai_worker_config")
      .upsert(
        { organization_id: orgId, activated_services: updated },
        { onConflict: "organization_id", ignoreDuplicates: false }
      );
  } catch (err) {
    logger.warn("[ai-worker-config] activateServiceInConfig failed:", err);
  }
}

/**
 * Toggle the writeback_enabled flag for an org.
 */
export async function updateWritebackEnabled(
  orgId: string,
  enabled: boolean
): Promise<void> {
  try {
    const admin = getAdminClient();
    await admin
      .from("ai_worker_config")
      .upsert(
        { organization_id: orgId, writeback_enabled: enabled },
        { onConflict: "organization_id", ignoreDuplicates: false }
      );
  } catch (err) {
    logger.warn("[ai-worker-config] updateWritebackEnabled failed:", err);
  }
}
