/**
 * Process Engine — Core AI Worker Capability
 *
 * The Process Engine is available to ALL AI Workers regardless of
 * which services (SE-aaS, AaaS) are activated. Process templates
 * (hr_offboarding, procurement, order_management) are FSM configurations,
 * not analytical domains.
 *
 * DB value: agent_type='bpaas' (internal, for backward compat)
 * API route: /api/process/[templateType]
 * Brain layer: L28 (Tier 9 — Process Execution, always present)
 */

// Worker — used by process-jobs cron
export { processProcessEngineJobs } from "./worker";
export type { ProcessEngineWorkerResult } from "./types";

// Templates — process configurations
export {
  PROCESS_ENGINE_TEMPLATES,
  isProcessTemplate,
  getProcessTemplate,
  processEngineDomain,
  type ProcessTemplateType,
  // Backward compat
  BPAAS_PROCESS_TYPES,
  isBPaaSProcessType,
  getProcessDefinition,
  bpaasDomain,
} from "./templates";

// Types
export type {
  ProcessEngineParams,
  ProcessEngineResult,
  ProcessEngineContext,
  ProcessEngineState,
  ProcessTemplate,
  ProcessPolicyRule,
  ProcessFSMTransition,
} from "./types";

// Core execution (re-export for callers who need it directly)
export { executeBPaaSProcess as executeProcess } from "@/lib/process-intelligence/domain-executor";
export { BPaaSFSMRunner as ProcessEngineRunner } from "@/lib/process-intelligence/fsm-runner";
