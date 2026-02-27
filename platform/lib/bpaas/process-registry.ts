import { logger } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

// BPaaS process types — NEVER use these as se-aas domain names
// Domain prefix in RL/prediction_records MUST always be "bpaas.<processType>"
export const BPAAS_PROCESS_TYPES = [
  "hr_offboarding",
  "procurement",
  "order_management",
  "expense_approval",
  "customer_onboarding",
] as const;

export type BPaaSProcessType = (typeof BPAAS_PROCESS_TYPES)[number];

export interface FSMTransition {
  from: string;
  to: string;
  on: string;
}

export interface ProcessDefinition {
  processType: BPaaSProcessType | string;
  name: string;
  description: string;
  initialState: string;
  states: string[];
  transitions: FSMTransition[];
  defaultPolicyRules: PolicyRule[];
}

export interface PolicyRule {
  id: string;
  condition: string; // e.g. "total_amount > 500"
  action: "require_approval" | "escalate" | "block";
  level: "manager" | "committee" | "hr" | "finance" | "legal" | "cfo" | "ciso";
  threshold?: number;
  description: string;
}

// Hardcoded fallback definitions (match the seeded DB templates)
const BUILTIN_DEFINITIONS: Record<string, ProcessDefinition> = {
  hr_offboarding: {
    processType: "hr_offboarding",
    name: "HR Employee Offboarding",
    description: "End-to-end employee offboarding process",
    initialState: "DECOMPOSE",
    states: [
      "DECOMPOSE",
      "ASSESS",
      "COMPUTE",
      "POLICY_CHECK",
      "APPROVAL_GATE",
      "MUTATE",
      "SCHEDULE_NOTIFY",
      "COMPLETE",
    ],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "POLICY_CHECK", on: "computed" },
      { from: "POLICY_CHECK", to: "APPROVAL_GATE", on: "policy_pass" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "policy_fail" },
      { from: "APPROVAL_GATE", to: "MUTATE", on: "approved" },
      { from: "APPROVAL_GATE", to: "ESCALATE", on: "rejected" },
      { from: "MUTATE", to: "SCHEDULE_NOTIFY", on: "mutated" },
      { from: "SCHEDULE_NOTIFY", to: "COMPLETE", on: "notified" },
    ],
    defaultPolicyRules: [
      {
        id: "pto_balance",
        condition: "pto_balance > 0",
        action: "require_approval",
        level: "manager",
        description: "Positive PTO balance requires manager sign-off",
      },
      {
        id: "severance",
        condition: "tenure_years > 2",
        action: "require_approval",
        level: "hr",
        description: "Severance for employees > 2 years requires HR approval",
      },
      {
        id: "equity",
        condition: "has_unvested_equity",
        action: "escalate",
        level: "legal",
        description: "Unvested equity requires legal review",
      },
    ],
  },
  procurement: {
    processType: "procurement",
    name: "Procurement Request",
    description: "Purchase order processing with approval routing",
    initialState: "DECOMPOSE",
    states: [
      "DECOMPOSE",
      "ASSESS",
      "COMPUTE",
      "POLICY_CHECK",
      "APPROVAL_GATE",
      "MUTATE",
      "COMPLETE",
    ],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "POLICY_CHECK", on: "computed" },
      { from: "POLICY_CHECK", to: "APPROVAL_GATE", on: "policy_pass" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "policy_fail" },
      { from: "APPROVAL_GATE", to: "MUTATE", on: "approved" },
      { from: "MUTATE", to: "COMPLETE", on: "mutated" },
    ],
    defaultPolicyRules: [
      {
        id: "amount_500",
        condition: "total_amount > 500",
        action: "require_approval",
        level: "manager",
        threshold: 500,
        description: "Purchases > $500 require manager approval",
      },
      {
        id: "amount_5000",
        condition: "total_amount > 5000",
        action: "require_approval",
        level: "committee",
        threshold: 5000,
        description: "Purchases > $5000 require committee approval",
      },
      {
        id: "new_vendor",
        condition: "vendor_is_new",
        action: "require_approval",
        level: "finance",
        description: "New vendors require finance vetting",
      },
    ],
  },
  order_management: {
    processType: "order_management",
    name: "Order Modification",
    description: "Customer order modification with refund/charge recalculation",
    initialState: "DECOMPOSE",
    states: [
      "DECOMPOSE",
      "ASSESS",
      "COMPUTE",
      "POLICY_CHECK",
      "APPROVAL_GATE",
      "MUTATE",
      "SCHEDULE_NOTIFY",
      "COMPLETE",
    ],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "POLICY_CHECK", on: "computed" },
      { from: "POLICY_CHECK", to: "MUTATE", on: "policy_pass" },
      { from: "POLICY_CHECK", to: "APPROVAL_GATE", on: "requires_approval" },
      { from: "APPROVAL_GATE", to: "MUTATE", on: "approved" },
      { from: "MUTATE", to: "SCHEDULE_NOTIFY", on: "mutated" },
      { from: "SCHEDULE_NOTIFY", to: "COMPLETE", on: "notified" },
    ],
    defaultPolicyRules: [
      {
        id: "refund_100",
        condition: "refund_amount > 100",
        action: "require_approval",
        level: "manager",
        threshold: 100,
        description: "Refunds > $100 require manager approval",
      },
      {
        id: "gift_card",
        condition: "gift_card_balance_after < 0",
        action: "escalate",
        level: "finance",
        description: "Cannot exceed gift card capacity",
      },
    ],
  },
};

/**
 * Get process definition — tries DB first, falls back to builtin.
 * DB templates can override/extend builtins for org-specific customization.
 */
export async function getProcessDefinition(
  processType: string,
  organizationId: string,
  supabase: SupabaseClient
): Promise<ProcessDefinition> {
  try {
    const { data } = await supabase
      .from("bpaas_process_definitions")
      .select("fsm_definition, policy_rules, name, description")
      .eq("process_type", processType)
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)
      .order("organization_id", { nullsFirst: false }) // org-specific first
      .limit(1)
      .single();

    if (data?.fsm_definition) {
      const fsmDef = data.fsm_definition as {
        initial_state: string;
        states: string[];
        transitions: FSMTransition[];
      };
      return {
        processType,
        name: data.name as string,
        description: data.description as string,
        initialState: fsmDef.initial_state,
        states: fsmDef.states,
        transitions: fsmDef.transitions,
        defaultPolicyRules: (data.policy_rules as PolicyRule[]) ?? [],
      };
    }
  } catch (err) {
    logger.warn("[BPaaS/ProcessRegistry] DB lookup failed, using builtin", {
      processType,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const builtin = BUILTIN_DEFINITIONS[processType];
  if (!builtin) {
    throw new Error(
      `Unknown BPaaS process type: ${processType}. Valid types: ${BPAAS_PROCESS_TYPES.join(", ")}`
    );
  }
  return builtin;
}

export function isBPaaSProcessType(value: string): value is BPaaSProcessType {
  return BPAAS_PROCESS_TYPES.includes(value as BPaaSProcessType);
}

/** RL domain prefix — always "bpaas.<processType>" */
export function bpaasDomain(processType: string): string {
  return `bpaas.${processType}`;
}
