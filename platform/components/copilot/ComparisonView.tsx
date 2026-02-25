"use client";

/**
 * ComparisonView — Side-by-Side Artifact Comparison
 * ==================================================
 *
 * Splits the artifact viewer into two panes, each with a dropdown
 * to select which artifact to show. Supports:
 *
 * - Independent artifact selection per pane
 * - Synchronized scrolling (toggleable)
 * - Full rendering of each artifact (code, charts, domain results, etc.)
 * - Useful for: P&L period-over-period, velocity across orgs, benchmarks
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useShikiHighlight } from "@/lib/shiki";
import dynamic from "next/dynamic";
import { parseChartSpec } from "@/components/copilot/chart-utils";
import { DomainResultRenderer } from "@/components/copilot/DomainResultRenderer";
import { AgentExecutionCard } from "@/components/copilot/AgentExecutionCard";
import DOMPurify from "dompurify";
import type { Artifact } from "./ArtifactsPanel";

const InlineChart = dynamic(
  () =>
    import("@/components/copilot/InlineChart").then((m) => ({
      default: m.InlineChart,
    })),
  { ssr: false }
);

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ComparisonViewProps {
  artifacts: Artifact[];
  /** Pre-selected artifact for the left pane (optional) */
  initialLeftId?: string;
  /** Pre-selected artifact for the right pane (optional) */
  initialRightId?: string;
  /** Exit comparison mode */
  onClose: () => void;
}

// ─── Artifact Type Labels ───────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  code: "Code",
  analysis: "Analysis",
  table: "Table",
  chart: "Chart",
  document: "Document",
  "financial-statement": "Financial",
  "engineering-analysis": "Engineering",
  "mermaid-diagram": "Diagram",
  "agent-execution": "Agent",
  presentation: "Slides",
  pdf: "PDF",
  infographic: "Infographic",
};

// ─── Mini Code Viewer (inline, no Shiki — lightweight for comparison) ───────

function ComparisonCodeViewer({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const shikiHtml = useShikiHighlight(code, language);

  if (shikiHtml) {
    return (
      <div
        className={cn(
          "shiki-container px-3 py-2 text-[12px] leading-relaxed font-mono bg-[#0d1117] min-h-full",
          "[&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:!m-0 [&_code]:!bg-transparent",
          "[&_.line]:flex [&_.line::before]:content-[attr(data-line)] [&_.line::before]:inline-block [&_.line::before]:w-8 [&_.line::before]:text-right [&_.line::before]:pr-3 [&_.line::before]:text-[var(--color-muted)]/30 [&_.line::before]:select-none [&_.line::before]:text-[10px] [&_.line::before]:tabular-nums [&_.line::before]:shrink-0"
        )}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(shikiHtml) }}
      />
    );
  }

  return (
    <pre className="px-3 py-2 text-[12px] leading-relaxed font-mono text-muted-foreground bg-[#0d1117] min-h-full whitespace-pre-wrap break-words">
      {code}
    </pre>
  );
}

// ─── Artifact Content Renderer ──────────────────────────────────────────────

