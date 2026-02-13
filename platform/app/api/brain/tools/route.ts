/**
 * Brain Tool Definitions API — For MCP / OpenAI Function Calling / Claude Tools
 *
 * GET /api/brain/tools — Returns tool schemas that any agent framework can use.
 *
 * These tool definitions follow the OpenAI function calling format, which is
 * compatible with Claude's tool_use, LangChain, CrewAI, and other frameworks.
 */

import { NextResponse } from "next/server";

const NEXUS_BRAIN_TOOLS = [
  {
    type: "function",
    function: {
      name: "nexus_brain_query",
      description:
        "Query the NexusBrain causal knowledge graph. Returns causal relationships, " +
        "patterns, impact analysis, and cascade paths for any business domain. " +
        "Use this to understand WHY things happen in an organization — root causes, " +
        "downstream effects, and cross-domain cascades.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The business question to analyze (e.g., 'What drives customer churn?' or 'Why is revenue declining?')",
          },
          domains: {
            type: "array",
            items: { type: "string" },
            description: "Optional: filter to specific domains (finance, growth, cs, marketing, product, strategy, engineering, people, revenue)",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nexus_brain_forecast",
      description:
        "Generate a causal forecast using the brain's trained knowledge graph. " +
        "Returns predicted values with confidence intervals, driver analysis, and " +
        "the causal reasoning behind the prediction. The forecast uses real " +
        "effect sizes and lag days discovered by the brain's 15-method statistical ensemble.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "What to forecast (e.g., 'Forecast revenue for next quarter' or 'Predict churn trend for 6 months')",
          },
          entityState: {
            type: "object",
            description: "Optional: current metrics for context (e.g., { arr: 5000000, churnRate: 0.08, nps: 42 })",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nexus_brain_simulate",
      description:
        "Run a counterfactual simulation ('what-if' analysis) through the causal graph. " +
        "Traces cascade effects across domains and estimates impact timeline. " +
        "Example: 'What if we increase pricing 15%?' → traces through churn, revenue, " +
        "support load, and estimates total business impact over time.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The what-if scenario to simulate (e.g., 'What if we cut marketing spend by 30%?')",
          },
          entityState: {
            type: "object",
            description: "Optional: current metrics for baseline (e.g., { monthlyMarketingSpend: 50000, cac: 120 })",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nexus_brain_diagnose",
      description:
        "Diagnose a business anomaly or problem using root cause analysis through " +
        "the causal graph. Identifies upstream causes, triggered business rules, " +
        "and recommends corrective actions with an execution playbook.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The problem to diagnose (e.g., 'Why did support costs spike 40% this month?')",
          },
          entityState: {
            type: "object",
            description: "Optional: current metrics that show the problem (e.g., { supportCostMonthly: 45000, ticketVolume: 1200 })",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nexus_brain_explain",
      description:
        "Get a detailed causal explanation for a business concept or relationship. " +
        "Uses the brain's discovered causal edges with real statistical evidence " +
        "(effect sizes, p-values, lag days) to explain HOW things are connected.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "What to explain (e.g., 'How does engineering velocity affect revenue?' or 'Explain the relationship between NPS and churn')",
          },
        },
        required: ["question"],
      },
    },
  },
];

export async function GET() {
  return NextResponse.json({
    name: "NexusBrain",
    version: "1.0.0",
    description:
      "Causal intelligence engine that understands organizations as living systems. " +
      "Trained on cross-domain signals with 15 statistical causal discovery methods. " +
      "Query, forecast, simulate, diagnose, and explain any business question.",
    tools: NEXUS_BRAIN_TOOLS,
    endpoint: "/api/brain/query",
    auth: {
      type: "bearer",
      description: "Use API key: Authorization: Bearer nxb_...",
    },
    usage: {
      note: "All tools call the same /api/brain/query endpoint with different 'action' values.",
      example: {
        method: "POST",
        url: "/api/brain/query",
        headers: { Authorization: "Bearer nxb_your_key_here", "Content-Type": "application/json" },
        body: { question: "What drives customer churn?", action: "query" },
      },
    },
  });
}
