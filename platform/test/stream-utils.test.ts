/**
 * Tests for lib/copilot/stream-utils.ts — SSE stream factory.
 * Pure functions + browser APIs (jsdom environment covers ReadableStream, TextEncoder).
 */
import { describe, it, expect } from "vitest";
import { createSSEStream, SSE_HEADERS } from "@/lib/copilot/stream-utils";

// Helper to read all chunks from a ReadableStream into a string
async function readStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

describe("SSE_HEADERS", () => {
  it("has correct Content-Type", () => {
    expect(SSE_HEADERS["Content-Type"]).toBe("text/event-stream");
  });

  it("has no-cache Cache-Control", () => {
    expect(SSE_HEADERS["Cache-Control"]).toBe("no-cache, no-transform");
  });

  it("has keep-alive Connection", () => {
    expect(SSE_HEADERS["Connection"]).toBe("keep-alive");
  });

  it("has X-Accel-Buffering disabled", () => {
    expect(SSE_HEADERS["X-Accel-Buffering"]).toBe("no");
  });
});

describe("createSSEStream", () => {
  it("creates a stream object with all expected helpers", () => {
    const s = createSSEStream();
    expect(s).toHaveProperty("stream");
    expect(s).toHaveProperty("send");
    expect(s).toHaveProperty("sendText");
    expect(s).toHaveProperty("sendError");
    expect(s).toHaveProperty("close");
    expect(s).toHaveProperty("sendAgentStep");
    expect(s).toHaveProperty("sendProgressiveArtifact");
    expect(s).toHaveProperty("sendAgentStatus");
    expect(s).toHaveProperty("sendProactiveInsights");
    expect(s).toHaveProperty("sendWorkflowProgress");
  });

  it("stream is a ReadableStream", () => {
    const { stream } = createSSEStream();
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  it("send() writes data: prefix + double newline", async () => {
    const { stream, send, close } = createSSEStream();
    send("hello");
    close();
    const text = await readStream(stream);
    expect(text).toContain("data: hello\n\n");
  });

  it("sendText() wraps text in JSON", async () => {
    const { stream, sendText, close } = createSSEStream();
    sendText("my message");
    close();
    const text = await readStream(stream);
    expect(text).toContain('"text":"my message"');
  });

  it("sendError() wraps error in JSON", async () => {
    const { stream, sendError, close } = createSSEStream();
    sendError("something broke");
    close();
    const text = await readStream(stream);
    expect(text).toContain('"error":"something broke"');
  });

  it("close() sends [DONE] marker", async () => {
    const { stream, close } = createSSEStream();
    close();
    const text = await readStream(stream);
    expect(text).toContain("[DONE]");
  });

  it("close() is idempotent — calling twice does not throw", () => {
    const { close } = createSSEStream();
    expect(() => { close(); close(); }).not.toThrow();
  });

  it("send() after close() is a no-op (does not throw)", () => {
    const { send, close } = createSSEStream();
    close();
    expect(() => send("late data")).not.toThrow();
  });

  it("sendAgentStep() writes agentStep JSON", async () => {
    const { stream, sendAgentStep, close } = createSSEStream();
    sendAgentStep({
      stepNumber: 1,
      type: "thinking",
      title: "Analyzing request",
      status: "started",
    });
    close();
    const text = await readStream(stream);
    expect(text).toContain('"agentStep"');
    expect(text).toContain('"stepNumber":1');
    expect(text).toContain('"type":"thinking"');
    expect(text).toContain('"title":"Analyzing request"');
    expect(text).toContain('"status":"started"');
  });

  it("sendAgentStep() includes optional fields when provided", async () => {
    const { stream, sendAgentStep, close } = createSSEStream();
    sendAgentStep({
      stepNumber: 2,
      type: "acting",
      title: "Querying DB",
      content: "SELECT * FROM engagements",
      toolName: "sql-query",
      durationMs: 142,
      status: "completed",
    });
    close();
    const text = await readStream(stream);
    expect(text).toContain('"content":"SELECT * FROM engagements"');
    expect(text).toContain('"toolName":"sql-query"');
    expect(text).toContain('"durationMs":142');
  });

  it("sendProgressiveArtifact() writes progressiveArtifact JSON", async () => {
    const { stream, sendProgressiveArtifact, close } = createSSEStream();
    sendProgressiveArtifact({
      id: "art-1",
      type: "table",
      title: "Engagement Health",
      content: "<table/>",
      isPartial: false,
      service: "seaas",
    });
    close();
    const text = await readStream(stream);
    expect(text).toContain('"progressiveArtifact"');
    expect(text).toContain('"id":"art-1"');
    expect(text).toContain('"isPartial":false');
    expect(text).toContain('"service":"seaas"');
  });

  it("sendAgentStatus() writes agentStatus JSON", async () => {
    const { stream, sendAgentStatus, close } = createSSEStream();
    sendAgentStatus({
      taskId: "task-123",
      status: "running",
      agentType: "se-aas",
      message: "Processing",
    });
    close();
    const text = await readStream(stream);
    expect(text).toContain('"agentStatus"');
    expect(text).toContain('"taskId":"task-123"');
    expect(text).toContain('"status":"running"');
  });

  it("sendProactiveInsights() writes array of insights", async () => {
    const { stream, sendProactiveInsights, close } = createSSEStream();
    sendProactiveInsights([
      { domain: "early-warning", content: "3 engineers at flight risk", importance: 0.9 },
    ]);
    close();
    const text = await readStream(stream);
    expect(text).toContain('"proactiveInsights"');
    expect(text).toContain('"domain":"early-warning"');
    expect(text).toContain('"importance":0.9');
  });

  it("sendWorkflowProgress() writes workflow progress JSON", async () => {
    const { stream, sendWorkflowProgress, close } = createSSEStream();
    sendWorkflowProgress({
      runId: "run-1",
      workflowId: "wf-1",
      workflowName: "Onboarding",
      status: "running",
      currentStep: 1,
      totalSteps: 3,
      steps: [
        { order: 1, label: "Init", status: "completed" },
        { order: 2, label: "Process", status: "running" },
      ],
    });
    close();
    const text = await readStream(stream);
    expect(text).toContain('"workflowProgress"');
    expect(text).toContain('"workflowName":"Onboarding"');
    expect(text).toContain('"currentStep":1');
    expect(text).toContain('"totalSteps":3');
  });

  it("multiple sends appear in order", async () => {
    const { stream, sendText, close } = createSSEStream();
    sendText("first");
    sendText("second");
    sendText("third");
    close();
    const text = await readStream(stream);
    const firstPos = text.indexOf('"first"');
    const secondPos = text.indexOf('"second"');
    const thirdPos = text.indexOf('"third"');
    expect(firstPos).toBeLessThan(secondPos);
    expect(secondPos).toBeLessThan(thirdPos);
  });
});
