/**
 * Output Validator (ADR-023)
 * ==========================
 *
 * Process-type-aware output field validation.
 * Implements L2/L3/L3b/L4 Completion Contracts from the purple agent pattern:
 *   L2  — Structured JSON output (shape check)
 *   L3  — Required fields present for the process type
 *   L3b — Semantic validation (no placeholder values, no empty strings)
 *   L4  — Quality scoring (heuristic: field density × value richness)
 *
 * Design principles:
 * - Pure TypeScript: no DB calls, no Anthropic calls, synchronous
 * - Never throws — returns ValidationResult with details on failure
 * - Process-type registry is extensible (add new types at the bottom)
 */

import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CompletionLevel = "L2" | "L3" | "L3b" | "L4";

export interface ValidationResult {
  level: CompletionLevel | "FAIL";
  passed: boolean;
  score: number;          // 0.0–1.0 quality score
  missingFields: string[];
  invalidFields: string[];
  details: string;
}

// ── Process Type Definitions ──────────────────────────────────────────────────

interface ProcessSchema {
  requiredFields: string[];
  optionalFields: string[];
  semanticRules: SemanticRule[];
}

interface SemanticRule {
  field: string;
  check: (value: unknown) => boolean;
  errorMsg: string;
}

const PROCESS_SCHEMAS: Record<string, ProcessSchema> = {
  hr_offboarding: {
    requiredFields: ["employee_id", "termination_date", "access_revoked", "equipment_returned"],
    optionalFields: ["final_paycheck", "exit_interview", "knowledge_transfer_complete"],
    semanticRules: [
      {
        field: "termination_date",
        check: (v) => typeof v === "string" && v.length > 0 && v !== "TBD" && v !== "PLACEHOLDER",
        errorMsg: "termination_date must be a real date string",
      },
      {
        field: "access_revoked",
        check: (v) => typeof v === "boolean",
        errorMsg: "access_revoked must be boolean",
      },
    ],
  },
  procurement: {
    requiredFields: ["vendor_id", "amount", "approved_by", "purchase_order_id"],
    optionalFields: ["delivery_date", "budget_line", "approval_notes"],
    semanticRules: [
      {
        field: "amount",
        check: (v) => typeof v === "number" && v > 0,
        errorMsg: "amount must be a positive number",
      },
    ],
  },
  finance_analysis: {
    requiredFields: ["analysis_type", "result", "confidence"],
    optionalFields: ["methodology", "data_sources", "caveats"],
    semanticRules: [
      {
        field: "confidence",
        check: (v) => typeof v === "number" && (v as number) >= 0 && (v as number) <= 1,
        errorMsg: "confidence must be between 0 and 1",
      },
      {
        field: "result",
        check: (v) => v !== null && v !== undefined && String(v).length > 0,
        errorMsg: "result must be non-empty",
      },
    ],
  },
  delivery_intelligence: {
    requiredFields: ["engagement_id", "health_score", "recommendations"],
    optionalFields: ["risk_factors", "trend", "pod_recommendation"],
    semanticRules: [
      {
        field: "health_score",
        check: (v) => typeof v === "number" && (v as number) >= 0 && (v as number) <= 1,
        errorMsg: "health_score must be between 0 and 1",
      },
      {
        field: "recommendations",
        check: (v) => Array.isArray(v) && (v as unknown[]).length > 0,
        errorMsg: "recommendations must be a non-empty array",
      },
    ],
  },
  general: {
    requiredFields: ["result"],
    optionalFields: ["confidence", "reasoning", "next_steps"],
    semanticRules: [
      {
        field: "result",
        check: (v) => v !== null && v !== undefined && String(v).length > 0,
        errorMsg: "result must be non-empty",
      },
    ],
  },
};

// ── Placeholder Detection ─────────────────────────────────────────────────────

const PLACEHOLDER_PATTERNS = [
  /^TBD$/i,
  /^PLACEHOLDER$/i,
  /^TODO$/i,
  /^N\/A$/i,
  /^null$/i,
  /^undefined$/i,
  /^\{.*\}$/, // raw template tokens
  /^<.*>$/,   // XML-style placeholders
];

function isPlaceholder(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") {
    const s = value.trim();
    if (s.length === 0) return true;
    return PLACEHOLDER_PATTERNS.some((p) => p.test(s));
  }
  return false;
}

// ── Process Type Detector ─────────────────────────────────────────────────────

/**
 * Detect process type from domain string or output shape.
 * Maps known domain identifiers to registered process schemas.
 */
export function detectProcessType(domain: string, output?: Record<string, unknown>): string {
  const d = domain.toLowerCase().replace(/[^a-z0-9_]/g, "_");

  if (/hr|offboard|termination|employee/.test(d)) return "hr_offboarding";
  if (/procure|purchase|vendor|procurement/.test(d)) return "procurement";
  if (/finance|financial|npv|irr|sharpe|investment/.test(d)) return "finance_analysis";
  if (/delivery|engagement|health|pod|sprint/.test(d)) return "delivery_intelligence";

  // Heuristic from output shape
  if (output) {
    if ("employee_id" in output || "termination_date" in output) return "hr_offboarding";
    if ("vendor_id" in output || "purchase_order_id" in output) return "procurement";
    if ("analysis_type" in output || "methodology" in output) return "finance_analysis";
    if ("engagement_id" in output || "health_score" in output) return "delivery_intelligence";
  }

  return "general";
}

// ── Validation Core ───────────────────────────────────────────────────────────

/**
 * Validate process output against completion contracts.
 *
 * L2: Parses as JSON object (or already is an object)
 * L3: All required fields for the process type are present
 * L3b: No placeholder/empty values in required fields
 * L4: Semantic rules pass + quality score >= 0.65
 *
 * @param output    - The process result to validate (any shape)
 * @param domain    - Domain/process type hint (e.g. "hr_offboarding", "delivery-intelligence")
 * @returns         - ValidationResult with level reached and details
 */
