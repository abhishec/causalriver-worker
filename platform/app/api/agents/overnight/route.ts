/**
 * POST /api/agents/overnight
 *
 * Overnight Agent Orchestrator
 * ==============================
 * Accepts a feature spec, decomposes it into tickets, and spawns a child
 * "code-agent" job in agent_queue for each ticket. The cron worker then
 * picks up each child job and: generates code via Claude, commits to a
 * GitHub branch, opens a PR, and notifies Slack.
 *
 * Rate limited: 2 requests/hour per user (prevent runaway spawning).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { getBrainContext } from "@/lib/brain/brain-context";
import { recordAgentOutcome } from "@/lib/brain/agent-rl";
import { checkSessionRateLimit } from "@/lib/security-middleware";
import { getConnectorCredentials } from "@/lib/connectors/get-credentials";
import { logger } from "@/lib/logger";
import type { DecomposedTicket } from "@/app/api/agents/decompose-spec/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // overnight jobs can take time

// ── Types ─────────────────────────────────────────────────────────────────────

interface OvernightRequest {
  spec: string;
  repoOwner: string;
  repoName: string;
  projectKey?: string;
  slackChannel?: string;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Step 1: createClient — isolated try/catch (Amplify Lambda safety) ────
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Step 2: getUser — isolated try/catch ─────────────────────────────────
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

  // ── Rate limiting: 2 req/hour per user (prevent runaway job spawning) ────
  const rateLimit = await checkSessionRateLimit(user.id, "/api/agents/overnight");
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Overnight agents are limited to 2 per hour." },
      { status: 429 }
    );
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
  let body: OvernightRequest;
  try {
    body = await req.json() as OvernightRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { spec, repoOwner, repoName, projectKey, slackChannel } = body;

  if (!spec || typeof spec !== "string" || spec.trim().length < 10) {
    return NextResponse.json(
      { error: "spec is required (min 10 characters)" },
      { status: 400 }
    );
  }
  if (!repoOwner || typeof repoOwner !== "string") {
    return NextResponse.json({ error: "repoOwner is required" }, { status: 400 });
  }
  if (!repoName || typeof repoName !== "string") {
    return NextResponse.json({ error: "repoName is required" }, { status: 400 });
  }

  // ── Step 4: Look up GitHub connector credentials (via RPC decryption) ────
  let serviceClient;
  try {
    serviceClient = await createServiceClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use getConnectorCredentials() to decrypt via get_connector_credentials RPC.
  // Direct .select("credentials") bypasses pgcrypto decryption — never use it.
  const githubCreds = await getConnectorCredentials(serviceClient, organizationId, "github");

  if (!githubCreds) {
    logger.warn("[overnight/route] No active GitHub connector found", {
      orgId: organizationId,
    });
    return NextResponse.json(
      { error: "No active GitHub connector found. Connect GitHub in Settings > Connectors." },
      { status: 400 }
    );
  }

  const githubToken = (githubCreds.access_token as string | undefined)
    ?? (githubCreds.token as string | undefined)
    ?? "";
  if (!githubToken) {
    return NextResponse.json(
      { error: "GitHub connector is missing access_token. Please reconnect GitHub." },
      { status: 400 }
    );
  }

  // ── Step 5: Look up Slack connector credentials (optional, via RPC) ──────
  let slackToken: string | undefined;
  try {
    const slackCreds = await getConnectorCredentials(serviceClient, organizationId, "slack");
    if (slackCreds) {
      slackToken = (slackCreds.access_token as string | undefined)
        ?? (slackCreds.bot_token as string | undefined);
    }
  } catch {
    // Non-fatal — Slack notifications are optional
    logger.warn("[overnight/route] Slack connector lookup failed (non-fatal)", {
      orgId: organizationId,
    });
  }

  // ── Step 6: Decompose spec into tickets ───────────────────────────────────
  let tickets: DecomposedTicket[] = [];
  try {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === "development" ? "http://localhost:3001" : "https://platform.usebrainos.com");

    const decomposeRes = await fetch(`${appUrl}/api/agents/decompose-spec`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Forward auth cookie so the decompose-spec route authenticates correctly.
        // Note: for internal server-to-server calls, use CRON_SECRET approach if
        // cookie forwarding is unavailable.
        ...(req.headers.get("cookie") ? { cookie: req.headers.get("cookie")! } : {}),
      },
      body: JSON.stringify({ spec: spec.trim(), projectKey, repoOwner, repoName }),
    });

    if (decomposeRes.ok) {
      const decomposeData = await decomposeRes.json() as { tickets?: DecomposedTicket[] };
      tickets = Array.isArray(decomposeData.tickets) ? decomposeData.tickets : [];
    } else {
      logger.warn("[overnight/route] decompose-spec returned non-OK", {
        status: decomposeRes.status,
      });
    }
  } catch (decomposeErr) {
    logger.warn("[overnight/route] decompose-spec call failed (non-fatal)", {
      error: decomposeErr instanceof Error ? decomposeErr.message : String(decomposeErr),
    });
  }

  // Fallback: create one generic ticket from the spec if decomposition failed
  if (tickets.length === 0) {
    tickets = [
      {
        title: spec.trim().slice(0, 80),
        description: spec.trim(),
        type: "task",
        priority: "medium",
        estimate: "medium",
        dependencies: [],
        domain: "backend",
      },
    ];
    logger.warn("[overnight/route] Decomposition returned 0 tickets — using single fallback ticket", {
      orgId: organizationId,
    });
  }

  // ── Step 7: Get brain context ─────────────────────────────────────────────
  let brainContextSummary: string | undefined;
  try {
    const ctx = await getBrainContext(serviceClient, organizationId);
    brainContextSummary = ctx.contextSummary;
  } catch (ctxErr) {
    // Non-fatal — code gen will work without brain context
    logger.warn("[overnight/route] getBrainContext failed (non-fatal)", {
      error: ctxErr instanceof Error ? ctxErr.message : String(ctxErr),
    });
  }

  // ── Step 8: Create parent job in agent_queue ──────────────────────────────
  const { data: parentJob, error: parentErr } = await serviceClient
    .from("agent_queue")
    .insert({
      organization_id: organizationId,
      agent_type: "overnight-orchestrator",
      task_type: "overnight-orchestrator",
      priority: 5,
      status: "running",
      payload: {
        spec: spec.trim(),
        repoOwner,
        repoName,
        ticketCount: tickets.length,
        userId: user.id,
      },
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (parentErr || !parentJob) {
    logger.error("[overnight/route] Failed to create parent job", {
      orgId: organizationId,
      error: parentErr?.message,
    });
    return NextResponse.json(
      { error: "Failed to create orchestrator job" },
      { status: 500 }
    );
  }

  // ── Step 9: Create child code-agent jobs for each ticket ──────────────────
  const childJobs: Array<{ ticketTitle: string; jobId: string }> = [];
  const totalTickets = tickets.length;

  for (let ticketIndex = 0; ticketIndex < tickets.length; ticketIndex++) {
    const ticket = tickets[ticketIndex];
    const { data: childJob, error: childErr } = await serviceClient
      .from("agent_queue")
      .insert({
        organization_id: organizationId,
        agent_type: "code-agent",
        task_type: "code-agent",
        priority: 5,
        status: "pending",
        parent_job_id: parentJob.id,
        payload: {
          ticket,
          repoOwner,
          repoName,
          githubToken,
          ...(slackToken ? { slackToken } : {}),
          ...(slackChannel ? { slackChannel } : {}),
          parentJobId: parentJob.id,
          ...(brainContextSummary ? { brainContext: brainContextSummary } : {}),
        },
      })
      .select("id")
      .single();

    if (childErr || !childJob) {
      logger.warn("[overnight/route] Failed to create child job for ticket", {
        ticketTitle: ticket.title,
        error: childErr?.message,
      });
      // Non-fatal: continue creating other child jobs
      continue;
    }

    childJobs.push({ ticketTitle: ticket.title, jobId: childJob.id });

    // Save parent-level checkpoint after each child job is dispatched.
    // If the Lambda dies mid-loop, a resume can skip already-dispatched tickets.
    const completedTickets = tickets.slice(0, ticketIndex + 1).map((t) => t.title);
    const pendingTickets = tickets.slice(ticketIndex + 1).map((t) => t.title);
    try {
      await serviceClient
        .from("agent_queue")
        .update({
          checkpoint_data: {
            completedTickets,
            pendingTickets,
            childJobsDispatched: childJobs.map((cj) => ({ title: cj.ticketTitle, jobId: cj.jobId })),
          },
          checkpoint_phase: `ticket-${ticketIndex + 1}-of-${totalTickets}`,
        })
        .eq("id", parentJob.id)
        .eq("organization_id", organizationId);
    } catch (cpErr) {
      // Non-fatal — checkpoint failure must never block the loop
      logger.warn("[overnight/route] Parent checkpoint save failed (non-fatal)", {
        parentJobId: parentJob.id,
        ticketIndex,
        error: cpErr instanceof Error ? cpErr.message : String(cpErr),
      });
    }
  }

  logger.warn("[overnight/route] Overnight agents spawned", {
    orgId: organizationId,
    userId: user.id,
    parentJobId: parentJob.id,
    ticketCount: tickets.length,
    childJobsCreated: childJobs.length,
    repo: `${repoOwner}/${repoName}`,
  });

  // ── Step 10: Mark parent job success + record RL outcome ─────────────────
  // The parent job's role is "decompose spec into child jobs" — that's now done.
  // Quality: fraction of tickets that got child jobs (1.0 if all got jobs).
  const parentQuality = tickets.length > 0
    ? childJobs.length / tickets.length
    : 0.5;

  // Mark the parent job as success (it was inserted as 'running').
  // Wrapped in async IIFE to surface errors via logger.warn instead of silently swallowing them.
  void (async () => {
    try {
      const { error } = await serviceClient
        .from("agent_queue")
        .update({
          status: "success",
          completed_at: new Date().toISOString(),
          result: {
            ticketCount: tickets.length,
            childJobsCreated: childJobs.length,
            repo: `${repoOwner}/${repoName}`,
          },
        })
        .eq("id", parentJob.id)
        .eq("organization_id", organizationId);
      if (error) {
        logger.warn("[overnight/route] Parent job status update failed (non-fatal)", {
          parentJobId: parentJob.id,
          error: error.message,
        });
      }
    } catch (e) {
      logger.warn("[overnight/route] Parent job status update threw (non-fatal)", {
        parentJobId: parentJob.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  })();

  // Fire-and-forget RL outcome for the parent orchestration job
  recordAgentOutcome(serviceClient, {
    agentId: parentJob.id,
    domain: "overnight-orchestrator",
    taskDescription: `Decompose spec and spawn code-agent jobs for ${repoOwner}/${repoName}`,
    resultSummary: `Spawned ${childJobs.length}/${tickets.length} code-agent jobs. Tickets: ${tickets.slice(0, 3).map(t => t.title).join(", ")}${tickets.length > 3 ? "…" : ""}`,
    quality: parentQuality,
    executionMs: 0, // orchestration time is not meaningful for quality
    organizationId,
    userId: user.id,
  }).catch(() => { /* fire-and-forget: never block the response */ });

  return NextResponse.json({
    parentJobId: parentJob.id,
    ticketCount: tickets.length,
    childJobsCreated: childJobs.length,
    tickets,
    childJobs,
    message: "Overnight agents spawned — check /api/brain/worker-health for progress",
  });
}
