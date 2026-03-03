/**
 * Process Engine — Core AI Worker Capability
 * ============================================
 * Available to all AI Workers regardless of service activation.
 * Process templates are configurations, not analytical domains.
 *
 * Internal DB value: agent_type='bpaas' (kept for backward compat)
 * RL prefix: "bpaas.<templateType>" (kept for backward compat — don't break existing prediction_records)
 */

// Re-export the execution types from the FSM implementation (lib/process-intelligence/)
// Use the new canonical names; deprecated aliases (BPaaSExecutionParams etc.) remain in source files.
export type { ProcessExecutionParams as ProcessEngineParams } from "@/lib/process-intelligence/domain-executor";
export type { ProcessExecutionResult as ProcessEngineResult } from "@/lib/process-intelligence/domain-executor";
export type { ProcessContext as ProcessEngineContext } from "@/lib/process-intelligence/fsm-runner";
export type { ProcessState as ProcessEngineState } from "@/lib/process-intelligence/fsm-runner";

// ProcessTemplate — the canonical name for what bpaas called "ProcessDefinition"
export type { ProcessDefinition as ProcessTemplate } from "@/lib/process-intelligence/process-registry";
export type { PolicyRule as ProcessPolicyRule } from "@/lib/process-intelligence/process-registry";
export type { FSMTransition as ProcessFSMTransition } from "@/lib/process-intelligence/process-registry";

// WorkerResult — matches SE-aaS WorkerResult shape for consistent cron return values
export interface ProcessEngineWorkerResult {
  processed: number;
  succeeded: number;
  failed: number;
  jobIds: string[];
}
