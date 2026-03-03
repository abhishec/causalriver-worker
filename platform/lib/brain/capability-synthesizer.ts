/**
 * Capability Synthesizer
 * ======================
 *
 * Detects computation gaps in task descriptions (NPV, velocity trends,
 * burndown, Sharpe ratio, etc.) and synthesizes JavaScript functions to
 * fill them. Capabilities are registered and reused across the session.
 *
 * Design principles:
 * - Pure detection: regex-based, zero cost, synchronous
 * - Haiku synthesis: cheap LLM call only when a capability is missing
 * - Registry-backed: ai_memory caches synthesized functions per workspace
 * - Graceful degradation: never throws, returns [] on any failure
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComputationGap {
  type: string;           // 'npv', 'velocity_trend', 'burndown', 'sharpe_ratio', etc.
  description: string;
  inputTypes: string[];
  outputType: string;
}

export interface SynthesizedCapability {
  name: string;
  description: string;
  gapType: string;
  implementation: string;   // JavaScript function source
  testResult: "passed" | "failed" | "skipped";
  createdAt: string;
}

export interface CapabilityRegistry {
  capabilities: Record<string, SynthesizedCapability>;
  lastUpdated: string;
}

// ── Gap Pattern Definitions ───────────────────────────────────────────────────

interface GapPattern {
  regex: RegExp;
  type: string;
  description: string;
  inputTypes: string[];
  outputType: string;
}

const GAP_PATTERNS: GapPattern[] = [
  {
    regex: /\bnpv\b|net present value/i,
    type: "npv",
    description: "Net Present Value calculation",
    inputTypes: ["cashflows", "discountRate"],
    outputType: "number",
  },
  {
    regex: /\birr\b|internal rate of return/i,
    type: "irr",
    description: "Internal Rate of Return calculation",
    inputTypes: ["cashflows"],
    outputType: "number",
  },
  {
    regex: /velocity[ _-]?trend|velocity trend/i,
    type: "velocity_trend",
    description: "Sprint velocity trend analysis",
    inputTypes: ["sprintVelocities"],
    outputType: "trend_object",
  },
  {
    regex: /\bburndown\b|burn[ _-]?down/i,
    type: "burndown",
    description: "Burndown chart data generation",
    inputTypes: ["totalPoints", "completedPoints", "sprintDays"],
    outputType: "chart_data",
  },
  {
    regex: /\bsharpe\b|sharpe ratio/i,
    type: "sharpe_ratio",
    description: "Sharpe ratio calculation",
    inputTypes: ["returns", "riskFreeRate"],
    outputType: "number",
  },
  {
    regex: /\bcagr\b|compound annual/i,
    type: "cagr",
    description: "Compound Annual Growth Rate calculation",
    inputTypes: ["startValue", "endValue", "years"],
    outputType: "number",
  },
  {
    regex: /\bamortization\b|loan schedule/i,
    type: "amortization",
    description: "Loan amortization schedule generation",
    inputTypes: ["principal", "rate", "periods"],
    outputType: "schedule_array",
  },
  {
    regex: /variance[ _-]?analysis|budget variance/i,
    type: "variance_analysis",
    description: "Budget variance analysis",
    inputTypes: ["actual", "budget"],
    outputType: "analysis_object",
  },
];

// ── Detection ─────────────────────────────────────────────────────────────────

/**
 * Detects computation gaps in a task description using regex pattern matching.
 *
 * Pure function — no I/O, no side effects, synchronous.
 * Returns [] if no known computation gaps are detected.
 */
export function detectComputationGaps(taskDescription: string): ComputationGap[] {
  const gaps: ComputationGap[] = [];
  const seen = new Set<string>();

  for (const pattern of GAP_PATTERNS) {
    if (!seen.has(pattern.type) && pattern.regex.test(taskDescription)) {
      seen.add(pattern.type);
      gaps.push({
        type: pattern.type,
        description: pattern.description,
        inputTypes: [...pattern.inputTypes],
        outputType: pattern.outputType,
      });
    }
  }

  return gaps;
}

// ── Synthesis ─────────────────────────────────────────────────────────────────

