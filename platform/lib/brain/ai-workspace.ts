/**
 * AI Workspace — Core unit of intelligence in BrainOS
 * =====================================================
 * Hierarchy: Customer → Org → AI Workspace
 *
 * An AI Workspace = org + activated services.
 * It has its own Brain, runs agents, has Copilot, and tracks RL.
 *
 * All functions are safe by default: never throw, always return a usable result.
 */

import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AIWorkspace {
  id: string;
  organizationId: string;
  name: string;
  activatedServices: string[];  // ['SE-aaS', 'A-aaS', ...]
  seaasConfig: {
    enabledDomains: string[];
    asyncMode: boolean;
    maxConcurrentJobs: number;
  };
  aaasConfig: {
    enabled: boolean;
  };
  brainConfig: {
    minIqForActivation: number;
    learningRate: number;
    enableFederation: boolean;
    contextWindowTokens: number;
    enableRecovery: boolean;
    recoveryModel: string;
    maxRecoveryAttempts: number;
  };
  orchestratorConfig: {
    enableRlPriority: boolean;
    brainReadinessMinIq: number;
    autoStartWaitingJobs: boolean;
  };
  status: string;
  createdAt: string;
  updatedAt: string;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_ENABLED_DOMAINS = [
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

function buildDefault(orgId: string, name?: string): AIWorkspace {
  const now = new Date().toISOString();
  return {
    id: "",
    organizationId: orgId,
    name: name ?? "",
    activatedServices: ["SE-aaS"],
    seaasConfig: {
      enabledDomains: [...DEFAULT_ENABLED_DOMAINS],
      asyncMode: true,
      maxConcurrentJobs: 3,
    },
    aaasConfig: {
      enabled: false,
    },
    brainConfig: {
      minIqForActivation: 10,
      learningRate: 0.1,
      enableFederation: true,
      contextWindowTokens: 8000,
      enableRecovery: true,
      recoveryModel: "claude-haiku-4-5-20251001",
      maxRecoveryAttempts: 3,
    },
    orchestratorConfig: {
      enableRlPriority: true,
      brainReadinessMinIq: 10,
      autoStartWaitingJobs: true,
    },
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

// ── DB row → AIWorkspace mapper ───────────────────────────────────────────────

function rowToWorkspace(row: Record<string, any>): AIWorkspace {
  const seaas = row.seaas_config ?? {};
  const aaas = row.aaas_config ?? {};
  const brain = row.brain_config ?? {};
  const orch = row.orchestrator_config ?? {};

  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name ?? "",
    activatedServices: row.activated_services ?? ["SE-aaS"],
    seaasConfig: {
      enabledDomains: seaas.enabled_domains ?? [...DEFAULT_ENABLED_DOMAINS],
      asyncMode: seaas.async_mode ?? true,
      maxConcurrentJobs: seaas.max_concurrent_jobs ?? 3,
    },
    aaasConfig: {
      enabled: aaas.enabled ?? false,
    },
    brainConfig: {
      minIqForActivation: brain.min_iq_for_activation ?? 10,
      learningRate: brain.learning_rate ?? 0.1,
      enableFederation: brain.enable_federation ?? true,
      contextWindowTokens: brain.context_window_tokens ?? 8000,
      enableRecovery: brain.enable_recovery ?? true,
      recoveryModel: brain.recovery_model ?? "claude-haiku-4-5-20251001",
      maxRecoveryAttempts: brain.max_recovery_attempts ?? 3,
    },
    orchestratorConfig: {
      enableRlPriority: orch.enable_rl_priority ?? true,
      brainReadinessMinIq: orch.brain_readiness_min_iq ?? 10,
      autoStartWaitingJobs: orch.auto_start_waiting_jobs ?? true,
    },
    status: row.status ?? "active",
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read the AI Workspace for an organisation.
 * If no row exists, creates one with defaults (upsert).
 * Never throws — returns a safe default if DB fails.
 */
export async function getOrCreateAIWorkspace(
  orgId: string,
  name?: string
): Promise<AIWorkspace> {
  try {
    const admin = getAdminClient();

    const { data, error } = await admin
      .from("ai_workspace")
      .select("*")
      .eq("organization_id", orgId)
      .maybeSingle();

    if (error) {
      logger.warn("[ai-workspace] read failed:", error.message);
      return buildDefault(orgId, name);
    }

    if (!data) {
      // No row yet — insert defaults
      const { data: inserted, error: insertError } = await admin
        .from("ai_workspace")
        .insert({
          organization_id: orgId,
          name: name ?? "",
          activated_services: ["SE-aaS"],
          status: "active",
        })
        .select("*")
        .maybeSingle();

      if (insertError || !inserted) {
        logger.warn("[ai-workspace] insert defaults failed:", insertError?.message);
        return buildDefault(orgId, name);
      }

      return rowToWorkspace(inserted);
    }

    return rowToWorkspace(data);
  } catch (err) {
    logger.warn("[ai-workspace] getOrCreateAIWorkspace unexpected error:", err);
    return buildDefault(orgId, name);
  }
}

/**
 * Returns activated_services for an org's AI Workspace.
 * Returns ['SE-aaS'] as default if workspace does not exist or DB fails.
 */
export async function getAIWorkspaceServices(orgId: string): Promise<string[]> {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("ai_workspace")
      .select("activated_services")
      .eq("organization_id", orgId)
      .maybeSingle();

    if (error || !data) return ["SE-aaS"];
    return data.activated_services ?? ["SE-aaS"];
  } catch {
    return ["SE-aaS"];
  }
}

/**
 * Adds a service to activated_services if not already present.
 * No-ops gracefully if the workspace row doesn't exist yet.
 */
export async function activateService(
  orgId: string,
  service: string
): Promise<void> {
  try {
    const admin = getAdminClient();

    const { data } = await admin
      .from("ai_workspace")
      .select("id, activated_services")
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!data) {
      logger.warn("[ai-workspace] activateService: no workspace row for org", orgId);
      return;
    }

    const current: string[] = data.activated_services ?? [];
    if (current.includes(service)) return;  // Already activated

    const { error } = await admin
      .from("ai_workspace")
      .update({ activated_services: [...current, service] })
      .eq("organization_id", orgId);

    if (error) {
      logger.warn("[ai-workspace] activateService update failed:", error.message);
    }
  } catch (err) {
    logger.warn("[ai-workspace] activateService unexpected error:", err);
  }
}

/**
 * Patch workspace config fields. Only provided keys are updated.
 * Supports: name, activatedServices, seaasConfig, aaasConfig, brainConfig, orchestratorConfig, status.
 */
export async function updateWorkspaceConfig(
  orgId: string,
  patch: Partial<AIWorkspace>
): Promise<void> {
  try {
    const admin = getAdminClient();

    const dbPatch: Record<string, unknown> = {};

    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.activatedServices !== undefined)
      dbPatch.activated_services = patch.activatedServices;

    if (patch.seaasConfig !== undefined) {
      dbPatch.seaas_config = {
        enabled_domains: patch.seaasConfig.enabledDomains,
        async_mode: patch.seaasConfig.asyncMode,
        max_concurrent_jobs: patch.seaasConfig.maxConcurrentJobs,
      };
    }

    if (patch.aaasConfig !== undefined) {
      dbPatch.aaas_config = {
        enabled: patch.aaasConfig.enabled,
      };
    }

    if (patch.brainConfig !== undefined) {
      dbPatch.brain_config = {
        min_iq_for_activation: patch.brainConfig.minIqForActivation,
        learning_rate: patch.brainConfig.learningRate,
        enable_federation: patch.brainConfig.enableFederation,
        context_window_tokens: patch.brainConfig.contextWindowTokens,
        enable_recovery: patch.brainConfig.enableRecovery,
        recovery_model: patch.brainConfig.recoveryModel,
        max_recovery_attempts: patch.brainConfig.maxRecoveryAttempts,
      };
    }

    if (patch.orchestratorConfig !== undefined) {
      dbPatch.orchestrator_config = {
        enable_rl_priority: patch.orchestratorConfig.enableRlPriority,
        brain_readiness_min_iq: patch.orchestratorConfig.brainReadinessMinIq,
        auto_start_waiting_jobs: patch.orchestratorConfig.autoStartWaitingJobs,
      };
    }

    if (Object.keys(dbPatch).length === 0) return;

    const { error } = await admin
      .from("ai_workspace")
      .update(dbPatch)
      .eq("organization_id", orgId);

    if (error) {
      logger.warn("[ai-workspace] updateWorkspaceConfig failed:", error.message);
    }
  } catch (err) {
    logger.warn("[ai-workspace] updateWorkspaceConfig unexpected error:", err);
  }
}
