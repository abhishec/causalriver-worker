/**
 * A2A Agent Card — GET /api/a2a/agent-card
 * ==========================================
 * Returns the BrainOS agent capability descriptor per the Google/Linux
 * Foundation Agent-to-Agent (A2A) protocol specification.
 *
 * This is a PUBLIC endpoint — no auth required. Agent cards are the
 * A2A equivalent of an OpenAPI spec: any external agent or orchestrator
 * can discover BrainOS capabilities by fetching this endpoint.
 *
 * Reference: https://google.github.io/A2A/specification/
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * A2A AgentCard — full capability descriptor for BrainOS Delivery Intelligence Agent.
 * Schema follows A2A spec v0.1 (Google/Linux Foundation standard).
 */
const AGENT_CARD = {
  schemaVersion: "0.1",
  name: "BrainOS Delivery Intelligence Agent",
  description:
    "SE-aaS orchestration brain — pod matching, delivery health, early warning, scope creep detection",
  url: "https://platform.usebrainos.com/api/a2a",
  version: "1.0.0",
  capabilities: {
    streaming: false,
    pushNotifications: true,
    stateTransitionHistory: true,
  },
  skills: [
    {
      id: "pod-match",
      name: "Pod Matching",
      description:
        "Match engineers to engagements based on skills and availability",
      tags: ["delivery", "staffing", "pod"],
      examples: [
        "Find the best pod for a fintech engagement starting Q2",
        "Which engineers are available for the Acme Corp project?",
      ],
    },
    {
      id: "early-warning",
      name: "Early Warning",
      description: "Detect flight risk, velocity drops, review burden",
      tags: ["risk", "engineers", "velocity"],
      examples: [
        "Which engineers are at flight risk this week?",
        "Show me velocity trends across all engagements",
      ],
    },
    {
      id: "scope-creep",
      name: "Scope Creep Detection",
      description: "Alert on scope changes before they derail delivery",
      tags: ["scope", "delivery", "alerts"],
      examples: [
        "Are there any active scope creep alerts?",
        "Which engagements have exceeded their estimated story points?",
      ],
    },
    {
      id: "delivery-health",
      name: "Delivery Health",
      description: "Full engagement health snapshot",
      tags: ["delivery", "health", "engagement"],
      examples: [
        "What is the overall delivery health of my portfolio?",
        "Give me a health snapshot for the Tookitaki engagement",
      ],
    },
  ],
  authentication: {
    schemes: ["Bearer"],
    description:
      "Accepts SE_AAS_WORKER_SECRET (machine-to-machine) or a valid Supabase JWT (user auth)",
  },
  defaultInputModes: ["text/plain", "application/json"],
  defaultOutputModes: ["application/json"],
};

export async function GET() {
  return NextResponse.json(AGENT_CARD, {
    headers: {
      // Allow external agents to fetch this card cross-origin
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

// Support CORS preflight from external A2A agents
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
