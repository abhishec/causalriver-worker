/**
 * POST /api/agents/decompose-spec
 *
 * Decomposes a feature spec into actionable engineering tickets using Claude.
 * Optionally creates Jira tickets if the org has a Jira connector configured.
 * Persists the decomposition result as a "spec-decomposition" artifact.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import Anthropic from "@anthropic-ai/sdk";
import { createJiraTicket } from "@/lib/connectors/writeback/jira";
import { getConnectorWithCredentials } from "@/lib/connectors/get-credentials";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DecomposedTicket {
  title: string;
  description: string;
  type: "feature" | "bug" | "task" | "test";
  priority: "high" | "medium" | "low";
  estimate: "small" | "medium" | "large";
  dependencies: string[];
  domain: "frontend" | "backend" | "database" | "devops" | "testing";
}

interface JiraTicketRef {
  title: string;
  jiraKey?: string;
  jiraId?: string;
  error?: string;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const DECOMPOSE_SYSTEM_PROMPT = `You are a senior software architect decomposing a feature spec into actionable engineering tickets.

Given a spec, return a JSON array of tickets. Each ticket has:
- title: string (max 80 chars, imperative: "Add X", "Fix Y", "Implement Z")
- description: string (acceptance criteria, 2-5 bullet points)
- type: "feature" | "bug" | "task" | "test"
- priority: "high" | "medium" | "low"
- estimate: "small" | "medium" | "large" (S=<4h, M=<2d, L=<1w)
- dependencies: string[] (titles of tickets this depends on, empty if none)
- domain: "frontend" | "backend" | "database" | "devops" | "testing"

Rules:
- Max 10 tickets per spec
- Start with infrastructure/DB tickets, then backend, then frontend, then tests
- Each ticket must be independently completable (no ambiguous requirements)
- Include a test ticket for every feature ticket

Return ONLY valid JSON — no markdown, no explanation. The response must be a JSON array.`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse Claude's response as a DecomposedTicket[].
 * Returns an empty array on any parse failure (caller surfaces the error).
 */
