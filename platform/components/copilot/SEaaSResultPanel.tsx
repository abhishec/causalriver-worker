"use client";

import { useState, useRef, useEffect, useId } from "react";
import { cn } from "@/lib/utils";
import DOMPurify from "dompurify";
import type { SEaaSDomainData } from "@/components/copilot/types";

// ─── Mermaid diagram renderer ─────────────────────────────────────────────────

function MermaidDiagram({ code, title }: { code: string; title?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uniqueId = useId();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            primaryColor: "#7c6cf0",
            primaryTextColor: "#e4e4e7",
            primaryBorderColor: "#3f3f46",
            lineColor: "#52525b",
            secondaryColor: "#1e1b4b",
            tertiaryColor: "#172554",
            background: "#0d1117",
            mainBkg: "#161b22",
            nodeBorder: "#3f3f46",
            clusterBkg: "#1a1a2e",
            titleColor: "#a1a1aa",
          },
          flowchart: { htmlLabels: true, curve: "basis" },
          securityLevel: "strict",
        });
        const safeId = `mermaid-result-${uniqueId.replace(/:/g, "-")}`;
        const { svg: rendered } = await mermaid.render(safeId, code);
        // Mermaid v11 may leave a hidden container in <body> — clean it up
        const orphan = document.getElementById(safeId);
        if (orphan) orphan.remove();
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        // Remove any orphaned mermaid error SVG nodes injected into <body> by mermaid v11
        document.querySelectorAll('[id^="mermaid-result-"]').forEach((el) => {
          if (el.closest("body") && !el.closest("[data-mermaid-host]")) el.remove();
        });
        if (!cancelled) setError("Diagram unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, [code, uniqueId]);

  if (error) {
    return (
      <div className="my-3 text-sm text-muted-foreground p-3 border border-border-subtle rounded-lg bg-surface">
        Diagram unavailable
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-border-subtle bg-card">
      <div className="flex items-center justify-between px-4 py-2 bg-surface-hover border-b border-border-subtle">
        <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
          {title ?? "Diagram"}
        </span>
      </div>
      <div ref={containerRef} className="p-4 flex items-center justify-center overflow-x-auto">
        {svg ? (
          <div
            className="[&_svg]:max-w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ["foreignObject"] }) }}
          />
        ) : (
          <div className="flex items-center gap-2 py-8 text-xs text-muted">
            <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Rendering diagram...
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Severity / Priority badges ────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const s = severity?.toLowerCase() ?? "info";
  const map: Record<string, { cls: string; dot: string; label: string }> = {
    critical: { cls: "bg-danger/10 text-danger border-danger/30",      dot: "bg-danger",      label: "CRITICAL" },
    high:     { cls: "bg-warning/10 text-warning border-warning/30",   dot: "bg-warning",     label: "HIGH" },
    medium:   { cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", dot: "bg-yellow-400", label: "MEDIUM" },
    low:      { cls: "bg-blue-500/10 text-blue-400 border-blue-500/30", dot: "bg-blue-400",   label: "LOW" },
    info:     { cls: "bg-surface text-muted border-border-subtle",      dot: "bg-muted",      label: "INFO" },
  };
  const cfg = map[s] ?? map.info;
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0", cfg.cls)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function PriorityIcon({ priority }: { priority: string }) {
  const p = priority?.toLowerCase() ?? "medium";
  if (p === "high") return (
    <span className="flex items-center justify-center w-5 h-5 rounded bg-danger/10 shrink-0">
      <svg className="w-3 h-3 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
      </svg>
    </span>
  );
  if (p === "medium") return (
    <span className="flex items-center justify-center w-5 h-5 rounded bg-warning/10 shrink-0">
      <svg className="w-3 h-3 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
      </svg>
    </span>
  );
  return (
    <span className="flex items-center justify-center w-5 h-5 rounded bg-surface shrink-0">
      <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
      </svg>
    </span>
  );
}

// ─── Confidence ring ───────────────────────────────────────────────────────────

function ConfidenceRing({ value, size = 48 }: { value: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(value, 0), 1);
  const dash = pct * circ;
  const color = pct >= 0.8 ? "#22c55e" : pct >= 0.6 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={4} className="text-border-subtle" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <span className="absolute text-[11px] font-bold tabular-nums" style={{ color }}>
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}

// ─── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ value, max = 1, label, color = "blue" }: { value: number; max?: number; label: string; color?: string }) {
  const pct = Math.round((value / max) * 100);
  const colorMap: Record<string, string> = {
    blue:   "bg-blue-500",
    green:  "bg-green-500",
    yellow: "bg-yellow-400",
    red:    "bg-danger",
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted">{label}</span>
        <span className="text-[11px] font-semibold tabular-nums text-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", colorMap[color] ?? colorMap.blue)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Branch pill ───────────────────────────────────────────────────────────────

function BranchPill({ branch }: { branch: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-mono text-blue-400">
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .103 2.703-1.332 2.703H6.13c-1.435 0-2.332-1.703-1.332-2.703L5 14.5" />
      </svg>
      {branch}
    </span>
  );
}

// ─── File chip ─────────────────────────────────────────────────────────────────

function FileChip({ path, line }: { path: string; line?: number }) {
  const parts = path.split("/");
  const name = parts[parts.length - 1];
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-[10px] font-mono text-muted max-w-[220px] truncate">
      <svg className="w-2.5 h-2.5 shrink-0 text-muted/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
      <span className="truncate" title={path}>{name}{line ? `:${line}` : ""}</span>
    </span>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────

type TabId = "summary" | "findings" | "recommendations" | "metrics";

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  {
    id: "summary",
    label: "Summary",
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
    ),
  },
  {
    id: "findings",
    label: "Findings",
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    id: "recommendations",
    label: "Actions",
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    id: "metrics",
    label: "Metrics",
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
];

// ─── Domain type → display config ─────────────────────────────────────────────

const DOMAIN_CONFIG: Record<string, { label: string; accent: string; icon: React.ReactNode }> = {
  // P0: Delivery Intelligence
  "early-warning": {
    label: "Early Warning",
    accent: "text-yellow-400",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>,
  },
  // P1: Code Intelligence
  "pr-review": {
    label: "PR Review",
    accent: "text-blue-400",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
  },
  "tdd": {
    label: "TDD Agent",
    accent: "text-green-400",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" /></svg>,
  },
  "tdd-code-gen": {
    label: "TDD Generator",
    accent: "text-green-400",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" /></svg>,
  },
  "boilerplate-scaffold": {
    label: "Scaffolding",
    accent: "text-cyan-400",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>,
  },
  "dependency-upgrade": {
    label: "Dep Upgrade",
    accent: "text-orange-400",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg>,
  },
  "design-doc-generator": {
    label: "HLD / LLD",
    accent: "text-indigo-400",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
  },
  // P1: Test Intelligence
  "test-case-generator": {
    label: "Test Cases",
    accent: "text-green-400",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  "test-data-generator": {
    label: "Test Data",
    accent: "text-teal-400",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>,
  },
  // SWE: Codebase Understanding
  "codebase-qa": {
    label: "Codebase Q&A",
    accent: "text-purple-400",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>,
  },
  "dead-code-detector": {
    label: "Dead Code",
    accent: "text-muted",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>,
  },
  "dead-code": {
    label: "Dead Code",
    accent: "text-muted",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>,
  },
  "impact-analysis": {
    label: "Impact Analysis",
    accent: "text-orange-400",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>,
  },
  "architecture-extractor": {
    label: "Architecture",
    accent: "text-violet-400",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z" /></svg>,
  },
  // Observability
  "incident-diagnosis": {
    label: "Incident RCA",
    accent: "text-danger",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>,
  },
  "log-query": {
    label: "Log Query",
    accent: "text-amber-400",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg>,
  },
  "performance-profiler": {
    label: "Perf Profiler",
    accent: "text-rose-400",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
  },
  // Data
  "sql-analyzer": {
    label: "SQL Analyzer",
    accent: "text-sky-400",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" /></svg>,
  },
  "data-lineage": {
    label: "Data Lineage",
    accent: "text-emerald-400",
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>,
  },
};

function getDomainConfig(analysisType?: string) {
  if (!analysisType) return null;
  const key = analysisType.toLowerCase().replace(/\s+/g, "-");
  return DOMAIN_CONFIG[key] ?? DOMAIN_CONFIG[Object.keys(DOMAIN_CONFIG).find(k => analysisType.toLowerCase().includes(k)) ?? ""] ?? null;
}

// ─── Section header ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-bold uppercase tracking-widest text-muted/70 mb-2">{children}</div>
  );
}

// ─── Summary stat card ─────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent = false }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3 flex flex-col gap-0.5", accent ? "border-accent/30 bg-accent/5" : "border-border-subtle bg-surface/40")}>
      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={cn("text-[18px] font-bold tabular-nums leading-tight", accent ? "text-accent-light" : "text-foreground")}>{value}</div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface SEaaSResultPanelProps {
  data: SEaaSDomainData;
}

export function SEaaSResultPanel({ data }: SEaaSResultPanelProps) {
  const domainCfg = getDomainConfig(data.analysisType);

  const getDefaultTab = (): TabId => {
    if (data.summary || data.analysisType) return "summary";
    if (data.findings && data.findings.length > 0) return "findings";
    if (data.recommendations && data.recommendations.length > 0) return "recommendations";
    return "summary";
  };

  const [activeTab, setActiveTab] = useState<TabId>(getDefaultTab);

  const hasData: Record<TabId, boolean> = {
    summary:         !!(data.summary || data.analysisType),
    findings:        !!(data.findings && data.findings.length > 0),
    recommendations: !!(data.recommendations && data.recommendations.length > 0),
    metrics:         !!(data.metrics && Object.keys(data.metrics).length > 0),
  };

  // Severity breakdown counts
  const sevCounts = (data.findings ?? []).reduce<Record<string, number>>((acc, f) => {
    const s = f.severity?.toLowerCase() ?? "info";
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  // Confidence value (0–1) — try to parse from metrics or narrative
  const confidenceRaw = data.metrics?.confidence ?? data.metrics?.confidenceScore ?? data.metrics?.quality_score ?? null;
  const confidence = typeof confidenceRaw === "number"
    ? (confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw)
    : null;

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border-subtle overflow-hidden">

      {/* ── Header strip ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 border-b border-border-subtle bg-gradient-to-r from-accent/5 via-transparent to-transparent">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {domainCfg ? (
              <span className={cn("shrink-0", domainCfg.accent)}>{domainCfg.icon}</span>
            ) : (
              <svg className="w-3.5 h-3.5 text-accent-light shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
            )}
            <span className="text-[12px] font-semibold text-foreground truncate">
              {domainCfg?.label ?? data.analysisType ?? "SE-aaS Analysis"}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {data.metrics?.branch && <BranchPill branch={String(data.metrics.branch)} />}
            {confidence !== null && <ConfidenceRing value={confidence} size={40} />}
          </div>
        </div>

        {/* Severity breakdown strip — shown when findings exist */}
        {data.findings && data.findings.length > 0 && (
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            {(["critical", "high", "medium", "low"] as const).map(s => {
              const count = sevCounts[s] ?? 0;
              if (!count) return null;
              const colors: Record<string, string> = {
                critical: "bg-danger/10 text-danger border-danger/20",
                high:     "bg-warning/10 text-warning border-warning/20",
                medium:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
                low:      "bg-blue-500/10 text-blue-400 border-blue-500/20",
              };
              return (
                <span key={s} className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold border", colors[s])}>
                  {count} {s}
                </span>
              );
            })}
            <span className="text-[10px] text-muted ml-auto">
              {data.findings.length} total finding{data.findings.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 border-b border-border-subtle bg-surface/20">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-all relative flex-1 justify-center",
              activeTab === tab.id
                ? "text-accent-light bg-accent/5"
                : "text-muted hover:text-foreground hover:bg-surface/50",
              !hasData[tab.id] && "opacity-40"
            )}
          >
            <span className={cn(activeTab === tab.id ? "text-accent-light" : "text-muted")}>{tab.icon}</span>
            {tab.label}
            {hasData[tab.id] && tab.id === "findings" && (sevCounts.critical ?? 0) > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0 animate-pulse" />
            )}
            {hasData[tab.id] && tab.id !== "findings" && (
              <span className={cn("w-1 h-1 rounded-full shrink-0", activeTab === tab.id ? "bg-accent-light" : "bg-accent/40")} />
            )}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-light rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        {/* ── SUMMARY ─────────────────────────────────────────────────────────── */}
        {activeTab === "summary" && (
          <div className="p-4 space-y-4">
            {/* Key stats grid */}
            {data.metrics && Object.keys(data.metrics).length > 0 && (() => {
              const topMetrics = Object.entries(data.metrics ?? {})
                .filter(([k]) => !["branch", "confidence", "confidenceScore"].includes(k))
                .slice(0, 4);
              if (!topMetrics.length) return null;
              return (
                <div>
                  <SectionLabel>Key Metrics</SectionLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {topMetrics.map(([key, value], i) => (
                      <StatCard
                        key={key}
                        label={key.replace(/_/g, " ")}
                        value={typeof value === "number" ? value.toLocaleString() : String(value)}
                        accent={i === 0}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Summary text */}
            {data.summary && (
              <div>
                <SectionLabel>Analysis</SectionLabel>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{data.summary}</p>
              </div>
            )}

            {/* Mermaid diagrams from codeSnippets */}
            {data.codeSnippets && data.codeSnippets.filter(s => s.language?.toLowerCase() === "mermaid").length > 0 && (
              <div>
                <SectionLabel>Architecture Diagrams</SectionLabel>
                {data.codeSnippets
                  .filter(s => s.language?.toLowerCase() === "mermaid")
                  .map((snippet, i) => (
                    <MermaidDiagram key={i} code={snippet.code} title={snippet.title} />
                  ))}
              </div>
            )}

            {/* Code snippets (non-mermaid) */}
            {data.codeSnippets && data.codeSnippets.filter(s => s.language?.toLowerCase() !== "mermaid").length > 0 && (
              <div>
                <SectionLabel>Code</SectionLabel>
                {data.codeSnippets
                  .filter(s => s.language?.toLowerCase() !== "mermaid")
                  .map((snippet, i) => (
                    <div key={i} className="my-2 rounded-xl overflow-hidden border border-border-subtle">
                      <div className="px-4 py-2 bg-surface-hover border-b border-border-subtle flex items-center justify-between">
                        <span className="text-[10px] font-medium text-muted uppercase tracking-wider">{snippet.title ?? snippet.language}</span>
                      </div>
                      <pre className="p-4 text-[11px] text-muted-foreground overflow-x-auto bg-card"><code>{snippet.code ?? "// No code available"}</code></pre>
                    </div>
                  ))}
              </div>
            )}

            {/* Findings preview */}
            {data.findings && data.findings.length > 0 && (
              <div>
                <SectionLabel>Critical Issues</SectionLabel>
                <div className="space-y-2">
                  {data.findings
                    .filter(f => ["critical", "high"].includes(f.severity?.toLowerCase()))
                    .slice(0, 3)
                    .map((f, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border-subtle/60 bg-surface/30 cursor-pointer hover:bg-surface/60 transition-colors"
                        onClick={() => setActiveTab("findings")}
                      >
                        <SeverityBadge severity={f.severity} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium text-foreground leading-snug truncate">{f.title}</p>
                          {f.file && <FileChip path={f.file} line={f.line} />}
                        </div>
                      </div>
                    ))}
                  {data.findings.length > 3 && (
                    <button
                      className="text-[11px] text-accent-light hover:text-accent transition-colors"
                      onClick={() => setActiveTab("findings")}
                    >
                      View all {data.findings.length} findings →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Top action preview */}
            {data.recommendations && data.recommendations.length > 0 && (
              <div>
                <SectionLabel>Top Action</SectionLabel>
                <div
                  className="flex items-start gap-2.5 p-2.5 rounded-lg border border-accent/20 bg-accent/5 cursor-pointer hover:bg-accent/10 transition-colors"
                  onClick={() => setActiveTab("recommendations")}
                >
                  <PriorityIcon priority={data.recommendations[0]?.priority} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-foreground leading-snug">{data.recommendations[0]?.action ?? "Action recommended"}</p>
                    <p className="text-[11px] text-muted mt-0.5 leading-snug line-clamp-2">{data.recommendations[0]?.rationale}</p>
                  </div>
                </div>
                {data.recommendations.length > 1 && (
                  <button
                    className="text-[11px] text-accent-light hover:text-accent transition-colors mt-1.5"
                    onClick={() => setActiveTab("recommendations")}
                  >
                    +{data.recommendations.length - 1} more actions →
                  </button>
                )}
              </div>
            )}

            {/* Empty state */}
            {!data.summary && !data.findings?.length && !data.recommendations?.length && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-accent-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                  </svg>
                </div>
                <p className="text-[12px] text-muted max-w-[200px]">Ask the copilot to analyse your code, review a PR, or run an impact analysis.</p>
              </div>
            )}
          </div>
        )}

        {/* ── FINDINGS ────────────────────────────────────────────────────────── */}
        {activeTab === "findings" && (
          <div>
            {data.findings && data.findings.length > 0 ? (
              <>
                {/* Group by severity */}
                {(["critical", "high", "medium", "low", "info"] as const).map(sev => {
                  const group = data.findings!.filter(f => (f.severity?.toLowerCase() ?? "info") === sev);
                  if (!group.length) return null;
                  return (
                    <div key={sev}>
                      <div className="sticky top-0 z-10 px-4 py-1.5 bg-card/95 backdrop-blur-sm border-b border-border-subtle/50">
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={sev} />
                          <span className="text-[10px] text-muted">{group.length} finding{group.length !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                      {group.map((f, i) => (
                        <div key={i} className="px-4 py-3 border-b border-border-subtle/40 hover:bg-surface/20 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-foreground leading-snug mb-1">{f.title}</p>
                              <p className="text-[12px] text-muted-foreground leading-relaxed">{f.description}</p>
                              {(f.file || f.line) && (
                                <div className="mt-2">
                                  <FileChip path={f.file ?? ""} line={f.line} />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <p className="text-[12px] text-muted">No findings. Ask: &ldquo;Review the PR for code quality and security&rdquo;</p>
              </div>
            )}
          </div>
        )}

        {/* ── ACTIONS / RECOMMENDATIONS ────────────────────────────────────────── */}
        {activeTab === "recommendations" && (
          <div>
            {data.recommendations && data.recommendations.length > 0 ? (
              <div className="divide-y divide-border-subtle/40">
                {data.recommendations.map((r, i) => (
                  <div key={i} className="px-4 py-3.5 hover:bg-surface/20 transition-colors">
                    <div className="flex items-start gap-2.5">
                      <PriorityIcon priority={r.priority} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[13px] font-semibold text-foreground leading-snug">{r.action}</p>
                        </div>
                        <p className="text-[12px] text-muted-foreground leading-relaxed">{r.rationale}</p>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted shrink-0 mt-0.5">
                        #{i + 1}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <p className="text-[12px] text-muted">No actions yet.</p>
              </div>
            )}
          </div>
        )}

        {/* ── METRICS ─────────────────────────────────────────────────────────── */}
        {activeTab === "metrics" && (
          <div className="p-4 space-y-4">
            {data.metrics && Object.keys(data.metrics).length > 0 ? (
              <>
                {/* Score bars for 0–1 numeric values */}
                {(() => {
                  const bars = Object.entries(data.metrics ?? {})
                    .filter(([k, v]) =>
                      typeof v === "number" &&
                      v >= 0 && v <= 1 &&
                      !["confidence", "confidenceScore"].includes(k)
                    );
                  if (!bars.length) return null;
                  return (
                    <div>
                      <SectionLabel>Scores</SectionLabel>
                      <div className="space-y-3">
                        {bars.map(([key, value]) => {
                          const pct = (value as number);
                          const color = pct >= 0.75 ? "green" : pct >= 0.5 ? "yellow" : "red";
                          return <ScoreBar key={key} value={pct} label={key.replace(/_/g, " ")} color={color} />;
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Stat cards for all other values */}
                {(() => {
                  const cards = Object.entries(data.metrics ?? {}).filter(([k, v]) =>
                    !(typeof v === "number" && v >= 0 && v <= 1 && !["confidence", "confidenceScore"].includes(k))
                    && k !== "branch"
                  );
                  if (!cards.length) return null;
                  return (
                    <div>
                      <SectionLabel>Counts & Values</SectionLabel>
                      <div className="grid grid-cols-2 gap-2">
                        {cards.map(([key, value], i) => (
                          <StatCard
                            key={key}
                            label={key.replace(/_/g, " ")}
                            value={typeof value === "number" ? value.toLocaleString() : String(value)}
                            accent={i === 0}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-[12px] text-muted">No metrics data available.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