/**
 * Synthesizes a JavaScript capability function for a detected computation gap.
 *
 * Calls claude-haiku-4-5-20251001 with a tight prompt to generate a pure,
 * side-effect-free JavaScript function. Validates it by attempting construction
 * in a safe context. Returns null on any failure.
 *
 * 8-second timeout.
 */
export async function synthesizeCapability(
  gap: ComputationGap,
  apiKey: string
): Promise<SynthesizedCapability | null> {
  const startMs = Date.now();
  const functionName = `compute_${gap.type}`;
  const inputsSignature = gap.inputTypes.join(", ");

  const prompt =
    `Write a pure JavaScript function called \`${functionName}\` that takes ` +
    `(${inputsSignature}) and returns ${gap.outputType}. ` +
    `No imports. No side effects. Handle edge cases gracefully. ` +
    `Return only the function definition, wrapped in \`\`\`javascript\`\`\` fences.`;

  try {
    const anthropic = new Anthropic({ apiKey });

    const SYNTHESIS_TIMEOUT_MS = 8000;

    const synthesisPromise = anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Synthesis timeout")), SYNTHESIS_TIMEOUT_MS)
    );

    const response = await Promise.race([synthesisPromise, timeoutPromise]);

    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    if (!rawText) {
      logger.warn("[CapabilitySynthesizer] empty response from Haiku", {
        gapType: gap.type,
      });
      return null;
    }

    const implementation = extractFunctionBody(rawText);
    if (!implementation) {
      logger.warn("[CapabilitySynthesizer] could not extract function from response", {
        gapType: gap.type,
        rawPreview: rawText.slice(0, 100),
      });
      return null;
    }

    // Validate: attempt to construct the function to catch syntax errors
    let testResult: SynthesizedCapability["testResult"] = "skipped";
    try {
      // eslint-disable-next-line no-new-func
      new Function(`return (${implementation})`);
      testResult = "passed";
    } catch (syntaxErr) {
      logger.warn("[CapabilitySynthesizer] syntax validation failed", {
        gapType: gap.type,
        error: String(syntaxErr),
      });
      testResult = "failed";
      // Still return the capability — the caller can decide whether to use it
    }

    const durationMs = Date.now() - startMs;
    logger.info("[CapabilitySynthesizer] synthesized capability", {
      gapType: gap.type,
      testResult,
      durationMs,
    });

    return {
      name: functionName,
      description: gap.description,
      gapType: gap.type,
      implementation,
      testResult,
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn("[CapabilitySynthesizer] synthesis failed (non-fatal)", {
      gapType: gap.type,
      error: String(err),
    });
    return null;
  }
}

// ── Registry + Orchestration ──────────────────────────────────────────────────

/**
 * Detects gaps in a task, checks the ai_memory registry for cached capabilities,
 * synthesizes any missing ones, caches them, and returns all available capabilities.
 *
 * Never throws — returns [] on any failure or if no gaps are detected.
 */
export async function getOrSynthesizeCapabilities(
  taskDescription: string,
  workspaceId: string,
  apiKey: string,
  supabase: SupabaseClient
): Promise<SynthesizedCapability[]> {
  try {
    const gaps = detectComputationGaps(taskDescription);
    if (gaps.length === 0) return [];

    const capabilities: SynthesizedCapability[] = [];

    for (const gap of gaps) {
      try {
        // Check registry: ai_memory with domain='capability-registry', memory_type=gapType
        const cached = await loadCachedCapability(supabase, workspaceId, gap.type);

        if (cached) {
          capabilities.push(cached);
          continue;
        }

        // Not cached — synthesize
        const synthesized = await synthesizeCapability(gap, apiKey);
        if (!synthesized) continue;

        // Cache in ai_memory (fire-and-forget)
        cacheCapability(supabase, workspaceId, gap.type, synthesized).catch((err) =>
          logger.warn("[CapabilitySynthesizer] cache write failed (non-fatal)", {
            gapType: gap.type,
            error: String(err),
          })
        );

        capabilities.push(synthesized);
      } catch (gapErr) {
        logger.warn("[CapabilitySynthesizer] gap processing failed (non-fatal)", {
          gapType: gap.type,
          error: String(gapErr),
        });
        // Continue to next gap
      }
    }

    return capabilities;
  } catch (err) {
    logger.warn("[CapabilitySynthesizer] getOrSynthesizeCapabilities failed (non-fatal)", {
      error: String(err),
    });
    return [];
  }
}

