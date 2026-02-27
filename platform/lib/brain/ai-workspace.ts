/**
 * AI Workspace — Thin adapter over ai-worker-config
 * ==================================================
 * DEPRECATED DIRECTION: All DB operations now go through ai_worker_config.
 * The ai_workspace table has been marked deprecated in migration
 * 20260330000050_consolidate_ai_workspace_deprecated.sql.
 *
 * This file remains to preserve the AIWorkspace type and function signatures
 * used by brain/workspace/route.ts and other consumers. Internally every
 * function delegates to ai-worker-config.ts which reads/writes ai_worker_config.
 *
 * Do NOT add new features here — add them to ai-worker-config.ts instead.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import {
  getAIWorkerConfig,
  updateAIWorkerConfig,
  ensureAIWorkerConfig,
  getActivatedServices,
  activateServiceInConfig,
  updateWritebackEnabled as workerUpdateWritebackEnabled,
  type AIWorkerConfig,
} from "@/lib/brain/ai-worker-config";

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
  writebackEnabled: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// ── Converter: AIWorkerConfig → AIWorkspace ───────────────────────────────────

function workerConfigToWorkspace(cfg: AIWorkerConfig): AIWorkspace {
  const now = new Date().toISOString();
  return {
    id: cfg.organizationId,          // ai_worker_config has no separate id field exposed
    organizationId: cfg.organizationId,
    name: cfg.displayName,
    activatedServices: cfg.activatedServices ?? ["SE-aaS"],
    seaasConfig: {
      enabledDomains: cfg.enabledDomains,
      asyncMode: true,                // static default — not stored in ai_worker_config
      maxConcurrentJobs: cfg.orchestratorConfig.maxConcurrentJobs,
    },
    aaasConfig: cfg.aaasConfig ?? { enabled: false },
    brainConfig: {
      minIqForActivation: cfg.orchestratorConfig.brainReadinessMinIQ,
      learningRate: cfg.brainConfig.learningRate,
      enableFederation: cfg.brainConfig.enableFederation,
      contextWindowTokens: cfg.brainConfig.contextWindowTokens,
      enableRecovery: cfg.orchestratorConfig.enableRecovery,
      recoveryModel: cfg.recoveryConfig.claudeModel,
      maxRecoveryAttempts: cfg.recoveryConfig.maxRecoveryAttempts,
    },
    orchestratorConfig: {
      enableRlPriority: cfg.orchestratorConfig.enableRLPriority,
      brainReadinessMinIq: cfg.orchestratorConfig.brainReadinessMinIQ,
      autoStartWaitingJobs: cfg.orchestratorConfig.autoStartWaitingJobs,
    },
    writebackEnabled: cfg.writebackEnabled ?? false,
    status: cfg.status,
    createdAt: now,
    updatedAt: now,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read the AI Workspace for an organisation.
 * If no row exists, creates one with defaults (upsert).
 * Never throws — returns a safe default if DB fails.
 *
 * Now delegates to ai_worker_config.
 */
