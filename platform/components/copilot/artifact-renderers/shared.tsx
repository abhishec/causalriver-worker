"use client";

import { cn } from "@/lib/utils";

// ─── Stat Grid & Card ────────────────────────────────────────────────────────

export function StatGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <div className={cn(
      "grid gap-1.5 mb-2.5",
      cols === 2 && "grid-cols-2",
      cols === 3 && "grid-cols-3",
      cols === 4 && "grid-cols-4"
    )}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, color }: { label: string; value: string | number | null | undefined; color?: string }) {
  const colorClass = color === "red" ? "text-danger"
    : color === "green" ? "text-success"
    : color === "amber" ? "text-warning"
    : color === "blue" ? "text-info"
    : color === "purple" ? "text-brain-training"
    : "text-foreground";
  return (
    <div className="bg-surface border border-border-subtle rounded-[10px] px-3 py-2.5">
      <div className="text-[10px] text-muted uppercase tracking-wider font-medium">{label}</div>
      <div className={cn("text-lg font-bold mt-0.5 tabular-nums", colorClass)}>{value ?? "—"}</div>
    </div>
  );
}

// ─── Score Bar (progress bar with color thresholds) ──────────────────────────

export function ScoreBar({ value, label, max = 100 }: { value: number; label: string; max?: number }) {
  const safeVal = value ?? 0;
  const safeMax = max || 100;
  const pct = Math.min(100, Math.max(0, (safeVal / safeMax) * 100));
  const color = pct >= 75 ? "#16a34a" : pct >= 50 ? "#ca8a04" : "#dc2626";
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px] mb-0.5">
        <span className="text-muted">{label}</span>
        <span className="font-semibold" style={{ color }}>{Math.round(safeVal)}</span>
      </div>
      <div className="h-1.5 bg-surface rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ─── Health Ring (SVG donut) ─────────────────────────────────────────────────

export function HealthRing({ score, size = 48 }: { score: number; size?: number }) {
  const safeScore = score ?? 0;
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(Math.max(safeScore, 0), 100) / 100;
  const d = p * c;
  const color = safeScore >= 75 ? "#16a34a" : safeScore >= 50 ? "#ca8a04" : "#dc2626";
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(31,30,29,.08)" strokeWidth={3} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeDasharray={`${d} ${c - d}`} />
      </svg>
      <span className="absolute text-xs font-bold tabular-nums" style={{ color }}>{Math.round(safeScore)}</span>
    </div>
  );
}

// ─── Severity Badge ──────────────────────────────────────────────────────────

export function SeverityBadge({ level, label }: { level: "critical" | "high" | "medium" | "low"; label?: string }) {
  const styles = {
    critical: "bg-danger/8 text-danger border-danger/15",
    high: "bg-warning/8 text-warning border-warning/15",
    medium: "bg-yellow-600/8 text-yellow-600 border-yellow-600/15",
    low: "bg-info/8 text-info border-info/15",
  };
  const labels = { critical: "CRITICAL", high: "HIGH", medium: "MEDIUM", low: "LOW" };
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide border shrink-0", styles[level])}>
      {label || labels[level]}
    </span>
  );
}

// ─── Finding Row ─────────────────────────────────────────────────────────────

export function FindingRow({ severity, text, file, detail, label }: {
  severity: "critical" | "high" | "medium" | "low";
  text: string;
  file?: string;
  detail?: string;
  /** Override the default severity label (e.g. "FUNC", "SLA ✗", "SLOW") */
  label?: string;
}) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border-subtle last:border-b-0">
      <SeverityBadge level={severity} label={label} />
      <div className="min-w-0">
        <div className="text-[13px] text-muted-foreground leading-snug" dangerouslySetInnerHTML={{ __html: text }} />
        {detail && <div className="text-[11px] text-muted mt-0.5">{detail}</div>}
        {file && <FileChip file={file} />}
      </div>
    </div>
  );
}

// ─── File Chip ───────────────────────────────────────────────────────────────

export function FileChip({ file }: { file: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-[10px] font-mono text-muted mt-1">
      {file}
    </span>
  );
}

// ─── Branch Pill ─────────────────────────────────────────────────────────────

