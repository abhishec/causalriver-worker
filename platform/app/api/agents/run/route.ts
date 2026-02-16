/**
 * Brain Agent Run API — Spawn Semi-Autonomous Agents
 * ====================================================
 *
 * POST /api/agents/run
 *   Spawn a brain agent that runs asynchronously.
 *   Each agent = Claude call with L1-L30 brain memory injected.
 *
 *   Semi-autonomous logic:
 *   - confidence >= 0.8 → auto-execute, return results
 *   - confidence < 0.8  → pause, ask user for approval
 *
 *   Body: {
 *     prompt: string,          // What to do: "Diagnose why churn increased"
 *     agentType?: string,      // 'diagnose' | 'build' | 'analyze' | 'predict' | 'investigate'
 *     autoExecuteThreshold?: number, // Override default 0.8
 *     organizationId?: string,
 *   }
 *
 *   Returns: { taskId, status } — poll GET /api/agents/tasks?taskId=xxx for results
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { CORE_ORG_ID } from "@/lib/org-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Allow up to 2 min for agent execution

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      prompt,
      agentType = "general",
      autoExecuteThreshold = 0.8,
      organizationId,
    } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: "prompt is required (min 3 characters)" },
        { status: 400 }
      );
    }

    // ── Resolve org ──────────────────────────────────────────────
    let orgId = organizationId;
    if (!orgId) {
      const { data: membership } = await supabase
        .from("org_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true })
        .limit(1)
        .single();
      orgId = membership?.organization_id || CORE_ORG_ID;
    }

    // Verify membership
    const { data: memberCheck } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 }
      );
    }

    // ── Create task record ───────────────────────────────────────
    const service = await createServiceClient();

    const { data: task, error: insertError } = await service
      .from("brain_agent_tasks")
      .insert({
        organization_id: orgId,
        created_by: user.id,
        prompt: prompt.trim(),
        agent_type: agentType,
        auto_execute_threshold: autoExecuteThreshold,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !task) {
      console.error("[AgentRun] Failed to create task:", insertError?.message);
      return NextResponse.json(
        { error: "Failed to create agent task" },
        { status: 500 }
      );
    }

    const taskId = task.id;

    // ── Execute agent (non-blocking via waitUntil pattern) ───────
    // We start execution but return the taskId immediately.
    // The agent runs to completion and updates the DB row.
    executeAgent(service, taskId, orgId, prompt, agentType, autoExecuteThreshold).catch(
      (err) => {
        console.error(`[AgentRun] Task ${taskId} failed:`, err);
        // Update task to failed
        service
          .from("brain_agent_tasks")
          .update({
            status: "failed",
            error_message: err instanceof Error ? err.message : "Unknown error",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", taskId)
          .then(() => {});
      }
    );

    return NextResponse.json({
      success: true,
      taskId,
      status: "running",
      message: "Agent spawned. Poll GET /api/agents/tasks?taskId=" + taskId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[AgentRun] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================================
// AGENT EXECUTION ENGINE
// ============================================================================

/**
 * The core execution function. Runs a Claude call with full brain memory
 * injected as system prompt context.
 *
 * Steps:
 *  1. Load brain context (causal edges, patterns, signals, predictions)
 *  2. Load user corrections from ai_memory
 *  3. Build rich system prompt with all brain layers
 *  4. Call Claude with the agent prompt
 *  5. Parse response for artifacts + confidence
 *  6. If confidence >= threshold → complete, else → awaiting_approval
 *  7. Store results + emit learning signal
 */
