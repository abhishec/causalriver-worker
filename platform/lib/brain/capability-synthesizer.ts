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