export async function getOrCreateAIWorkspace(
  orgId: string,
  name?: string
): Promise<AIWorkspace> {
  try {
    const cfg = await getAIWorkerConfig(orgId);
    const workspace = workerConfigToWorkspace(cfg);
    // Apply caller-provided name if the config has an empty display_name
    if (name && !workspace.name) {
      workspace.name = name;
    }
    return workspace;
  } catch (err) {
    logger.warn("[ai-workspace] getOrCreateAIWorkspace unexpected error:", err);
    // Build minimal safe default
    const now = new Date().toISOString();
    return {
      id: orgId,
      organizationId: orgId,
      name: name ?? "",
      activatedServices: ["SE-aaS"],
      seaasConfig: { enabledDomains: [], asyncMode: true, maxConcurrentJobs: 3 },
      aaasConfig: { enabled: false },
      brainConfig: {
        minIqForActivation: 10,
        learningRate: 0.1,
        enableFederation: true,
        contextWindowTokens: 8000,
        enableRecovery: true,
        recoveryModel: "claude-haiku-4-5-20251001",
        maxRecoveryAttempts: 3,
      },
      orchestratorConfig: { enableRlPriority: true, brainReadinessMinIq: 10, autoStartWaitingJobs: true },
      writebackEnabled: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
  }
}

/**
 * Returns activated_services for an org's AI Workspace.
 * Returns ['SE-aaS'] as default if workspace does not exist or DB fails.
 *
 * Now delegates to ai_worker_config.
 */
export async function getAIWorkspaceServices(orgId: string): Promise<string[]> {
  return getActivatedServices(orgId);
}

/**
 * Adds a service to activated_services if not already present.
 * No-ops gracefully if the workspace row doesn't exist yet.
 *
 * Now delegates to ai_worker_config.
 */
export async function activateService(
  orgId: string,
  service: string
): Promise<void> {
  return activateServiceInConfig(orgId, service);
}

/**
 * Patch workspace config fields. Only provided keys are updated.
 * Supports: name, activatedServices, seaasConfig, aaasConfig, brainConfig, orchestratorConfig, status.
 *
 * Now delegates to ai_worker_config.
 */
export async function updateWorkspaceConfig(
  orgId: string,
  patch: Partial<AIWorkspace>
): Promise<void> {
  try {
    const workerPatch: Partial<Omit<AIWorkerConfig, "organizationId">> = {};

    if (patch.name !== undefined) workerPatch.displayName = patch.name;
    if (patch.status !== undefined) workerPatch.status = patch.status as AIWorkerConfig["status"];
    if (patch.activatedServices !== undefined) workerPatch.activatedServices = patch.activatedServices;
    if (patch.writebackEnabled !== undefined) workerPatch.writebackEnabled = patch.writebackEnabled;
    if (patch.aaasConfig !== undefined) workerPatch.aaasConfig = patch.aaasConfig;

    if (patch.seaasConfig !== undefined) {
      workerPatch.enabledDomains = patch.seaasConfig.enabledDomains;
      // maxConcurrentJobs lives in orchestratorConfig in ai_worker_config
      if (patch.orchestratorConfig === undefined) {
        // Fetch current to merge max_concurrent_jobs
        const current = await getAIWorkerConfig(orgId);
        workerPatch.orchestratorConfig = {
          ...current.orchestratorConfig,
          maxConcurrentJobs: patch.seaasConfig.maxConcurrentJobs,
        };
      }
    }

    if (patch.orchestratorConfig !== undefined) {
      const current = await getAIWorkerConfig(orgId);
      workerPatch.orchestratorConfig = {
        ...current.orchestratorConfig,
        enableRLPriority: patch.orchestratorConfig.enableRlPriority,
        brainReadinessMinIQ: patch.orchestratorConfig.brainReadinessMinIq,
        autoStartWaitingJobs: patch.orchestratorConfig.autoStartWaitingJobs,
      };
    }

    if (patch.brainConfig !== undefined) {
      const current = await getAIWorkerConfig(orgId);
      workerPatch.brainConfig = {
        ...current.brainConfig,
        learningRate: patch.brainConfig.learningRate,
        enableFederation: patch.brainConfig.enableFederation,
        contextWindowTokens: patch.brainConfig.contextWindowTokens,
      };
      // Recovery fields go into recoveryConfig
      workerPatch.recoveryConfig = {
        ...current.recoveryConfig,
        enableAutoRecovery: patch.brainConfig.enableRecovery,
        claudeModel: patch.brainConfig.recoveryModel,
        maxRecoveryAttempts: patch.brainConfig.maxRecoveryAttempts,
      };
      // brainReadinessMinIQ goes into orchestratorConfig
      if (!workerPatch.orchestratorConfig) {
        workerPatch.orchestratorConfig = {
          ...current.orchestratorConfig,
          brainReadinessMinIQ: patch.brainConfig.minIqForActivation,
        };
      }
    }

    if (Object.keys(workerPatch).length === 0) return;

    await updateAIWorkerConfig(orgId, workerPatch);
  } catch (err) {
    logger.warn("[ai-workspace] updateWorkspaceConfig unexpected error:", err);
  }
}

/**
 * Toggle writeback_enabled for an org's AI Workspace.
 * Enables or disables automatic post-execution dispatch to connected systems.
 * Never throws — logs and swallows errors.
 *
 * Now delegates to ai_worker_config (supabase param unused but kept for API compat).
 */
export async function updateWritebackEnabled(
  _supabase: SupabaseClient,
  orgId: string,
  enabled: boolean
): Promise<void> {
  return workerUpdateWritebackEnabled(orgId, enabled);
}

// Re-export ensureAIWorkerConfig under a workspace alias for callers that
// used to call ensureAIWorkspace.
export { ensureAIWorkerConfig as ensureAIWorkspace };
