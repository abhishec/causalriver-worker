/**
 * Calculator Tool — Safe Math Expression Evaluator
 * ==================================================
 * GAIA-ready: evaluates arithmetic and scientific math expressions.
 * Uses a whitelist-based approach — only known-safe operations are permitted.
 * No external dependencies. Zero network calls. Instant.
 *
 * Supports:
 *   - Arithmetic: +, -, *, /, **, % (power via **)
 *   - Math functions: sqrt, abs, sin, cos, tan, asin, acos, atan, atan2,
 *                     log, log2, log10, exp, pow, floor, ceil, round, sign, trunc
 *   - Constants: PI, E, LN2, LN10, LOG2E, LOG10E, SQRT2
 *   - Comparison: returns boolean as 0/1 for GAIA boolean questions
 */

export interface CalculatorResult {
  result: number | string;
  expression: string;
  formatted: string;
  error?: string;
}

// Safe math environment — only expose known-safe Math functions + basic operators
const SAFE_MATH_FN_NAMES = [
  "sqrt", "abs", "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
  "log", "log2", "log10", "exp", "pow", "floor", "ceil", "round",
  "sign", "trunc", "min", "max", "hypot", "cbrt", "clz32",
] as const;

// Build the safe context
const SAFE_CONTEXT: Record<string, unknown> = {
  PI: Math.PI,
  E: Math.E,
  LN2: Math.LN2,
  LN10: Math.LN10,
  LOG2E: Math.LOG2E,
  LOG10E: Math.LOG10E,
  SQRT2: Math.SQRT2,
  Infinity: Infinity,
  NaN: NaN,
};

const _mathAsRecord = Math as unknown as Record<string, unknown>;
for (const fn of SAFE_MATH_FN_NAMES) {
  SAFE_CONTEXT[fn] = _mathAsRecord[fn];
  // Also add uppercase aliases for GAIA compatibility (e.g. SQRT, ABS)
  SAFE_CONTEXT[fn.toUpperCase()] = _mathAsRecord[fn];
}

// Regex to validate expression — reject anything that looks like code injection
// Allow: digits, operators, parentheses, dots, spaces, function names, commas
const SAFE_EXPR_RE = /^[0-9\s+\-*/().^%,_a-zA-Z]+$/;

// Additional blocklist for dangerous patterns
const BLOCKLIST_RE = /\b(function|return|var|let|const|import|require|eval|this|window|global|process|Buffer|fetch|XMLHttpRequest|document|localStorage|__dirname|__filename)\b/i;

/**
 * Evaluate a math expression safely.
 * Returns { result, formatted, error }.
 */
export function calculate(expression: string): CalculatorResult {
  const expr = String(expression ?? "").trim();
  if (!expr) {
    return { result: "", expression: expr, formatted: "", error: "No expression provided" };
  }

  // Normalize common syntax: ^ → ** (Python/math notation → JS)
  const normalized = expr
    .replace(/\^/g, "**")
    // Allow 'pi' lowercase → 'PI'
    .replace(/\bpi\b/gi, "PI")
    .replace(/\be\b(?!\w)/g, "E");

  // Safety checks
  if (!SAFE_EXPR_RE.test(normalized)) {
    return {
      result: "",
      expression: expr,
      formatted: "",
      error: `Unsafe expression: contains disallowed characters`,
    };
  }

  if (BLOCKLIST_RE.test(normalized)) {
    return {
      result: "",
      expression: expr,
      formatted: "",
      error: "Unsafe expression: blocked keyword detected",
    };
  }

  try {
    // Build argument list for the safe evaluator function
    const argNames = Object.keys(SAFE_CONTEXT);
    const argValues = Object.values(SAFE_CONTEXT);

    const fn = new Function(...argNames, `"use strict"; return (${normalized});`) as (...args: unknown[]) => unknown;
    const result = fn(...argValues);

    if (typeof result === "number") {
      if (isNaN(result)) {
        return { result: "NaN", expression: expr, formatted: "NaN (undefined result)", error: "Result is NaN" };
      }
      if (!isFinite(result)) {
        return { result: "Infinity", expression: expr, formatted: result > 0 ? "Infinity" : "-Infinity" };
      }
      // Format: use toPrecision for very large/small numbers, otherwise fixed
      const formatted = Math.abs(result) > 1e12 || (Math.abs(result) < 1e-6 && result !== 0)
        ? result.toPrecision(10)
        : result % 1 === 0
          ? result.toString()
          : parseFloat(result.toPrecision(12)).toString();

      return { result, expression: expr, formatted };
    }

    if (typeof result === "boolean") {
      return {
        result: result ? 1 : 0,
        expression: expr,
        formatted: result ? "true (1)" : "false (0)",
      };
    }

    return { result: String(result), expression: expr, formatted: String(result) };
  } catch (err) {
    return {
      result: "",
      expression: expr,
      formatted: "",
      error: `Evaluation error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
