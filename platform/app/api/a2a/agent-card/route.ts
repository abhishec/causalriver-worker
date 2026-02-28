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
 * Skills are built dynamically from AGENT_SKILLS in capabilities-manifest.ts.
 * To add a new skill, add it there — this endpoint self-updates automatically.
 *
 * Reference: https://google.github.io/A2A/specification/
 */

import { NextResponse } from "next/server";
import { AGENT_SKILLS, getSkillCountByServiceArea } from "@/lib/brain/capabilities-manifest";

export const dynamic = "force-dynamic";

export async function GET() {
  const skillCounts = getSkillCountByServiceArea();

  const agentCard = {
    schemaVersion: "0.1",
    name: "BrainOS AI Worker",
    description: [
      "Multi-service AI orchestration brain across three service areas:",
      `SE-aaS (${skillCounts["se-aas"]} skills) — code intelligence, delivery health, pod matching, early warning;`,
      `AaaS (${skillCounts["aas"]} skills) — bookkeeping, reconciliation, tax compliance, anomaly detection;`,
      `PM-aaS (${skillCounts["pm-aas"]} skills) — roadmap planning, sprint health, backlog prioritization.`,
    ].join(" "),
    url: "https://platform.usebrainos.com/api/a2a",
    version: "2.0.0",
    capabilities: {
      streaming: false,
      pushNotifications: true,
      stateTransitionHistory: true,
    },
    skills: AGENT_SKILLS.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
      serviceArea: skill.serviceArea,
      inputModes: skill.inputModes,
      outputModes: skill.outputModes,
      ...(skill.examples ? { examples: skill.examples } : {}),
    })),
    authentication: {
      schemes: ["Bearer"],
      description:
        "Accepts SE_AAS_WORKER_SECRET (machine-to-machine) or a valid Supabase JWT (user auth)",
    },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["application/json"],
    skillCount: AGENT_SKILLS.length,
    skillsByServiceArea: skillCounts,
  };

  return NextResponse.json(agentCard, {
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
