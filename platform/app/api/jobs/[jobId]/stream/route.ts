/**
 * GET /api/jobs/[jobId]/stream
 *
 * SSE endpoint for real-time job progress updates.
 * Polls agent_queue status + checkpoint_data every 5s and streams progress.
 *
 * Used by the frontend to show progress for long-running agent sessions.
 * Max duration: 12 minutes (AWS Lambda/Amplify SSR limit).
 * For jobs >12min, sends "timeout" event so frontend can reconnect.
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  // Auth check — wrapped in try/catch to prevent unhandled 500s
  let orgId: string;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership?.organization_id) {
      return new Response("No workspace", { status: 403 });
    }

    orgId = membership.organization_id;

    // Verify job belongs to user's org
    const { data: job } = await supabase
      .from("agent_queue")
      .select("id, organization_id, status")
      .eq("id", jobId)
      .eq("organization_id", orgId)
      .single();

    if (!job) {
      return new Response("Job not found", { status: 404 });
    }
  } catch (err) {
    logger.error("[stream] Auth/setup error:", err);
    return new Response("Internal error", { status: 500 });
  }

  const encoder = new TextEncoder();
  const startMs = Date.now();
  let aborted = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream already closed
          aborted = true;
        }
      };

      // Poll every 5 seconds, max 12 minutes (AWS Lambda/Amplify SSR limit)
      const MAX_POLL_MS = 12 * 60 * 1000;
      const POLL_INTERVAL_MS = 5000;
      let consecutiveErrors = 0;

      // Create a fresh client for polling (the auth client may expire)
      const pollSupabase = await createClient();

      while (Date.now() - startMs < MAX_POLL_MS) {
        // Check abort BEFORE the query (not just after sleep)
        if (request.signal.aborted || aborted) break;

        try {
          // 3s query timeout — prevents indefinite hang when DB is slow under load
          const queryAbort = AbortSignal.timeout(3000);
          const { data: current } = await pollSupabase
            .from("agent_queue")
            .select("status, checkpoint_data, started_at, completed_at, error_message, result, heartbeat_at")
            .eq("id", jobId)
            .abortSignal(queryAbort)
            .single();

          if (!current) {
            send({ type: "error", message: "Job not found" });
            break;
          }

          consecutiveErrors = 0; // Reset on success

          // Validate checkpoint_data before accessing — malformed value crashes stream silently
          let checkpoint: Record<string, unknown> | null = null;
          try {
            const raw = current.checkpoint_data;
            if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
              checkpoint = raw as Record<string, unknown>;
            }
          } catch {
            logger.warn("[stream] Malformed checkpoint_data — skipping", { jobId });
          }

          const elapsedMs = current.started_at
            ? Date.now() - new Date(current.started_at as string).getTime()
            : 0;

          const heartbeatAge = current.heartbeat_at
            ? Date.now() - new Date(current.heartbeat_at as string).getTime()
            : null;

          // Stale agent detection — heartbeat not updated in 30s while job is running
          if (heartbeatAge !== null && heartbeatAge > 30_000 && current.status === "processing") {
            send({ type: "stale", message: "Agent unresponsive — heartbeat not updated in 30s", heartbeatAge, elapsedMs });
          }

          send({
            type: "progress",
            status: current.status,
            step: checkpoint?.currentStep ?? null,
            phase: checkpoint?.phase ?? null,
            totalSteps: checkpoint?.totalSteps ?? null,
            currentSubtaskGoal: checkpoint?.currentSubtaskGoal ?? null,
            lastTool: checkpoint?.lastTool ?? null,
            totalToolCalls: checkpoint?.totalToolCalls ?? null,
            toolsUsed: checkpoint?.toolsUsed ?? null,
            partialOutput: checkpoint?.partialOutput ?? null,
            progress: checkpoint?.progress ?? null,
            elapsedMs,
            heartbeatAge,
          });

          // Terminal states
          if (current.status === "paused") {
            const childJobId = (checkpoint?.childJobId ?? null) as string | null;
            send({ type: "paused", childJobId, elapsedMs, message: "Job checkpointed — continuing in next run" });
            break;
          }
          if (current.status === "completed" || current.status === "failed" || current.status === "cancelled") {
            send({
              type: current.status === "completed" ? "complete" : current.status === "cancelled" ? "cancelled" : "failed",
              result: current.result,
              error: current.status === "cancelled" ? "Job cancelled" : current.error_message,
              elapsedMs,
            });
            break;
          }
        } catch (err) {
          consecutiveErrors++;
          logger.error(`[stream] Poll error (attempt ${consecutiveErrors}):`, err);
          send({ type: "error", message: "Poll failed" });

          // Circuit breaker: 3 consecutive poll failures = give up
          if (consecutiveErrors >= 3) {
            send({ type: "failed", error: "Connection to database lost after 3 retries", elapsedMs: Date.now() - startMs });
            break;
          }
        }

        // Interruptible sleep — abort signal cancels the wait immediately
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, POLL_INTERVAL_MS);
          const onAbort = () => { clearTimeout(timer); resolve(); };
          request.signal.addEventListener("abort", onAbort, { once: true });
        });

        if (request.signal.aborted || aborted) break;
      }

      // If we exited because of timeout (not terminal state), send timeout event
      if (Date.now() - startMs >= MAX_POLL_MS && !request.signal.aborted && !aborted) {
        send({
          type: "timeout",
          message: "Stream timeout — job is still running. Reconnect to resume tracking.",
          elapsedMs: Date.now() - startMs,
        });
      }

      try { controller.close(); } catch { /* already closed */ }
    },
    cancel() {
      aborted = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
