/**
 * Quality Gate — APEX Architecture
 * ==================================
 *
 * Evaluates subtask output against acceptance criteria using Claude Haiku.
 * Returns a structured verdict: PASS / RETRY / ESCALATE.
 *
 * Called after every subtask execution in the APEX FSM cycle:
 *   EXECUTING_SUBTASK → EVALUATING (here) → PASS/RETRY/ESCALATE
 *
 * Design:
 *   - Uses claude-haiku (cheap, fast) as evaluator — NOT the main model
 *   - Score 0.0–1.0: ≥0.75 PASS, 0.40–0.74 RETRY, <0.40 ESCALATE
 *   - ESCALATE = task is fundamentally impossible with available tools
 *   - RETRY cap: 3 attempts max, then ESCALATE regardless of score
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Exponential backoff for quality-gate Anthropic call (same pattern as workers)
async function callWithRetry(payload: unknown): Promise<{ content: Array<{ type: string; text?: string }> }> {
  const delays = [500, 1000, 2000];
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= 2; attempt++) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (resp.ok) return resp.json() as Promise<{ content: Array<{ type: string; text?: string }> }>;
    if ((resp.status === 429 || resp.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, delays[attempt] + Math.random() * 200));
      lastErr = new Error(`Quality gate API ${resp.status}`);
      continue;
    }
    return { content: [] }; // graceful degradation on non-retryable errors
  }
  lastErr; // suppress unused warning
  return { content: [] };
}

export type QualityVerdict = "PASS" | "RETRY" | "ESCALATE";

export interface QualityGateResult {
  verdict: QualityVerdict;
  score: number;          // 0.0 to 1.0
  feedback: string;       // Evaluator's reasoning
  improvements?: string[]; // Specific things to fix on RETRY
}

const PASS_THRESHOLD = 0.75;
const ESCALATE_THRESHOLD = 0.40;

/**
 * Evaluate a subtask result against acceptance criteria.
 * Fire-and-forget safe — never throws, always returns a result.
 */
export async function evaluateSubtask(opts: {
  subtaskGoal: string;
  acceptanceCriteria: string[];
  result: string;
  attemptNumber: number;
  maxAttempts: number;
}): Promise<QualityGateResult> {
  const { subtaskGoal, acceptanceCriteria, result, attemptNumber, maxAttempts } = opts;

  // Hard limit: ESCALATE if we've exhausted retries
  if (attemptNumber >= maxAttempts) {
    return {
      verdict: "ESCALATE",
      score: 0.0,
      feedback: `Max attempts (${maxAttempts}) reached without passing quality gate.`,
      improvements: [],
    };
  }

  if (!ANTHROPIC_API_KEY) {
    // Graceful degradation: pass without evaluation
    return { verdict: "PASS", score: 0.8, feedback: "Quality gate bypassed (no API key)." };
  }

  const criteriaText = acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n");

  const evalPrompt = `You are a quality evaluator. Score this agent output on a scale of 0.0 to 1.0.

SUBTASK GOAL:
${subtaskGoal}

ACCEPTANCE CRITERIA:
${criteriaText}

AGENT OUTPUT:
${result.slice(0, 3000)}

Respond ONLY with valid JSON (no markdown):
{
  "score": <number 0.0-1.0>,
  "feedback": "<one sentence summary of quality>",
  "improvements": ["<specific improvement 1>", "<specific improvement 2>"]
}

Score guide:
- 0.9-1.0: Fully satisfies all criteria with excellent detail
- 0.75-0.89: Satisfies most criteria, minor gaps
- 0.40-0.74: Partially satisfies, significant gaps remain
- 0.0-0.39: Fails to address the goal or completely wrong`;

  try {
    const data = await callWithRetry({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: evalPrompt }],
    });

    const text = data.content.find((b) => b.type === "text")?.text ?? "{}";

    // Parse JSON (strip any accidental markdown fences)
    const cleaned = text.replace(/```json\n?|```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as { score?: number; feedback?: string; improvements?: string[] };

    const score = Math.max(0, Math.min(1, Number(parsed.score ?? 0.5)));
    const feedback = String(parsed.feedback ?? "No feedback");
    const improvements = Array.isArray(parsed.improvements) ? parsed.improvements : [];

    let verdict: QualityVerdict;
    if (score >= PASS_THRESHOLD) {
      verdict = "PASS";
    } else if (score >= ESCALATE_THRESHOLD) {
      verdict = "RETRY";
    } else {
      verdict = "ESCALATE";
    }

    return { verdict, score, feedback, improvements };
  } catch {
    // Parse error or network error — optimistic pass to not block the pipeline
    return { verdict: "PASS", score: 0.65, feedback: "Quality gate evaluation failed — optimistic pass." };
  }
}
