/**
 * GAIA Tool Executor — Central Dispatcher
 * =========================================
 * Provides:
 *   - getGAIATools(): Anthropic tool_use schema definitions for all GAIA tools
 *   - executeGAIATool(): routes a tool_use block to the correct implementation
 *
 * GAIA Tool Suite:
 *   web_search    — Brave Search API (real-time web)
 *   execute_python — Piston API (sandboxed Python execution)
 *   calculator    — Safe arithmetic / scientific math evaluator
 *   browser_navigate — Browserless.io (full page text + links)
 *   browser_screenshot — Browserless.io (base64 PNG screenshot)
 *   analyze_image — Claude Vision (image description + text extraction)
 *
 * Used by:
 *   - /api/copilot/chat/route.ts (agentic loop, Task 0)
 *   - /lib/agents/general-worker.ts (already wired for web_search + browser)
 */

import { searchWeb } from "@/lib/tools/web-search";
import { executePython } from "@/lib/tools/code-execution";
import { calculate } from "@/lib/tools/calculator";
import { browserNavigate, browserScreenshot } from "@/lib/tools/browser";
import { analyzeImage, analyzeImageUrl } from "@/lib/tools/vision";

// ── Anthropic tool_use schema ────────────────────────────────────────────────

export interface GaiaTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** Returns Anthropic-format tool definitions for all GAIA tools. */
export function getGAIATools(): GaiaTool[] {
  return [
    {
      name: "web_search",
      description:
        "Search the internet for real-time information. Use when answering questions about current events, recent data, live prices, statistics, or any fact that may have changed. Returns top web results with titles, URLs, and descriptions.",
      input_schema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query. Be specific and include key terms.",
          },
          max_results: {
            type: "number",
            description: "Maximum number of results to return (1-10, default 5)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "execute_python",
      description:
        "Execute Python code in a sandboxed environment. Use for: mathematical calculations, data processing, file parsing, string manipulation, scientific computations. Code runs isolated with no file system or network access. Supports standard library + common packages (numpy, pandas, math, json, re, datetime).",
      input_schema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "Python 3 code to execute. Use print() to output results.",
          },
          stdin: {
            type: "string",
            description: "Optional standard input to pass to the program",
          },
        },
        required: ["code"],
      },
    },
    {
      name: "calculator",
      description:
        "Evaluate a mathematical expression instantly. Supports: arithmetic (+, -, *, /, **, %), trigonometry (sin, cos, tan, asin, acos, atan), logarithms (log, log2, log10, exp), and constants (PI, E). Use ^ for power. Faster than execute_python for simple math.",
      input_schema: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description:
              "Math expression to evaluate. Examples: '2**10', 'sqrt(144)', 'sin(PI/2)', '(3.7 + 2.1) * 4 / 3'",
          },
        },
        required: ["expression"],
      },
    },
    {
      name: "browser_navigate",
      description:
        "Navigate to a URL and extract the full page text content and links. Use for reading web pages, articles, documentation, Wikipedia entries, or any URL found from web_search. Better than web_search when you need the FULL content of a specific page.",
      input_schema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Full URL to navigate to (must start with https://)",
          },
          wait_ms: {
            type: "number",
            description:
              "Milliseconds to wait for page to render (default 3000, use 5000 for JS-heavy pages)",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "browser_screenshot",
      description:
        "Take a screenshot of a web page and return it as a base64 PNG image. Use for visual questions about page layout, charts, infographics, or pages that require visual inspection.",
      input_schema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL to screenshot",
          },
          full_page: {
            type: "boolean",
            description: "Capture full page (true) or viewport only (false, default)",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "analyze_image",
      description:
        "Analyze an image for visual content, text, numbers, charts, diagrams, or any visual information. Provide either a base64-encoded image or an image URL. Returns detailed description, extracted text, and detected objects. Use for GAIA questions involving images, paintings, charts, or visual data.",
      input_schema: {
        type: "object",
        properties: {
          image_url: {
            type: "string",
            description: "URL of the image to analyze (if available)",
          },
          image_base64: {
            type: "string",
            description: "Base64-encoded image data (if URL not available)",
          },
          media_type: {
            type: "string",
            enum: ["image/png", "image/jpeg", "image/gif", "image/webp"],
            description: "Image format (default: image/png)",
          },
          prompt: {
            type: "string",
            description: "Specific question about the image (optional)",
          },
        },
      },
    },
  ];
}

