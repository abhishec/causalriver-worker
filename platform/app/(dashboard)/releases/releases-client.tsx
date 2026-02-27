"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types (mirror release-tracker.ts shapes) ────────────────────────────────

interface ReleaseEntity {
  id: string;
  release_name: string;
  release_type: string;
  branch_name: string;
  base_version?: string;
  target_date?: string;
  drop_number?: number;
  drop_date?: string;
  team_label?: string;
  team_members: string[];
  github_repo?: string;
  jira_project_key?: string;
  jira_fix_version?: string;
  status: string;
}

interface ReleaseReadiness {
  releaseId: string;
  releaseName: string;
  branchName: string;
  targetDate?: string;
  metrics: {
    totalJiraTickets: number;
    resolvedTickets: number;
    ticketResolutionPct: number;
    totalPRs: number;
    mergedPRs: number;
    prMergeRatePct: number;
    openPRs: number;
    totalCommits: number;
    teamMembers: string[];
    activeMembersLastWeek: string[];
  };
  readinessScore: number;
  readinessLabel: "red" | "amber" | "green";
  summary: string;
}

interface JiraTicket {
  key: string;
  summary: string;
  status: string;
  issue_type: string;
  assignee: string | null;
}

interface CommitDiff {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

interface VelocityDrop {
  dropNumber: number;
  dropDate: string;
  mergedPRs: number;
  resolvedTickets: number;
  authorBreakdown: Record<string, number>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LABEL_COLORS = {
  green: "bg-success/10 text-success border-success/20",
  amber: "bg-warning/10 text-warning border-warning/20",
  red:   "bg-danger/10  text-danger  border-danger/20",
};

const SCORE_BAR_COLORS = {
  green: "bg-success",
  amber: "bg-warning",
  red:   "bg-danger",
};

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReleaseDashboardClient({
  initialReleases,
  orgId,
}: {
  initialReleases: ReleaseEntity[];
  orgId: string;
}) {
  const [releases]         = useState<ReleaseEntity[]>(initialReleases);
  const [selected, setSelected] = useState<ReleaseEntity | null>(
    initialReleases[0] ?? null
  );
  const [activeTab, setActiveTab] = useState<"overview" | "tickets" | "diff" | "velocity">("overview");

  const [readiness, setReadiness]  = useState<ReleaseReadiness | null>(null);
  const [tickets,   setTickets]    = useState<JiraTicket[] | null>(null);
  const [diff,      setDiff]       = useState<CommitDiff[] | null>(null);
  const [velocity,  setVelocity]   = useState<VelocityDrop[] | null>(null);
  const [loading,   setLoading]    = useState(false);
  const [syncing,   setSyncing]    = useState(false);
  const [error,     setError]      = useState<string | null>(null);

  const releaseConfig = selected
    ? {
        organizationId: orgId,
        releaseName:    selected.release_name,
        releaseType:    selected.release_type as any,
        branchName:     selected.branch_name,
        baseVersion:    selected.base_version,
        targetDate:     selected.target_date,
        teamLabel:      selected.team_label,
        teamMembers:    selected.team_members,
        githubRepo:     selected.github_repo,
        jiraProjectKey: selected.jira_project_key,
        jiraFixVersion: selected.jira_fix_version,
      }
    : null;

  const fetchQuery = useCallback(
    async (query: string, releaseId: string) => {
      if (!releaseConfig) return null;
      const res = await fetch(
        `/api/releases/${releaseId}?query=${query}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ releaseConfig }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      return json.data;
    },
    [releaseConfig]
  );

  // Load overview (readiness) whenever selected release changes
  useEffect(() => {
    if (!selected) return;
    setReadiness(null);
    setTickets(null);
    setDiff(null);
    setVelocity(null);
    setError(null);
    setActiveTab("overview");

    setLoading(true);
    fetchQuery("readiness", selected.id)
      .then(setReadiness)
      .catch(() => setError("Failed to load release data"))
      .finally(() => setLoading(false));
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load tab data on demand
  useEffect(() => {
    if (!selected || activeTab === "overview") return;
    if (activeTab === "tickets"  && tickets  !== null) return;
    if (activeTab === "diff"     && diff     !== null) return;
    if (activeTab === "velocity" && velocity !== null) return;

    setLoading(true);
    setError(null);
    const queryMap = { tickets: "tickets", diff: "diff", velocity: "velocity" };
    fetchQuery(queryMap[activeTab], selected.id)
      .then(data => {
        if (activeTab === "tickets")  setTickets(data);
        if (activeTab === "diff")     setDiff(data);
        if (activeTab === "velocity") setVelocity(data?.drops ?? data);
      })
      .catch(() => setError("Failed to load tab data"))
      .finally(() => setLoading(false));
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync() {
    if (!selected || !releaseConfig) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`/api/releases/${selected.id}?query=sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseConfig }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      // Reload readiness after sync
      const fresh = await fetchQuery("readiness", selected.id);
      setReadiness(fresh);
      setTickets(null); setDiff(null); setVelocity(null);
    } catch {
      setError("Sync failed — please try again");
    } finally {
      setSyncing(false);
    }
  }

  // ── No releases state ──────────────────────────────────────────────────────
  if (releases.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="text-lg font-medium mb-2 text-foreground">No active releases found</p>
        <p className="text-sm">
          Connect GitHub and Jira, then register your releases via the Connectors page.
        </p>
      </div>
    );
  }

