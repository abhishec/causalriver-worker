/**
 * Tool Maker Agent — ADR-028 Dynamic Tool Synthesis Engine
 * =========================================================
 *
 * Core synthesis engine that replaces the old Haiku-only inline synthesis
 * with async Opus/Sonnet/Haiku synthesis + self-correction loops.
 *
 * Key capabilities:
 * - ATLASS reuse check: embed-then-search before synthesizing (avoid re-inventing)
 * - Model tier selection: Sonnet for financial/high-occurrence, Haiku for cheap/fast
 * - Self-correction loop: up to 3 attempts to fix failing test cases
 * - capability_library persistence: validated tools stored with embeddings for reuse
 *
 * Design principles:
 * - Pure fire-and-forget: never throws — always returns null on unrecoverable failure
 * - 30s hard timeout on any LLM call via Promise.race()
 * - JSON extraction uses same regex as tool-registry.ts: text.match(/\{[\s\S]*\}/)
 * - Test execution uses new Function() in try/catch for safe sandboxed evaluation
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { embedText } from "@/lib/brain/tier2-signals";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_SELF_CORRECTION_ATTEMPTS = 3;
const SYNTHESIS_TIMEOUT_MS = 30_000;
const ATLASS_SIMILARITY_THRESHOLD = 0.85;
const ATLASS_QUALITY_THRESHOLD = 0.6;

/** Financial/math domains that justify Sonnet over Haiku */
const FINANCIAL_DOMAINS = /^(finance|accounting|bookkeep|budget|revenue|cost|pricing|invoice)/i;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TestCase {
  inputs: Record<string, unknown>;
  expected: unknown;
  description: string;
}

export interface TestResult {
  testCase: TestCase;
  passed: boolean;
  actual: unknown;
  error?: string;
}

export interface ToolSynthesisResult {
  toolId: string;
  status: "candidate" | "validated";
  model: string;
  selfCorrectionAttempts: number;
  testsPassed: number;
  testsTotal: number;
}

interface SynthesizedToolSpec {
  name: string;
  description: string;
  implementation: string;
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
  testCases: TestCase[];
}

interface AtlassMatch {
  id: string;
  similarity: number;
  quality_score: number;
}

// ── Model Selector ────────────────────────────────────────────────────────────

/**
 * Select the synthesis model based on occurrence count and domain.
 *
 * Tier logic:
 * - occurrences >= 10 AND financial domain  → Sonnet (high-stakes, math-heavy)
 * - occurrences >= 5                        → Sonnet (standard quality threshold)
 * - occurrences >= 3                        → Haiku  (cheap, fast, sufficient)
 * - fallback                               → Haiku  (should not reach in normal flow)
 */
export function selectSynthesisModel(occurrences: number, domain: string): string {
  if (occurrences >= 10 && FINANCIAL_DOMAINS.test(domain)) {
    // Sonnet for financial — Opus is too expensive for cron-driven synthesis
    return "claude-sonnet-4-20250514";
  }
  if (occurrences >= 5) {
    return "claude-sonnet-4-20250514";
  }
  // occurrences >= 3 or anything lower — Haiku is fast and cheap enough
  return "claude-haiku-4-5-20251001";
}

// ── ATLASS Reuse Check ────────────────────────────────────────────────────────

/**
 * Check the capability_library for a semantically similar existing tool.
 *
 * Returns the existing tool ID if similarity > 0.85 AND quality_score > 0.6,
 * so we avoid re-synthesizing something we already have.
 *
 * Returns null on any error or when no suitable match exists.
 */