export function BranchPill({ branch, detail }: { branch: string; detail?: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 max-w-full">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl bg-info/6 border border-info/12 text-[10px] font-mono text-info max-w-[280px]">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="shrink-0"><path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM5 3.25a.75.75 0 1 0 0 0h-.75A.75.75 0 0 0 3.5 4v3.25a.75.75 0 0 0 .75.75h1.5a.75.75 0 0 1 .75.75v1.5a2.25 2.25 0 1 0 1.5 0v-1.5A2.25 2.25 0 0 0 5.75 6.5h-1V4a.75.75 0 0 0-.75-.75Zm6.75 0a.75.75 0 1 0 0 0H11A.75.75 0 0 0 10.25 4v2.75A2.25 2.25 0 0 0 8 8.75v.582a2.25 2.25 0 1 0 1.5 0V8.75a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 0 .75-.75V4a.75.75 0 0 0-.75-.75Z"/></svg>
        <span className="truncate">{branch}</span>
      </span>
      {detail && <span className="text-[10px] text-muted">{detail}</span>}
    </div>
  );
}

// ─── Alert Banner ────────────────────────────────────────────────────────────

export function AlertBanner({ type, title, description, badge }: {
  type: "critical" | "warning";
  title: string;
  description: string;
  badge?: string;
}) {
  const isCrit = type === "critical";
  return (
    <div className={cn(
      "flex items-start gap-2 px-3 py-2.5 rounded-[10px] mb-2",
      isCrit ? "bg-danger/4 border border-danger/12" : "bg-warning/4 border border-warning/12"
    )}>
      <SeverityBadge level={isCrit ? "critical" : "high"} label={badge} />
      <div className="flex-1">
        <div className={cn("text-[13px] font-semibold", isCrit ? "text-danger" : "text-warning")}>{title}</div>
        <div className="text-[12px] text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

// ─── Insight Box ─────────────────────────────────────────────────────────────

export function InsightBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5 rounded-[10px] border border-accent/15 bg-accent/4 text-[12px] text-accent leading-relaxed my-2">
      {children}
    </div>
  );
}

// ─── Tech Chip ───────────────────────────────────────────────────────────────

export function TechChip({ label, color }: { label: string; color?: "blue" | "green" | "purple" | "amber" }) {
  const styles = {
    blue: "bg-info/6 text-info border-info/10",
    green: "bg-success/6 text-success border-success/10",
    purple: "bg-brain-training/6 text-brain-training border-brain-training/10",
    amber: "bg-warning/6 text-warning border-warning/10",
  };
  return (
    <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border m-0.5", styles[color || "blue"])}>
      {label}
    </span>
  );
}

// ─── Action Item ─────────────────────────────────────────────────────────────

export function ActionItem({ priority, title, description }: {
  priority: "high" | "medium" | "low";
  title: string;
  description?: string;
}) {
  const priStyles = {
    high: "bg-danger/8 text-danger",
    medium: "bg-warning/8 text-warning",
    low: "bg-info/8 text-info",
  };
  const priIcons = { high: "↑", medium: "→", low: "↓" };
  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-[10px] border border-border-subtle mb-1.5 bg-surface">
      <div className={cn("w-[22px] h-[22px] rounded-md flex items-center justify-center text-[11px] font-bold shrink-0", priStyles[priority])}>
        {priIcons[priority]}
      </div>
      <div>
        <div className="text-[13px] font-semibold text-foreground">{title}</div>
        {description && <div className="text-[12px] text-muted">{description}</div>}
      </div>
    </div>
  );
}

// ─── Financial Row ───────────────────────────────────────────────────────────

