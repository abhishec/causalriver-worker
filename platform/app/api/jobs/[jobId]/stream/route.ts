/**
 * GET /api/jobs/[jobId]/stream
 *
 * SSE endpoint for real-time job progress updates.
 * Polls agent_queue status + checkpoint_data every 5s and streams progress.
 *
 * Used by the frontend to show progress for long-running agent sessions (12h+).
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Verify job belongs to user's org
  const { data: job } = await supabase
    .from("agent_queue")
    .select("id, organization_id, status")
    .eq("id", jobId)
    .single();

  if (!job) {
    return new Response("Job not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  const startMs = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Poll every 5 seconds, max 30 minutes
      const MAX_POLL_MS = 30 * 60 * 1000;
      const POLL_INTERVAL_MS = 5000;

      let lastStatus = "";

      while (Date.now() - startMs < MAX_POLL_MS) {
        try {
          const { data: current } = await supabase
            .from("agent_queue")
            .select("status, checkpoint_data, started_at, completed_at, error_message, result, heartbeat_at")
            .eq("id", jobId)
            .single();

          if (!current) {
            send({ type: "error", message: "Job not found" });
            break;
          }

          const checkpoint = current.checkpoint_data as Record<string, unknown> | null;
          const elapsedMs = current.started_at
            ? Date.now() - new Date(current.started_at as string).getTime()
            : 0;

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
            progress: checkpoint?.progress ?? null,
            elapsedMs,
            heartbeatAge: current.heartbeat_at
              ? Date.now() - new Date(current.heartbeat_at as string).getTime()
              : null,
          });

          // Terminal states
          if (current.status === "completed" || current.status === "failed") {
            send({
              type: current.status === "completed" ? "complete" : "failed",
              result: current.result,
              error: current.error_message,
              elapsedMs,
            });
            break;
          }

          lastStatus = current.status as string;
        } catch {
          send({ type: "error", message: "Poll failed" });
        }

        // Wait between polls, but check for client disconnect
        await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

        if (request.signal.aborted) break;
      }

      controller.close();
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
