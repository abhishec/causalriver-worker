"use client";

import { useState, useCallback } from "react";
import { useWorkspace } from "@/lib/workspace-context";

interface JiraProjectInfo {
  key: string;
  name: string;
  issueCount?: number;
  projectType?: string;
}

interface JiraSiteInfo {
  siteUrl: string;
  siteName?: string;
  projects: JiraProjectInfo[];
}

export interface JiraConfig {
  siteUrl: string;
  email: string;
  /** API token — not stored, used only for the current session */
  apiToken: string;
  /** Which Jira project keys to ingest — empty = all projects */
  trackedProjects: string[];
  /**
   * How far back to pull issues on first sync.
   * "3m" | "6m" | "1y" | "2y" | "all"
   */
  dataLookback: string;
  /** Optional: filter by fix version label — links issues to releases */
  fixVersionFilter?: string;
}

interface JiraSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: (config: JiraConfig, siteInfo: JiraSiteInfo) => void;
}

type Step = "credentials" | "validating" | "projects" | "error";

const LOOKBACK_OPTIONS = [
  { value: "3m",  label: "Last 3 months",  hint: "Recent sprints only" },
  { value: "6m",  label: "Last 6 months",  hint: "Recommended for active teams" },
  { value: "1y",  label: "Last 1 year",    hint: "Good for long-running projects" },
  { value: "2y",  label: "Last 2 years",   hint: "Deep history" },
  { value: "all", label: "All issues",     hint: "Full history — slow on large projects (5K+ issues)" },
];