function ArtifactContent({ artifact }: { artifact: Artifact }) {
  if (!artifact) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted">
        Select an artifact
      </div>
    );
  }

  switch (artifact.type) {
    case "agent-execution":
      return (
        <div className="p-3 overflow-auto h-full">
          <AgentExecutionCard
            data={(() => {
              try {
                return typeof artifact.rawData === "object" && artifact.rawData
                  ? (artifact.rawData as any)
                  : JSON.parse(artifact.content);
              } catch {
                return {
                  taskId: artifact.id,
                  agentType: "Agent",
                  status: "completed" as const,
                  steps: [],
                  summary: artifact.content,
                };
              }
            })()}
          />
        </div>
      );

    case "chart": {
      const spec = parseChartSpec(artifact.content);
      return spec ? (
        <div className="p-3">
          <InlineChart spec={spec} />
        </div>
      ) : (
        <div className="px-3 py-2 text-sm text-muted">
          Could not render chart
        </div>
      );
    }

    case "financial-statement":
    case "engineering-analysis":
      return (
        <div className="h-full overflow-hidden">
          <DomainResultRenderer
            domainId={artifact.domainId}
            result={
              artifact.service === "aas"
                ? {
                    service: "aas" as const,
                    data: (artifact.rawData ||
                      (() => { try { return JSON.parse(artifact.content || "{}"); } catch { return {}; } })()) as any,
                  }
                : artifact.domainId
                  ? {
                      service: "delivery-intelligence" as const,
                      data: (artifact.rawData ||
                        (() => { try { return JSON.parse(artifact.content || "{}"); } catch { return {}; } })()) as any,
                    }
                  : {
                      service: "seaas" as const,
                      data: (artifact.rawData ||
                        (() => { try { return JSON.parse(artifact.content || "{}"); } catch { return {}; } })()) as any,
                    }
            }
          />
        </div>
      );

    case "code":
      return (
        <ComparisonCodeViewer
          code={artifact.content}
          language={artifact.language || ""}
        />
      );

    default:
      // Document / analysis / table / etc. — render as formatted text
      return (
        <div className="px-3 py-2 text-[12px] text-muted-foreground leading-relaxed">
          {artifact.content.split("\n").map((line, i) => {
            if (line.startsWith("# "))
              return (
                <h2
                  key={i}
                  className="text-sm font-semibold mt-3 mb-1.5 text-foreground"
                >
                  {line.slice(2)}
                </h2>
              );
            if (line.startsWith("## "))
              return (
                <h3
                  key={i}
                  className="text-xs font-semibold mt-2 mb-1 text-foreground"
                >
                  {line.slice(3)}
                </h3>
              );
            if (line.startsWith("### "))
              return (
                <h4
                  key={i}
                  className="text-[10px] font-semibold mt-1.5 mb-0.5 text-muted-foreground uppercase tracking-wider"
                >
                  {line.slice(4)}
                </h4>
              );
            if (line.match(/^[-*]\s/))
              return (
                <div key={i} className="flex items-start gap-1.5 ml-2 my-0.5">
                  <span className="text-accent mt-1 text-[5px]">●</span>
                  <span className="flex-1">{line.slice(2)}</span>
                </div>
              );
            if (line.trim() === "") return <div key={i} className="h-1.5" />;
            return (
              <p key={i} className="my-0.5">
                {line}
              </p>
            );
          })}
        </div>
      );
  }
}

// ─── Pane Selector Dropdown ─────────────────────────────────────────────────

