/**
 * Process Engine — Template Registry
 * =====================================
 * Process templates are configurations for the FSM — not analytical domains.
 * Available to any workspace regardless of which services are activated.
 *
 * Templates describe the FSM shape (states, transitions, policy rules) for
 * each process type (hr_offboarding, procurement, order_management, etc.).
 * The actual execution logic lives in lib/process-intelligence/domain-executor.ts.
 */

import {
  BPAAS_PROCESS_TYPES,
  isBPaaSProcessType,
  getProcessDefinition,
  bpaasDomain,
  type BPaaSProcessType,
  type ProcessDefinition,
  type PolicyRule,
  type FSMTransition,
} from "@/lib/process-intelligence/process-registry";

// Backward-compat re-exports — old names preserved so existing callers don't break
export {
  BPAAS_PROCESS_TYPES,
  isBPaaSProcessType,
  getProcessDefinition,
  bpaasDomain,
};
export type { BPaaSProcessType, ProcessDefinition, PolicyRule, FSMTransition };

// New canonical names for the Process Engine framing
export const PROCESS_ENGINE_TEMPLATES = BPAAS_PROCESS_TYPES;
export const isProcessTemplate = isBPaaSProcessType;
export const getProcessTemplate = getProcessDefinition;

/** Process Engine RL domain prefix: "bpaas.<templateType>" */
export function processEngineDomain(templateType: string): string {
  return `bpaas.${templateType}`;
}

export type ProcessTemplateType = BPaaSProcessType;