/**
 * Formats synthesized capabilities into a system prompt injection block.
 *
 * Returns "" if the capabilities array is empty so callers can safely
 * append to a system prompt without adding blank sections.
 */
export function formatCapabilitiesForPrompt(
  capabilities: SynthesizedCapability[]
): string {
  if (capabilities.length === 0) return "";

  const sections = capabilities
    .filter((c) => c.testResult !== "failed")
    .map((c) => {
      return (
        `**${c.name}(${inferSignatureFromName(c.gapType)})** — ${c.description}\n` +
        "```javascript\n" +
        c.implementation +
        "\n```"
      );
    });

  if (sections.length === 0) return "";

  return (
    "## SYNTHESIZED COMPUTATION CAPABILITIES\n" +
    "The following functions are available for this task:\n\n" +
    sections.join("\n\n") +
    "\n\nUse these functions in your reasoning when computing the requested values."
  );
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

/**
 * Extracts the function body from a Haiku response.
 *
 * Tries:
 * 1. Content between ```javascript ... ``` or ```js ... ``` fences
 * 2. Content between ``` ... ``` fences
 * 3. First function declaration found in raw text
 */
function extractFunctionBody(rawText: string): string | null {
  // Try named code fences first
  const fenceMatch = rawText.match(
    /```(?:javascript|js)\s*\n([\s\S]*?)\n?```/
  );
  if (fenceMatch?.[1]) return fenceMatch[1].trim();

  // Try generic code fence
  const genericFenceMatch = rawText.match(/```\s*\n([\s\S]*?)\n?```/);
  if (genericFenceMatch?.[1]) return genericFenceMatch[1].trim();

  // Try first function declaration
  const funcMatch = rawText.match(/function\s+\w+\s*\([^)]*\)\s*\{[\s\S]*?\}/);
  if (funcMatch?.[0]) return funcMatch[0].trim();

  // Try arrow function or const function assignment
  const constMatch = rawText.match(/(?:const|let|var)\s+\w+\s*=\s*(?:function|\([^)]*\)\s*=>)\s*\{[\s\S]*?\}/);
  if (constMatch?.[0]) return constMatch[0].trim();

  return null;
}

/**
 * Loads a cached capability from ai_memory.
 * Returns null if not found or on any error.
 */