async function executeAgent(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  taskId: string,
  orgId: string,
  prompt: string,
  agentType: string,
  autoExecuteThreshold: number
): Promise<void> {
  const startTime = Date.now();

  // ── Step 1: Record "thinking" step ─────────────────────────────
  await addStep(supabase, taskId, 1, "reasoning", "Loading brain memory", "Querying L1-L30 brain layers for organizational intelligence...");

  // ── Step 2: Load brain context in parallel ─────────────────────
  const [
    { data: causalEdges },
    { data: rules },
    { data: patterns },
    { data: corrections },
    { data: recentSignals },
    { data: predictions },
  ] = await Promise.all([
    // L2: Causal edges
    supabase
      .from("causal_relationships_statistical")
      .select("source_signal, target_signal, strength, confidence, lag, p_value")
      .eq("organization_id", orgId)
      .gte("confidence", 0.5)
      .order("confidence", { ascending: false })
      .limit(20),
    // L5: Grammar rules
    supabase
      .from("brain_grammar_rules")
      .select("rule_name, rule_body, confidence, domain")
      .eq("organization_id", orgId)
      .gte("confidence", 0.5)
      .order("confidence", { ascending: false })
      .limit(10),
    // L5: Patterns
    supabase
      .from("ai_causal_chains")
      .select("chain_name, chain_data, confidence, domain")
      .eq("organization_id", orgId)
      .order("confidence", { ascending: false })
      .limit(10),
    // User corrections (high priority)
    supabase
      .from("ai_memory")
      .select("content, importance, domain, created_at")
      .eq("organization_id", orgId)
      .eq("memory_type", "correction")
      .order("importance", { ascending: false })
      .limit(5),
    // L1: Recent cross-domain signals (last 7 days)
    supabase
      .from("cross_domain_signals")
      .select("source_domain, signal_type, signal_value, signal_metadata, created_at")
      .eq("organization_id", orgId)
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(30),
    // L4: Recent predictions
    supabase
      .from("prediction_records")
      .select("prediction_type, predicted_value, actual_value, accuracy, domain, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Track which layers had data
  const brainLayersUsed: Record<string, number> = {};
  if (causalEdges?.length) brainLayersUsed["L2_causal_edges"] = causalEdges.length;
  if (rules?.length) brainLayersUsed["L5_grammar_rules"] = rules.length;
  if (patterns?.length) brainLayersUsed["L5_patterns"] = patterns.length;
  if (corrections?.length) brainLayersUsed["L4_corrections"] = corrections.length;
  if (recentSignals?.length) brainLayersUsed["L1_signals"] = recentSignals.length;
  if (predictions?.length) brainLayersUsed["L4_predictions"] = predictions.length;

  await supabase
    .from("brain_agent_tasks")
    .update({ brain_layers_used: brainLayersUsed, updated_at: new Date().toISOString() })
    .eq("id", taskId);

  await addStep(supabase, taskId, 2, "reasoning", "Brain memory loaded",
    `Loaded ${Object.entries(brainLayersUsed).map(([k, v]) => `${k}: ${v}`).join(", ") || "no brain data yet"}`);

  // ── Step 3: Build system prompt with brain memory ──────────────
  const systemPrompt = buildAgentSystemPrompt(
    agentType,
    causalEdges || [],
    rules || [],
    patterns || [],
    corrections || [],
    recentSignals || [],
    predictions || [],
  );

  await addStep(supabase, taskId, 3, "reasoning", "Reasoning with brain memory", "Calling Claude with organizational intelligence injected...");

  // ── Step 4: Call Claude API ────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `${prompt}\n\n---\nIMPORTANT: At the end of your response, on a new line, output your confidence level for this analysis as:\nCONFIDENCE: 0.XX\n(where 0.XX is between 0.00 and 1.00, based on how confident you are in the accuracy and completeness of your answer given the available brain data)`,
        },
      ],
    }),
  });

  if (!claudeResponse.ok) {
    const errText = await claudeResponse.text();
    throw new Error(`Claude API error ${claudeResponse.status}: ${errText.slice(0, 200)}`);
  }

  const claudeData = await claudeResponse.json();
  const fullResponse = claudeData.content?.[0]?.text || "";
  const tokensUsed = (claudeData.usage?.input_tokens || 0) + (claudeData.usage?.output_tokens || 0);

  // ── Step 5: Parse confidence + extract artifacts ───────────────
  const confidenceMatch = fullResponse.match(/CONFIDENCE:\s*([\d.]+)/i);
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.7;
  const cleanResponse = fullResponse.replace(/\nCONFIDENCE:\s*[\d.]+\s*$/i, "").trim();

  // Extract code blocks as artifacts
  const artifacts: Array<{
    id: string;
    type: string;
    title: string;
    language: string;
    content: string;
    createdAt: number;
  }> = [];

  const codeBlockRegex = /```(\w+)?\s*\n([\s\S]*?)```/g;
  let match;
  let artifactIndex = 0;
  while ((match = codeBlockRegex.exec(cleanResponse)) !== null) {
    const lang = match[1] || "text";
    const code = match[2].trim();
    if (code.split("\n").length >= 2) {
      artifactIndex++;
      artifacts.push({
        id: `agent_${taskId.slice(0, 8)}_${artifactIndex}`,
        type: "code",
        title: `Agent Output ${artifactIndex} (${lang})`,
        language: lang,
        content: code,
        createdAt: Date.now(),
      });
    }
  }

  // Also create an "analysis" artifact for the full response
  artifacts.unshift({
    id: `agent_${taskId.slice(0, 8)}_analysis`,
    type: "analysis",
    title: `Agent Analysis: ${prompt.slice(0, 50)}${prompt.length > 50 ? "..." : ""}`,
    language: "markdown",
    content: cleanResponse,
    createdAt: Date.now(),
  });

  const durationMs = Date.now() - startTime;
  const costUsd = tokensUsed * 0.000003; // rough estimate

  await addStep(supabase, taskId, 4, "artifact", "Results generated",
    `${artifacts.length} artifact(s) produced. Confidence: ${(confidence * 100).toFixed(0)}%`);

  // ── Step 6: Semi-autonomous decision ───────────────────────────
  const isHighConfidence = confidence >= autoExecuteThreshold;

  if (isHighConfidence) {
    // Auto-execute: mark complete immediately
    await supabase
      .from("brain_agent_tasks")
      .update({
        status: "completed",
        confidence_score: confidence,
        result_summary: cleanResponse.slice(0, 500),
        result_artifacts: artifacts,
        result_metadata: {
          tokensUsed,
          costUsd,
          durationMs,
          brainLayersUsed,
          model: "claude-sonnet-4-20250514",
          autoExecuted: true,
        },
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    await addStep(supabase, taskId, 5, "action", "Auto-executed (high confidence)",
      `Confidence ${(confidence * 100).toFixed(0)}% >= threshold ${(autoExecuteThreshold * 100).toFixed(0)}%. Results delivered.`);
  } else {
    // Low confidence: pause for human approval
    await supabase
      .from("brain_agent_tasks")
      .update({
        status: "awaiting_approval",
        confidence_score: confidence,
        result_summary: cleanResponse.slice(0, 500),
        result_artifacts: artifacts,
        result_metadata: {
          tokensUsed,
          costUsd,
          durationMs,
          brainLayersUsed,
          model: "claude-sonnet-4-20250514",
          autoExecuted: false,
        },
        proposed_action: {
          actionType: agentType,
          description: `Agent completed analysis with ${(confidence * 100).toFixed(0)}% confidence. Review recommended before accepting results.`,
          impact: "Results will be added to your artifacts",
          reversible: true,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    await addStep(supabase, taskId, 5, "approval_request", "Awaiting your approval",
      `Confidence ${(confidence * 100).toFixed(0)}% < threshold ${(autoExecuteThreshold * 100).toFixed(0)}%. Please review and approve/reject.`);
  }

  // ── Step 7: Emit learning signal ───────────────────────────────
  await supabase.from("cross_domain_signals").insert({
    organization_id: orgId,
    source_domain: "brain.agents",
    signal_type: `agent_${agentType}_completed`,
    signal_value: confidence,
    entity_type: "brain_agent_task",
    entity_id: taskId,
    signal_metadata: {
      prompt: prompt.slice(0, 200),
      autoExecuted: isHighConfidence,
      tokensUsed,
      durationMs,
      artifactCount: artifacts.length,
      brainLayersUsed: Object.keys(brainLayersUsed),
    },
  });
}

// ============================================================================
// SYSTEM PROMPT BUILDER — Injects L1-L30 brain memory into Claude
// ============================================================================

function buildAgentSystemPrompt(
  agentType: string,
  causalEdges: Array<Record<string, unknown>>,
  rules: Array<Record<string, unknown>>,
  patterns: Array<Record<string, unknown>>,
  corrections: Array<Record<string, unknown>>,
  signals: Array<Record<string, unknown>>,
  predictions: Array<Record<string, unknown>>,
): string {
  const sections: string[] = [];

  sections.push(`You are a NexusBrain Agent — a semi-autonomous AI that operates WITH organizational memory, not as a stateless LLM.

Your role: Execute the user's task using the organizational intelligence injected below. You have access to this organization's REAL causal graph, learned patterns, recent signals, and user-validated corrections.

AGENT TYPE: ${agentType}
EXECUTION MODE: Semi-autonomous (your confidence determines if results are auto-delivered or require human approval)

KEY PRINCIPLES:
1. Ground every insight in the Brain data below — don't make claims without evidence from the org's causal graph
2. When Brain data conflicts, trust user corrections > causal edges > patterns > signals
3. Produce actionable artifacts (code, analyses, recommendations) not just explanations
4. Be explicit about uncertainty — your confidence score determines what happens next
5. Reference specific causal relationships and signal data to support your analysis`);

  // L2: Causal Edges
  if (causalEdges.length > 0) {
    sections.push(`\n## L2 — Organizational Causal Graph (${causalEdges.length} edges)
These are REAL statistical causal relationships learned from THIS organization's data:`);
    for (const edge of causalEdges.slice(0, 15)) {
      sections.push(`- ${edge.source_signal} → ${edge.target_signal} (strength: ${edge.strength}, confidence: ${edge.confidence}, lag: ${edge.lag}d, p: ${edge.p_value})`);
    }
  }

  // L5: Grammar Rules
  if (rules.length > 0) {
    sections.push(`\n## L5 — Discovered Organizational Patterns (${rules.length} rules)
These patterns were autonomously discovered by the Brain:`);
    for (const rule of rules) {
      sections.push(`- [${rule.domain}] ${rule.rule_name}: ${typeof rule.rule_body === 'string' ? rule.rule_body.slice(0, 200) : JSON.stringify(rule.rule_body).slice(0, 200)} (confidence: ${rule.confidence})`);
    }
  }

  // L5: Causal Chains
  if (patterns.length > 0) {
    sections.push(`\n## L5 — Causal Chains (${patterns.length} chains)`);
    for (const p of patterns) {
      sections.push(`- [${p.domain}] ${p.chain_name} (confidence: ${p.confidence})`);
    }
  }

  // User corrections (HIGHEST PRIORITY)
  if (corrections.length > 0) {
    sections.push(`\n## USER CORRECTIONS (Ground Truth — HIGHEST PRIORITY)
These corrections were explicitly validated by users. They OVERRIDE conflicting brain data:`);
    for (const c of corrections) {
      sections.push(`- [${c.domain}] ${c.content}`);
    }
  }

  // L1: Recent signals
  if (signals.length > 0) {
    sections.push(`\n## L1 — Recent Cross-Domain Signals (last 7 days, ${signals.length} signals)
Real-time events from this organization's connected systems:`);
    // Group by source domain
    const grouped: Record<string, Array<Record<string, unknown>>> = {};
    for (const s of signals) {
      const domain = String(s.source_domain);
      if (!grouped[domain]) grouped[domain] = [];
      grouped[domain].push(s);
    }
    for (const [domain, sigs] of Object.entries(grouped)) {
      sections.push(`  ${domain}: ${sigs.length} signal(s) — types: ${[...new Set(sigs.map(s => s.signal_type))].join(", ")}`);
    }
  }

  // L4: Prediction track record
  if (predictions.length > 0) {
    const accurate = predictions.filter((p: any) => p.accuracy !== null && p.accuracy > 0.7);
    sections.push(`\n## L4 — Brain Prediction Track Record
Recent predictions: ${predictions.length}, accurate (>70%): ${accurate.length}
Use the Brain's prediction accuracy to calibrate your own confidence.`);
  }

  sections.push(`\n## OUTPUT FORMAT
1. Provide a clear, structured analysis grounded in the Brain data above
2. Include specific code blocks, recommendations, or action items as appropriate
3. Reference specific causal edges or signals when making claims
4. End with CONFIDENCE: 0.XX (your honest assessment of answer quality given available data)`);

  return sections.join("\n");
}

// ============================================================================
// HELPER: Add step to brain_agent_steps
// ============================================================================

async function addStep(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  taskId: string,
  stepNumber: number,
  stepType: string,
  title: string,
  content: string,
): Promise<void> {
  await supabase.from("brain_agent_steps").insert({
    task_id: taskId,
    step_number: stepNumber,
    step_type: stepType,
    title,
    content,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    duration_ms: 0,
  });
}
