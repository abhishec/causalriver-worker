/**
 * Code Execution Tool — Piston API
 * ==================================
 * GAIA-ready: executes Python (and other languages) in a sandboxed environment.
 * Uses Piston API (https://emkc.org/api/v2/piston) — free, no API key required.
 * Lambda-safe: HTTP-based, no local process spawning.
 *
 * Supports: Python 3, JavaScript, Ruby, Go, etc.
 * Max runtime: 10s (Piston default) with 12s fetch timeout.
 */

import { logger } from "@/lib/logger";

const PISTON_API_URL = "https://emkc.org/api/v2/piston";

export interface CodeExecutionResult {
  output: string;      // Combined stdout + stderr
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;      // Set on network/API error (not code error)
  language: string;
  version: string;
}

/**
 * Execute code in a sandboxed environment via Piston API.
 * Supports Python 3 by default. Never throws.
 */
export async function executeCode(
  code: string,
  options: {
    language?: string;
    version?: string;
    stdin?: string;
    args?: string[];
  } = {},
): Promise<CodeExecutionResult> {
  const {
    language = "python",
    version = "3.10.0",
    stdin = "",
    args = [],
  } = options;

  const codeStr = String(code ?? "").trim();
  if (!codeStr) {
    return {
      output: "",
      stdout: "",
      stderr: "Error: no code provided",
      exitCode: 1,
      language,
      version,
      error: "No code provided",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000); // 12s timeout

    let resp: Response;
    try {
      resp = await fetch(`${PISTON_API_URL}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          version,
          files: [{ content: codeStr }],
          stdin,
          args,
          compile_timeout: 10000,
          run_timeout: 10000,
          compile_memory_limit: -1,
          run_memory_limit: -1,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      logger.warn("[tools/code-execution] Piston API error", { status: resp.status, body: errText });
      return {
        output: "",
        stdout: "",
        stderr: `API error ${resp.status}: ${errText}`,
        exitCode: 1,
        language,
        version,
        error: `Piston API error ${resp.status}`,
      };
    }

    const data = await resp.json() as {
      language?: string;
      version?: string;
      run?: { stdout?: string; stderr?: string; output?: string; code?: number | null };
      compile?: { stdout?: string; stderr?: string; output?: string; code?: number | null };
    };

    // Piston returns compile errors in the compile block
    const compileStderr = data.compile?.stderr ?? "";
    const runStdout = data.run?.stdout ?? "";
    const runStderr = data.run?.stderr ?? "";
    const exitCode = data.run?.code ?? 0;

    const fullOutput = [
      compileStderr ? `[Compile] ${compileStderr}` : "",
      runStdout,
      runStderr,
    ]
      .filter(Boolean)
      .join("\n")
      .trim();

    return {
      output: fullOutput || "(no output)",
      stdout: runStdout,
      stderr: compileStderr + (compileStderr && runStderr ? "\n" : "") + runStderr,
      exitCode: typeof exitCode === "number" ? exitCode : 0,
      language: data.language ?? language,
      version: data.version ?? version,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[tools/code-execution] Fetch error", { error: msg });
    return {
      output: "",
      stdout: "",
      stderr: `Execution error: ${msg}`,
      exitCode: 1,
      language,
      version,
      error: msg,
    };
  }
}

/**
 * Convenience: execute Python code specifically.
 */
export async function executePython(code: string, stdin?: string): Promise<CodeExecutionResult> {
  return executeCode(code, { language: "python", version: "3.10.0", stdin });
}