function parseTickets(text: string): DecomposedTicket[] {
  // Strip markdown code fences if Claude wrapped the JSON
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  const parsed = JSON.parse(stripped);
  if (!Array.isArray(parsed)) {
    throw new Error("Claude response is not a JSON array");
  }
  return parsed as DecomposedTicket[];
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Step 1: createClient — isolated try/catch (Amplify Lambda env var safety) ──
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Step 2: getUser — isolated try/catch ──────────────────────────────────
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Step 3: getCurrentWorkspaceId — isolated try/catch ───────────────────
  let organizationId: string;
  try {
    organizationId = await getCurrentWorkspaceId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!organizationId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 401 });
  }

  // ── Parse request body ────────────────────────────────────────────────────
  let body: {
    spec?: string;
    projectKey?: string;
    repoOwner?: string;
    repoName?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { spec, projectKey, repoOwner, repoName } = body;

  if (!spec || typeof spec !== "string" || spec.trim().length < 10) {
    return NextResponse.json(
      { error: "spec is required (min 10 characters)" },
      { status: 400 }
    );
  }

  // ── Step 4: Call Claude to decompose the spec ─────────────────────────────
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    logger.error("[decompose-spec] ANTHROPIC_API_KEY not set");
    return NextResponse.json({ error: "AI service unavailable" }, { status: 503 });
  }

  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  let tickets: DecomposedTicket[] = [];

  try {
    const userMessage =
      repoOwner && repoName
        ? `Repository: ${repoOwner}/${repoName}\n\nSpec:\n${spec.trim()}`
        : `Spec:\n${spec.trim()}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: DECOMPOSE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    try {
      tickets = parseTickets(rawText);
    } catch (parseErr) {
      logger.warn("[decompose-spec] Failed to parse Claude response as tickets:", {
        parseErr,
        rawText: rawText.slice(0, 500),
      });
      // Return empty tickets with a warning rather than a 500
      tickets = [];
    }
  } catch (claudeErr) {
    logger.error("[decompose-spec] Claude API error:", claudeErr);
    return NextResponse.json(
      { error: "Failed to decompose spec: AI service error" },
      { status: 502 }
    );
  }

  // ── Step 5: Optionally create Jira tickets ────────────────────────────────
  const jiraTickets: JiraTicketRef[] = [];

  if (projectKey && tickets.length > 0) {
    let serviceClient;
    try {
      serviceClient = await createServiceClient();
    } catch {
      // Non-fatal — Jira write-back is optional, proceed without it
      logger.warn("[decompose-spec] Could not create service client for Jira lookup");
    }

    if (serviceClient) {
      const jiraConnector = await getConnectorWithCredentials(
        serviceClient,
        organizationId,
        "jira"
      );

      if (jiraConnector?.credentials) {
        const jiraToken = jiraConnector.credentials.access_token as string | undefined
          ?? jiraConnector.credentials.api_token as string | undefined;
        const jiraDomain = (jiraConnector.config.site_url as string | undefined)
          ?? (jiraConnector.config.site_name as string | undefined);

        if (jiraToken && jiraDomain) {
          // Extract subdomain from site_url if it's a full URL
          const domainSubdomain = jiraDomain.includes("atlassian.net")
            ? jiraDomain.replace(/^https?:\/\//, "").replace(/\.atlassian\.net.*$/, "")
            : jiraDomain;

          for (const ticket of tickets) {
            try {
              const result = await createJiraTicket(jiraToken, domainSubdomain, {
                projectKey,
                summary: ticket.title,
                description: ticket.description,
                issuetype: ticket.type === "bug" ? "Bug" : ticket.type === "test" ? "Task" : "Story",
                labels: [ticket.domain, ticket.priority, ticket.estimate],
              });

              jiraTickets.push({
                title: ticket.title,
                jiraKey: result.externalRef?.jira_key as string | undefined,
                jiraId: result.externalRef?.jira_id as string | undefined,
                error: result.success ? undefined : result.error,
              });
            } catch (jiraErr) {
              logger.warn("[decompose-spec] Jira ticket creation failed for:", ticket.title, jiraErr);
              jiraTickets.push({
                title: ticket.title,
                error: jiraErr instanceof Error ? jiraErr.message : "Unknown Jira error",
              });
            }
          }
        } else {
          logger.warn("[decompose-spec] Jira connector found but missing token or domain — skipping Jira write-back");
        }
      } else {
        logger.warn("[decompose-spec] No active Jira connector found for org — skipping Jira write-back");
      }
    }
  }

  // ── Step 6: Persist as se_aas_artifact ───────────────────────────────────
  let artifactId: string | null = null;

  try {
    let serviceClient;
    try {
      serviceClient = await createServiceClient();
    } catch {
      // Non-fatal — artifact persistence failure doesn't break the response
    }

    if (serviceClient) {
      const { data: inserted, error: insertError } = await serviceClient
        .from("se_aas_artifacts")
        .insert({
          organization_id: organizationId,
          domain_type: "spec-decomposition",
          artifact_data: {
            spec: spec.trim(),
            tickets,
            projectKey: projectKey ?? null,
            repoOwner: repoOwner ?? null,
            repoName: repoName ?? null,
            jiraTickets,
          },
          metadata: {
            ticketCount: tickets.length,
            jiraEnabled: jiraTickets.length > 0,
            model: "claude-sonnet-4-6",
          },
          created_by: user.id,
          created_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();

      if (insertError) {
        logger.warn("[decompose-spec] artifact insert error (non-fatal):", insertError);
      } else if (inserted) {
        artifactId = inserted.id as string;
      }
    }
  } catch (persistErr) {
    logger.warn("[decompose-spec] artifact persistence failed (non-fatal):", persistErr);
  }

  logger.warn("[decompose-spec] Decomposition complete", {
    orgId: organizationId,
    userId: user.id,
    ticketCount: tickets.length,
    jiraTicketCount: jiraTickets.length,
    artifactId,
  });

  return NextResponse.json({
    tickets,
    jiraTickets,
    artifactId,
  });
}
