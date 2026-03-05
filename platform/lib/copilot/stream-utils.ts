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
    send("[DONE]");   // must enqueue before marking closed, otherwise send() returns early
    closed = true;
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

  /**
   * Stream bulk ingestion progress to the UI.
   * Emitted during batch document ingestion jobs to show per-document status.
   */
  const sendIngestionProgress = (progress: {
    jobId: string;
    totalDocuments: number;
    processedDocuments: number;
    currentDocument?: string;
    chunksCreated?: number;
    status: "running" | "completed" | "failed" | "partial";
    errorMessage?: string;
  }) => {
    send(JSON.stringify({ ingestionProgress: progress }));
  };

  /**
   * Stream an interactive agent turn result to the UI.
   * Emitted after each user input → agent output exchange in a session.
   */
  const sendSessionTurn = (turn: {
    sessionId: string;
    turnId: string;
    turnNumber: number;
    agentType: string;
    output: string;
    tokensUsed?: number;
    ragResultsUsed?: number;
    status: "completed" | "failed";
    errorMessage?: string;
  }) => {
    send(JSON.stringify({ sessionTurn: turn }));
  };

  /** Stream a typed widget to the UI (Dynamic Widget System) */
  const sendWidget = (widget: {
    kind: string;
    title?: string;
    subtitle?: string;
    data: Record<string, unknown>;
  }) => {
    send(JSON.stringify({ widget }));
  };

  /** Notify UI that a general/APEX agent job was queued — triggers AgentJobWidget */
  const sendGeneralJobQueued = (job: {
    jobId: string;
    agentType: "general" | "apex";
    task: string;
    status: "pending";
    createdAt: string;
  }) => {
    send(JSON.stringify({ generalJobQueued: job }));
  };

  return {
    stream, send, sendText, sendError, close,
    sendAgentStep, sendProgressiveArtifact, sendAgentStatus, sendProactiveInsights,
    sendWorkflowProgress, sendIngestionProgress, sendSessionTurn, sendWidget,
    sendGeneralJobQueued,
  };
}

/** Standard SSE response headers */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;