async function findAtlassMatch(
  supabase: SupabaseClient,
  embedding: number[],
  orgId: string,
): Promise<AtlassMatch | null> {
  try {
    const { data, error } = await supabase.rpc("search_capability_library", {
      query_embedding: embedding,
      org_id: orgId,
      similarity_threshold: ATLASS_SIMILARITY_THRESHOLD,
      match_count: 1,
    });

    if (error || !data || !Array.isArray(data) || data.length === 0) return null;

    const top = data[0] as AtlassMatch;
    if (
      typeof top.similarity === "number" &&
      top.similarity > ATLASS_SIMILARITY_THRESHOLD &&
      typeof top.quality_score === "number" &&
      top.quality_score > ATLASS_QUALITY_THRESHOLD
    ) {
      return top;
    }

    return null;
  } catch (err) {
    logger.warn("[tool-maker] ATLASS search failed (non-fatal)", {
      error: String(err),
      orgId,
    });
    return null;
  }
}

// ── LLM Call Helper ───────────────────────────────────────────────────────────

/**
 * Call the Anthropic API with a hard 30s timeout via Promise.race().
 * Returns the raw text content or null on timeout/error.
 */
async function callModel(
  model: string,
  prompt: string,
  apiKey: string,
  maxTokens = 1200,
): Promise<string | null> {
  try {
    const anthropic = new Anthropic({ apiKey });

    const callPromise = anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`LLM synthesis timeout after ${SYNTHESIS_TIMEOUT_MS}ms`)),
        SYNTHESIS_TIMEOUT_MS,
      )
    );

    const response = await Promise.race([callPromise, timeoutPromise]);
    const text =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    return text || null;
  } catch (err) {
    logger.warn("[tool-maker] callModel failed", {
      model,
      error: String(err),
    });
    return null;
  }
}

// ── Creator Prompt ────────────────────────────────────────────────────────────

function buildCreatorPrompt(
  domain: string,
  query: string,
  occurrences: number,
): string {
  return `You are a tool-making agent. A recurring capability gap has been detected:
Domain: ${domain}
Pattern: ${query} (occurred ${occurrences} times)

Create a REUSABLE JavaScript function that addresses this class of problems.
Requirements:
- Pure function, no side effects, no imports
- Accept general parameters (not hardcoded to one case)
- Handle edge cases (null, empty, NaN)
- Return typed output with clear structure

Return ONLY valid JSON (no markdown fences):
{
  "name": "function_name",
  "description": "what it does in 1 sentence",
  "implementation": "function body as a single string",
  "inputSchema": { "param1": "type1", "param2": "type2" },
  "outputSchema": { "result": "type" },
  "testCases": [
    { "inputs": { "param1": value1 }, "expected": expectedValue, "description": "test description" },
    { "inputs": { "param1": value2 }, "expected": expectedValue2, "description": "edge case: null input" },
    { "inputs": { "param1": value3 }, "expected": expectedValue3, "description": "edge case: empty array" },
    { "inputs": { "param1": value4 }, "expected": expectedValue4, "description": "boundary test" },
    { "inputs": { "param1": value5 }, "expected": expectedValue5, "description": "typical use case" }
  ]
}`;
}

// ── Correction Prompt ─────────────────────────────────────────────────────────

function buildCorrectionPrompt(
  implementation: string,
  failures: TestResult[],
): string {
  const failureDetails = failures
    .map((f) => {
      const inputStr = JSON.stringify(f.testCase.inputs);
      const expectedStr = JSON.stringify(f.testCase.expected);
      const actualStr = JSON.stringify(f.actual);
      const errStr = f.error ? ` Error: ${f.error}` : "";
      return `- Test: ${f.testCase.description}\n  Inputs: ${inputStr}\n  Expected: ${expectedStr}\n  Got: ${actualStr}${errStr}`;
    })
    .join("\n");

  return `The following JavaScript function implementation has failing test cases. Fix it.

Current implementation:
${implementation}

Failing tests:
${failureDetails}

Return ONLY the corrected function implementation as a plain string (no JSON, no markdown fences, just the function body).`;
}

// ── JSON Extraction ───────────────────────────────────────────────────────────

/**
 * Extract and parse a JSON object from raw LLM text.
 * Uses the same regex pattern as tool-registry.ts.
 */