export function FinRow({ label, value, indent, bold, color }: {
  label: string;
  value: string;
  indent?: boolean;
  bold?: boolean;
  color?: "green" | "red" | "amber";
}) {
  const valColor = color === "green" ? "text-success"
    : color === "red" ? "text-danger"
    : color === "amber" ? "text-warning"
    : "text-foreground";
  return (
    <div className={cn(
      "flex justify-between px-3 py-1.5 transition-colors hover:bg-surface-hover/50",
      bold && "border-t border-border-subtle mt-0.5"
    )}>
      <span className={cn("text-[12px]", indent && "pl-3.5", bold ? "font-semibold text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
      <span className={cn("text-[12px] font-mono tabular-nums", bold && "font-semibold", valColor)}>{value}</span>
    </div>
  );
}

export function FinSection({ title }: { title: string }) {
  return (
    <div className="px-3 py-1.5 bg-surface/50 border-y border-border-subtle">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</span>
    </div>
  );
}

export function FinTotal({ label, value, color }: { label: string; value: string; color?: "green" | "red" }) {
  const valColor = color === "red" ? "text-danger" : color === "green" ? "text-success" : "text-foreground";
  return (
    <div className="flex justify-between px-3 py-2.5 bg-surface/80 rounded-lg mx-1 my-2">
      <span className="text-[13px] font-semibold text-foreground">{label}</span>
      <span className={cn("text-sm font-bold font-mono tabular-nums", valColor)}>{value}</span>
    </div>
  );
}

// ─── KPI Row ─────────────────────────────────────────────────────────────────

export function KpiRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5 px-3 py-2.5 border-b border-border-subtle shrink-0 overflow-x-auto">
      {children}
    </div>
  );
}

export function KpiCard({ label, value, sub, color, accent }: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  accent?: boolean;
}) {
  const valColor = color === "green" ? "text-success"
    : color === "red" ? "text-danger"
    : color === "amber" ? "text-warning"
    : "text-foreground";
  return (
    <div className={cn("px-2.5 py-2 rounded-lg bg-surface border border-border-subtle min-w-0 flex-1", accent && "border-accent/20")}>
      <div className="text-[9px] text-muted uppercase tracking-wider font-medium">{label}</div>
      <div className={cn("text-sm font-bold mt-0.5 tabular-nums", valColor)}>{value}</div>
      {sub && <div className="text-[9px] text-muted">{sub}</div>}
    </div>
  );
}

// ─── Artifact Header ─────────────────────────────────────────────────────────

export function ArtifactHeader({ icon, title, badge, badgeColor }: {
  icon: string;
  title: string;
  badge?: string;
  badgeColor?: "red" | "green" | "amber" | "blue";
}) {
  const badgeStyles = {
    red: "text-danger",
    green: "text-success",
    amber: "text-warning",
    blue: "text-info",
  };
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle shrink-0">
      <span className="text-base">{icon}</span>
      <span className="text-sm font-semibold flex-1 text-foreground">{title}</span>
      {badge && <span className={cn("text-xs font-semibold", badgeStyles[badgeColor || "red"])}>{badge}</span>}
    </div>
  );
}

// ─── Artifact Tabs ───────────────────────────────────────────────────────────

export function ArtifactTabs({ tabs, active, onChange }: {
  tabs: { id: string; label: string; hasDot?: boolean }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-0.5 px-3 py-1 border-b border-border-subtle shrink-0 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap",
            active === tab.id
              ? "text-foreground bg-surface-hover font-semibold"
              : "text-muted hover:text-muted-foreground hover:bg-surface-hover/50"
          )}
        >
          {tab.label}
          {tab.hasDot && <span className="inline-block w-1 h-1 rounded-full bg-success ml-1 align-middle" />}
        </button>
      ))}
    </div>
  );
}

// ─── Mono Block (for code/architecture diagrams) ─────────────────────────────

export function MonoBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[11px] text-muted-foreground leading-relaxed p-2.5 bg-surface rounded-lg border border-border-subtle whitespace-pre overflow-x-auto">
      {children}
    </div>
  );
}

// ─── Balance Check ───────────────────────────────────────────────────────────

export function BalanceCheck({ balanced, label }: { balanced: boolean; label?: string }) {
  const defaultLabel = balanced ? "Balance sheet is balanced" : "Balance sheet does not balance";
  return (
    <div className={cn(
      "mx-2 px-3 py-2 rounded-lg text-[11px] font-medium flex items-center gap-1.5",
      balanced
        ? "bg-success/6 text-success border border-success/12"
        : "bg-danger/6 text-danger border border-danger/12"
    )}>
      {balanced ? "✓" : "✗"} {label || defaultLabel}
    </div>
  );
}