// ── Tool Executor ────────────────────────────────────────────────────────────

/**
 * Execute a GAIA tool by name and return the result as a string.
 * This is what gets passed back to Claude as a tool_result.
 * Never throws — returns error string on failure.
 */
export async function executeGAIATool(
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<string> {
  try {
    switch (toolName) {
      case "web_search": {
        const query = String(toolInput.query ?? "");
        const maxResults = typeof toolInput.max_results === "number" ? toolInput.max_results : 5;
        const result = await searchWeb(query, { maxResults });
        if (result.error && result.results.length === 0) {
          return `Error: ${result.error}`;
        }
        const lines: string[] = [];
        if (result.answer) {
          lines.push(`Direct Answer: ${result.answer}\n`);
        }
        result.results.forEach((r, i) => {
          lines.push(`[${i + 1}] ${r.title}`);
          lines.push(`    URL: ${r.url}`);
          lines.push(`    ${r.description}`);
          if (r.publishedDate) lines.push(`    Published: ${r.publishedDate}`);
          lines.push("");
        });
        return lines.join("\n") || "No results found.";
      }

      case "execute_python": {
        const code = String(toolInput.code ?? "");
        const stdin = toolInput.stdin ? String(toolInput.stdin) : undefined;
        const result = await executePython(code, stdin);
        if (result.exitCode !== 0) {
          return `Exit code: ${result.exitCode}\nOutput:\n${result.output}\nStderr:\n${result.stderr}`;
        }
        return result.output || "(no output)";
      }

      case "calculator": {
        const expression = String(toolInput.expression ?? "");
        const result = calculate(expression);
        if (result.error) {
          return `Error: ${result.error}`;
        }
        return `${result.formatted}`;
      }

      case "browser_navigate": {
        const url = String(toolInput.url ?? "");
        const waitMs = typeof toolInput.wait_ms === "number" ? toolInput.wait_ms : 3000;
        const result = await browserNavigate(url, waitMs);
        if (result.error) {
          return `Error: ${result.error}`;
        }
        const lines: string[] = [];
        if (result.title) lines.push(`Title: ${result.title}`);
        lines.push(`URL: ${result.url}`);
        lines.push(`\nContent:\n${result.textContent}`);
        if (result.links.length > 0) {
          lines.push(`\nLinks (first ${Math.min(result.links.length, 10)}):`);
          result.links.slice(0, 10).forEach((l) => {
            lines.push(`  - ${l.text}: ${l.href}`);
          });
        }
        return lines.join("\n");
      }

      case "browser_screenshot": {
        const url = String(toolInput.url ?? "");
        const fullPage = toolInput.full_page === true;
        const result = await browserScreenshot(url, fullPage);
        if (result.error) {
          return `Error: ${result.error}`;
        }
        // Return as a reference — the caller (chat route) can pass as image block
        return `[Screenshot taken: ${result.width}x${result.height}px, base64_length=${result.base64.length}]`;
      }

      case "analyze_image": {
        const imageUrl = toolInput.image_url ? String(toolInput.image_url) : undefined;
        const imageBase64 = toolInput.image_base64 ? String(toolInput.image_base64) : undefined;
        const mediaType = (toolInput.media_type as "image/png" | "image/jpeg" | "image/gif" | "image/webp") ?? "image/png";
        const prompt = toolInput.prompt ? String(toolInput.prompt) : undefined;

        let result;
        if (imageUrl) {
          result = await analyzeImageUrl(imageUrl, prompt);
        } else if (imageBase64) {
          result = await analyzeImage(imageBase64, mediaType, prompt);
        } else {
          return "Error: provide either image_url or image_base64";
        }

        if (result.error) {
          return `Error: ${result.error}`;
        }

        const lines: string[] = [];
        lines.push(`Description: ${result.description}`);
        if (result.extractedText) {
          lines.push(`\nExtracted Text/Numbers: ${result.extractedText}`);
        }
        if (result.objects.length > 0) {
          lines.push(`\nKey Objects: ${result.objects.join(", ")}`);
        }
        return lines.join("\n");
      }

      default:
        return `Error: Unknown tool '${toolName}'. Available tools: web_search, execute_python, calculator, browser_navigate, browser_screenshot, analyze_image`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error executing tool '${toolName}': ${msg}`;
  }
}
