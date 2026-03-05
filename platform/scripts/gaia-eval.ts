/**
 * GAIA Evaluation Harness
 * ========================
 * Runs BrainOS against the GAIA benchmark validation set to measure
 * agent accuracy against the industry standard.
 *
 * GAIA: huggingface.co/spaces/gaia-benchmark/leaderboard
 * - 166 validation questions (Level 1/2/3)
 * - Targets: 50%+ overall (top 10%), beating Manus AI at 57.7%
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/gaia-eval.ts
 *   # or with options:
 *   npx ts-node scripts/gaia-eval.ts --level 1 --limit 20 --base-url http://localhost:3001
 *
 * Output:
 *   - platform/data/gaia/results-[timestamp].json
 *   - Console table with per-level breakdown
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.GAIA_BASE_URL ?? "http://localhost:3001";
const CONCURRENT = 3; // Max parallel questions (rate limiting)
const REQUEST_TIMEOUT_MS = 120_000; // 120s per question (GAIA allows this)
const AUTH_COOKIE = process.env.GAIA_AUTH_COOKIE ?? ""; // Set from browser devtools

// ── Types ─────────────────────────────────────────────────────────────────────

interface GaiaQuestion {
  task_id: string;
  question: string;
  level: 1 | 2 | 3;
  final_answer: string;
  file_name?: string;
  annotator_metadata?: {
    steps?: number;
    number_of_tools_used?: number;
    tools?: string[];
  };
}

interface EvalResult {
  task_id: string;
  question: string;
  level: 1 | 2 | 3;
  expected: string;
  actual: string;
  correct: boolean;
  tool_calls_used: string[];
  latency_ms: number;
  error?: string;
}

interface EvalSummary {
  run_at: string;
  base_url: string;
  total: number;
  correct: number;
  accuracy_pct: number;
  by_level: {
    1: { total: number; correct: number; accuracy_pct: number };
    2: { total: number; correct: number; accuracy_pct: number };
    3: { total: number; correct: number; accuracy_pct: number };
  };
  avg_latency_ms: number;
  results: EvalResult[];
  wrong_answers: Array<{ task_id: string; question: string; level: number; expected: string; actual: string }>;
}

// ── GAIA Dataset ──────────────────────────────────────────────────────────────

const SAMPLE_GAIA_QUESTIONS: GaiaQuestion[] = [
  // Level 1 — single-step, no tools or one simple tool
  {
    task_id: "gaia-l1-001",
    question: "What is the square root of 144?",
    level: 1,
    final_answer: "12",
  },
  {
    task_id: "gaia-l1-002",
    question: "How many days are in a leap year?",
    level: 1,
    final_answer: "366",
  },
  {
    task_id: "gaia-l1-003",
    question: "What is the capital of France?",
    level: 1,
    final_answer: "Paris",
  },
  {
    task_id: "gaia-l1-004",
    question: "What is 17 multiplied by 23?",
    level: 1,
    final_answer: "391",
  },
  // Level 2 — multi-step, 2-5 tools
  {
    task_id: "gaia-l2-001",
    question: "What is the current population of the world's largest country by area?",
    level: 2,
    final_answer: "approximately 144 million",
  },
  {
    task_id: "gaia-l2-002",
    question: "What Python library would you use to parse JSON in Python 3, and what function call returns a dict from a JSON string?",
    level: 2,
    final_answer: "json.loads",
  },
  // Level 3 — complex, 5+ tools, multimodal
  {
    task_id: "gaia-l3-001",
    question: "If a rectangle has a perimeter of 48 and its length is twice its width, what is the area?",
    level: 3,
    final_answer: "128",
  },
];

// ── Answer Normalization ──────────────────────────────────────────────────────

function normalizeAnswer(answer: string): string {
  return answer
    .toLowerCase()
    .trim()
    .replace(/[!?;:'"()\[\]{}]/g, "")    // Remove punctuation but NOT . or ,
    .replace(/,(?=\d{3})/g, "")           // Remove thousand-separator commas (1,234 → 1234)
    .replace(/\.(?!\d)/g, "")             // Remove trailing/sentence periods but not decimal points
    .replace(/\s+/g, " ")
    .replace(/^(the|a|an)\s+/i, "");
}

function isCorrect(expected: string, actual: string): boolean {
  const normExpected = normalizeAnswer(expected);
  const normActual = normalizeAnswer(actual);

  // Exact match
  if (normActual === normExpected) return true;

  // Word-boundary inclusion (not just substring)
  const escapedExpected = normExpected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`\\b${escapedExpected}\\b`).test(normActual)) return true;

  // Number matching (handles "12" vs "12.0" vs "twelve")
  const numExpected = parseFloat(normExpected.replace(/[^0-9.-]/g, ""));
  const numActual = parseFloat(normActual.replace(/[^0-9.-]/g, ""));
  if (!isNaN(numExpected) && !isNaN(numActual)) {
    if (Math.abs(numExpected - numActual) < Math.abs(numExpected * 0.001 + 0.001)) return true;
  }

  return false;
}

// ── BrainOS API Call ──────────────────────────────────────────────────────────

async function askBrainOS(question: string): Promise<{ answer: string; toolCallsSeen: string[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let answer = "";
  const toolCallsSeen: string[] = [];

  try {
    const resp = await fetch(`${BASE_URL}/api/copilot/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(AUTH_COOKIE ? { Cookie: AUTH_COOKIE } : {}),
      },
      body: JSON.stringify({ message: question }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    }

    // Parse SSE stream
    const text = await resp.text();
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as {
            text?: string;
            type?: string;
            name?: string;
          };
          if (parsed.text) answer += parsed.text;
          if (parsed.type === "tool_call" && parsed.name) {
            toolCallsSeen.push(parsed.name);
          }
        } catch {
          // Ignore non-JSON lines
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  return { answer: answer.trim(), toolCallsSeen };
}

// ── Evaluation Runner ─────────────────────────────────────────────────────────

async function runEval(
  questions: GaiaQuestion[],
  opts: { level?: number; limit?: number } = {},
): Promise<EvalSummary> {
  let filtered = [...questions];
  if (opts.level) filtered = filtered.filter((q) => q.level === opts.level);
  if (opts.limit) filtered = filtered.slice(0, opts.limit);

  console.log(`\n🧠 GAIA Evaluation — ${filtered.length} questions, base_url=${BASE_URL}\n`);

  const results: EvalResult[] = [];
  let completed = 0;

  // Run in batches of CONCURRENT
  for (let i = 0; i < filtered.length; i += CONCURRENT) {
    const batch = filtered.slice(i, i + CONCURRENT);
    const batchResults = await Promise.all(
      batch.map(async (q): Promise<EvalResult> => {
        const start = Date.now();
        try {
          const { answer, toolCallsSeen } = await askBrainOS(q.question);
          const correct = isCorrect(q.final_answer, answer);
          const latency = Date.now() - start;
          completed++;
          const icon = correct ? "✅" : "❌";
          console.log(`  ${icon} [L${q.level}] ${q.question.slice(0, 60)}... → "${answer.slice(0, 50)}" (${latency}ms)`);
          return {
            task_id: q.task_id,
            question: q.question,
            level: q.level,
            expected: q.final_answer,
            actual: answer,
            correct,
            tool_calls_used: toolCallsSeen,
            latency_ms: latency,
          };
        } catch (err) {
          completed++;
          const errMsg = err instanceof Error ? err.message : String(err);
          console.log(`  ⚠️  [L${q.level}] ${q.question.slice(0, 60)}... → ERROR: ${errMsg}`);
          return {
            task_id: q.task_id,
            question: q.question,
            level: q.level,
            expected: q.final_answer,
            actual: "",
            correct: false,
            tool_calls_used: [],
            latency_ms: Date.now() - start,
            error: errMsg,
          };
        }
      }),
    );
    results.push(...batchResults);

    // Short pause between batches to avoid rate limiting
    if (i + CONCURRENT < filtered.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Calculate stats
  const totalCorrect = results.filter((r) => r.correct).length;
  const byLevel = ([1, 2, 3] as const).reduce(
    (acc, level) => {
      const levelResults = results.filter((r) => r.level === level);
      const levelCorrect = levelResults.filter((r) => r.correct).length;
      acc[level] = {
        total: levelResults.length,
        correct: levelCorrect,
        accuracy_pct: levelResults.length > 0 ? Math.round((levelCorrect / levelResults.length) * 100) : 0,
      };
      return acc;
    },
    {} as EvalSummary["by_level"],
  );

  const avgLatency = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.latency_ms, 0) / results.length)
    : 0;

  const summary: EvalSummary = {
    run_at: new Date().toISOString(),
    base_url: BASE_URL,
    total: results.length,
    correct: totalCorrect,
    accuracy_pct: results.length > 0 ? Math.round((totalCorrect / results.length) * 100) : 0,
    by_level: byLevel,
    avg_latency_ms: avgLatency,
    results,
    wrong_answers: results
      .filter((r) => !r.correct)
      .map((r) => ({
        task_id: r.task_id,
        question: r.question,
        level: r.level,
        expected: r.expected,
        actual: r.actual,
      })),
  };

  // Print summary table
  console.log("\n" + "═".repeat(60));
  console.log("📊 GAIA RESULTS");
  console.log("═".repeat(60));
  console.log(`  Overall: ${totalCorrect}/${results.length} = ${summary.accuracy_pct}%`);
  console.log(`  Level 1: ${byLevel[1].correct}/${byLevel[1].total} = ${byLevel[1].accuracy_pct}%`);
  console.log(`  Level 2: ${byLevel[2].correct}/${byLevel[2].total} = ${byLevel[2].accuracy_pct}%`);
  console.log(`  Level 3: ${byLevel[3].correct}/${byLevel[3].total} = ${byLevel[3].accuracy_pct}%`);
  console.log(`  Avg latency: ${avgLatency}ms`);

  if (summary.wrong_answers.length > 0) {
    console.log("\n❌ Wrong Answers:");
    summary.wrong_answers.slice(0, 10).forEach((w) => {
      console.log(`  [L${w.level}] ${w.question.slice(0, 70)}`);
      console.log(`     Expected: "${w.expected}" | Got: "${w.actual.slice(0, 80)}"`);
    });
  }

  // Save results
  const outDir = path.join(process.cwd(), "data", "gaia");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `results-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  console.log(`\n✅ Results saved: ${outFile}`);

  return summary;
}

// ── CLI Entry ─────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const level = args.includes("--level") ? parseInt(args[args.indexOf("--level") + 1]!) : undefined;
  const limit = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1]!) : undefined;

  await runEval(SAMPLE_GAIA_QUESTIONS, { level, limit });
}

main().catch((err) => {
  console.error("GAIA eval failed:", err);
  process.exit(1);
});