function PaneSelector({
  artifacts,
  selectedId,
  onSelect,
  label,
}: {
  artifacts: Artifact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = artifacts.find((a) => a.id === selectedId);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all w-full",
          "bg-surface border border-border-subtle hover:border-border hover:bg-surface-hover",
          open && "border-accent/30 bg-accent/5"
        )}
      >
        <span className="text-[9px] text-muted uppercase tracking-wider shrink-0">
          {label}
        </span>
        <span className="flex-1 truncate text-left text-foreground">
          {selected?.title || "Select artifact..."}
        </span>
        <svg
          className={cn(
            "w-3 h-3 text-muted transition-transform",
            open && "rotate-180"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border-subtle rounded-lg shadow-xl py-1 z-50 max-h-60 overflow-y-auto animate-dropdown-in">
          {artifacts.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                onSelect(a.id);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-[11px] transition-colors flex items-center gap-2",
                a.id === selectedId
                  ? "bg-accent/8 text-accent font-medium"
                  : "text-foreground hover:bg-surface-hover"
              )}
            >
              <span className="text-[9px] px-1 py-0.5 rounded bg-surface border border-border-subtle font-mono uppercase text-muted shrink-0">
                {TYPE_LABELS[a.type] || a.type}
              </span>
              <span className="truncate">{a.title}</span>
              {a.pinned && (
                <svg
                  className="w-2.5 h-2.5 text-accent shrink-0 ml-auto"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              )}
            </button>
          ))}
          {artifacts.length === 0 && (
            <div className="px-3 py-4 text-center text-[11px] text-muted">
              No artifacts available
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Comparison View ───────────────────────────────────────────────────

export function ComparisonView({
  artifacts,
  initialLeftId,
  initialRightId,
  onClose,
}: ComparisonViewProps) {
  const [leftId, setLeftId] = useState<string | null>(
    initialLeftId || artifacts[0]?.id || null
  );
  const [rightId, setRightId] = useState<string | null>(
    initialRightId || artifacts[1]?.id || null
  );
  const [syncScroll, setSyncScroll] = useState(true);

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef<"left" | "right" | null>(null);

  const leftArtifact = artifacts.find((a) => a.id === leftId) || null;
  const rightArtifact = artifacts.find((a) => a.id === rightId) || null;

  // ── Synchronized scrolling ──────────────────────────────────────────────
  const handleScroll = useCallback(
    (source: "left" | "right") => {
      if (!syncScroll) return;
      if (isScrolling.current && isScrolling.current !== source) return;

      isScrolling.current = source;

      const sourceEl =
        source === "left" ? leftScrollRef.current : rightScrollRef.current;
      const targetEl =
        source === "left" ? rightScrollRef.current : leftScrollRef.current;

      if (!sourceEl || !targetEl) return;

      const scrollRatio =
        sourceEl.scrollTop /
        Math.max(1, sourceEl.scrollHeight - sourceEl.clientHeight);
      const targetMax = targetEl.scrollHeight - targetEl.clientHeight;
      targetEl.scrollTop = scrollRatio * targetMax;

      // Reset lock after scroll settles
      requestAnimationFrame(() => {
        isScrolling.current = null;
      });
    },
    [syncScroll]
  );

  // Attach scroll listeners
  useEffect(() => {
    const leftEl = leftScrollRef.current;
    const rightEl = rightScrollRef.current;

    const onLeftScroll = () => handleScroll("left");
    const onRightScroll = () => handleScroll("right");

    leftEl?.addEventListener("scroll", onLeftScroll, { passive: true });
    rightEl?.addEventListener("scroll", onRightScroll, { passive: true });

    return () => {
      leftEl?.removeEventListener("scroll", onLeftScroll);
      rightEl?.removeEventListener("scroll", onRightScroll);
    };
  }, [handleScroll]);

  // ── Swap panes ──────────────────────────────────────────────────────────
  const handleSwap = useCallback(() => {
    setLeftId(rightId);
    setRightId(leftId);
  }, [leftId, rightId]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Comparison Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          {/* Comparison icon */}
          <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center">
            <svg
              className="w-3.5 h-3.5 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
              />
            </svg>
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Compare
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Sync scroll toggle */}
          <button
            onClick={() => setSyncScroll(!syncScroll)}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-all",
              syncScroll
                ? "bg-accent/10 text-accent border border-accent/20"
                : "text-muted hover:text-foreground hover:bg-surface-hover border border-transparent"
            )}
            title={
              syncScroll ? "Disable synced scrolling" : "Enable synced scrolling"
            }
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
              />
            </svg>
            Sync
          </button>

          {/* Swap button */}
          <button
            onClick={handleSwap}
            className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
            title="Swap panes"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
              />
            </svg>
          </button>

          {/* Close comparison */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
            title="Exit comparison"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Two-Pane Content ──────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* Left Pane */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border-subtle">
          <div className="px-2 py-1.5 border-b border-border-subtle/50">
            <PaneSelector
              artifacts={artifacts}
              selectedId={leftId}
              onSelect={setLeftId}
              label="A"
            />
          </div>
          <div
            ref={leftScrollRef}
            className="flex-1 overflow-auto"
          >
            {leftArtifact ? (
              <ArtifactContent artifact={leftArtifact} />
            ) : (
              <EmptyPane />
            )}
          </div>
          {leftArtifact && (
            <PaneFooter artifact={leftArtifact} />
          )}
        </div>

        {/* Divider — visual separator */}
        <div className="w-px bg-border-subtle shrink-0" />

        {/* Right Pane */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-2 py-1.5 border-b border-border-subtle/50">
            <PaneSelector
              artifacts={artifacts}
              selectedId={rightId}
              onSelect={setRightId}
              label="B"
            />
          </div>
          <div
            ref={rightScrollRef}
            className="flex-1 overflow-auto"
          >
            {rightArtifact ? (
              <ArtifactContent artifact={rightArtifact} />
            ) : (
              <EmptyPane />
            )}
          </div>
          {rightArtifact && (
            <PaneFooter artifact={rightArtifact} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Empty pane placeholder ─────────────────────────────────────────────────

function EmptyPane() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-12">
      <div className="w-10 h-10 rounded-xl bg-surface-hover flex items-center justify-center mb-3">
        <svg
          className="w-5 h-5 text-muted/50"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
      </div>
      <p className="text-[11px] text-muted">
        Select an artifact to compare
      </p>
    </div>
  );
}

// ─── Pane Footer (lines + time) ─────────────────────────────────────────────

function PaneFooter({ artifact }: { artifact: Artifact }) {
  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 0) return "just now";
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-t border-border-subtle/50 text-[9px] text-muted">
      <span className="tabular-nums">
        {artifact.content.split("\n").length} lines
      </span>
      <span className="flex items-center gap-1">
        {artifact.service && artifact.service !== "general" && (
          <span
            className={cn(
              "px-1 py-0.5 rounded text-[8px] font-medium",
              artifact.service === "aas"
                ? "bg-emerald-500/10 text-emerald-500"
                : artifact.service === "agent"
                  ? "bg-purple-500/10 text-purple-500"
                  : "bg-blue-500/10 text-blue-500"
            )}
          >
            {artifact.service === "aas"
              ? "AAS"
              : artifact.service === "agent"
                ? "Agent"
                : "SE-aaS"}
          </span>
        )}
        {timeAgo(artifact.createdAt)}
      </span>
    </div>
  );
}