function extractJsonFromText(text: string): SynthesizedToolSpec | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Partial<SynthesizedToolSpec>;

    if (
      typeof parsed.name !== "string" ||
      typeof parsed.description !== "string" ||
      typeof parsed.implementation !== "string"
    ) {
      return null;
    }

    return {
      name: parsed.name,
      description: parsed.description,
      implementation: parsed.implementation,
      inputSchema: parsed.inputSchema ?? {},
      outputSchema: parsed.outputSchema ?? {},
      testCases: Array.isArray(parsed.testCases) ? parsed.testCases : [],
    };
  } catch {
    return null;
  }
}

// ── Test Case Executor ────────────────────────────────────────────────────────

/**
 * Execute synthesized test cases against the implementation using new Function().
 *
 * Extracts the function name from the implementation, instantiates it
 * in a sandboxed scope, then calls it with each test case's inputs.
 *
 * Deep-equality comparison for expected vs actual values.
 * Returns allPassed=true only when every test case passes.
 */
export function runTestCases(
  implementation: string,
  testCases: TestCase[],
): { allPassed: boolean; results: TestResult[]; failures: TestResult[] } {
  if (testCases.length === 0) {
    return { allPassed: true, results: [], failures: [] };
  }

  // Extract the primary function name from the implementation
  const fnNameMatch = implementation.match(/function\s+(\w+)/);
  const fnName = fnNameMatch?.[1] ?? null;

  const results: TestResult[] = [];

  for (const testCase of testCases) {
    let passed = false;
    let actual: unknown = undefined;
    let errorMsg: string | undefined;

    try {
      if (!fnName) {
        throw new Error("Could not extract function name from implementation");
      }

      // Build the ordered argument list from the function signature
      const argSignatureMatch = implementation.match(
        new RegExp(`function\\s+${fnName}\\s*\\(([^)]*)\\)`)
      );
      const paramNames = argSignatureMatch?.[1]
        ? argSignatureMatch[1].split(",").map((p) => p.trim()).filter(Boolean)
        : Object.keys(testCase.inputs);

      // Map params to values in declaration order, fall back to input order
      const args = paramNames.map((p) =>
        Object.prototype.hasOwnProperty.call(testCase.inputs, p)
          ? testCase.inputs[p]
          : undefined
      );

      const argsJson = JSON.stringify(args);

      // eslint-disable-next-line no-new-func
      const wrapper = new Function(`
        "use strict";
        ${implementation}
        return ${fnName}.apply(null, ${argsJson});
      `);

      actual = wrapper();

      // Deep equality via JSON round-trip (handles primitives, arrays, objects)
      passed =
        JSON.stringify(actual) === JSON.stringify(testCase.expected);
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      passed = false;
    }

    results.push({
      testCase,
      passed,
      actual,
      error: errorMsg,
    });
  }

  const failures = results.filter((r) => !r.passed);
  return {
    allPassed: failures.length === 0,
    results,
    failures,
  };
}

// ── Derive tags from tool spec ────────────────────────────────────────────────

function deriveTags(domain: string, spec: SynthesizedToolSpec): string[] {
  const tags: string[] = [domain];

  // Add input parameter names as tags for better semantic retrieval
  for (const key of Object.keys(spec.inputSchema)) {
    tags.push(key);
  }

  // Add output schema keys
  for (const key of Object.keys(spec.outputSchema)) {
    tags.push(key);
  }

  return [...new Set(tags)]; // deduplicate
}

// ── Main Synthesis Function ───────────────────────────────────────────────────

/**
 * Synthesize a reusable tool from a recurring capability gap.
 *
 * Flow:
 * 1. Generate embedding for the gap description
 * 2. ATLASS reuse check — return existing tool if similarity > 0.85 + quality > 0.6
 * 3. Select model tier based on occurrences + domain
 * 4. CREATOR prompt: ask model for JSON spec + 5 test cases
 * 5. Self-correction loop: run tests, feed failures back, max 3 attempts
 * 6. Generate embedding for the final description+domain+tags
 * 7. Insert into capability_library with status 'validated' or 'candidate'
 *
 * Returns null on any unrecoverable failure — never throws.
 */
