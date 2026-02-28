/**
 * Process Engine — Template Registry
 * =====================================
 * Process templates are configurations for the FSM — not analytical domains.
 * Available to any workspace regardless of which services are activated.
 *
 * Templates describe the FSM shape (states, transitions, policy rules) for
 * each process type (hr_offboarding, procurement, order_management, etc.).
 * The actual execution logic lives in lib/process-intelligence/domain-executor.ts.
 *
 * Process types are now DB-driven — any type in bpaas_process_definitions is valid.
 * The hardcoded BPAAS_PROCESS_TYPES array and BUILTIN_DEFINITIONS have been removed.
 */

import {
  isValidProcessType,
  getProcessDefinition,
  bpaasDomain,
  type BPaaSProcessType,
  type ProcessDefinition,
  type PolicyRule,
  type FSMTransition,
} from "@/lib/process-intelligence/process-registry";

// Canonical exports
export {
  isValidProcessType,
  getProcessDefinition,
  bpaasDomain,
};
export type { BPaaSProcessType, ProcessDefinition, PolicyRule, FSMTransition };

// Aliases for backward compat where needed
export { getProcessDefinition as getProcessTemplate };
export { isValidProcessType as isProcessTemplate };

/** Process Engine RL domain prefix: "bpaas.<templateType>" */
export function processEngineDomain(templateType: string): string {
  return `bpaas.${templateType}`;
}

export type ProcessTemplateType = BPaaSProcessType;
