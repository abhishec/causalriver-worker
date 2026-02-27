import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateConstraints } from "@/lib/brain/policy-enforcer";
import { logger } from "@/lib/logger";
import type { PolicyRule } from "./process-registry";

export interface PolicyContext {
  // Financial fields
  total_amount?: number;
  refund_amount?: number;
  gift_card_balance_after?: number;
  // HR fields
  pto_balance?: number;
  tenure_years?: number;
  has_unvested_equity?: boolean;
  // Vendor fields
  vendor_is_new?: boolean;
  // Generic
  [key: string]: unknown;
}

export interface PolicyCheckResult {
  passed: boolean;
  requiresApproval: boolean;
  escalationRequired: boolean;
  triggeredRules: Array<{
    ruleId: string;
    action: string;
    level: string;
    description: string;
  }>;
  escalationLevel?: "manager" | "committee" | "hr" | "finance" | "legal" | "cfo" | "ciso";
  summary: string;
}

/**
 * Evaluate BPaaS policy rules against a context — fully deterministic, zero LLM.
 * Evaluates each rule's condition string against the context object.
 * Returns a PolicyCheckResult indicating pass/fail and required actions.
 */
export function evaluatePolicyRules(
  rules: PolicyRule[],
  context: PolicyContext
): PolicyCheckResult {
  const triggered: PolicyCheckResult["triggeredRules"] = [];

  for (const rule of rules) {
    if (evaluateCondition(rule.condition, context)) {
      triggered.push({
        ruleId: rule.id,
        action: rule.action,
        level: rule.level,
        description: rule.description,
      });
    }
  }

  const requiresApproval = triggered.some((r) => r.action === "require_approval");
  const escalationRequired = triggered.some((r) => r.action === "escalate");
  const blocked = triggered.some((r) => r.action === "block");

  // Highest escalation level wins
  const levelPriority = [
    "manager",
    "hr",
    "finance",
    "committee",
    "legal",
    "cfo",
    "ciso",
  ];
  const triggeredLevels = triggered.map((r) => r.level);
  const escalationLevel = levelPriority
    .slice()
    .reverse()
    .find((l) => triggeredLevels.includes(l)) as
    | PolicyCheckResult["escalationLevel"]
    | undefined;

  const passed = !blocked && !escalationRequired && !requiresApproval;

  return {
    passed,
    requiresApproval,
    escalationRequired,
    triggeredRules: triggered,
    escalationLevel: triggered.length > 0 ? escalationLevel : undefined,
    summary: passed
      ? "All policy rules passed"
      : `${triggered.length} rule(s) triggered: ${triggered.map((r) => r.ruleId).join(", ")}`,
  };
}

/**
 * Evaluate a simple condition string against a context object.
 * Supports: >, <, >=, <=, ==, ===, boolean field checks.
 * Fully deterministic — no eval(), no LLM.
 */
function evaluateCondition(condition: string, context: PolicyContext): boolean {
  try {
    // Match patterns like: "field > number", "field < number", "boolean_field"
    const comparisonMatch = condition.match(/^(\w+)\s*(>|<|>=|<=|===|==|!=)\s*(.+)$/);
    if (comparisonMatch) {
      const [, field, operator, rawValue] = comparisonMatch;
      const contextValue = context[field];
      if (contextValue === undefined) return false;

      const numValue = parseFloat(rawValue);
      const strValue = rawValue.replace(/['"]/g, "");

      switch (operator) {
        case ">":
          return (contextValue as number) > numValue;
        case "<":
          return (contextValue as number) < numValue;
        case ">=":
          return (contextValue as number) >= numValue;
        case "<=":
          return (contextValue as number) <= numValue;
        case "===":
        case "==":
          return String(contextValue) === strValue;
        case "!=":
          return String(contextValue) !== strValue;
      }
    }

    // Boolean field check: "has_unvested_equity", "vendor_is_new"
    if (/^\w+$/.test(condition)) {
      return Boolean(context[condition]);
    }

    return false;
  } catch (err) {
    logger.warn("[BPaaS/PolicyChecker] Condition evaluation error", {
      condition,
      error: String(err),
    });
    return false;
  }
}

/**
 * Run BPaaS policy check + existing org-level constraint check.
 * Combines BPaaS-specific rule evaluation with the platform's existing
 * evaluateConstraints() (rate limits, concurrent job limits, etc.)
 */
export async function runPolicyCheck(
  supabase: SupabaseClient,
  orgId: string,
  processType: string,
  rules: PolicyRule[],
  context: PolicyContext
): Promise<PolicyCheckResult> {
  // First: platform-level constraints (rate limits, job quotas)
  const platformConstraints = await evaluateConstraints(supabase, orgId);
  if (!platformConstraints.allowed) {
    return {
      passed: false,
      requiresApproval: false,
      escalationRequired: true,
      triggeredRules: [
        {
          ruleId: "platform_limit",
          action: "escalate",
          level: "ciso",
          description:
            platformConstraints.reason ?? "Platform rate limit exceeded",
        },
      ],
      escalationLevel: "ciso",
      summary: `Platform constraint: ${platformConstraints.reason ?? "rate limit"}`,
    };
  }

  // Then: BPaaS-specific deterministic policy rules
  return evaluatePolicyRules(rules, context);
}