  const days = daysUntil(selected?.target_date ?? selected?.drop_date);

  return (
    <div className="flex h-full">
      {/* ── Left sidebar: release list ──────────────────────────────────── */}
      <aside className="w-64 border-r border-border bg-surface p-4 flex-shrink-0">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Active Releases
        </h2>
        <ul className="space-y-1">
          {releases.map(r => (
            <li key={r.id}>
              <button
                onClick={() => setSelected(r)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selected?.id === r.id
                    ? "bg-accent text-white"
                    : "text-foreground hover:bg-surface-hover"
                }`}
              >
                <div className="font-medium">{r.release_name}</div>
                <div className={`text-xs mt-0.5 ${selected?.id === r.id ? "text-white/70" : "text-muted-foreground"}`}>
                  {r.branch_name}
                  {r.drop_number ? ` · Drop ${r.drop_number}` : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto p-6">
        {selected && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {selected.release_name}
                  {selected.drop_number && (
                    <span className="ml-2 text-base font-medium text-muted-foreground">
                      Drop {selected.drop_number}
                    </span>
                  )}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {selected.branch_name}
                  {selected.base_version && ` · built on ${selected.base_version}`}
                  {selected.team_label && ` · ${selected.team_label}`}
                </p>
                {selected.team_members?.length > 0 && (
                  <p className="text-xs text-muted mt-1">
                    Team: {selected.team_members.join(", ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {days !== null && (
                  <div className={`text-sm font-medium px-3 py-1 rounded-full border ${
                    days < 0 ? "bg-danger/10 text-danger border-danger/20" :
                    days <= 7 ? "bg-warning/10 text-warning border-warning/20" :
                    "bg-surface-hover text-muted-foreground border-border"
                  }`}>
                    {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d to target`}
                  </div>
                )}
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
                >
                  {syncing ? "Syncing…" : "↺ Sync Now"}
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger" role="alert">
                {error}
              </div>
            )}

