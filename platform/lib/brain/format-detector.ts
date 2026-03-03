/**
 * Format Detector
 * ================
 *
 * Detects the required output format from the user's message BEFORE the LLM call
 * and returns a format directive to append to the system prompt.
 *
 * Prevents format-mismatch responses that require reprompting.
 *
 * Design principles:
 * - Pure functions only — no DB, no API, no side effects
 * - Synchronous — zero latency overhead on the hot path
 * - Exhaustive match — every OutputFormat has a concrete directive
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type OutputFormat =
  | "json_object"     // "give me JSON", "return as JSON", "in JSON format"
  | "markdown_table"  // "as a table", "in table format", "show as table"
  | "bullet_list"     // "bullet points", "as bullets", "list format", "as a list"
  | "numbered_list"   // "numbered list", "step by step", "steps to"
  | "comparison"      // "compare", "vs", "versus", "side by side"
  | "summary"         // "summarise", "summarize", "brief", "TLDR", "TL;DR"
  | "code_only"       // "write the code", "just the code", "code snippet"
  | "prose";          // default — no special format detected

// ── Detection Rules ───────────────────────────────────────────────────────────
//
// Order matters: rules are evaluated top-to-bottom and the first match wins.
// More specific patterns (e.g. code_only) must come before general ones (e.g. prose).

interface FormatRule {
  format: OutputFormat;
  patterns: RegExp[];
}

const FORMAT_RULES: FormatRule[] = [
  {
    format: "json_object",
    patterns: [
      /\bjson\b/i,
      /\breturn as json\b/i,
      /\bin json format\b/i,
      /\bjson output\b/i,
      /\bgive me json\b/i,
    ],
  },
  {
    format: "markdown_table",
    patterns: [
      /\bas a table\b/i,
      /\bin table format\b/i,
      /\bshow.{0,10}as.{0,10}table\b/i,
      /\bcreate a table\b/i,
      /\buse a table\b/i,
      /\bin.{0,5}tabular\b/i,
    ],
  },
  {
    format: "code_only",
    patterns: [
      /\bwrite the code\b/i,
      /\bjust the code\b/i,
      /\bcode snippet\b/i,
      /\bgive me the code\b/i,
      /\bonly the code\b/i,
      /\bcode only\b/i,
    ],
  },
  {
    format: "numbered_list",
    patterns: [
      /\bnumbered list\b/i,
      /\bnumbered steps\b/i,
      /\bstep by step\b/i,
      /\bsteps to\b/i,
      /\bstep-by-step\b/i,
      /\bwalk me through the steps\b/i,
    ],
  },
  {
    format: "bullet_list",
    patterns: [
      /\bbullet points?\b/i,
      /\bas bullets?\b/i,
      /\blist format\b/i,
      /\bas a list\b/i,
      /\bin bullet\b/i,
      /\busing bullets?\b/i,
    ],
  },
  {
    format: "comparison",
    patterns: [
      /\bcompare\b/i,
      /\bvs\.?\b/i,
      /\bversus\b/i,
      /\bside by side\b/i,
      /\bside-by-side\b/i,
      /\bdifference between\b/i,
      /\bdifferences between\b/i,
      /\bpros and cons\b/i,
      /\bpro.{0,5}con\b/i,
    ],
  },
  {
    format: "summary",
    patterns: [
      /\bsummarise\b/i,
      /\bsummarize\b/i,
      /\bbrief(ly)?\b/i,
      /\btl;?dr\b/i,
      /\bshort version\b/i,
      /\bin brief\b/i,
      /\bquick summary\b/i,
      /\boverview\b/i,
    ],
  },
];

// ── Directives ────────────────────────────────────────────────────────────────

const FORMAT_DIRECTIVES: Record<OutputFormat, string> = {
  json_object:
    "OUTPUT FORMAT REQUIRED: Return ONLY valid JSON. No prose, no markdown code fences, no explanation. Just the JSON object.",
  markdown_table:
    "OUTPUT FORMAT REQUIRED: Use a markdown table as the primary output structure. Columns must be clearly labeled. Use | separators.",
  bullet_list:
    "OUTPUT FORMAT REQUIRED: Format response as bullet points using - prefix. Max 8 bullets. Each bullet max 20 words.",
  numbered_list:
    "OUTPUT FORMAT REQUIRED: Use numbered steps (1. 2. 3.). Each step must be actionable and specific.",
  comparison:
    "OUTPUT FORMAT REQUIRED: Structure as a side-by-side comparison. Use a table with Option A | Option B columns or clearly labeled sections.",
  summary:
    "OUTPUT FORMAT REQUIRED: Respond concisely in 3-5 sentences maximum. No preamble. Lead with the key insight.",
  code_only:
    "OUTPUT FORMAT REQUIRED: Return ONLY the code. No explanation before or after. Include necessary imports.",
  prose: "",
};

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Detects the required output format from the user's message.
 * Returns 'prose' when no specific format is detected.
 */
export function detectOutputFormat(userMessage: string): OutputFormat {
  for (const rule of FORMAT_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(userMessage)) {
        return rule.format;
      }
    }
  }
  return "prose";
}

/**
 * Returns the format directive string to append to the system prompt.
 * Returns empty string for 'prose' (no directive needed).
 */
export function buildFormatDirective(format: OutputFormat): string {
  return FORMAT_DIRECTIVES[format];
}

/**
 * Convenience helper: returns true when the user message contains a
 * non-prose format requirement (i.e. a directive would be injected).
 */
export function hasFormatRequirement(userMessage: string): boolean {
  return detectOutputFormat(userMessage) !== "prose";
}
