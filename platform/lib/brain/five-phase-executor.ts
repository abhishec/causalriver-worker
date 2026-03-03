import { logger } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { captureStreamedResponse as _captureFivePhase } from "@/lib/brain/claude-learning-capture";
import { getOrSynthesizeCapabilities, formatCapabilitiesForPrompt } from "@/lib/brain/capability-synthesizer";
import type { SynthesizedCapability } from "@/lib/brain/capability-synthesizer";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export type Phase = "plan" | "gather" | "synthesize" | "artifact" | "insight";

export interface PhaseResult {
  phase: Phase;
  status: "completed" | "skipped" | "failed";
  output: string;
  durationMs: number;
  tokensUsed?: number;
}

export interface FivePhaseParams {
  domain: string;
  taskDescription: string;
  inputPayload: Record<string, unknown>;
  orgId: string;
  aiWorkerId?: string;
  brainContext?: string; // from getBrainContext() — passed in, not re-fetched
  gatherFn?: (() => Promise<string>) | Array<(prevContext: string) => Promise<string>>; // single fn or sequential chain
  maxPhases?: Phase[]; // if set, only run these phases (default: all 5)
}

export interface FivePhaseResult {
  phases: PhaseResult[];
  finalOutput: string;
  quality: number; // 0-1 computed from phase success rate + artifact quality
  totalDurationMs: number;
  tokensUsed: number;
}

/**
 * Runs a structured 5-phase execution for a domain task.
 * Designed to wrap or replace the ad-hoc multi-step pattern in domain executors.
 */
