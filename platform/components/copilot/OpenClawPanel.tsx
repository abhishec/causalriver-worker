"use client";

/**
 * OpenClawPanel — Reinforcement Loop Dashboard & Gateway Status
 *
 * Shows:
 *  1. Gateway connection status (connected/disconnected/reconnecting)
 *  2. Reinforcement loop services with live status
 *  3. Proactive services status
 *  4. One-click manual triggers for any service
 *  5. Brain learning stats (predictions verified, accuracy, edges adjusted)
 *
 * This is the "always learning" dashboard — the visual proof that the brain
 * is continuously improving through OpenClaw's daemon architecture.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ServiceInfo {
  id: string;
  name: string;
  status: string;
  lastRun: string | null;
  nextRun: string | null;
  runCount?: number;
  stats: Record<string, unknown>;
}

interface GatewayStatusResponse {
  orgId: string;
  connected: boolean;
  lastSeen: string | null;
  reconnecting: boolean;
  servicesRunning: string[];
  error?: string;
}

interface ReinforcementStats {
  enabled: boolean;
  lastOutcomeCollection: string | null;
  lastFeedbackRun: string | null;
  predictionsVerified: number;
  accuracy: number;
  edgesStrengthened: number;
  edgesWeakened: number;
}

// ─── Service metadata ───────────────────────────────────────────────────────

const SERVICE_META: Record<string, { label: string; icon: string; category: "reinforcement" | "proactive"; description: string }> = {
  "nexusbrain-outcome-collector": {
    label: "Outcome Collector",
    icon: "\u{1F4CA}",
    category: "reinforcement",
    description: "Polls actual metric values for prediction verification",
  },
  "nexusbrain-feedback-agent": {
    label: "Feedback Agent",
    icon: "\u{1F504}",
    category: "reinforcement",
    description: "Verifies predictions and adjusts causal edge weights",
  },
  "nexusbrain-anomaly-watchdog": {
    label: "Anomaly Watchdog",
    icon: "\u{1F50D}",
    category: "reinforcement",
    description: "Continuous cross-domain anomaly detection",
  },
  "nexusbrain-consolidation-runner": {
    label: "Consolidation",
    icon: "\u{1F9E0}",
    category: "reinforcement",
    description: "Nightly brain sleep: verify, optimize, decay",
  },
  "nexusbrain-signal-harvester": {
    label: "Signal Harvester",
    icon: "\u{1F33E}",
    category: "reinforcement",
    description: "Extracts outcome signals from conversations",
  },
  "nexusbrain-tech-debt-alarm": {
    label: "Tech Debt Alarm",
    icon: "\u{26A0}\u{FE0F}",
    category: "proactive",
    description: "Daily architecture risk detection",
  },
  "nexusbrain-reconciliation-runner": {
    label: "Reconciliation",
    icon: "\u{1F3E6}",
    category: "proactive",
    description: "Nightly bank reconciliation with causal matching",
  },
  "nexusbrain-cash-flow-prophet": {
    label: "Cash Flow Prophet",
    icon: "\u{1F4B0}",
    category: "proactive",
    description: "Weekly 13-week causal cash flow forecasting",
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "bg-green-500",
    connected: "bg-green-500",
    stopped: "bg-zinc-400",
    disconnected: "bg-zinc-400",
    unknown: "bg-zinc-400",
    reconnecting: "bg-amber-500",
    error: "bg-red-500",
  };
  const isPulsing = status === "running" || status === "connected" || status === "reconnecting";
  return (
    <span className="relative flex h-2 w-2">
      {isPulsing && (
        <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", colors[status] || "bg-zinc-400")} />
      )}
      <span className={cn("relative inline-flex rounded-full h-2 w-2", colors[status] || "bg-zinc-400")} />
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

interface OpenClawPanelProps {
  organizationId: string | undefined;
  className?: string;
}

interface RlStatus {
  signalsThisHour: number;
  signalsThisSession: number;
  feedbackTotal: number;
  feedbackHelpful: number;
  feedbackNotHelpful: number;
  learningVelocity: number;
  recentSignals: { signal_type: string; source_domain: string; signal_value: number; signal_timestamp: string }[];
  queueDepth: number;
}

export function OpenClawPanel({ organizationId, className }: OpenClawPanelProps) {
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatusResponse | null>(null);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [reinforcement, setReinforcement] = useState<ReinforcementStats | null>(null);
  const [rlStatus, setRlStatus] = useState<RlStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [connectForm, setConnectForm] = useState({ gatewayUrl: "", authToken: "" });
  const [showConnect, setShowConnect] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  // Track the in-flight AbortController so we can cancel on unmount or re-fetch
  const fetchAbortRef = useRef<AbortController | null>(null);

  // ── Fetch gateway status + services ───────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!organizationId) return;
    // Cancel any previous in-flight fetch before starting a new one
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = new AbortController();
    const { signal } = fetchAbortRef.current;
    try {
      // Fetch status, services, and RL status in parallel
      const [statusRes, servicesRes, rlRes] = await Promise.all([
        fetch(`/api/openclaw/status?organizationId=${organizationId}`, { signal }),
        fetch(`/api/openclaw/services?organizationId=${organizationId}`, { signal }),
        fetch(`/api/brain/rl-status`, { signal }),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setGatewayStatus(data);
      }

      if (servicesRes.ok) {
        const data = await servicesRes.json();
        setServices(data.services || []);
      }

      if (rlRes.ok) {
        const data = await rlRes.json();
        setRlStatus(data);
      }
    } catch (err) {
      // AbortError is expected on unmount/re-fetch — don't log
      if (err instanceof Error && err.name === "AbortError") return;
      // Silent fail — panel is non-critical
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchAll();
    // Poll every 30 seconds
    const interval = setInterval(fetchAll, 30000);
    return () => {
      clearInterval(interval);
      // Cancel any in-flight fetch on unmount to prevent setState on dead component
      fetchAbortRef.current?.abort();
    };
  }, [fetchAll]);

  // ── Derive reinforcement stats from service data ──────────────────────
  useEffect(() => {
    if (!expanded || !gatewayStatus?.connected) return;

    const feedbackService = services.find(s => s.id === "nexusbrain-feedback-agent");
    const outcomeService = services.find(s => s.id === "nexusbrain-outcome-collector");

    if (feedbackService?.stats || outcomeService?.stats) {
      const stats = feedbackService?.stats as Record<string, unknown> || {};
      const lastResult = stats.lastResult as Record<string, unknown> || {};
      setReinforcement({
        enabled: true,
        lastOutcomeCollection: outcomeService?.lastRun || null,
        lastFeedbackRun: feedbackService?.lastRun || null,
        predictionsVerified: (lastResult.totalVerified as number) || 0,
        accuracy: (lastResult.accuracy as number) || 0,
        edgesStrengthened: (lastResult.edgesStrengthened as number) || 0,
        edgesWeakened: (lastResult.edgesWeakened as number) || 0,
      });
    }
  }, [expanded, gatewayStatus?.connected, services]);

  // ── Connect gateway ───────────────────────────────────────────────────
  const handleConnect = async () => {
    if (!organizationId || !connectForm.gatewayUrl || !connectForm.authToken) return;
    setConnectError(null);
    try {
      const res = await fetch("/api/openclaw/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          gatewayUrl: connectForm.gatewayUrl,
          authToken: connectForm.authToken,
        }),
      });
      if (res.ok) {
        setShowConnect(false);
        setConnectForm({ gatewayUrl: "", authToken: "" });
        await fetchAll();
      } else {
        const data = await res.json();
        setConnectError(data.error || "Connection failed");
      }
    } catch {
      setConnectError("Network error");
    }
  };

  // ── Trigger service manually ──────────────────────────────────────────
  const handleTrigger = async (serviceId: string) => {
    if (!organizationId) return;
    setTriggering(serviceId);
    try {
      await fetch("/api/openclaw/services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, serviceId, action: "trigger" }),
      });
      // Refresh status after trigger
      setTimeout(fetchAll, 2000);
    } catch {
      // Silent fail
    } finally {
      setTriggering(null);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={cn("px-3 py-2", className)}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-zinc-300 animate-pulse" />
          <span>Checking OpenClaw...</span>
        </div>
      </div>
    );
  }

  // ── Not connected — show connection prompt ────────────────────────────
  if (!gatewayStatus?.connected) {
    const statusLabel = gatewayStatus?.reconnecting
      ? "Reconnecting..."
      : "Not connected";

    return (
      <div className={cn("px-3 py-2", className)}>
        <button
          onClick={() => setShowConnect(!showConnect)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          <StatusDot status={gatewayStatus?.reconnecting ? "reconnecting" : "disconnected"} />
          <span className="font-medium">OpenClaw</span>
          <span className="text-[10px] opacity-60">{statusLabel}</span>
          <svg className={cn("w-3 h-3 ml-auto transition-transform", showConnect && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showConnect && (
          <div className="mt-2 p-3 rounded-lg bg-surface border border-border-subtle space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Connect your OpenClaw Gateway to enable always-on reinforcement learning.
            </p>
            <input
              type="text"
              placeholder="Gateway URL (wss://...)"
              value={connectForm.gatewayUrl}
              onChange={(e) => setConnectForm((p) => ({ ...p, gatewayUrl: e.target.value }))}
              className="w-full px-2 py-1.5 text-xs rounded border border-border-subtle bg-background focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <input
              type="password"
              placeholder="Auth Token"
              value={connectForm.authToken}
              onChange={(e) => setConnectForm((p) => ({ ...p, authToken: e.target.value }))}
              className="w-full px-2 py-1.5 text-xs rounded border border-border-subtle bg-background focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {connectError && (
              <p className="text-[10px] text-red-500">{connectError}</p>
            )}
            {gatewayStatus?.error && (
              <p className="text-[10px] text-amber-500">Last error: {gatewayStatus.error}</p>
            )}
            <button
              onClick={handleConnect}
              className="w-full px-2 py-1.5 text-xs font-medium rounded bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              Connect Gateway
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Connected — show dashboard ────────────────────────────────────────
  const reinforcementServices = services.filter(
    (s) => SERVICE_META[s.id]?.category === "reinforcement"
  );
  const proactiveServices = services.filter(
    (s) => SERVICE_META[s.id]?.category === "proactive"
  );
  const runningCount = services.filter((s) => s.status === "running").length;
  const totalServices = services.length;

  return (
    <div className={cn("px-3 py-2", className)}>
      {/* ── Header (always visible) ─────────────────────────────────── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs w-full hover:bg-surface-hover/50 rounded px-1 py-0.5 transition-colors"
      >
        <StatusDot status="connected" />
        <span className="font-medium text-foreground">OpenClaw</span>
        <span className="text-[10px] text-muted-foreground">
          {totalServices > 0 ? `${runningCount}/${totalServices} services` : `${gatewayStatus.servicesRunning.length} registered`}
        </span>
        {rlStatus && rlStatus.signalsThisHour > 0 && (
          <span className="ml-auto text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            {rlStatus.signalsThisHour} signals/hr
          </span>
        )}
        {!rlStatus && reinforcement && reinforcement.predictionsVerified > 0 && (
          <span className="ml-auto text-[10px] font-medium text-green-600 dark:text-green-400">
            {Math.round(reinforcement.accuracy * 100)}% accuracy
          </span>
        )}
        <svg className={cn("w-3 h-3 transition-transform text-muted-foreground", expanded && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Expanded dashboard ───────────────────────────────────────── */}
      {expanded && (
        <div className="mt-2 space-y-3">
          {/* ── Active Learning (RL Signal Bus) ─────────────────── */}
          {rlStatus && (
            <div className="p-2.5 rounded-lg bg-gradient-to-br from-emerald-500/5 to-accent/5 border border-emerald-500/10">
              <h4 className="text-[11px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                Active Learning
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <Stat label="Signals (1h)" value={rlStatus.signalsThisHour} positive={rlStatus.signalsThisHour > 0} />
                <Stat label="Signals (24h)" value={rlStatus.signalsThisSession} />
                <Stat label="Feedback ✓" value={rlStatus.feedbackHelpful} positive={rlStatus.feedbackHelpful > 0} />
                <Stat label="Feedback ✗" value={rlStatus.feedbackNotHelpful} negative={rlStatus.feedbackNotHelpful > 0} />
                <Stat label="Velocity" value={`${rlStatus.learningVelocity}/hr`} positive={rlStatus.learningVelocity > 0} />
                <Stat label="Queue" value={rlStatus.queueDepth} />
              </div>
              {rlStatus.recentSignals.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Recent signals</div>
                  {rlStatus.recentSignals.slice(0, 3).map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[10px]">
                      <span className={cn(
                        "w-1 h-1 rounded-full shrink-0",
                        s.signal_value > 0 ? "bg-emerald-400" : "bg-amber-400"
                      )} />
                      <span className="text-muted-foreground truncate">{s.signal_type.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground/60 ml-auto shrink-0">{s.source_domain}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Brain Learning Stats ────────────────────────────── */}
          {reinforcement && reinforcement.predictionsVerified > 0 && (
            <div className="p-2.5 rounded-lg bg-gradient-to-br from-violet-500/5 to-blue-500/5 border border-violet-500/10">
              <h4 className="text-[11px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <span>{"\u{1F9E0}"}</span> Brain Learning Status
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <Stat label="Predictions Verified" value={reinforcement.predictionsVerified} />
                <Stat label="Accuracy" value={`${Math.round(reinforcement.accuracy * 100)}%`} highlight={reinforcement.accuracy >= 0.7} />
                <Stat label="Edges Strengthened" value={reinforcement.edgesStrengthened} positive />
                <Stat label="Edges Weakened" value={reinforcement.edgesWeakened} negative />
                <Stat label="Last Outcome Run" value={timeAgo(reinforcement.lastOutcomeCollection)} />
                <Stat label="Last Feedback Run" value={timeAgo(reinforcement.lastFeedbackRun)} />
              </div>
            </div>
          )}

          {/* ── Reinforcement Services ──────────────────────────── */}
          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
              Reinforcement Loop
            </h4>
            <div className="space-y-1">
              {reinforcementServices.map((svc) => (
                <ServiceRow
                  key={svc.id}
                  service={svc}
                  meta={SERVICE_META[svc.id]}
                  triggering={triggering === svc.id}
                  onTrigger={() => handleTrigger(svc.id)}
                />
              ))}
              {reinforcementServices.length === 0 && (
                <p className="text-[10px] text-muted-foreground px-1">No reinforcement services registered</p>
              )}
            </div>
          </div>

          {/* ── Proactive Services ──────────────────────────────── */}
          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
              Proactive Intelligence
            </h4>
            <div className="space-y-1">
              {proactiveServices.map((svc) => (
                <ServiceRow
                  key={svc.id}
                  service={svc}
                  meta={SERVICE_META[svc.id]}
                  triggering={triggering === svc.id}
                  onTrigger={() => handleTrigger(svc.id)}
                />
              ))}
              {proactiveServices.length === 0 && (
                <p className="text-[10px] text-muted-foreground px-1">No proactive services registered</p>
              )}
            </div>
          </div>

          {/* ── Gateway Info ────────────────────────────────────── */}
          <div className="pt-2 border-t border-border-subtle">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
              <span>Last seen: {timeAgo(gatewayStatus.lastSeen)}</span>
              <span>{gatewayStatus.servicesRunning.length} registered</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  highlight,
  positive,
  negative,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-[11px] font-medium tabular-nums",
          highlight && "text-green-600 dark:text-green-400",
          positive && "text-green-600 dark:text-green-400",
          negative && value !== 0 && "text-amber-600 dark:text-amber-400",
          !highlight && !positive && !negative && "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ServiceRow({
  service,
  meta,
  triggering,
  onTrigger,
}: {
  service: ServiceInfo;
  meta?: { label: string; icon: string; description: string };
  triggering: boolean;
  onTrigger: () => void;
}) {
  const label = meta?.label || service.name || service.id;
  const icon = meta?.icon || "\u{2699}\u{FE0F}";

  return (
    <div className="flex items-center gap-2 px-1 py-1 rounded hover:bg-surface-hover/50 group transition-colors">
      <StatusDot status={service.status} />
      <span className="text-[11px]">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-foreground truncate">{label}</div>
        <div className="text-[9px] text-muted-foreground">
          {service.lastRun ? `Last: ${timeAgo(service.lastRun)}` : "Never run"}
          {service.runCount && service.runCount > 0 ? ` \u{00B7} ${service.runCount} runs` : ""}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onTrigger(); }}
        disabled={triggering}
        className={cn(
          "opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded text-[9px] font-medium transition-all",
          triggering
            ? "bg-zinc-100 text-zinc-400 cursor-wait"
            : "bg-accent/10 text-accent hover:bg-accent/20"
        )}
        title={`Manually trigger ${label}`}
      >
        {triggering ? "..." : "Run"}
      </button>
    </div>
  );
}