            {/* Tabs */}
            <div className="border-b border-border mb-6">
              <nav className="-mb-px flex gap-6">
                {(["overview", "tickets", "diff", "velocity"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`pb-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                      activeTab === tab
                        ? "border-accent text-accent"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab === "overview" ? "Readiness" :
                     tab === "tickets"  ? `Tickets` :
                     tab === "diff"     ? "Commits" :
                     "Velocity"}
                  </button>
                ))}
              </nav>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-16 text-muted-foreground text-sm" role="status" aria-label="Loading release data">
                Loading…
              </div>
            )}

            {/* ── Overview / Readiness Tab ──────────────────────────── */}
            {!loading && activeTab === "overview" && readiness && (
              <div className="space-y-6">
                {/* Score card */}
                <div className={`p-6 rounded-xl border-2 ${LABEL_COLORS[readiness.readinessLabel]}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg font-semibold">Release Readiness</span>
                    <span className={`text-3xl font-bold`}>
                      {readiness.readinessScore}/100
                    </span>
                  </div>
                  <div className="w-full bg-white/60 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${SCORE_BAR_COLORS[readiness.readinessLabel]}`}
                      style={{ width: `${readiness.readinessScore}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs font-medium uppercase tracking-wider">
                    {readiness.readinessLabel === "green" ? "✅ Ready to ship" :
                     readiness.readinessLabel === "amber" ? "⚠️ Getting there" :
                     "🔴 Needs attention"}
                  </p>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard
                    label="Tickets Resolved"
                    value={`${readiness.metrics.resolvedTickets}/${readiness.metrics.totalJiraTickets}`}
                    sub={`${readiness.metrics.ticketResolutionPct}%`}
                    color={readiness.metrics.ticketResolutionPct >= 80 ? "green" : readiness.metrics.ticketResolutionPct >= 50 ? "amber" : "red"}
                  />
                  <MetricCard
                    label="PRs Merged"
                    value={`${readiness.metrics.mergedPRs}/${readiness.metrics.totalPRs}`}
                    sub={`${readiness.metrics.prMergeRatePct}%`}
                    color={readiness.metrics.prMergeRatePct >= 80 ? "green" : "amber"}
                  />
                  <MetricCard
                    label="Open PRs"
                    value={String(readiness.metrics.openPRs)}
                    sub="still open"
                    color={readiness.metrics.openPRs === 0 ? "green" : readiness.metrics.openPRs <= 3 ? "amber" : "red"}
                  />
                  <MetricCard
                    label="Commits"
                    value={String(readiness.metrics.totalCommits)}
                    sub={`since ${selected.base_version ?? "base"}`}
                    color="blue"
                  />
                </div>

                {/* Active team */}
                {readiness.metrics.activeMembersLastWeek.length > 0 && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Active last 7 days
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {readiness.metrics.activeMembersLastWeek.map(m => (
                        <span key={m} className="px-2 py-0.5 bg-white border border-gray-200 rounded text-sm text-gray-700">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Raw summary */}
                <pre className="text-xs text-gray-500 bg-gray-50 p-4 rounded-lg whitespace-pre-wrap font-mono">
                  {readiness.summary}
                </pre>
              </div>
            )}

            {/* ── Tickets Tab ──────────────────────────────────────── */}
            {!loading && activeTab === "tickets" && tickets !== null && (
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  {tickets.length} Jira ticket{tickets.length !== 1 ? "s" : ""} in{" "}
                  <span className="font-medium">{selected.jira_fix_version ?? selected.release_name}</span>
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {["Key", "Summary", "Status", "Type", "Assignee"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {tickets.map(t => (
                        <tr key={t.key} className="hover:bg-surface-hover">
                          <td className="px-4 py-3 font-medium text-accent whitespace-nowrap">{t.key}</td>
                          <td className="px-4 py-3 text-foreground max-w-xs truncate">{t.summary}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={t.status} />
                          </td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{t.issue_type}</td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{t.assignee ?? "—"}</td>
                        </tr>
                      ))}
                      {tickets.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                            No tickets found. Run &quot;Sync Now&quot; to pull Jira data.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Commits Diff Tab ─────────────────────────────────── */}
            {!loading && activeTab === "diff" && diff !== null && (
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  {diff.length} commit{diff.length !== 1 ? "s" : ""} since{" "}
                  <span className="font-medium">{selected.base_version ?? "base"}</span>
                </p>
                <div className="space-y-2">
                  {diff.map(c => (
                    <div key={c.sha} className="p-3 bg-surface rounded-lg border border-border-subtle flex items-start gap-3">
                      <code className="text-xs text-muted font-mono mt-0.5 flex-shrink-0">
                        {c.sha.slice(0, 7)}
                      </code>
                      <div className="min-w-0">
                        <p className="text-sm text-foreground font-medium truncate">
                          {c.message.split("\n")[0]}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {c.author} · {new Date(c.date).toLocaleDateString()}
                        </p>
                      </div>
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noreferrer"
                           className="ml-auto text-xs text-accent hover:underline flex-shrink-0">
                          View →
                        </a>
                      )}
                    </div>
                  ))}
                  {diff.length === 0 && (
                    <p className="text-center text-muted-foreground py-8 text-sm">
                      No commits found. Run &quot;Sync Now&quot; to pull GitHub data.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Velocity Tab ─────────────────────────────────────── */}
            {!loading && activeTab === "velocity" && velocity !== null && (
              <div className="space-y-4">
                {velocity.length === 0 && (
                  <p className="text-center text-muted-foreground py-8 text-sm">
                    No drop data found. This release may not have drops configured.
                  </p>
                )}
                {velocity.map((drop: VelocityDrop) => (
                  <div key={drop.dropNumber} className="p-4 border border-border-subtle rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-foreground">
                        Drop {drop.dropNumber}
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          {new Date(drop.dropDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div className="text-center p-3 bg-accent/5 rounded-lg">
                        <p className="text-2xl font-bold text-accent">{drop.mergedPRs}</p>
                        <p className="text-xs text-accent/70 mt-1">PRs Merged</p>
                      </div>
                      <div className="text-center p-3 bg-success/5 rounded-lg">
                        <p className="text-2xl font-bold text-success">{drop.resolvedTickets}</p>
                        <p className="text-xs text-success/70 mt-1">Tickets Resolved</p>
                      </div>
                    </div>
                    {Object.keys(drop.authorBreakdown).length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2 font-medium">PR contributions:</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(drop.authorBreakdown)
                            .sort(([, a], [, b]) => b - a)
                            .map(([author, count]) => (
                              <span key={author} className="text-xs px-2 py-0.5 bg-surface-hover rounded text-foreground">
                                {author}: {count}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, color,
}: {
  label: string;
  value: string;
  sub: string;
  color: "green" | "amber" | "red" | "blue";
}) {
  const bg = { green: "bg-success/5", amber: "bg-warning/5", red: "bg-danger/5", blue: "bg-accent/5" }[color];
  const text = { green: "text-success", amber: "text-warning", red: "text-danger", blue: "text-accent" }[color];
  return (
    <div className={`${bg} rounded-xl p-4`}>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${text}`}>{value}</p>
      <p className="text-xs text-muted mt-0.5">{sub}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls =
    s === "done" || s === "closed" || s === "resolved"
      ? "bg-success/10 text-success"
      : s === "in progress" || s === "in review"
      ? "bg-accent/10 text-accent"
      : "bg-surface-hover text-muted-foreground";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{status}</span>
  );
}