export async function runFivePhaseExecution(
  supabase: SupabaseClient,
  params: FivePhaseParams
): Promise<FivePhaseResult> {
  const startTime = Date.now();
  const phases: PhaseResult[] = [];
  let totalTokens = 0;

  const activePhaseset = new Set(
    params.maxPhases ?? [
      "plan",
      "gather",
      "synthesize",
      "artifact",
      "insight",
    ]
  );

  // ── PHASE 1: PLAN ──────────────────────────────────────────────
  let planOutput = "";
  if (activePhaseset.has("plan")) {
    const phaseStart = Date.now();
    try {
      const planResponse = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: `Domain: ${params.domain}
Task: ${params.taskDescription}

Decompose this task into 3-5 concrete subtasks. Identify what data is needed.
Respond in JSON: { "subtasks": ["...", "..."], "dataNeeded": ["...", "..."] }`,
          },
        ],
      });
      planOutput =
        planResponse.content[0].type === "text"
          ? planResponse.content[0].text
          : "";
      totalTokens +=
        planResponse.usage.input_tokens + planResponse.usage.output_tokens;
      phases.push({
        phase: "plan",
        status: "completed",
        output: planOutput,
        durationMs: Date.now() - phaseStart,
        tokensUsed: planResponse.usage.output_tokens,
      });
    } catch (err) {
      logger.warn("[five-phase-executor] PLAN phase failed", { err });
      phases.push({
        phase: "plan",
        status: "failed",
        output: String(err),
        durationMs: Date.now() - phaseStart,
      });
    }
  }

  // ── CAPABILITY SYNTHESIS (between Plan and Gather) ─────────────
  // Detect and synthesize any computation capabilities needed for this task.
  // Fire-and-forget safe: .catch(() => []) ensures this never throws.
  const _synthesizedCaps = await getOrSynthesizeCapabilities(
    params.taskDescription,
    params.orgId,
    process.env.ANTHROPIC_API_KEY ?? '',
    supabase,
  ).catch(() => [] as SynthesizedCapability[]);
  const _capsPrompt = formatCapabilitiesForPrompt(_synthesizedCaps);

  // ── PHASE 2: GATHER ────────────────────────────────────────────
  let gatherOutput = "";
  if (activePhaseset.has("gather")) {
    const phaseStart = Date.now();
    try {
      if (params.gatherFn) {
        if (Array.isArray(params.gatherFn)) {
          // Sequential chaining: each gather function receives prior context
          // This enables "gather market data → gather risk signals → gather sentiment"
          // where each step sees what the prior step found
          let chainedContext = params.brainContext ?? "";
          const gatherSteps: string[] = [];
          for (const gatherStep of params.gatherFn) {
            try {
              const stepOutput = await gatherStep(chainedContext);
              gatherSteps.push(stepOutput);
              // Chain context: accumulate all gathered data so far
              chainedContext = gatherSteps.join("\n\n---\n\n");
            } catch (stepErr) {
              logger.warn("[five-phase-executor] GATHER chain step failed (continuing)", { stepErr });
              gatherSteps.push(""); // continue with empty — don't abort chain
            }
          }
          gatherOutput = gatherSteps.filter(Boolean).join("\n\n---\n\n");
        } else {
          gatherOutput = await params.gatherFn();
        }
      } else {
        // Default: use brain context as gathered data
        gatherOutput = params.brainContext ?? "No additional context available.";
      }
      phases.push({
        phase: "gather",
        status: "completed",
        output: gatherOutput.slice(0, 1000),
        durationMs: Date.now() - phaseStart,
      });
    } catch (err) {
      logger.warn("[five-phase-executor] GATHER phase failed", { err });
      phases.push({
        phase: "gather",
        status: "failed",
        output: String(err),
        durationMs: Date.now() - phaseStart,
      });
    }
  }

  // ── PHASE 3: SYNTHESIZE ────────────────────────────────────────
  let synthesisOutput = "";
  if (activePhaseset.has("synthesize")) {
    const phaseStart = Date.now();
    try {
      const synthesisResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: `Domain: ${params.domain}
Task: ${params.taskDescription}

Plan: ${planOutput.slice(0, 300)}

Gathered data: ${gatherOutput.slice(0, 600)}

Brain context: ${(params.brainContext ?? "").slice(0, 400)}

Synthesize a comprehensive analysis. Be specific and actionable.${_capsPrompt ? `\n\n${_capsPrompt}` : ""}`,
          },
        ],
      });
      synthesisOutput =
        synthesisResponse.content[0].type === "text"
          ? synthesisResponse.content[0].text
          : "";
      totalTokens +=
        synthesisResponse.usage.input_tokens +
        synthesisResponse.usage.output_tokens;
      phases.push({
        phase: "synthesize",
        status: "completed",
        output: synthesisOutput,
        durationMs: Date.now() - phaseStart,
        tokensUsed: synthesisResponse.usage.output_tokens,
      });
    } catch (err) {
      logger.warn("[five-phase-executor] SYNTHESIZE phase failed", { err });
      phases.push({
        phase: "synthesize",
        status: "failed",
        output: String(err),
        durationMs: Date.now() - phaseStart,
      });
    }
  }

  // ── PHASE 4: ARTIFACT ──────────────────────────────────────────
  let artifactOutput = "";
  if (activePhaseset.has("artifact")) {
    const phaseStart = Date.now();
    try {
      const artifactResponse = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: `Based on this analysis:
${synthesisOutput.slice(0, 800)}

Create a structured artifact (report, recommendation, or action plan) for the ${params.domain} domain.
Use markdown formatting. Be concise and actionable.`,
          },
        ],
      });
      artifactOutput =
        artifactResponse.content[0].type === "text"
          ? artifactResponse.content[0].text
          : "";
      totalTokens +=
        artifactResponse.usage.input_tokens +
        artifactResponse.usage.output_tokens;
      phases.push({
        phase: "artifact",
        status: "completed",
        output: artifactOutput,
        durationMs: Date.now() - phaseStart,
        tokensUsed: artifactResponse.usage.output_tokens,
      });
    } catch (err) {
      logger.warn("[five-phase-executor] ARTIFACT phase failed", { err });
      phases.push({
        phase: "artifact",
        status: "failed",
        output: String(err),
        durationMs: Date.now() - phaseStart,
      });
    }
  }

  // ── PHASE 5: INSIGHT ───────────────────────────────────────────
  if (activePhaseset.has("insight")) {
    const phaseStart = Date.now();
    // Insight phase is always non-blocking — just log that it happened.
    // Actual knowledge extraction is handled by knowledge-extractor.ts (Agent 13).
    phases.push({
      phase: "insight",
      status: "completed",
      output: "Insight extraction delegated to knowledge-extractor",
      durationMs: Date.now() - phaseStart,
    });
  }

  // ── COMPUTE QUALITY ─────────────────────────────────────────────
  const completedPhases = phases.filter((p) => p.status === "completed").length;
  const totalPhases = phases.length;
  const phaseSuccessRate = totalPhases > 0 ? completedPhases / totalPhases : 0;
  const artifactQuality = artifactOutput.length > 100 ? 0.8 : 0.5;
  const quality =
    Math.round((phaseSuccessRate * 0.6 + artifactQuality * 0.4) * 100) / 100;

  const finalOutput = artifactOutput || synthesisOutput || "Execution completed.";

  logger.info("[five-phase-executor] Execution complete", {
    domain: params.domain,
    phases: completedPhases,
    quality,
    totalTokens,
    durationMs: Date.now() - startTime,
  });

  // Capture the final synthesis as a learning signal (fire-and-forget)
  if (finalOutput && finalOutput.length > 50 && params.orgId) {
    _captureFivePhase(finalOutput, Date.now() - startTime, {
      supabase,
      organizationId: params.orgId,
      domain: `five-phase.${params.domain}`,
      aiWorkerId: params.aiWorkerId,
      inputSummary: params.taskDescription.slice(0, 200),
      qualityThreshold: 0.4,
    });
  }

  return {
    phases,
    finalOutput,
    quality,
    totalDurationMs: Date.now() - startTime,
    tokensUsed: totalTokens,
  };
}