export async function synthesizeToolFromGap(
  supabase: SupabaseClient,
  orgId: string,
  gap: { id: string; domain: string; query: string; occurrences: number },
  apiKey: string,
): Promise<{ toolId: string; status: "candidate" | "validated" } | null> {
  const startMs = Date.now();

  try {
    // ── Step 1: Generate embedding for the gap description ─────────────────
    const gapDescription = `${gap.domain} ${gap.query}`;
    const gapEmbedding = await embedText(gapDescription);

    // ── Step 2: ATLASS reuse check ─────────────────────────────────────────
    if (gapEmbedding) {
      const atlassMatch = await findAtlassMatch(supabase, gapEmbedding, orgId);
      if (atlassMatch) {
        logger.info("[tool-maker] ATLASS reuse: returning existing tool", {
          orgId,
          gapId: gap.id,
          matchId: atlassMatch.id.slice(0, 8),
          similarity: Math.round(atlassMatch.similarity * 1000) / 1000,
          qualityScore: atlassMatch.quality_score,
        });
        return {
          toolId: atlassMatch.id,
          status: "validated",
        };
      }
    }

    // ── Step 3: Select model tier ──────────────────────────────────────────
    const model = selectSynthesisModel(gap.occurrences, gap.domain);

    logger.info("[tool-maker] Starting synthesis", {
      orgId,
      gapId: gap.id,
      domain: gap.domain,
      occurrences: gap.occurrences,
      model,
    });

    // ── Step 4: CREATOR prompt — get initial implementation + test cases ───
    const creatorPrompt = buildCreatorPrompt(gap.domain, gap.query, gap.occurrences);
    const creatorResponse = await callModel(model, creatorPrompt, apiKey);

    if (!creatorResponse) {
      logger.warn("[tool-maker] Creator LLM call returned null", {
        orgId,
        gapId: gap.id,
        model,
      });
      return null;
    }

    const spec = extractJsonFromText(creatorResponse);
    if (!spec) {
      logger.warn("[tool-maker] Could not extract JSON spec from creator response", {
        orgId,
        gapId: gap.id,
        preview: creatorResponse.slice(0, 120),
      });
      return null;
    }

    // ── Step 5: Self-correction loop ───────────────────────────────────────
    let { implementation } = spec;
    const testCases = spec.testCases;
    let selfCorrectionAttempts = 0;
    let lastTestRun = runTestCases(implementation, testCases);

    for (let attempt = 0; attempt < MAX_SELF_CORRECTION_ATTEMPTS; attempt++) {
      if (lastTestRun.allPassed) break;

      selfCorrectionAttempts = attempt + 1;
      logger.info("[tool-maker] Self-correction attempt", {
        orgId,
        gapId: gap.id,
        attempt: attempt + 1,
        failures: lastTestRun.failures.length,
        total: testCases.length,
      });

      const correctionPrompt = buildCorrectionPrompt(
        implementation,
        lastTestRun.failures,
      );
      const corrected = await callModel(model, correctionPrompt, apiKey, 800);

      if (corrected && corrected.trim().length > 0) {
        // The correction prompt asks for just the implementation (no JSON wrapper)
        // Accept if it looks like a function body
        const looksLikeImpl =
          corrected.includes("function ") || corrected.includes("=>") || corrected.includes("return ");
        if (looksLikeImpl) {
          implementation = corrected.trim();
          lastTestRun = runTestCases(implementation, testCases);
        }
      }
    }

    const testsPassed = lastTestRun.results.filter((r) => r.passed).length;
    const testsTotal = testCases.length;
    const status: "candidate" | "validated" =
      lastTestRun.allPassed ? "validated" : "candidate";

    logger.info("[tool-maker] Self-correction complete", {
      orgId,
      gapId: gap.id,
      status,
      testsPassed,
      testsTotal,
      selfCorrectionAttempts,
      durationMs: Date.now() - startMs,
    });

    // ── Step 6: Generate embedding for the final tool ──────────────────────
    const tags = deriveTags(gap.domain, spec);
    const embeddingText = `${spec.description} ${gap.domain} ${tags.join(" ")}`;
    const toolEmbedding = await embedText(embeddingText);

    // ── Step 7: Insert into capability_library ─────────────────────────────
    const synthesizedBy =
      model.includes("sonnet") ? "claude-sonnet" : "claude-haiku";

    const insertPayload: Record<string, unknown> = {
      organization_id: orgId,
      name: spec.name,
      description: spec.description,
      domain: gap.domain,
      implementation,
      input_schema: spec.inputSchema,
      output_schema: spec.outputSchema,
      test_cases: testCases,
      status,
      quality_score: status === "validated" ? 0.7 : 0.4,
      synthesized_by: synthesizedBy,
      source_gap_id: gap.id,
      tags,
      metadata: {
        model,
        selfCorrectionAttempts,
        testsPassed,
        testsTotal,
        synthesizedAt: new Date().toISOString(),
        gapOccurrences: gap.occurrences,
      },
    };

    // Only include embedding if we generated one successfully
    if (toolEmbedding) {
      insertPayload.embedding = toolEmbedding;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("capability_library")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError || !inserted) {
      logger.warn("[tool-maker] Failed to insert tool into capability_library", {
        orgId,
        gapId: gap.id,
        error: String(insertError?.message ?? "no data returned"),
      });
      return null;
    }

    const toolId = inserted.id as string;

    logger.info("[tool-maker] Tool inserted into capability_library", {
      orgId,
      toolId: toolId.slice(0, 8),
      name: spec.name,
      domain: gap.domain,
      status,
      model,
      selfCorrectionAttempts,
      testsPassed,
      testsTotal,
      durationMs: Date.now() - startMs,
    });

    return { toolId, status };
  } catch (err) {
    // Top-level guard — never throw from this function
    logger.warn("[tool-maker] synthesizeToolFromGap failed (non-fatal)", {
      orgId,
      gapId: gap.id,
      domain: gap.domain,
      error: String(err),
    });
    return null;
  }
}

