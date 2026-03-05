"use client";

/**
 * AgentJobWidget
 * ──────────────
 * Enterprise-quality progress + result display for AI Worker agent jobs.
 *
 * Shows real-time progress while the agent works, then renders the
 * completed deliverable with full markdown formatting (headers, tables,
 * bullets, bold, code blocks).
 *
 * Rendered automatically when the copilot emits a `generalJobQueued` SSE event.
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import type { WidgetProps } from "./widget-registry";

type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "paused";

interface JobProgress {
  status: JobStatus;
  step?: string | number | null;
  phase?: string | null;
  totalSteps?: number | null;
  currentSubtaskGoal?: string | null;
  lastTool?: string | null;
  totalToolCalls?: number | null;
  partialOutput?: string | null;
  heartbeatAge?: number | null;
  progress?: number | null;
  elapsedMs?: number;
  result?: Record<string, unknown> | null;
  error?: string | null;
}

// ── Lightweight markdown renderer for agent results ──────────────────────────
// Renders headers, bold, italic, bullets, numbered lists, tables, and code.
// Intentionally minimal — avoids pulling in react-markdown dependency.

function renderAgentMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;
  let tableRows: string[][] = [];
  let inTable = false;

  const flushList = () => {
    if (listItems.length === 0) return;
    const tag = listType === "ol"
      ? <ol key={`ol-${elements.length}`} className="list-decimal list-inside space-y-0.5 my-1">{listItems}</ol>
      : <ul key={`ul-${elements.length}`} className="list-disc list-inside space-y-0.5 my-1">{listItems}</ul>;
    elements.push(tag);
    listItems = [];
    listType = null;
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const headers = tableRows[0];
    const dataStart = tableRows.length > 1 && tableRows[1].every((c) => /^[-:| ]+$/.test(c)) ? 2 : 1;
    const data = tableRows.slice(dataStart);
    elements.push(
      <div key={`tbl-${elements.length}`} className="overflow-x-auto my-2">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border-subtle">
              {headers.map((h, i) => (
                <th key={i} className="text-left px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted/70 font-medium">{renderInline(h.trim())}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} className="border-b border-border-subtle/50">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1.5 text-muted-foreground">{renderInline(cell.trim())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Table rows
    if (line.includes("|") && line.trim().startsWith("|")) {
      if (!inTable) { flushList(); inTable = true; }
      const cells = line.split("|").slice(1, -1); // trim outer |
      if (cells.length > 0) { tableRows.push(cells); continue; }
    } else if (inTable) {
      flushTable();
    }

    // Headers
    const h1Match = line.match(/^#\s+(.+)/);
    const h2Match = line.match(/^##\s+(.+)/);
    const h3Match = line.match(/^###\s+(.+)/);
    if (h1Match || h2Match || h3Match) {
      flushList();
      const text = (h1Match?.[1] ?? h2Match?.[1] ?? h3Match?.[1])!;
      const cls = h1Match
        ? "text-base font-bold text-foreground mt-3 mb-1"
        : h2Match
          ? "text-sm font-semibold text-foreground mt-2.5 mb-1"
          : "text-xs font-semibold text-foreground/90 mt-2 mb-0.5";
      elements.push(<div key={`h-${i}`} className={cls}>{renderInline(text)}</div>);
      continue;
    }

    // Bullet list
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.+)/);
    if (bulletMatch) {
      if (listType === "ol") flushList();
      listType = "ul";
      listItems.push(<li key={`li-${i}`} className="text-muted-foreground">{renderInline(bulletMatch[2])}</li>);
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\s*)\d+[.)]\s+(.+)/);
    if (numMatch) {
      if (listType === "ul") flushList();
      listType = "ol";
      listItems.push(<li key={`li-${i}`} className="text-muted-foreground">{renderInline(numMatch[2])}</li>);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line)) {
      flushList();
      elements.push(<hr key={`hr-${i}`} className="border-border-subtle/40 my-2" />);
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      flushList();
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(<p key={`p-${i}`} className="text-muted-foreground my-0.5">{renderInline(line)}</p>);
  }
  flushList();
  flushTable();

  return elements;
}

/** Render inline formatting: **bold**, *italic*, `code`, [links](url) */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Italic
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+?)\*(?!\*)/);
    // Inline code
    const codeMatch = remaining.match(/`([^`]+)`/);
    // Link
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    // Find earliest match
    const matches = [
      boldMatch ? { type: "bold", match: boldMatch, idx: remaining.indexOf(boldMatch[0]) } : null,
      italicMatch ? { type: "italic", match: italicMatch, idx: remaining.indexOf(italicMatch[0]) } : null,
      codeMatch ? { type: "code", match: codeMatch, idx: remaining.indexOf(codeMatch[0]) } : null,
      linkMatch ? { type: "link", match: linkMatch, idx: remaining.indexOf(linkMatch[0]) } : null,
    ].filter(Boolean).sort((a, b) => a!.idx - b!.idx);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0]!;
    if (first.idx > 0) {
      parts.push(remaining.slice(0, first.idx));
    }

    if (first.type === "bold") {
      parts.push(<strong key={`b-${keyIdx++}`} className="font-semibold text-foreground">{first.match![1]}</strong>);
    } else if (first.type === "italic") {
      parts.push(<em key={`i-${keyIdx++}`} className="italic">{first.match![1]}</em>);
    } else if (first.type === "code") {
      parts.push(<code key={`c-${keyIdx++}`} className="px-1 py-0.5 rounded bg-surface text-[11px] font-mono">{first.match![1]}</code>);
    } else if (first.type === "link") {
      parts.push(<a key={`a-${keyIdx++}`} href={first.match![2]} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{first.match![1]}</a>);
    }

    remaining = remaining.slice(first.idx + first.match![0].length);
  }

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

// ── Business-friendly activity labels ────────────────────────────────────────

const ACTIVITY_LABELS: Record<string, string> = {
  web_search: "Searching the web",
  browser_extract: "Reading a web page",
  browser_screenshot: "Capturing a screenshot",
  search_corpus: "Searching your knowledge base",
  search_knowledge: "Retrieving product knowledge",
  keyword_search: "Looking up specific terms",
  write_memory: "Saving key findings",
  compress_context: "Organizing research notes",
};

const PHASE_LABELS: Record<string, string> = {
  PLANNING: "Planning approach",
  SYNTHESIZING: "Writing final report",
  ESCALATED: "Flagged for review",
};

export function AgentJobWidget({ title, data }: WidgetProps) {
  const jobId = String(data.jobId ?? "");
  const agentType = String(data.agentType ?? "general");
  const task = String(data.task ?? title ?? "Agent task");

  const [progress, setProgress] = useState<JobProgress>({ status: "pending" });
  const [streaming, setStreaming] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expanded, setExpanded] = useState(true);
  // SSE reconnection state — counts how many times we've reconnected
  const reconnectAttemptsRef = React.useRef(0);
  const reconnectTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track when streaming started for ETA computation
  const streamStartMsRef = React.useRef<number>(0);

  useEffect(() => {
    if (!jobId) return;

    // Terminal states skip streaming altogether
    const alreadyTerminal = progress.status === "completed" || progress.status === "failed" || progress.status === "cancelled";
    if (alreadyTerminal) return;

    let evtSource: EventSource | null = null;
    let closed = false;

    const MAX_RECONNECT_ATTEMPTS = 5;

    const connect = () => {
      if (closed) return;
      evtSource = new EventSource(`/api/jobs/${jobId}/stream`);
      setStreaming(true);
      if (streamStartMsRef.current === 0) streamStartMsRef.current = Date.now();

      evtSource.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as {
            type?: string;
            status?: string;
            step?: string;
            progress?: number;
            elapsedMs?: number;
            result?: Record<string, unknown>;
            error?: string;
          };

          // Reset reconnect counter on any successful message
          reconnectAttemptsRef.current = 0;

          if (msg.type === "progress") {
            const m = msg as Record<string, unknown>;
            setProgress({
              status: (msg.status as JobStatus) ?? "running",
              step: msg.step ?? null,
              phase: m.phase as string | null ?? null,
              totalSteps: m.totalSteps as number | null ?? null,
              currentSubtaskGoal: m.currentSubtaskGoal as string | null ?? null,
              lastTool: m.lastTool as string | null ?? null,
              totalToolCalls: m.totalToolCalls as number | null ?? null,
              partialOutput: m.partialOutput as string | null ?? null,
              heartbeatAge: m.heartbeatAge as number | null ?? null,
              progress: msg.progress ?? null,
              elapsedMs: msg.elapsedMs,
            });
          } else if (msg.type === "complete") {
            setProgress({ status: "completed", result: msg.result ?? null, elapsedMs: msg.elapsedMs });
            closed = true;
            evtSource?.close();
            setStreaming(false);
          } else if (msg.type === "failed") {
            setProgress({ status: "failed", error: msg.error ?? "Agent job failed", elapsedMs: msg.elapsedMs });
            closed = true;
            evtSource?.close();
            setStreaming(false);
          } else if (msg.type === "cancelled") {
            setProgress((prev) => ({ ...prev, status: "cancelled" }));
            closed = true;
            evtSource?.close();
            setStreaming(false);
          } else if (msg.type === "paused") {
            const m = msg as Record<string, unknown>;
            setProgress((prev) => ({ ...prev, status: "paused", step: m.childJobId as string | null ?? null }));
            closed = true;
            evtSource?.close();
            setStreaming(false);
          } else if (msg.type === "timeout") {
            // Server-side timeout (12min SSE limit) — reconnect to keep tracking
            evtSource?.close();
            scheduleReconnect();
          }
        } catch {
          // ignore parse errors
        }
      };

      evtSource.onerror = () => {
        evtSource?.close();
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (closed) return;
      const attempt = reconnectAttemptsRef.current;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        // Exhausted reconnects — surface terminal error state (audit C8)
        setConnectionLost(true);
        setStreaming(false);
        return;
      }
      reconnectAttemptsRef.current = attempt + 1;
      // Exponential backoff: 2s, 4s, 8s, 16s, 32s
      const backoffMs = Math.min(2000 * Math.pow(2, attempt), 32_000);
      setStreaming(false);
      // Clear any existing timer before scheduling a new one — prevents duplicate reconnects (audit H11)
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (!closed) {
          setStreaming(true);
          connect();
        }
      }, backoffMs);
    };

    connect();

    return () => {
      closed = true;
      evtSource?.close();
      setStreaming(false);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancel = useCallback(async () => {
    if (!jobId || cancelling) return;
    setCancelling(true);
    try {
      await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
      setProgress((prev) => ({ ...prev, status: "cancelled" }));
      setStreaming(false);
    } catch {
      // Ignore — widget will reflect state from SSE stream
    } finally {
      setCancelling(false);
    }
  }, [jobId]); // cancelling read via early return guard; setCancelling is stable

  const isActive = progress.status === "pending" || progress.status === "running";
  const elapsedSec = progress.elapsedMs ? Math.round(progress.elapsedMs / 1000) : 0;
  const elapsedLabel = elapsedSec >= 60
    ? `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`
    : elapsedSec > 0 ? `${elapsedSec}s` : null;
  const isStale = isActive && progress.heartbeatAge != null && progress.heartbeatAge > 60_000;

  // Business-friendly labels
  const agentLabel = agentType === "apex" ? "Deep Research Agent" : "Research Agent";
  const statusLabel: Record<JobStatus, string> = {
    pending: "Starting up",
    running: "Working",
    completed: "Completed",
    failed: "Error",
    cancelled: "Cancelled",
    paused: "Continuing",
  };
  const statusColors: Record<JobStatus, string> = {
    pending: "text-amber-400",
    running: "text-blue-400",
    completed: "text-emerald-400",
    failed: "text-red-400",
    cancelled: "text-muted",
    paused: "text-amber-400",
  };

  const output = progress.result?.output as string | undefined;
  const subtasksCompleted = progress.result?.subtasksCompleted as number | undefined;

  const handleDownload = useCallback(() => {
    if (!output) return;
    const slug = task.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    const filename = `${slug || "agent-report"}.md`;
    const blob = new Blob([output], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, [output, task]);

  // Activity description in business language
  const activityLabel = progress.lastTool
    ? (ACTIVITY_LABELS[progress.lastTool] ?? `Using ${progress.lastTool}`)
    : null;

  const phaseLabel = progress.phase
    ? (PHASE_LABELS[progress.phase] ?? null)
    : null;

  // Compute progress bar for APEX agents
  const progressPct = progress.totalSteps && progress.step
    ? Math.round((Number(progress.step) / Number(progress.totalSteps)) * 100)
    : null;

  // Estimated time remaining (APEX agents only, needs ≥5% done for accuracy)
  const etaLabel = useMemo(() => {
    if (!isActive || progressPct == null || progressPct < 5 || !progress.elapsedMs) return null;
    const remainingPct = 100 - progressPct;
    const msPerPct = progress.elapsedMs / progressPct;
    const remainingSec = Math.round((remainingPct * msPerPct) / 1000);
    if (remainingSec < 15) return null; // don't show noise when almost done
    if (remainingSec >= 60) return `~${Math.ceil(remainingSec / 60)}m remaining`;
    return `~${Math.ceil(remainingSec / 10) * 10}s remaining`;
  }, [isActive, progressPct, progress.elapsedMs]);

  // Memoize rendered markdown for result
  const renderedOutput = useMemo(() => {
    if (!output) return null;
    return renderAgentMarkdown(output);
  }, [output]);

  return (
    <div className="my-3 rounded-xl border border-border-subtle overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-2.5 bg-surface/40 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
            </span>
          )}
          {progress.status === "completed" && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400/20">
              <span className="text-emerald-400 text-[10px]">✓</span>
            </span>
          )}
          <span className="text-sm font-semibold text-foreground">{agentLabel}</span>
          <span className={`text-xs font-medium ${statusColors[progress.status]}`}>
            {statusLabel[progress.status]}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          {elapsedLabel && <span>{elapsedLabel}</span>}
          {etaLabel && <span className="text-blue-400/80">{etaLabel}</span>}
          {isStale && <span className="text-amber-400 font-medium">reconnecting…</span>}
          {progress.status === "completed" && subtasksCompleted !== undefined && (
            <span>{subtasksCompleted} research phases</span>
          )}
          {isActive && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="text-[10px] px-1.5 py-0.5 rounded text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
            >
              {cancelling ? "Stopping…" : "Stop"}
            </button>
          )}
          {progress.status === "completed" && output && (
            <>
              <button
                type="button"
                onClick={handleDownload}
                className="text-[10px] px-1.5 py-0.5 rounded text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                title="Download report as Markdown"
              >
                ↓ Export
              </button>
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-[10px] px-1.5 py-0.5 rounded text-muted hover:text-foreground hover:bg-surface/60 transition-colors"
              >
                {expanded ? "Collapse" : "Expand"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Task description */}
      <div className="px-4 py-2 border-b border-border-subtle/40">
        <div className="text-[10px] text-muted uppercase tracking-wider font-medium mb-0.5">Task</div>
        <div className="text-sm text-foreground line-clamp-2">{task}</div>
      </div>

      {/* Live activity (running) */}
      {progress.status === "running" && (
        <div className="px-4 py-2.5 border-b border-border-subtle/40 space-y-1.5">
          {/* APEX: subtask progress bar */}
          {progress.totalSteps && progressPct !== null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">
                  Phase {progress.step} of {progress.totalSteps}
                </span>
                <span className="text-muted">{progressPct}%</span>
              </div>
              <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-400 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {progress.currentSubtaskGoal && (
                <p className="text-xs text-foreground/70 truncate">{progress.currentSubtaskGoal}</p>
              )}
            </div>
          )}

          {/* Phase label (SYNTHESIZING, etc) */}
          {phaseLabel && !progress.totalSteps && (
            <span className="text-xs text-foreground/70">{phaseLabel}</span>
          )}

          {/* Current activity */}
          {activityLabel && (
            <span className="text-xs text-blue-400 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {activityLabel}
            </span>
          )}

          {/* Partial output preview — styled as a draft excerpt, not a log */}
          {progress.partialOutput && (
            <div className="mt-1 text-xs text-muted/70 leading-relaxed line-clamp-2 border-l-2 border-blue-400/30 pl-2 italic">
              {progress.partialOutput.slice(0, 200)}
            </div>
          )}
        </div>
      )}

      {/* Result (completed) — full markdown rendering */}
      {progress.status === "completed" && output && expanded && (
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Deliverable</div>
            {elapsedLabel && (
              <span className="text-[10px] text-muted">completed in {elapsedLabel}</span>
            )}
          </div>
          <div className="text-sm leading-relaxed max-h-[500px] overflow-y-auto pr-1 agent-result-content">
            {renderedOutput}
          </div>
        </div>
      )}

      {/* Collapsed completed state */}
      {progress.status === "completed" && output && !expanded && (
        <div className="px-4 py-2 text-xs text-muted">
          Report ready — click Expand to view.
        </div>
      )}

      {/* Error (failed) */}
      {progress.status === "failed" && (
        <div className="px-4 py-3">
          <div className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1">Something went wrong</div>
          <div className="text-sm text-red-400/80">{progress.error}</div>
          <p className="text-xs text-muted mt-1.5">Try rephrasing your request or running it again.</p>
        </div>
      )}

      {/* Connection lost — terminal state after 5 reconnect failures (audit C8) */}
      {connectionLost && isActive && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 mt-2">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Connection lost — job may still be running</span>
          <button
            onClick={() => {
              setConnectionLost(false);
              reconnectAttemptsRef.current = 0;
              setStreaming(true);
            }}
            className="ml-auto text-[10px] underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Pending placeholder */}
      {progress.status === "pending" && (
        <div className="px-4 py-3 flex items-center gap-2">
          <span className="inline-block w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-sm text-muted">Agent starting up — your results will appear here shortly.</span>
        </div>
      )}

      {/* Cancelled */}
      {progress.status === "cancelled" && (
        <div className="px-4 py-3 text-sm text-muted">
          Research stopped. You can start a new request anytime.
        </div>
      )}

      {/* Paused (chaining) */}
      {progress.status === "paused" && (
        <div className="px-4 py-3 flex items-center gap-2">
          <span className="inline-block w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-sm text-muted">Still working — continuing in the background.</span>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-1.5 bg-surface/20 border-t border-border-subtle/40 flex items-center justify-between">
        <span className="text-[10px] text-muted/50 font-mono">
          {jobId.slice(0, 8)}
        </span>
        {typeof data.aiWorkerId === "string" && (
          <a
            href={`/ai-worker/${String(data.aiWorkerId)}`}
            className="text-[10px] text-primary hover:underline"
          >
            View Worker →
          </a>
        )}
      </div>
    </div>
  );
}
