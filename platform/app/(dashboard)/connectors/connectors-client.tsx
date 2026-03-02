"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatNumber, cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { StatValue } from "@/components/ui/StatValue";
import { GitHubSetupModal, type GitHubReleaseConfig } from "@/components/connectors/GitHubSetupModal";
import { JiraSetupModal, type JiraConfig } from "@/components/connectors/JiraSetupModal";
import { IngestionProgress } from "@/components/connectors/IngestionProgress";
import { S3UploadModal } from "@/components/connectors/S3UploadModal";
import { WritebackRulesPanel } from "@/components/connectors/WritebackRulesPanel";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

/* ── Types ─────────────────────────────────────────────────────── */

interface ConnectorDef {
  name: string;
  type: string;
  domain: string;
  icon: string;
  description: string;
  oauth: boolean;
}

interface ConnectorInstance {
  id: string;
  connectorType: string;
  status: string;
  config: Record<string, any>;
  metadata: Record<string, any>;
  lastSyncAt: string | null;
  signalsCount: number;
  errorMessage: string | null;
  createdAt: string;
  instanceName?: string;
  displayName?: string;
}

interface SyncProgress {
  progressPct: number;
  signalsIngested: number;
}

interface ConnectorsClientProps {
  connectors: ConnectorDef[];
  domainCounts: Record<string, number>;
  activeDomains: string[];
  connectorInstances: ConnectorInstance[];
  syncProgressMap: Record<string, SyncProgress>;
  totalSignals: number;
  /** Timestamp of the last successful full or sleep brain cycle — null if never trained */
  lastBrainTrainedAt: string | null;
  /** Organization ID for scoping write-back rules */
  organizationId: string;
  /** User role from org_members — used to gate write-back rule management */
  userRole?: string | null;
}

/* ── Approvals callout — links to /connectors/approvals with live badge ── */

function ApprovalsCallout({ userRole }: { userRole?: string | null }) {
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const isAdmin = userRole === "admin" || userRole === "owner";

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetch("/api/connectors/writeback/pending")
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { total?: number } | null) => {
        if (!cancelled && json) setPendingCount(json.total ?? 0);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAdmin]);

  if (!isAdmin) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted">
          Write-back Approvals
        </div>
        {pendingCount !== null && pendingCount > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">
            {pendingCount} pending
          </span>
        )}
      </div>
      <Link
        href="/connectors/approvals"
        className="flex items-center justify-between p-4 rounded-xl border border-border-subtle bg-surface hover:bg-surface-hover transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {pendingCount !== null && pendingCount > 0
                ? `${pendingCount} write-back${pendingCount === 1 ? "" : "s"} waiting for approval`
                : "No pending approvals"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review and approve agent actions before they execute on connected systems
            </p>
          </div>
        </div>
        <svg className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </Link>
    </div>
  );
}

/* ── Domain colors ─────────────────────────────────────────────── */

const DOMAIN_COLORS: Record<string, string> = {
  engineering: "bg-brain-training/10 text-brain-training",
  finance: "bg-success/10 text-success",
  sales: "bg-warning/10 text-warning",
  support: "bg-info/10 text-info",
  communication: "bg-accent/10 text-accent",
  knowledge: "bg-brain-discovery/10 text-brain-discovery",
  operations: "bg-muted/15 text-muted-foreground",
  marketing: "bg-danger/10 text-danger",
  cs: "bg-brain-alert/10 text-brain-alert",
  accounting: "bg-emerald-500/10 text-emerald-600",
  any: "bg-muted/10 text-muted",
};

/* ── Service grouping: maps connector types to Brain OS services ────── */

const SERVICE_MAP: Record<string, string> = {
  github: "seaas", jira: "seaas", confluence: "seaas", slack: "seaas", notion: "seaas", linear: "seaas",
  cloudwatch: "seaas", datadog: "seaas", elk: "seaas", logs: "seaas",
  xero: "aaas", quickbooks: "aaas", stripe: "aaas", "s3-storage": "aaas",
};

const SERVICE_LABELS: Record<string, { label: string; desc: string }> = {
  seaas: { label: "SE-aaS \u2014 Engineering Intelligence", desc: "Code, delivery, and engineering velocity" },
  aaas: { label: "AAAS \u2014 Accounting Intelligence", desc: "Financial data, GL sync, and compliance" },
  general: { label: "General Intelligence", desc: "CRM, support, marketing, and cross-domain" },
};