// ── ADR-031: Workflow Synthesis for Reflex Gaps ─────────────────────────────

/**
 * Synthesize a workflow-type capability from a reflex gap.
 *
 * Called by the cron tool-maker when a gap has domain starting with "reflex:".
 * Uses the workflow-synthesizer to generate a workflow_definition (not a compute function).
 *
 * This bridges the gap between:
 * - Inline synthesis (immediate, during user request, via workflow-synthesizer.ts)
 * - Background synthesis (cron, 30 min cadence, via tool-maker.ts)
 *
 * Background synthesis uses Sonnet for higher quality and runs self-correction.
 */
export async function synthesizeWorkflowFromGap(
  supabase: SupabaseClient,
  orgId: string,
  gap: { id: string; domain: string; query: string; occurrences: number },
  apiKey: string,
): Promise<{ toolId: string; status: "candidate" | "validated" } | null> {
  try {
    // Import synthesizer dynamically to avoid circular deps
    const { synthesizeWorkflow } = await import("./workflow-synthesizer");

    // Use the synthesizer with the gap's query as the user message
    const synthesized = await synthesizeWorkflow(
      supabase,
      orgId,
      gap.query,
      [], // no URLs in background synthesis
      [], // no conversation history
    );

    if (!synthesized) {
      logger.warn("[tool-maker] Workflow synthesis returned null for gap", {
        orgId,
        gapId: gap.id,
        domain: gap.domain,
      });
      return null;
    }

    logger.info("[tool-maker] Workflow synthesized from gap", {
      orgId,
      gapId: gap.id,
      toolId: synthesized.id.slice(0, 8),
      name: synthesized.name,
    });

    return { toolId: synthesized.id, status: "validated" };
  } catch (err) {
    logger.warn("[tool-maker] synthesizeWorkflowFromGap failed (non-fatal)", {
      orgId,
      gapId: gap.id,
      error: String(err),
    });
    return null;
  }
}