async function loadCachedCapability(
  supabase: SupabaseClient,
  workspaceId: string,
  gapType: string
): Promise<SynthesizedCapability | null> {
  try {
    const { data, error } = await supabase
      .from("ai_memory")
      .select("content, metadata, created_at")
      .eq("organization_id", workspaceId)
      .eq("domain", "capability-registry")
      .eq("memory_type", gapType)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    // Deserialize from stored content
    const parsed = JSON.parse(data.content as string) as SynthesizedCapability;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persists a synthesized capability to ai_memory for future reuse.
 * Fire-and-forget — caller handles errors.
 */
async function cacheCapability(
  supabase: SupabaseClient,
  workspaceId: string,
  gapType: string,
  capability: SynthesizedCapability
): Promise<void> {
  await supabase.from("ai_memory").insert({
    organization_id: workspaceId,
    domain: "capability-registry",
    memory_type: gapType,
    content: JSON.stringify(capability),
    importance: 0.8,
    metadata: {
      gapType,
      capabilityName: capability.name,
      testResult: capability.testResult,
      cachedAt: new Date().toISOString(),
    },
  });
}

/**
 * Returns a human-readable function signature hint from a gap type name.
 * Used for the formatCapabilitiesForPrompt display only.
 */
function inferSignatureFromName(gapType: string): string {
  const pattern = GAP_PATTERNS.find((p) => p.type === gapType);
  if (pattern) return pattern.inputTypes.join(", ");
  // Fallback: convert underscored gap type to camelCase params
  return gapType
    .split("_")
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
}

// ── Test Case Executor ────────────────────────────────────────────────────────

interface CapabilityTestCase {
  inputs: Record<string, unknown>;
  expectedOutputType: "number" | "string" | "array" | "object" | "boolean";
  description: string;
}

// Default test cases per gap type
const DEFAULT_TEST_CASES: Record<string, CapabilityTestCase[]> = {
  npv: [
    {
      inputs: { cashflows: [-1000, 300, 400, 500], discountRate: 0.1 },
      expectedOutputType: "number",
      description: "NPV of standard investment",
    },
  ],
  irr: [
    {
      inputs: { cashflows: [-1000, 300, 400, 500] },
      expectedOutputType: "number",
      description: "IRR of standard investment",
    },
  ],
  velocity_trend: [
    {
      inputs: { sprintVelocities: [30, 35, 32, 38, 40] },
      expectedOutputType: "object",
      description: "Velocity trend for 5 sprints",
    },
  ],
  burndown: [
    {
      inputs: { totalPoints: 100, completedPoints: [0, 20, 40, 65, 80], sprintDays: 10 },
      expectedOutputType: "object",
      description: "Burndown chart data",
    },
  ],
  sharpe_ratio: [
    {
      inputs: { returns: [0.05, 0.03, 0.08, -0.02, 0.06], riskFreeRate: 0.02 },
      expectedOutputType: "number",
      description: "Sharpe ratio calculation",
    },
  ],
  cagr: [
    {
      inputs: { startValue: 1000, endValue: 2000, years: 5 },
      expectedOutputType: "number",
      description: "CAGR 5-year",
    },
  ],
  amortization: [
    {
      inputs: { principal: 100000, rate: 0.05, periods: 12 },
      expectedOutputType: "object",
      description: "Monthly amortization schedule",
    },
  ],
  engagement_health: [
    {
      inputs: { metrics: [{ score: 0.8 }, { score: 0.6 }, { score: 0.7 }] },
      expectedOutputType: "object",
      description: "Engagement health aggregation",
    },
  ],
};

/**
 * Execute a synthesized capability function against test cases.
 * Uses Function() constructor in a try-catch for safe execution.
 *
 * @param capability - The synthesized capability to test
 * @returns          - "passed" | "failed" | "skipped" with optional error message
 */
export function executeCapabilityTests(
  capability: SynthesizedCapability
): { result: "passed" | "failed" | "skipped"; error?: string } {
  const testCases = DEFAULT_TEST_CASES[capability.gapType];

  if (!testCases || testCases.length === 0) {
    return { result: "skipped" };
  }

  const { implementation } = capability;

  for (const testCase of testCases) {
    try {
      // Wrap the implementation in a function factory and execute
      // eslint-disable-next-line no-new-func
      const fn = new Function(`
        ${implementation}
        // Auto-call: find the first function definition and call it
        const fnMatch = \`${implementation.replace(/`/g, "\\`")}\`.match(/function\\s+(\\w+)/);
        const fnName = fnMatch ? fnMatch[1] : null;
        if (fnName && typeof eval(fnName) === 'function') {
          return eval(fnName)(${JSON.stringify(Object.values(testCase.inputs)[0])});
        }
        return null;
      `);

      const output = fn();

      // Type check the output
      const outputType = Array.isArray(output) ? "array" : typeof output;
      if (output === null || output === undefined) {
        return { result: "failed", error: "Function returned null/undefined" };
      }
      if (outputType !== testCase.expectedOutputType && testCase.expectedOutputType !== "object") {
        return {
          result: "failed",
          error: `Expected ${testCase.expectedOutputType}, got ${outputType}`,
        };
      }
    } catch (err) {
      return {
        result: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return { result: "passed" };
}

// ── Capability Observer ───────────────────────────────────────────────────────

/**
 * ADR-027 PART 7A: Records a capability gap based on low response quality.
 *
 * Called from post-flight when responseQuality < 0.5. Unlike observeCapabilityRegret
 * (which scans LLM response text for regret phrases), this function records gaps
 * triggered by quality-score signals — indicating the AI produced a weak answer
 * for this domain/query combination and should synthesize better tooling.
 *
 * Fire-and-forget safe: never throws.
 *
 * @param params.domain       - Domain that produced the low-quality response
 * @param params.query        - Original user query (truncated to 300 chars)
 * @param params.qualityScore - RL quality score (0–1) that triggered the gap
 * @param params.supabase     - Supabase service-role client
 * @param params.orgId        - Organization/workspace ID
 */
export async function recordCapabilityGap(params: {
  domain: string;
  query: string;
  qualityScore: number;
  supabase: SupabaseClient;
  orgId: string;
}): Promise<void> {
  const { domain, query, qualityScore, supabase, orgId } = params;

  logger.warn("[capability-synthesizer] recordCapabilityGap: low-quality response gap", {
    domain,
    orgId,
    qualityScore,
    queryPreview: query.slice(0, 80),
  });

  try {
    await supabase.from("ai_memory").insert({
      organization_id: orgId,
      domain: `capability-gap:${domain}`,
      memory_type: "capability-regret",
      content: JSON.stringify({
        domain,
        query: query.slice(0, 300),
        qualityScore,
        source: "quality-signal",
        detectedAt: new Date().toISOString(),
      }),
      importance: 0.7,
      metadata: {
        gapSource: "quality-signal",
        qualityScore,
        domain,
        recordedAt: new Date().toISOString(),
      },
    });

    // ADR-028: Also record gap in capability_library for tool-maker synthesis
    void Promise.resolve(supabase.from("capability_library").insert({
      organization_id: orgId,
      name: `gap_${domain.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}`,
      description: query.slice(0, 300),
      domain,
      implementation: "",  // empty — gap only
      status: "gap",
      quality_score: qualityScore,
      synthesized_by: "system",
    })).catch(() => {
      // fire-and-forget — capability_library may not exist yet
    });
  } catch {
    // fire-and-forget — never throw
  }
}

/**
 * CapabilityObserver: detects computation gaps in LLM responses at inference time.
 *
 * After an LLM response is generated, scan it for phrases indicating the LLM
 * lacked a computation capability (e.g., "I cannot calculate", "would require
 * running code", "I don't have the ability to compute").
 *
 * These are "capability regret" signals — the LLM wanted to compute but couldn't.
 * The observer records these as gaps for next-time synthesis.
 *
 * @param response  - The LLM response text to scan
 * @param domain    - Current domain (for categorization)
 * @param orgId     - Organization ID (for storage)
 * @param supabase  - Supabase client
 */
export async function observeCapabilityRegret(
  response: string,
  domain: string,
  orgId: string,
  supabase: SupabaseClient
): Promise<void> {
  // "Regret patterns": phrases indicating the LLM wanted to compute but couldn't
  const REGRET_PATTERNS = [
    /i (?:cannot|can't|couldn't|am unable to) (?:calculate|compute|run|execute|perform the calculation)/i,
    /(?:would require|requires) (?:running code|actual computation|a calculator|numeric|programming)/i,
    /i don't have the (?:ability|capability|tools) to (?:calculate|compute|run)/i,
    /(?:you'd need|you would need|one would need) (?:to run|actual|a tool) (?:to compute|to calculate)/i,
    /(?:cannot|can't) (?:actually run|execute) this (?:calculation|formula|function)/i,
  ];

  const detectedRegrets: string[] = [];
  for (const pattern of REGRET_PATTERNS) {
    const match = response.match(pattern);
    if (match) {
      detectedRegrets.push(match[0]);
    }
  }

  if (detectedRegrets.length === 0) return;

  logger.warn("[capability-synthesizer] CapabilityObserver: regret signals detected", {
    domain,
    orgId,
    count: detectedRegrets.length,
    sample: detectedRegrets[0],
  });

  // Fire-and-forget: record the gap signals for future capability synthesis
  try {
    await supabase.from("ai_memory").insert({
      organization_id: orgId,
      domain: `capability-gap:${domain}`,
      memory_type: "capability-regret",
      content: JSON.stringify({
        domain,
        regrets: detectedRegrets,
        responseFragment: response.slice(0, 200),
        detectedAt: new Date().toISOString(),
      }),
      importance: 0.6,
    });

    // ADR-028: Also record regret gap in capability_library
    void Promise.resolve(supabase.from("capability_library").insert({
      organization_id: orgId,
      name: `regret_${domain.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}`,
      description: `LLM regret: ${detectedRegrets[0]?.slice(0, 200) ?? "unknown"}`,
      domain: `capability-gap:${domain}`,
      implementation: "",
      status: "gap",
      quality_score: 0.3,
      synthesized_by: "system",
    })).catch(() => {
      // fire-and-forget — capability_library may not exist yet
    });
  } catch {
    // fire-and-forget — never throw
  }
}
