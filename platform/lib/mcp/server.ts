/**
 * BrainOS MCP Server
 * ==================
 * Model Context Protocol (JSON-RPC 2.0) tool definitions and dispatch.
 *
 * Exposes 5 BrainOS tools to any MCP-compatible agent:
 *   - brainos_se_analyze      — SE-aaS domain execution
 *   - brainos_delivery_health — engagement health snapshot
 *   - brainos_pod_match       — pod matching recommendations
 *   - brainos_early_warning   — flight-risk / velocity alerts
 *   - brainos_brain_context   — current brain state + RL status
 */

import { seAnalyze, type SeAnalyzeInput } from "./tools/se-analyze";
import { deliveryHealth, type DeliveryHealthInput } from "./tools/delivery-health";
import { podMatch, type PodMatchInput } from "./tools/pod-match";
import { earlyWarning, type EarlyWarningInput } from "./tools/early-warning";
import { brainContext, type BrainContextInput } from "./tools/brain-context";

// ── MCP Tool Definitions (returned by tools/list) ─────────────────────────

export const TOOL_DEFINITIONS = [
  {
    name: "brainos_se_analyze",
    description:
      "Execute a BrainOS SE-aaS domain analysis. Analyzes code, SQL, test data, or any engineering artifact using the active SE-aaS domain executor with full Brain context mesh.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The analysis query or content to analyze",
        },
        domain: {
          type: "string",
          description:
            "SE-aaS domain to invoke. Examples: sql-analyzer, test-data-generator, test-case-generator, tdd-code-generator, incident-diagnosis, impact-analysis, data-lineage, pr-review, codebase-qa, dead-code-detector",
        },
        organizationId: {
          type: "string",
          description: "BrainOS organization (AI worker space) ID",
        },
      },
      required: ["query", "domain", "organizationId"],
    },
  },
  {
    name: "brainos_delivery_health",
    description:
      "Get the delivery health snapshot for an organization. Returns engagement health scores, at-risk count, and per-engagement health data from the live engagement_health_latest view.",
    inputSchema: {
      type: "object",
      properties: {
        organizationId: {
          type: "string",
          description: "BrainOS organization (AI worker space) ID",
        },
      },
      required: ["organizationId"],
    },
  },
  {
    name: "brainos_pod_match",
    description:
      "Get pod matching recommendations. Returns the top pod recommendation with confidence score from historical pod match data.",
    inputSchema: {
      type: "object",
      properties: {
        organizationId: {
          type: "string",
          description: "BrainOS organization (AI worker space) ID",
        },
        requirements: {
          type: "string",
          description: "Optional: describe the engagement requirements to filter recommendations",
        },
      },
      required: ["organizationId"],
    },
  },
  {
    name: "brainos_early_warning",
    description:
      "Detect at-risk engineers via flight-risk and velocity analysis. Returns engineers with high flight-risk scores, velocity degradation, overallocation, or high review burden.",
    inputSchema: {
      type: "object",
      properties: {
        organizationId: {
          type: "string",
          description: "BrainOS organization (AI worker space) ID",
        },
      },
      required: ["organizationId"],
    },
  },
  {
    name: "brainos_brain_context",
    description:
      "Get the current BrainOS brain state for an organization. Returns Brain IQ, signal count, RL quality patterns, active jobs, strategic objectives, and the context summary used to prime all AI decisions.",
    inputSchema: {
      type: "object",
      properties: {
        organizationId: {
          type: "string",
          description: "BrainOS organization (AI worker space) ID",
        },
      },
      required: ["organizationId"],
    },
  },
];

// ── Tool Dispatch ──────────────────────────────────────────────────────────

export async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (name) {
    case "brainos_se_analyze":
      return seAnalyze(args as unknown as SeAnalyzeInput);

    case "brainos_delivery_health":
      return deliveryHealth(args as unknown as DeliveryHealthInput);

    case "brainos_pod_match":
      return podMatch(args as unknown as PodMatchInput);

    case "brainos_early_warning":
      return earlyWarning(args as unknown as EarlyWarningInput);

    case "brainos_brain_context":
      return brainContext(args as unknown as BrainContextInput);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
