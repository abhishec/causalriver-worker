/**
 * Process Engine — Core AI Worker Capability
 *
 * The Process Engine is available to ALL AI Workers regardless of
 * which services (SE-aaS, AaaS) are activated. Process templates
 * (hr_offboarding, procurement, order_management) are FSM configurations,
 * not analytical domains.
 *
 * Process types are DB-driven — any type in bpaas_process_definitions is valid.
 * The hardcoded BPAAS_PROCESS_TYPES array has been removed.
 *
 * DB value: agent_type='bpaas' (internal, for backward compat)
 * API route: /api/process/[templateType]
 * Brain layer: L28 (Tier 9 — Process Execution, always present)
 */

// Worker — used by process-jobs cron
export { processProcessEngineJobs } from "./worker";
export type { ProcessEngineWorkerResult } from "./types";

// Templates — process configurations (DB-driven, no hardcoded list)
export {
  isValidProcessType,
  isProcessTemplate,
  getProcessDefinition,
  getProcessTemplate,
  processEngineDomain,
  bpaasDomain,
  type ProcessTemplateType,
  type BPaaSProcessType,  // deprecated alias — use ProcessType from process-intelligence/process-registry
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
export { executeProcess } from "@/lib/process-intelligence/domain-executor";
// Deprecated alias kept for backward compat
export { executeBPaaSProcess } from "@/lib/process-intelligence/domain-executor";
export { ProcessFSMRunner as ProcessEngineRunner } from "@/lib/process-intelligence/fsm-runner";
// Deprecated alias kept for backward compat
export { BPaaSFSMRunner } from "@/lib/process-intelligence/fsm-runner";
