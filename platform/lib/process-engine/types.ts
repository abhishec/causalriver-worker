/**
 * Process Engine — Core AI Worker Capability
 * ============================================
 * Available to all AI Workers regardless of service activation.
 * Process templates are configurations, not analytical domains.
 *
 * Internal DB value: agent_type='bpaas' (kept for backward compat)
 * RL prefix: "bpaas.<templateType>" (kept for backward compat — don't break existing prediction_records)
 */

// Re-export the execution types from the FSM implementation
// These live in lib/bpaas/ and are solid — don't move them
export type { BPaaSExecutionParams as ProcessEngineParams } from "@/lib/bpaas/domain-executor";
export type { BPaaSExecutionResult as ProcessEngineResult } from "@/lib/bpaas/domain-executor";
export type { BPaaSContext as ProcessEngineContext } from "@/lib/bpaas/fsm-runner";
export type { BPaaSState as ProcessEngineState } from "@/lib/bpaas/fsm-runner";

// ProcessTemplate — the canonical name for what bpaas called "ProcessDefinition"
export type { ProcessDefinition as ProcessTemplate } from "@/lib/bpaas/process-registry";
export type { PolicyRule as ProcessPolicyRule } from "@/lib/bpaas/process-registry";
export type { FSMTransition as ProcessFSMTransition } from "@/lib/bpaas/process-registry";

// WorkerResult — matches SE-aaS WorkerResult shape for consistent cron return values
export interface ProcessEngineWorkerResult {
  processed: number;
  succeeded: number;
  failed: number;
  jobIds: string[];
}