export function JiraSetupModal({
  isOpen,
  onClose,
  onConnected,
}: JiraSetupModalProps) {
  const { currentWorkspace } = useWorkspace();

  // Step 1 — credentials
  const [step, setStep] = useState<Step>("credentials");
  const [siteUrl, setSiteUrl] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [error, setError] = useState("");

  // Step 2 — project & scope config
  const [siteInfo, setSiteInfo] = useState<JiraSiteInfo | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [lookback, setLookback] = useState("6m");
  const [fixVersionFilter, setFixVersionFilter] = useState("");
  const [projectSearch, setProjectSearch] = useState("");

  const normaliseSiteUrl = (raw: string): string => {
    let url = raw.trim().replace(/\/$/, "");
    if (!url.startsWith("http")) url = `https://${url}`;
    // Ensure .atlassian.net suffix for cloud instances without full domain
    if (!url.includes(".") && !url.includes("atlassian")) {
      url = `https://${raw.trim()}.atlassian.net`;
    }
    return url;
  };

  const handleValidate = async () => {
    if (!siteUrl.trim()) { setError("Please enter your Jira site URL"); return; }
    if (!email.trim()) { setError("Please enter your Jira account email"); return; }
    if (!apiToken.trim()) { setError("Please enter your Jira API token"); return; }

    const normUrl = normaliseSiteUrl(siteUrl);
    setError("");
    setStep("validating");

    try {
      // Validate credentials via backend proxy (avoids CORS issues with self-hosted Jira)
      const res = await fetch("/api/connectors/jira/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl: normUrl,
          email: email.trim(),
          apiToken: apiToken.trim(),
          trackedProjects: [],
          dataLookback: "6m",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `Jira returned ${res.status}. Check the site URL.`);
        setStep("error");
        return;
      }

      const projects: JiraProjectInfo[] = (data.projects ?? []).map((p: any) => ({
        key: p.key,
        name: p.name,
        projectType: p.projectType,
      }));

      setSiteInfo({ siteUrl: normUrl, siteName: new URL(normUrl).hostname, projects });
      // Pre-select all software-type projects (filter out service desks etc)
      const softwareProjects = projects
        .filter((p) => p.projectType === "software" || !p.projectType)
        .map((p) => p.key);
      setSelectedProjects(softwareProjects.length > 0 ? softwareProjects : projects.map((p) => p.key));
      setStep("projects");
    } catch (err: any) {
      setError(err.message || "Network error — check the site URL");
      setStep("error");
    }
  };

  const toggleProject = (key: string) => {
    setSelectedProjects((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleStartIngestion = async () => {
    if (!siteInfo) return;
    if (selectedProjects.length === 0) { setError("Select at least one project"); return; }

    // Persist final project selection and config to the connector record
    try {
      await fetch("/api/connectors/jira/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl: siteInfo.siteUrl,
          email: email.trim(),
          apiToken: apiToken.trim(),
          trackedProjects: selectedProjects,
          dataLookback: lookback,
          fixVersionFilter: fixVersionFilter.trim() || undefined,
        }),
      });
    } catch {
      // Non-fatal — connector was already created in handleValidate
    }

    onConnected(
      {
        siteUrl: siteInfo.siteUrl,
        email: email.trim(),
        apiToken: apiToken.trim(),
        trackedProjects: selectedProjects,
        dataLookback: lookback,
        fixVersionFilter: fixVersionFilter.trim() || undefined,
      },
      siteInfo
    );
    handleClose();
  };

  const handleClose = () => {
    setStep("credentials");
    setSiteUrl("");
    setEmail("");
    setApiToken("");
    setError("");
    setSiteInfo(null);
    setSelectedProjects([]);
    setLookback("6m");
    setFixVersionFilter("");
    setProjectSearch("");
    onClose();
  };

  const filteredProjects = (siteInfo?.projects ?? []).filter(
    (p) =>
      p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
      p.key.toLowerCase().includes(projectSearch.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-2xl bg-card border border-border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔷</span>
            <div>
              <h2 className="text-base font-semibold">Connect Jira</h2>
              <p className="text-xs text-muted">
                {step === "projects"
                  ? `${siteInfo?.siteName} — configure projects & scope`
                  : "Link Jira to track tickets, releases and velocity"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-hover transition-colors text-muted"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        {step === "projects" && (
          <div className="flex items-center gap-2 px-6 py-2.5 bg-surface/50 border-b border-border-subtle shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-success text-white text-[10px] font-bold flex items-center justify-center">✓</span>
              <span className="text-xs text-muted">Credentials</span>
            </div>
            <div className="flex-1 h-px bg-border-subtle mx-1" />
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">2</span>
              <span className="text-xs font-medium">Projects & Data Scope</span>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* ── Step 1: Credentials ── */}
          {(step === "credentials" || step === "validating" || step === "error") && (
            <>
              {/* Site URL */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Jira Site URL
                </label>
                <input
                  type="text"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  placeholder="yourcompany.atlassian.net or https://jira.yourcompany.com"
                  className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-sm placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
                  disabled={step === "validating"}
                />
                <p className="text-[10px] text-muted mt-1">
                  Cloud: <code className="bg-surface px-1 rounded">yourcompany.atlassian.net</code>
                  {" · "}
                  Server/DC: full URL e.g. <code className="bg-surface px-1 rounded">https://jira.example.com</code>
                </p>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Account Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-sm placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
                  disabled={step === "validating"}
                />
              </div>

              {/* API Token */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  API Token
                </label>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="ATATT3xFfGF0..."
                  className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-sm placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
                  disabled={step === "validating"}
                  onKeyDown={(e) => { if (e.key === "Enter") handleValidate(); }}
                />
                <p className="text-[10px] text-muted mt-1">
                  <a
                    href="https://id.atlassian.com/manage-profile/security/api-tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    Create an API token →
                  </a>
                  {" "}Needs <code className="bg-surface px-1 rounded">read:jira-data</code> scope.
                </p>
              </div>

              {error && (
                <div className="rounded-lg bg-danger/5 border border-danger/20 p-3 text-xs text-danger">
                  {error}
                </div>
              )}

              <button
                onClick={handleValidate}
                disabled={step === "validating"}
                className="w-full py-3 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {step === "validating" ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Validating & fetching projects...
                  </>
                ) : step === "error" ? "Try Again" : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Connect Jira
                  </>
                )}
              </button>
            </>
          )}

          {/* ── Step 2: Projects & scope ── */}
          {step === "projects" && siteInfo && (
            <>
              {/* Site summary pill */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/5 border border-success/20">
                <svg className="w-4 h-4 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium text-success">{siteInfo.siteName}</span>
                <span className="text-xs text-muted ml-auto">{siteInfo.projects.length} projects found</span>
              </div>

              {/* Project selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Projects to ingest
                    <span className="ml-1 text-[10px] text-muted font-normal">
                      ({selectedProjects.length} selected)
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedProjects(siteInfo.projects.map((p) => p.key))}
                      className="text-[10px] text-accent hover:underline"
                    >
                      All
                    </button>
                    <span className="text-[10px] text-muted">·</span>
                    <button
                      onClick={() => setSelectedProjects([])}
                      className="text-[10px] text-muted hover:text-foreground"
                    >
                      None
                    </button>
                  </div>
                </div>

                {/* Project search */}
                <div className="relative mb-2">
                  <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    placeholder="Filter projects..."
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-surface border border-border text-xs placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                  />
                </div>

                {/* Project list */}
                <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-surface divide-y divide-border-subtle">
                  {filteredProjects.map((project) => (
                    <label
                      key={project.key}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-hover transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProjects.includes(project.key)}
                        onChange={() => toggleProject(project.key)}
                        className="accent-accent rounded"
                      />
                      <span className="text-xs font-mono font-semibold text-accent w-14 shrink-0">{project.key}</span>
                      <span className="flex-1 text-xs truncate">{project.name}</span>
                      {project.projectType && (
                        <span className="text-[9px] text-muted bg-surface px-1.5 py-0.5 rounded border border-border-subtle shrink-0 capitalize">
                          {project.projectType}
                        </span>
                      )}
                    </label>
                  ))}
                  {filteredProjects.length === 0 && (
                    <div className="px-3 py-4 text-xs text-muted text-center">No projects match</div>
                  )}
                </div>

                {selectedProjects.length === 0 && (
                  <p className="text-[10px] text-danger mt-1">Select at least one project</p>
                )}
              </div>

              {/* Fix version filter */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Fix version filter
                  <span className="ml-1 text-[10px] font-normal text-muted">(optional — for release tracking)</span>
                </label>
                <input
                  type="text"
                  value={fixVersionFilter}
                  onChange={(e) => setFixVersionFilter(e.target.value)}
                  placeholder="e.g. 6.3.4 or 5.11.5-enterprise (leave blank for all)"
                  className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-sm placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
                />
                <p className="text-[10px] text-muted mt-1">
                  When set, only issues with this <code className="bg-surface px-1 rounded">fixVersion</code> are ingested — keeps data focused on your active release.
                  Leave blank to ingest all tickets across the selected projects.
                </p>
              </div>

              {/* Data lookback */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">
                  Data lookback — how far back to pull on first sync
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {LOOKBACK_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                        lookback === opt.value
                          ? "border-accent/50 bg-accent/5"
                          : "border-border-subtle bg-surface hover:bg-surface-hover"
                      }`}
                    >
                      <input
                        type="radio"
                        name="jira-lookback"
                        value={opt.value}
                        checked={lookback === opt.value}
                        onChange={() => setLookback(opt.value)}
                        className="accent-accent"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">{opt.label}</span>
                        <span className="text-[10px] text-muted ml-2">{opt.hint}</span>
                      </div>
                      {opt.value === "6m" && (
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                          Recommended
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              {/* Summary */}
              {selectedProjects.length > 0 && (
                <div className="rounded-lg bg-surface border border-border-subtle p-3 text-xs space-y-1">
                  <div className="font-medium text-foreground mb-1">Ingestion summary</div>
                  <div className="flex justify-between text-muted">
                    <span>Projects</span>
                    <span className="font-mono text-foreground">{selectedProjects.join(", ")}</span>
                  </div>
                  <div className="flex justify-between text-muted">
                    <span>Data window</span>
                    <span className="font-mono text-foreground">
                      {LOOKBACK_OPTIONS.find(o => o.value === lookback)?.label}
                    </span>
                  </div>
                  {fixVersionFilter && (
                    <div className="flex justify-between text-muted">
                      <span>Fix version filter</span>
                      <span className="font-mono text-foreground">{fixVersionFilter}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted">
                    <span>Release tracking</span>
                    <span className="font-mono text-foreground">
                      {fixVersionFilter ? `✓ Enabled (${fixVersionFilter})` : "All issues"}
                    </span>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-danger/5 border border-danger/20 p-3 text-xs text-danger">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setStep("credentials"); setError(""); }}
                  className="flex-1 py-2.5 rounded-xl border border-border text-xs font-medium hover:bg-surface-hover transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={handleStartIngestion}
                  disabled={selectedProjects.length === 0}
                  className="flex-1 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Start Jira Ingestion
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-surface/50 border-t border-border-subtle shrink-0">
          <p className="text-[10px] text-muted text-center">
            {step === "projects"
              ? "Initial sync runs in background. Only issue metadata is read — no attachments or comments."
              : "Credentials are encrypted at rest and used only for data sync."}
          </p>
        </div>
      </div>
    </div>
  );
}
