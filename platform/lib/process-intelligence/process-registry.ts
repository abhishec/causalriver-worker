import { logger } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

// BPaaSProcessType is now an open string — any type in bpaas_process_definitions is valid.
// The hardcoded BPAAS_PROCESS_TYPES array has been removed. Validation is DB-driven.
export type BPaaSProcessType = string;

export interface FSMTransition {
  from: string;
  to: string;
  on: string;
}

export interface ProcessDefinition {
  processType: string;
  name: string;
  description: string;
  initialState: string;
  states: string[];
  transitions: FSMTransition[];
  defaultPolicyRules: PolicyRule[];
  stateInstructions?: Record<string, string>;
}

export interface PolicyRule {
  id: string;
  condition: string; // e.g. "total_amount > 500"
  action: "require_approval" | "escalate" | "block";
  level: "manager" | "committee" | "hr" | "finance" | "legal" | "cfo" | "ciso";
  threshold?: number;
  description: string;
}

/**
 * Get process definition from bpaas_process_definitions table.
 * Tries org-specific first (organization_id matches), then global (organization_id=NULL).
 * No hardcoded BUILTIN_DEFINITIONS fallback — FSM shapes live in the DB only.
 */
export async function getProcessDefinition(
  processType: string,
  organizationId: string,
  supabase: SupabaseClient
): Promise<ProcessDefinition> {
  // Try org-specific first, then global (org_id=NULL)
  const { data, error } = await supabase
    .from("bpaas_process_definitions")
    .select("*")
    .eq("process_type", processType)
    .eq("is_active", true)
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .order("organization_id", { ascending: false, nullsFirst: false }) // org-specific wins
    .limit(1)
    .single();

  if (error || !data) {
    logger.warn("[BPaaS/ProcessRegistry] Process definition not found in DB", {
      processType,
      organizationId,
      error: error?.message,
    });
    throw new Error(`Process definition not found for type: ${processType}`);
  }

  const fsmDef = data.fsm_definition as {
    states: string[];
    transitions: FSMTransition[];
    initial_state: string;
  } | null;

  return {
    processType: data.process_type as string,
    name: data.name as string,
    description: (data.description as string | null) ?? "",
    initialState: fsmDef?.initial_state ?? "DECOMPOSE",
    states: fsmDef?.states ?? [
      "DECOMPOSE",
      "ASSESS",
      "COMPUTE",
      "POLICY_CHECK",
      "APPROVAL_GATE",
      "MUTATE",
      "COMPLETE",
      "ESCALATE",
      "FAILED",
    ],
    transitions: fsmDef?.transitions ?? [],
    defaultPolicyRules: (data.policy_rules as PolicyRule[] | null) ?? [],
    stateInstructions:
      (data.state_instructions as Record<string, string> | null) ?? {},
  };
}

/**
 * Check if a process type is valid by querying bpaas_process_definitions.
 * Replaces the hardcoded BPAAS_PROCESS_TYPES array — any type in DB is valid.
 * Checks global templates (org_id=NULL) AND org-specific templates.
 */
export async function isValidProcessType(
  processType: string,
  organizationId: string,
  supabase: SupabaseClient
): Promise<boolean> {
  if (!processType || typeof processType !== "string") return false;
  try {
    const { data, error } = await supabase
      .from("bpaas_process_definitions")
      .select("id")
      .eq("process_type", processType)
      .eq("is_active", true)
      .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
      .limit(1)
      .maybeSingle(); // Fix 5: maybeSingle avoids throwing when 2 rows match (global + org-specific)
    return !error && !!data;
  } catch {
    return false;
  }
}

/** RL domain prefix — always "bpaas.<processType>" */
export function bpaasDomain(processType: string): string {
  return `bpaas.${processType}`;
}
