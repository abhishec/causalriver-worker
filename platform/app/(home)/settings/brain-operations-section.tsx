"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusDot } from "@/components/ui/StatusDot";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

interface BrainOperationsProps {
  orgId: string;
  connectors: Array<{
    id: string;
    connector_type: string;
    display_name: string;
    status: string;
    last_sync_at: string | null;
  }>;
}

interface MechanismStatus {
  loading: boolean;
  running: boolean;
  lastRun: string | null;
  result: string | null;
  error: string | null;
}

const INITIAL_STATUS: MechanismStatus = {
  loading: false,
  running: false,
  lastRun: null,
  result: null,
  error: null,
};

function timeAgoShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function BrainOperationsSection({ orgId, connectors }: BrainOperationsProps) {
  // ── State for each mechanism ──────────────────────────────────
  const [brainCycle, setBrainCycle] = useState<MechanismStatus>(INITIAL_STATUS);
  const [syncAll, setSyncAll] = useState<MechanismStatus>(INITIAL_STATUS);
  const [webhooks, setWebhooks] = useState<MechanismStatus>(INITIAL_STATUS);
  const [cronJobs, setCronJobs] = useState<MechanismStatus>(INITIAL_STATUS);
  const [brainState, setBrainState] = useState<any>(null);

  const activeConnectors = (connectors || []).filter(
    (c) => c.status === "active" || c.status === "connected"
  );

  // ── Load current brain state + recent job history on mount ────
  useEffect(() => {
    const loadStatus = async () => {
      try {
        // Get brain state
        const brainRes = await fetch("/api/brain/cycle");
        if (brainRes.ok) {
          const data = await brainRes.json();
          setBrainState(data);

          // Extract last cycle time from recent_cycles
          const lastCycleRun = data.recent_cycles?.[0];
          if (lastCycleRun) {
            setBrainCycle((prev) => ({
              ...prev,
              lastRun: lastCycleRun.completed_at || lastCycleRun.started_at,
              result: `${lastCycleRun.job_type} (${lastCycleRun.duration_ms}ms)`,
            }));
          }
        }
      } catch {
        // Non-critical
      }

      // Derive webhook status from connectors
      const webhookConnectors = (connectors || []).filter(
        (c) =>
          ["github", "jira", "slack", "linear"].includes(c.connector_type) &&
          (c.status === "active" || c.status === "connected")
      );
      setWebhooks((prev) => ({
        ...prev,
        result: webhookConnectors.length > 0
          ? `${webhookConnectors.length} active webhook source(s): ${webhookConnectors.map((c) => c.connector_type).join(", ")}`
          : "No webhook sources connected",
        lastRun: webhookConnectors.length > 0
          ? webhookConnectors
              .map((c) => c.last_sync_at)
              .filter(Boolean)
              .sort()
              .reverse()[0] || null
          : null,
      }));

      // Derive sync status from most recent connector sync
      const lastSync = (connectors || [])
        .map((c) => c.last_sync_at)
        .filter(Boolean)
        .sort()
        .reverse()[0];
      if (lastSync) {
        setSyncAll((prev) => ({ ...prev, lastRun: lastSync }));
      }
    };

    loadStatus();
  }, [connectors]);

  // ── Trigger handlers ──────────────────────────────────────────

  const handleBrainCycle = useCallback(
    async (mode: "full" | "lightweight" | "sleep" | "homeostasis") => {
      setBrainCycle({ loading: false, running: true, lastRun: brainCycle.lastRun, result: null, error: null });
      try {
        const res = await fetch("/api/brain/cycle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setBrainCycle({
          loading: false,
          running: false,
          lastRun: new Date().toISOString(),
          result: `${mode} cycle completed in ${data.duration_ms}ms`,
          error: null,
        });
      } catch (err: any) {
        setBrainCycle((prev) => ({
          ...prev,
          running: false,
          error: "Brain cycle failed. Please try again.",
        }));
      }
    },
    [brainCycle.lastRun]
  );

  const handleSyncAll = useCallback(async () => {
    setSyncAll({ loading: false, running: true, lastRun: syncAll.lastRun, result: null, error: null });
    try {
      const res = await fetch("/api/connectors/sync-all", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSyncAll({
        loading: false,
        running: false,
        lastRun: new Date().toISOString(),
        result: `${data.successCount}/${data.totalConnectors} synced, ${data.totalSignals} signals${data.brainCycle?.triggered ? " → brain cycle auto-triggered" : ""}`,
        error: null,
      });
    } catch (err: any) {
      setSyncAll((prev) => ({
        ...prev,
        running: false,
        error: "Sync failed. Please try again.",
      }));
    }
  }, [syncAll.lastRun]);

  // ── Render ────────────────────────────────────────────────────

  const mechanisms = [
    {
      id: "brain-cycle",
      title: "Brain Cycle",
      subtitle: "POST /api/brain/cycle",
      description:
        "Runs the 30-layer Neural Cortex Controller on-demand. Full mode processes all layers (L1-L30); lightweight runs L1-L15 only.",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
      status: brainCycle,
      trigger: (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleBrainCycle("full")}
            disabled={brainCycle.running}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
              brainCycle.running
                ? "bg-surface text-muted cursor-not-allowed"
                : "bg-accent text-white hover:bg-accent/90"
            )}
          >
            {brainCycle.running ? "Running..." : "Full (L1-L30)"}
          </button>
          <button
            onClick={() => handleBrainCycle("lightweight")}
            disabled={brainCycle.running}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium border border-border-subtle hover:border-accent/30 transition-all disabled:opacity-50"
          >
            Lightweight
          </button>
          <button
            onClick={() => handleBrainCycle("sleep")}
            disabled={brainCycle.running}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium border border-border-subtle hover:border-accent/30 transition-all disabled:opacity-50"
          >
            Sleep
          </button>
          <button
            onClick={() => handleBrainCycle("homeostasis")}
            disabled={brainCycle.running}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium border border-border-subtle hover:border-accent/30 transition-all disabled:opacity-50"
          >
            Heal
          </button>
        </div>
      ),
      isActive: true,
      autoTrigger: "Settings → Brain Config → Train Now, or after sync-all completes",
    },
    {
      id: "sync-all",
      title: "Sync All Connectors",
      subtitle: "POST /api/connectors/sync-all",
      description:
        "Pulls data from every active connector (GitHub, Jira, Slack), generates signals, then auto-triggers a lightweight brain cycle.",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      ),
      status: syncAll,
      trigger: (
        <button
          onClick={handleSyncAll}
          disabled={syncAll.running || activeConnectors.length === 0}
          className={cn(
            "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
            syncAll.running || activeConnectors.length === 0
              ? "bg-surface text-muted cursor-not-allowed"
              : "bg-accent text-white hover:bg-accent/90"
          )}
        >
          {syncAll.running
            ? "Syncing..."
            : activeConnectors.length === 0
            ? "No connectors"
            : `Sync ${activeConnectors.length} source(s)`}
        </button>
      ),
      isActive: activeConnectors.length > 0,
      autoTrigger: "OnboardingWizard → Run Initial Training, or Settings → Brain Config → Sync & Train",
    },
    {
      id: "webhooks",
      title: "Webhooks (Real-time)",
      subtitle: "GitHub / Jira / Slack / Linear",
      description:
        "Automatic signal ingestion on every PR, issue, message, and sprint event. After 10+ signals accumulate, auto-triggers a lightweight brain cycle.",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      ),
      status: webhooks,
      trigger: (
        <div className="flex items-center gap-2 flex-wrap">
          {["github", "jira", "slack", "linear"].map((type) => {
            const connected = activeConnectors.some(
              (c) => c.connector_type === type
            );
            return (
              <Badge
                key={type}
                variant={connected ? "success" : "outline"}
                size="xs"
              >
                {type}
                {connected ? " (live)" : ""}
              </Badge>
            );
          })}
        </div>
      ),
      isActive:
        activeConnectors.some((c) =>
          ["github", "jira", "slack", "linear"].includes(c.connector_type)
        ),
      autoTrigger: "Automatic — fires on every webhook event. Brain auto-triggers after 10+ signal threshold (5min debounce).",
    },
    {
      id: "cron",
      title: "Scheduled Jobs (pg_cron)",
      subtitle: "Daily automated processing",
      description:
        "Daily cron schedule: 2 AM retention cleanup, 3 AM threshold optimization, 4 AM brain consolidation + federation, 5 AM full sleep cycle (L1-L30), 6 AM all maintenance. Hourly prediction verification.",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      status: cronJobs,
      trigger: (
        <div className="space-y-1.5">
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { time: "Every hour", job: "Prediction verification" },
              { time: "2 AM UTC", job: "Data retention cleanup" },
              { time: "3 AM UTC", job: "Threshold optimization" },
              { time: "4 AM UTC", job: "Brain consolidation" },
              { time: "5 AM UTC", job: "Full sleep cycle (L1-L30)" },
              { time: "6 AM UTC", job: "All maintenance tasks" },
            ].map((item) => (
              <div
                key={item.time}
                className="px-2 py-1.5 rounded-md bg-surface border border-border-subtle"
              >
                <div className="text-[10px] font-mono text-accent">
                  {item.time}
                </div>
                <div className="text-[10px] text-muted leading-tight mt-0.5">
                  {item.job}
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
      isActive: true,
      autoTrigger: "Automatic — pg_cron runs these on schedule. Requires pg_cron extension + service role key configured.",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Brain health summary */}
      {brainState && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-border-subtle">
          <StatusDot
            type={brainState.controller_alive ? "active" : "inactive"}
            size="sm"
            pulse={brainState.controller_alive}
          />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium">
              Brain: {brainState.controller_alive ? "Active" : "Idle"}
            </span>
            {brainState.recent_cycles?.length > 0 && (
              <span className="text-[10px] text-muted ml-2">
                Last cycle: {timeAgoShort(brainState.recent_cycles[0].started_at)}
              </span>
            )}
          </div>
          <Badge variant={brainState.controller_alive ? "success" : "outline"} size="xs">
            {brainState.status}
          </Badge>
        </div>
      )}

      {/* Mechanism cards */}
      {mechanisms.map((mech) => (
        <div
          key={mech.id}
          className="rounded-xl bg-card border border-border-subtle overflow-hidden"
        >
          {/* Header */}
          <div className="px-5 py-4 flex items-start gap-4">
            <div
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                mech.isActive
                  ? "bg-accent/10 text-accent"
                  : "bg-surface text-muted"
              )}
            >
              {mech.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold">{mech.title}</h4>
                <StatusDot
                  type={
                    mech.status.running
                      ? "active"
                      : mech.isActive
                      ? "warning"
                      : "inactive"
                  }
                  size="sm"
                  pulse={mech.status.running}
                />
              </div>
              <div className="text-[10px] font-mono text-muted mt-0.5">
                {mech.subtitle}
              </div>
              <p className="text-xs text-muted mt-1.5 leading-relaxed">
                {mech.description}
              </p>
            </div>
          </div>

          {/* Trigger area */}
          <div className="px-5 py-3 bg-surface/50 border-t border-border-subtle">
            {mech.trigger}
          </div>

          {/* Status bar */}
          {(mech.status.result || mech.status.error || mech.status.lastRun) && (
            <div className="px-5 py-2.5 border-t border-border-subtle flex items-center gap-3 text-[10px]">
              {mech.status.lastRun && (
                <span className="text-muted">
                  Last: {timeAgoShort(mech.status.lastRun)}
                </span>
              )}
              {mech.status.result && (
                <span className="text-success">{mech.status.result}</span>
              )}
              {mech.status.error && (
                <span className="text-danger">{mech.status.error}</span>
              )}
            </div>
          )}

          {/* Auto-trigger info */}
          <div className="px-5 py-2 border-t border-border-subtle">
            <div className="text-[10px] text-muted">
              <span className="font-medium text-muted-foreground">Auto-trigger:</span>{" "}
              {mech.autoTrigger}
            </div>
          </div>
        </div>
      ))}

      {/* Wiring diagram */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <h4 className="text-sm font-semibold mb-3">How Data Flows to the Brain</h4>
        <div className="space-y-2 text-xs text-muted leading-relaxed">
          <div className="flex items-start gap-2">
            <span className="text-accent font-mono text-[10px] shrink-0 mt-0.5 w-4">1.</span>
            <span>
              <strong className="text-foreground">Connectors</strong> (GitHub, Jira, Slack, S3 upload) produce raw data
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-accent font-mono text-[10px] shrink-0 mt-0.5 w-4">2.</span>
            <span>
              Sync routes + webhooks convert raw data into <strong className="text-foreground">cross_domain_signals</strong>
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-accent font-mono text-[10px] shrink-0 mt-0.5 w-4">3.</span>
            <span>
              <strong className="text-foreground">Auto-trigger</strong> fires a lightweight brain cycle when 10+ signals accumulate (5min debounce)
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-accent font-mono text-[10px] shrink-0 mt-0.5 w-4">4.</span>
            <span>
              <strong className="text-foreground">Brain Cycle</strong> (Neural Cortex Controller) processes signals through L1-L30 layers
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-accent font-mono text-[10px] shrink-0 mt-0.5 w-4">5.</span>
            <span>
              <strong className="text-foreground">pg_cron</strong> runs daily consolidation (4 AM) + full sleep cycle (5 AM) + maintenance (6 AM)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