/* ── Helpers ───────────────────────────────────────────────────── */

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/* ── Component ─────────────────────────────────────────────────── */

export function ConnectorsClient({
  connectors,
  domainCounts,
  activeDomains: activeDomainsList,
  connectorInstances,
  syncProgressMap,
  totalSignals,
  lastBrainTrainedAt,
  organizationId,
  userRole,
}: ConnectorsClientProps) {
  const router = useRouter();
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showJiraModal, setShowJiraModal] = useState(false);
  const [showS3Upload, setShowS3Upload] = useState(false);
  const [showIngestion, setShowIngestion] = useState(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ type: string; success: boolean; message: string } | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [freshworksDomain, setFreshworksDomain] = useState("");
  const [showFreshworksInput, setShowFreshworksInput] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);

  // Health data: per-type polling every 60s to show live last-sync + auth method + status
  const [healthMap, setHealthMap] = useState<Record<string, {
    status: string;
    lastSyncAt: string | null;
    signalsCount: number;
    errorMessage: string | null;
    authMethod: string | null;
  }>>({});

  useEffect(() => {
    const fetchHealth = () => {
      fetch("/api/connectors/health")
        .then((r) => r.ok ? r.json() : [])
        .then((rows: Array<{ type: string; status: string; lastSyncAt: string | null; signalsCount: number; errorMessage: string | null; authMethod: string | null }>) => {
          if (!Array.isArray(rows)) return; // guard: API returned non-array on cold start or auth error
          const m: typeof healthMap = {};
          for (const row of rows) {
            m[row.type] = { status: row.status, lastSyncAt: row.lastSyncAt, signalsCount: row.signalsCount, errorMessage: row.errorMessage, authMethod: row.authMethod };
          }
          setHealthMap(m);
        })
        .catch(() => {/* non-fatal */});
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 60_000);
    return () => clearInterval(interval);
  }, []);

  const activeDomains = new Set(activeDomainsList);
  const activeInstances = connectorInstances.filter((c) => c.status === "active");
  const connectedCount = activeInstances.length;
  // Set of connector types that have at least one active instance
  const connectedTypes = new Set(activeInstances.map((c) => c.connectorType));
  // Set of connector types that have any instance (active, error, disabled)
  const hasAnyInstance = new Set(connectorInstances.map((c) => c.connectorType));
  const syncingCount = Object.keys(syncProgressMap).length;

  // Check URL params for OAuth callback messages
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");

    if (success) {
      const messages: Record<string, string> = {
        slack_connected: "Slack connected successfully",
        jira_connected: "Jira site connected successfully",
        confluence_connected: "Confluence site connected successfully",
        github_connected: "GitHub account connected via OAuth",
        github_app_installed: "GitHub App installed — select repos to track",
        freshdesk_connected: "Freshdesk connected successfully",
      };
      setMessage({ type: "success", text: messages[success] || "Connector connected!" });
      // After GitHub App install, open repo selection modal automatically
      if (success === "github_app_installed") {
        setShowSetupModal(true);
      }
      window.history.replaceState({}, "", "/connectors");
    }
    if (error) {
      setMessage({ type: "error", text: decodeURIComponent(error) });
      window.history.replaceState({}, "", "/connectors");
    }
  }, []);

  /* ── Connect via OAuth ──────────────────────────────────────── */
  const handleOAuthConnect = useCallback((type: string) => {
    window.location.href = `/api/connectors/${type}/auth`;
  }, []);

  /* ── Sync ────────────────────────────────────────────────────── */
  const handleSync = useCallback(async (type: string, connectorId?: string) => {
    setMessage({ type: "info", text: `Starting ${type} sync...` });
    try {
      const res = await fetch(`/api/connectors/${type}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: `${type} sync started. Data will appear shortly.` });
        setTimeout(() => router.refresh(), 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage({ type: "error", text: data.error || `Failed to start ${type} sync` });
      }
    } catch {
      setMessage({ type: "error", text: `Network error starting ${type} sync` });
    }
  }, [router]);

  /* ── Test Connection ─────────────────────────────────────────── */
  const handleTestConnection = useCallback(async (type: string, connectorId?: string) => {
    setTestingConnection(connectorId || type);
    setTestResult(null);
    try {
      const url = connectorId
        ? `/api/connectors/${type}/status?connectorId=${connectorId}`
        : `/api/connectors/${type}/status`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const successMsg = data.status === "active" ? "Connection test passed — credentials valid" : `Connection test: status is ${data.status}`;
        setTestResult({
          type: connectorId || type,
          success: true,
          message: successMsg,
        });
        setMessage({ type: "success", text: successMsg });
      } else {
        const failMsg = "Connection test failed — check credentials";
        setTestResult({ type: connectorId || type, success: false, message: failMsg });
        setMessage({ type: "error", text: failMsg });
      }
    } catch {
      const errMsg = "Connection test failed — network error";
      setTestResult({ type: connectorId || type, success: false, message: errMsg });
      setMessage({ type: "error", text: errMsg });
    } finally {
      setTestingConnection(null);
    }
  }, []);

  /* ── GitHub setup ────────────────────────────────────────────── */
  const handleGitHubConnected = useCallback(
    (_repo: any, releaseConfig: GitHubReleaseConfig) => {
      const branchLabel =
        releaseConfig.trackedBranches.length > 0
          ? `${releaseConfig.trackedBranches.length} branch(es)`
          : "all branches";

      setMessage({
        type: "info",
        text: `Starting GitHub ingestion for ${branchLabel}, ${releaseConfig.dataLookback} lookback...`,
      });
      setShowIngestion(true);

      // ── CRITICAL FIX: pass trackedBranches + dataLookback to sync route ──
      // Previously this was just router.refresh() — branch config was captured
      // in the UI but never actually sent to the backend, so ALL branches were
      // synced and no release_version metadata was stamped on signals.
      fetch("/api/connectors/github/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackedBranches: releaseConfig.trackedBranches,
          dataLookback: releaseConfig.dataLookback,
          repositories: releaseConfig.repositories,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setMessage({ type: "error", text: `GitHub sync failed: ${data.error}` });
          } else {
            setMessage({
              type: "success",
              text: `GitHub sync complete — ${data.signalsGenerated ?? 0} signals ingested from ${branchLabel}`,
            });
          }
          setTimeout(() => router.refresh(), 1500);
        })
        .catch(() => {
          setMessage({ type: "error", text: "GitHub sync failed — check your connection and try again." });
          setTimeout(() => router.refresh(), 1500);
        });

      router.refresh();
    },
    [router]
  );

  /* ── Jira setup ──────────────────────────────────────────────── */
  const handleJiraConnected = useCallback(
    (config: JiraConfig) => {
      setMessage({
        type: "info",
        text: `Starting Jira ingestion for ${config.trackedProjects.join(", ")}, ${config.dataLookback} lookback...`,
      });
      // Kick off the Jira sync with the config
      fetch("/api/connectors/jira/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectKeys: config.trackedProjects,
          dataLookback: config.dataLookback,
          fixVersionFilter: config.fixVersionFilter,
          sources: config.sources,
        }),
      })
        .then((res) => res.json())
        .then(() => {
          setMessage({ type: "success", text: "Jira sync started — tickets will appear shortly." });
          setTimeout(() => router.refresh(), 2000);
        })
        .catch(() => {
          setMessage({ type: "error", text: "Jira sync failed to start. Check credentials." });
        });
    },
    [router]
  );

  /* ── Separate connectors into connected vs available ─────────── */
  // A connector type still shows in "available" even if it has active instances
  // (so you can connect additional repos/sites/workspaces)
  const availableConnectors = connectors.filter(
    (c) => {
      // Types that don't support multi-instance: only show if no active instance
      const multiInstanceTypes = new Set(["github", "jira", "slack"]);
      if (multiInstanceTypes.has(c.type)) return true; // Always show — can add more
      return !connectedTypes.has(c.type);
    }
  );

  return (
    <ErrorBoundary section="Connectors">
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Connectors</h1>
        <p className="text-xs text-muted mt-0.5">
          Connect your tools to feed signals into the brain
        </p>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatValue label="Total Connectors" value={String(connectors.length)} subtitle="Available" />
        <StatValue label="Connected" value={String(connectedCount)} subtitle={connectedCount > 0 ? "connected" : "none connected"} />
        <StatValue label="Active Domains" value={String(activeDomains.size)} subtitle="With signals" />
        <StatValue label="Total Signals" value={formatNumber(totalSignals)} subtitle="Across all sources" />
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={cn(
            "flex items-center justify-between px-4 py-3 rounded-xl border text-sm",
            message.type === "success" && "bg-success/10 border-success/20 text-success",
            message.type === "error" && "bg-danger/10 border-danger/20 text-danger",
            message.type === "info" && "bg-info/10 border-info/20 text-info"
          )}
        >
          <span className="font-medium">{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="text-xs opacity-60 hover:opacity-100 ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Ingestion progress banner */}
      {showIngestion && (
        <IngestionProgress
          onComplete={() => {
            setShowIngestion(false);
            router.refresh();
          }}
        />
      )}

      {/* ── Connected Connectors ──────────────────────────────── */}
      {activeInstances.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Connected ({activeInstances.length})
            </div>
            {lastBrainTrainedAt ? (
              <div className="flex items-center gap-1.5 text-[11px] text-accent">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Brain learning from these connectors · last cycle {(() => { const d = new Date(lastBrainTrainedAt); return isNaN(d.getTime()) ? "recently" : formatRelativeTime(d); })()}
              </div>
            ) : (
              <div className="text-[11px] text-muted">
                Go to{" "}
                <Link href="/settings?tab=brain" className="font-medium underline underline-offset-2 hover:text-foreground transition-colors">
                  Settings → Brain
                </Link>{" "}
                to run first training cycle
              </div>
            )}
          </div>
          <div className="space-y-2">
            {activeInstances.map((instance) => {
              const connectorDef = connectors.find((c) => c.type === instance.connectorType);
              if (!connectorDef) return null;
              const signalCount = domainCounts[connectorDef.domain] || 0;
              const progress = syncProgressMap[instance.connectorType];
              const isSyncing = !!progress;
              const isTesting = testingConnection === instance.id;
              const currentTestResult = testResult?.type === instance.id ? testResult : null;
              const instanceLabel = instance.displayName || instance.instanceName;
              const health = healthMap[instance.connectorType];

              return (
                <Card key={instance.id} variant="interactive">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center text-xl shrink-0">
                      {connectorDef.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-sm font-semibold">{connectorDef.name}</span>
                        {instanceLabel && instanceLabel !== "default" && (
                          <span className="text-xs text-muted font-mono">{instanceLabel}</span>
                        )}
                        <Badge variant="success" size="xs" pulse>Connected</Badge>
                        <Badge
                          variant="default"
                          size="xs"
                          className={DOMAIN_COLORS[connectorDef.domain]}
                        >
                          {connectorDef.domain}
                        </Badge>
                        {isSyncing && (
                          <Badge variant="info" size="xs" pulse>Syncing</Badge>
                        )}
                        {lastBrainTrainedAt && !isSyncing && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                            RL Active
                          </span>
                        )}
                        {health?.authMethod === "github_app" && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 text-[10px] font-medium">
                            GitHub App
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted mb-2">{connectorDef.description}</p>

                      {/* Connection details */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="text-muted">
                          Signals:{" "}
                          <span className="text-foreground font-mono tabular-nums">
                            {formatNumber(health?.signalsCount ?? instance.signalsCount ?? signalCount)}
                          </span>
                        </span>
                        <span className="text-muted">
                          Last sync:{" "}
                          <span className="text-foreground font-medium">
                            {(() => {
                              const ts = health?.lastSyncAt ?? instance.lastSyncAt;
                              return ts ? formatRelativeTime(new Date(ts)) : "Never synced";
                            })()}
                          </span>
                        </span>
                        <span className="text-muted flex items-center gap-1">
                          <svg className="w-3 h-3 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          Brain trained:{" "}
                          <span className={cn(
                            "font-medium",
                            lastBrainTrainedAt ? "text-accent" : "text-muted"
                          )}>
                            {lastBrainTrainedAt ? formatRelativeTime(new Date(lastBrainTrainedAt)) : "Not yet — run Sync & Train"}
                          </span>
                        </span>
                        {instance.metadata?.team_name && (
                          <span className="text-muted">
                            Team: <span className="text-foreground">{instance.metadata.team_name}</span>
                          </span>
                        )}
                        {instance.metadata?.github_login && (
                          <span className="text-muted">
                            Account: <span className="text-foreground">@{instance.metadata.github_login}</span>
                          </span>
                        )}
                        {instance.metadata?.site_name && (
                          <span className="text-muted">
                            Site: <span className="text-foreground">{instance.metadata.site_name}</span>
                          </span>
                        )}
                        {instance.config?.repoFullName && (
                          <span className="text-muted">
                            Repo: <span className="text-foreground font-mono">{instance.config.repoFullName}</span>
                          </span>
                        )}
                        {instance.connectorType === "github" && instance.config?.trackedBranches && instance.config.trackedBranches.length > 0 && (
                          <span className="text-muted">
                            Branches:{" "}
                            <span className="text-foreground font-mono text-[11px]">
                              {(instance.config.trackedBranches as string[]).slice(0, 3).join(", ")}
                              {instance.config.trackedBranches.length > 3 && ` +${instance.config.trackedBranches.length - 3} more`}
                            </span>
                          </span>
                        )}
                        {instance.connectorType === "github" && instance.config?.dataLookback && (
                          <span className="text-muted">
                            Lookback: <span className="text-foreground">{instance.config.dataLookback}</span>
                          </span>
                        )}
                      </div>

                      {/* Sync Progress */}
                      {isSyncing && progress && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted">Syncing...</span>
                            <span className="text-accent font-mono tabular-nums">
                              {progress.progressPct ?? 0}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-surface overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-full transition-all duration-500"
                              style={{ width: `${progress.progressPct ?? 0}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted mt-1">
                            {formatNumber(progress.signalsIngested)} signals processed
                          </p>
                        </div>
                      )}

                      {/* Error message */}
                      {instance.errorMessage && (
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-danger">
                          <StatusDot type="error" size="sm" />
                          {instance.errorMessage}
                        </div>
                      )}

                      {/* Test Result */}
                      {currentTestResult && (
                        <div
                          className={cn(
                            "mt-2 flex items-center gap-1.5 text-[11px] font-medium",
                            currentTestResult.success ? "text-success" : "text-danger"
                          )}
                        >
                          <StatusDot type={currentTestResult.success ? "success" : "error"} size="sm" />
                          {currentTestResult.message}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5 shrink-0">
                      {(instance.status === "error" || health?.status === "error") && (
                        <button
                          onClick={() => {
                            if (instance.connectorType === "freshdesk") {
                              // Use stored domain from metadata to avoid requiring re-entry
                              const storedDomain = (instance.metadata as Record<string, unknown>)?.domain as string | undefined;
                              if (storedDomain) {
                                window.location.href = `/api/connectors/freshworks/auth?domain=${encodeURIComponent(storedDomain)}`;
                              } else {
                                // No domain stored — show the domain input by setting state
                                setShowFreshworksInput(true);
                              }
                            } else {
                              handleOAuthConnect(instance.connectorType);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-danger/10 text-danger text-xs font-medium hover:bg-danger/20 transition-colors flex items-center gap-1.5"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Reconnect
                        </button>
                      )}
                      <button
                        onClick={() => handleTestConnection(instance.connectorType, instance.id)}
                        disabled={isTesting}
                        className="px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs font-medium hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                      >
                        {isTesting ? (
                          <>
                            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Testing...
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Test
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleSync(instance.connectorType, instance.id)}
                        disabled={isSyncing}
                        className="px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isSyncing ? "Syncing..." : "Sync Now"}
                      </button>
                      {/* Multi-instance: add another Jira site */}
                      {instance.connectorType === "jira" && (
                        <button
                          onClick={() => setShowJiraModal(true)}
                          className="px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs font-medium hover:bg-surface-hover transition-colors flex items-center gap-1"
                          title="Connect an additional Jira site"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                          Add Instance
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Available Connectors — grouped by service ──────────── */}
      {/* ── Coming Soon toggle ─────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted">
          Available Connectors
        </div>
        <button
          onClick={() => setShowComingSoon((prev) => !prev)}
          className="flex items-center gap-1.5 text-[11px] text-muted hover:text-foreground transition-colors"
        >
          <span className={cn(
            "w-7 h-4 rounded-full transition-colors relative",
            showComingSoon ? "bg-accent" : "bg-border"
          )}>
            <span className={cn(
              "absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow",
              showComingSoon && "translate-x-3"
            )} />
          </span>
          {showComingSoon ? "Hide coming soon" : "Show coming soon"}
        </button>
      </div>

      {(["seaas", "aaas", "general"] as const).map((svcKey) => {
        const svcInfo = SERVICE_LABELS[svcKey];
        const allSvcConnectors = availableConnectors.filter(
          (c) => (SERVICE_MAP[c.type] || "general") === svcKey
        );
        const svcConnectors = showComingSoon
          ? allSvcConnectors
          : allSvcConnectors.filter((c) => c.oauth || c.type === "s3-storage");
        if (svcConnectors.length === 0) return null;
        return (
      <div key={svcKey}>
        <div className="flex items-center gap-2 mb-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted">
            {svcInfo.label}
          </div>
          <span className="text-[10px] text-muted/60">{svcInfo.desc}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {svcConnectors.map((connector) => {
            const signalCount = domainCounts[connector.domain] || 0;
            const hasSignals = activeDomains.has(connector.domain);
            const isGitHub = connector.type === "github";
            // Find any failed/errored instance for this connector type
            const failedInstance = connectorInstances.find(
              (ci) => ci.connectorType === connector.type && (ci.status === "error" || ci.status === "disabled")
            );
            const hasError = !!failedInstance;

            return (
              <div
                key={connector.type}
                className={cn(
                  "rounded-xl bg-card border p-5 transition-all hover:bg-card-hover hover:border-accent/30 group",
                  hasError ? "border-danger/20" : "border-border-subtle",
                  !hasSignals && !connector.oauth && "opacity-60"
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{connector.icon}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="default"
                      size="xs"
                      className={DOMAIN_COLORS[connector.domain]}
                    >
                      {connector.domain}
                    </Badge>
                    {hasError ? (
                      <Badge variant="danger" size="xs">Error</Badge>
                    ) : hasSignals ? (
                      <Badge variant="success" size="xs">Has Signals</Badge>
                    ) : null}
                  </div>
                </div>

                <h3 className="font-medium text-sm mb-1">{connector.name}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  {connector.description}
                </p>

                {/* Error info if disconnected with error */}
                {hasError && failedInstance?.errorMessage && (
                  <div className="mb-3 flex items-center gap-1.5 text-[10px] text-danger">
                    <StatusDot type="error" size="sm" />
                    <span className="truncate">{failedInstance.errorMessage}</span>
                  </div>
                )}

                {/* Signals count if active domain */}
                {hasSignals && (
                  <div className="flex items-center justify-between mb-3 text-xs">
                    <span className="text-muted">Existing signals</span>
                    <span className="font-medium text-accent tabular-nums">{formatNumber(signalCount)}</span>
                  </div>
                )}

                {/* Connect Action */}
                <div className="pt-3 border-t border-border-subtle">
                  {connector.type === "s3-storage" ? (
                    <button
                      onClick={() => setShowS3Upload(true)}
                      className="w-full py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      Upload Data
                    </button>
                  ) : connector.oauth ? (
                    <div className="flex gap-2">
                      {isGitHub ? (
                        <>
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch("/api/connectors/github/app-install", { redirect: "manual" });
                                // A successful redirect returns opaqueredirect (type==="opaqueredirect") or status 0 in fetch with redirect:manual
                                // In Next.js the route always redirects (3xx) on success, or returns JSON error on failure
                                if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
                                  // Server wants to redirect — follow it properly
                                  window.location.href = "/api/connectors/github/app-install";
                                  return;
                                }
                                // Non-redirect means an error JSON was returned
                                const data = await res.json().catch(() => ({}));
                                setMessage({
                                  type: "error",
                                  text: data.error || "GitHub App not configured. Please add GITHUB_APP_SLUG to your environment variables.",
                                });
                              } catch {
                                // fetch() itself failed (network error) — fall back to direct navigation
                                window.location.href = "/api/connectors/github/app-install";
                              }
                            }}
                            className="flex-1 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors flex items-center justify-center gap-1.5"
                            title="Org-level access, no tokens needed"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            Install App
                          </button>
                          <button
                            onClick={() => setShowSetupModal(true)}
                            className="py-2 px-3 rounded-lg bg-surface border border-border-subtle text-xs font-medium hover:bg-surface-hover transition-colors"
                            title="Manual token + branch selection"
                          >
                            Token
                          </button>
                        </>
                      ) : connector.type === "jira" ? (
                        <>
                          <button
                            onClick={() => setShowJiraModal(true)}
                            className="flex-1 py-2 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                            Token + Projects
                          </button>
                          <button
                            onClick={() => handleOAuthConnect("jira")}
                            className="flex-1 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            OAuth
                          </button>
                        </>
                      ) : connector.type === "freshdesk" ? (
                        showFreshworksInput ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={freshworksDomain}
                              onChange={(e) => setFreshworksDomain(e.target.value)}
                              placeholder="acme.freshdesk.com"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-xs placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && freshworksDomain.trim()) {
                                  window.location.href = `/api/connectors/freshworks/auth?domain=${encodeURIComponent(freshworksDomain.trim())}`;
                                }
                                if (e.key === "Escape") setShowFreshworksInput(false);
                              }}
                            />
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => {
                                  if (freshworksDomain.trim()) {
                                    window.location.href = `/api/connectors/freshworks/auth?domain=${encodeURIComponent(freshworksDomain.trim())}`;
                                  }
                                }}
                                disabled={!freshworksDomain.trim()}
                                className="flex-1 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors disabled:opacity-40"
                              >
                                Connect →
                              </button>
                              <button
                                onClick={() => setShowFreshworksInput(false)}
                                className="py-1.5 px-2.5 rounded-lg bg-surface border border-border-subtle text-xs hover:bg-surface-hover transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowFreshworksInput(true)}
                            className="w-full py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            Connect with OAuth
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => handleOAuthConnect(connector.type)}
                          className="w-full py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          Connect with OAuth
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted">Coming soon</span>
                      <span className="text-[10px] text-muted bg-surface px-2 py-0.5 rounded-full">
                        API / Webhook
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
        );
      })}

      {/* ── Info Cards ─────────────────────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-3">
        <Card>
          <CardTitle className="mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Secure & Private
          </CardTitle>
          <p className="text-xs text-muted leading-relaxed">
            All credentials encrypted at rest. Brain OS only accesses data you explicitly grant.
          </p>
        </Card>

        <Card>
          <CardTitle className="mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
            Auto Sync
          </CardTitle>
          <p className="text-xs text-muted leading-relaxed">
            Connectors sync hourly. Initial sync may take time; incremental syncs are fast.
          </p>
        </Card>

        <Card>
          <CardTitle className="mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-brain-training" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Brain Learning
          </CardTitle>
          <p className="text-xs text-muted leading-relaxed">
            Each signal feeds the causal graph. More connectors = deeper cross-domain intelligence.
          </p>
        </Card>
      </div>

      {/* ── AI Worker Automation — Write-back Rules ─────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted">
            AI Worker Automation — Write-back Rules
          </div>
          <span className="text-[10px] text-muted/60">
            Automatically push AI Worker results to Slack, Jira, or GitHub
          </span>
        </div>
        <WritebackRulesPanel organizationId={organizationId} userRole={userRole} />
      </div>

      {/* ── Write-back Approvals queue link ─────────────────────── */}
      <ApprovalsCallout userRole={userRole} />

      {/* GitHub Setup Modal — token + branch selection + data lookback */}
      <GitHubSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        onConnected={handleGitHubConnected}
      />

      {/* Jira Setup Modal — API token + project selection + data lookback */}
      <JiraSetupModal
        isOpen={showJiraModal}
        onClose={() => setShowJiraModal(false)}
        onConnected={handleJiraConnected}
      />

      {/* S3 Upload Modal */}
      <S3UploadModal
        isOpen={showS3Upload}
        onClose={() => setShowS3Upload(false)}
        onUploaded={(result) => {
          if (result.brainIngestion?.triggered) {
            setMessage({
              type: "success",
              text: `Uploaded ${result.fileName} — brain ingested ${result.brainIngestion.signalsIngested} signals from ${result.brainIngestion.transactionCount} transactions`,
            });
          } else {
            setMessage({ type: "success", text: `Uploaded ${result.fileName} to S3 storage` });
          }
          router.refresh();
        }}
      />
    </div>
    </ErrorBoundary>
  );
}
