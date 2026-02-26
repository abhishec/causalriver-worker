/**
 * SSE Stream Utilities for Copilot Chat
 *
 * Provides the createSSEStream() factory and all typed send helpers used
 * across every execution path (normal LLM, agent mode, workflow mode, etc.)
 */

export function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  let closed = false;

  const send = (data: string) => {
    if (closed || !controller) return;
    try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)); } catch { /* stream already closed */ }
  };

  const sendText = (text: string) => {
    send(JSON.stringify({ text }));
  };

  const sendError = (error: string) => {
    send(JSON.stringify({ error }));
  };

  const close = () => {
    if (closed) return;
    closed = true;
    send("[DONE]");
    try { controller?.close(); } catch { /* already closed */ }
  };

  /** Stream an agent execution step to the UI */
  const sendAgentStep = (step: {
    stepNumber: number;
    type: "thinking" | "querying" | "acting" | "observing" | "reflecting";
    title: string;
    content?: string;
    toolName?: string;
    durationMs?: number;
    status: "started" | "completed" | "failed";
  }) => {
    send(JSON.stringify({ agentStep: step }));
  };

  /** Stream a progressive artifact that builds incrementally */
  const sendProgressiveArtifact = (artifact: {
    id: string;
    type: string;
    title: string;
    content: string;
    isPartial: boolean;
    service?: "seaas" | "aas" | "core";
  }) => {
    send(JSON.stringify({ progressiveArtifact: artifact }));
  };

  /** Stream agent task status changes */
  const sendAgentStatus = (status: {
    taskId: string;
    status: "starting" | "running" | "completed" | "failed" | "awaiting_approval";
    agentType?: string;
    message?: string;
  }) => {
    send(JSON.stringify({ agentStatus: status }));
  };

  /** Stream proactive insights ("while you were away") */
  const sendProactiveInsights = (insights: Array<{
    domain: string;
    content: string;
    importance: number;
  }>) => {
    send(JSON.stringify({ proactiveInsights: insights }));
  };

  /** Stream workflow execution progress */
  const sendWorkflowProgress = (progress: {
    runId: string;
    workflowId: string;
    workflowName: string;
    status: "running" | "paused" | "completed" | "failed";
    currentStep: number;
    totalSteps: number;
    steps: Array<{
      order: number;
      label: string;
      status: "pending" | "running" | "completed" | "failed" | "skipped";
      parallel_group?: string;
    }>;
  }) => {
    send(JSON.stringify({ workflowProgress: progress }));
  };

  return {
    stream, send, sendText, sendError, close,
    sendAgentStep, sendProgressiveArtifact, sendAgentStatus, sendProactiveInsights,
    sendWorkflowProgress,
  };
}

/** Standard SSE response headers */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;