export function validateProcessOutput(
  output: unknown,
  domain: string
): ValidationResult {
  // ── L2: JSON object check ──────────────────────────────────────────────────
  let parsed: Record<string, unknown>;

  if (output === null || output === undefined) {
    return {
      level: "FAIL",
      passed: false,
      score: 0,
      missingFields: [],
      invalidFields: [],
      details: "Output is null or undefined — L2 failed",
    };
  }

  if (typeof output === "string") {
    try {
      parsed = JSON.parse(output) as Record<string, unknown>;
    } catch {
      return {
        level: "FAIL",
        passed: false,
        score: 0,
        missingFields: [],
        invalidFields: [],
        details: "Output is not valid JSON — L2 failed",
      };
    }
  } else if (typeof output === "object" && !Array.isArray(output)) {
    parsed = output as Record<string, unknown>;
  } else {
    return {
      level: "FAIL",
      passed: false,
      score: 0.1,
      missingFields: [],
      invalidFields: [],
      details: `Output is ${typeof output} (not an object) — L2 failed`,
    };
  }

  // L2 passed ✓
  const processType = detectProcessType(domain, parsed);
  const schema = PROCESS_SCHEMAS[processType] ?? PROCESS_SCHEMAS.general;

  // ── L3: Required fields present ────────────────────────────────────────────
  const missingFields = schema.requiredFields.filter((f) => !(f in parsed));

  if (missingFields.length > 0) {
    return {
      level: "L2",
      passed: false,
      score: 0.3,
      missingFields,
      invalidFields: [],
      details: `L2 passed, L3 failed — missing required fields: ${missingFields.join(", ")} (process type: ${processType})`,
    };
  }

  // L3 passed ✓

  // ── L3b: No placeholder values ────────────────────────────────────────────
  const invalidFields: string[] = [];
  for (const field of schema.requiredFields) {
    if (isPlaceholder(parsed[field])) {
      invalidFields.push(field);
    }
  }

  if (invalidFields.length > 0) {
    return {
      level: "L3",
      passed: false,
      score: 0.5,
      missingFields: [],
      invalidFields,
      details: `L3 passed, L3b failed — placeholder values in: ${invalidFields.join(", ")}`,
    };
  }

  // L3b passed ✓

  // ── L4: Semantic rules ────────────────────────────────────────────────────
  const semanticViolations: string[] = [];
  for (const rule of schema.semanticRules) {
    if (rule.field in parsed) {
      try {
        if (!rule.check(parsed[rule.field])) {
          semanticViolations.push(rule.errorMsg);
        }
      } catch {
        semanticViolations.push(`${rule.field}: check threw`);
      }
    }
  }

  if (semanticViolations.length > 0) {
    return {
      level: "L3b",
      passed: false,
      score: 0.65,
      missingFields: [],
      invalidFields: semanticViolations.map((v) => v.split(":")[0].trim()),
      details: `L3b passed, L4 failed — semantic violations: ${semanticViolations.join("; ")}`,
    };
  }

  // ── Quality score ─────────────────────────────────────────────────────────
  const allFields = [...schema.requiredFields, ...schema.optionalFields];
  const presentOptional = schema.optionalFields.filter((f) => f in parsed && !isPlaceholder(parsed[f])).length;
  const optionalDensity = schema.optionalFields.length > 0 ? presentOptional / schema.optionalFields.length : 1.0;

  // Value richness: check if string values have meaningful content (>10 chars)
  let richValues = 0;
  let checkableValues = 0;
  for (const field of schema.requiredFields) {
    const val = parsed[field];
    if (typeof val === "string") {
      checkableValues++;
      if (val.trim().length > 10) richValues++;
    } else if (val !== null && val !== undefined) {
      checkableValues++;
      richValues++;
    }
  }
  const valueRichness = checkableValues > 0 ? richValues / checkableValues : 1.0;

  const score = Math.round((0.7 * valueRichness + 0.3 * optionalDensity) * 100) / 100;

  logger.warn("[output-validator] L4 passed", {
    processType,
    score,
    presentFields: schema.requiredFields.length,
    allFields: allFields.length,
  });

  return {
    level: "L4",
    passed: true,
    score: Math.max(0.65, Math.min(1.0, score)),
    missingFields: [],
    invalidFields: [],
    details: `All contracts passed (L2→L3→L3b→L4) — process type: ${processType}, score: ${score.toFixed(2)}`,
  };
}

/**
 * Quick check: does this output meet at least L3 (required fields)?
 * Returns true if all required fields are present (ignores semantic rules).
 */
export function meetsMinimumContract(output: unknown, domain: string): boolean {
  const result = validateProcessOutput(output, domain);
  return result.level !== "FAIL" && result.level !== "L2";
}

/**
 * Format validation result as a system prompt suffix for the LLM.
 * Used when output_validator detects an L2/L3 failure — injects a correction hint.
 */
export function buildValidationHint(result: ValidationResult, domain: string): string {
  if (result.passed) return "";

  const lines: string[] = [];
  lines.push("## OUTPUT VALIDATION NOTICE");
  lines.push(`Your previous response did not meet the ${result.level || "L2"} completion contract for domain: ${domain}`);

  if (result.missingFields.length > 0) {
    lines.push(`Missing required fields: ${result.missingFields.join(", ")}`);
  }
  if (result.invalidFields.length > 0) {
    lines.push(`Invalid/placeholder values in: ${result.invalidFields.join(", ")}`);
  }
  lines.push("Please ensure your response includes all required structured fields.");

  return lines.join("\n");
}
