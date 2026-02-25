"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useWorkspace } from "@/lib/workspace-context";

interface RepoInfo {
  fullName: string;
  name: string;
  description: string | null;
  language: string;
  stars: number;
  forks: number;
  size: number;
  defaultBranch: string;
  isPrivate: boolean;
  openIssues: number;
  updatedAt: string;
  branches?: string[]; // available branches fetched from API
}

export interface GitHubRepoEntry {
  owner: string;
  name: string;
  fullName: string;
  branch?: string;
}

export interface GitHubReleaseConfig {
  /** Which branches to track — e.g. ["release/6.3.4", "release/5.11.5-enterprise"] */
  trackedBranches: string[];
  /**
   * How far back to ingest commits / PRs on first load.
   * "3m" | "6m" | "1y" | "2y" | "all"
   */
  dataLookback: string;
  /** Additional repos to track with the same token */
  repositories?: GitHubRepoEntry[];
}

interface GitHubSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with repo info + release config once user confirms */
  onConnected: (repo: RepoInfo, releaseConfig: GitHubReleaseConfig) => void;
}

type Step = "token" | "validating" | "branches" | "confirmed" | "error";

const LOOKBACK_OPTIONS = [
  { value: "3m",  label: "Last 3 months",  hint: "Fastest — recent work only" },
  { value: "6m",  label: "Last 6 months",  hint: "Recommended for active releases" },
  { value: "1y",  label: "Last 1 year",    hint: "Good for long-lived branches" },
  { value: "2y",  label: "Last 2 years",   hint: "Deep history — slower first sync" },
  { value: "all", label: "All history",    hint: "Full repo — can be very slow on large repos" },
];

export function GitHubSetupModal({
  isOpen,
  onClose,
  onConnected,
}: GitHubSetupModalProps) {
  const { currentWorkspace } = useWorkspace();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalTarget(document.body); }, []);
  const [step, setStep] = useState<Step>("token");
  const [token, setToken] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState("");
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);

  // Multi-repo support
  const [additionalRepos, setAdditionalRepos] = useState<GitHubRepoEntry[]>([]);
  const [additionalRepoInput, setAdditionalRepoInput] = useState("");

  // Branch + lookback config (step 2)
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [lookback, setLookback] = useState("6m");
  const [branchSearch, setBranchSearch] = useState("");

  const parseRepoUrl = useCallback((input: string): { owner: string; repo: string } | null => {
    const cleaned = input.trim().replace(/\/$/, "");
    const urlMatch = cleaned.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)/);
    if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/, "") };
    const slashMatch = cleaned.match(/^([^/\s]+)\/([^/\s]+)$/);
    if (slashMatch) return { owner: slashMatch[1], repo: slashMatch[2] };
    return null;
  }, []);

  const handleAddRepo = () => {
    const inputs = additionalRepoInput.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean);
    const newRepos: GitHubRepoEntry[] = [];
    const invalid: string[] = [];

    for (const input of inputs) {
      const parsed = parseRepoUrl(input);
      if (parsed) {
        const fullName = `${parsed.owner}/${parsed.repo}`;
        // Don't add duplicates or the primary repo
        if (!additionalRepos.some((r) => r.fullName === fullName) &&
            !(repoInfo && repoInfo.fullName === fullName)) {
          newRepos.push({ owner: parsed.owner, name: parsed.repo, fullName });
        }
      } else {
        invalid.push(input);
      }
    }

    if (newRepos.length > 0) {
      setAdditionalRepos((prev) => [...prev, ...newRepos]);
    }
    if (invalid.length > 0) {
      setError(`Could not parse ${invalid.length} entry(s). Use: owner/repo or https://github.com/owner/repo`);
    } else {
      setError("");
    }
    setAdditionalRepoInput("");
  };

  const removeAdditionalRepo = (index: number) => {
    setAdditionalRepos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConnect = async () => {
    if (!token.trim()) { setError("Please enter your GitHub Personal Access Token"); return; }
    if (!repoUrl.trim()) { setError("Please enter a repository URL or owner/repo"); return; }

    // Parse all pasted repo URLs — first valid one is primary, rest become additional repos
    const allLines = repoUrl.split(/[\n,]+/).map(l => l.trim()).filter(Boolean);
    const allParsed = allLines.map(l => parseRepoUrl(l)).filter(Boolean) as { owner: string; repo: string }[];
    if (allParsed.length === 0) { setError("Invalid format. Use: owner/repo or https://github.com/owner/repo"); return; }

    const parsed = allParsed[0];
    // Pre-load additional repos from pasted URLs (skip the primary)
    if (allParsed.length > 1) {
      const extras: GitHubRepoEntry[] = allParsed.slice(1).map(p => ({
        owner: p.owner,
        name: p.repo,
        fullName: `${p.owner}/${p.repo}`,
      }));
      setAdditionalRepos(prev => {
        const existing = new Set(prev.map(r => r.fullName));
        return [...prev, ...extras.filter(e => !existing.has(e.fullName))];
      });
    }

    setError("");
    setStep("validating");

    try {
      const response = await fetch("/api/connectors/github/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), owner: parsed.owner, repo: parsed.repo }),
      });

      const data = await response.json();
      if (!response.ok) { setError(data.error || "Failed to connect to GitHub"); setStep("error"); return; }

      // Fetch branches list from GitHub API directly using the token
      let branches: string[] = [data.repo.defaultBranch];
      try {
        const branchRes = await fetch(
          `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/branches?per_page=100`,
          { headers: { Authorization: `Bearer ${token.trim()}`, Accept: "application/vnd.github.v3+json" } }
        );
        if (branchRes.ok) {
          const branchData = await branchRes.json();
          branches = branchData.map((b: any) => b.name as string);
        }
      } catch {
        // fallback: just default branch
      }

      // Pre-select release/* branches if any exist
      const releaseBranches = branches.filter((b) => b.startsWith("release/"));
      setAvailableBranches(branches);
      setSelectedBranches(
        releaseBranches.length > 0 ? releaseBranches : [data.repo.defaultBranch]
      );
      setRepoInfo({ ...data.repo, branches });
      setStep("branches");
    } catch (err: any) {
      setError("Network error");
      setStep("error");
    }
  };

  const toggleBranch = (branch: string) => {
    setSelectedBranches((prev) =>
      prev.includes(branch) ? prev.filter((b) => b !== branch) : [...prev, branch]
    );
  };

  const handleStartIngestion = () => {
    if (!repoInfo) return;
    if (selectedBranches.length === 0) { setError("Please select at least one branch to track"); return; }
    onConnected(repoInfo, {
      trackedBranches: selectedBranches,
      dataLookback: lookback,
      repositories: additionalRepos.length > 0 ? additionalRepos : undefined,
    });
    handleClose();
  };

  const handleClose = () => {
    setStep("token");
    setToken("");
    setRepoUrl("");
    setError("");
    setRepoInfo(null);
    setAvailableBranches([]);
    setSelectedBranches([]);
    setLookback("6m");
    setBranchSearch("");
    setAdditionalRepos([]);
    setAdditionalRepoInput("");
    onClose();
  };

  const filteredBranches = availableBranches.filter((b) =>
    b.toLowerCase().includes(branchSearch.toLowerCase())
  );

  // Group branches: release/* first, then rest
  const releaseBranches = filteredBranches.filter((b) => b.startsWith("release/"));
  const otherBranches = filteredBranches.filter((b) => !b.startsWith("release/"));

  if (!isOpen || !portalTarget) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-2xl bg-card border border-border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🐙</span>
            <div>
              <h2 className="text-base font-semibold">Connect GitHub</h2>
              <p className="text-xs text-muted">
                {step === "branches" || step === "confirmed"
                  ? `${repoInfo?.fullName} — configure tracking`
                  : "Link a repository to build code intelligence"}
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
        {(step === "branches" || step === "confirmed") && (
          <div className="flex items-center gap-2 px-6 py-2.5 bg-surface/50 border-b border-border-subtle shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-success text-white text-[10px] font-bold flex items-center justify-center">✓</span>
              <span className="text-xs text-muted">Repository</span>
            </div>
            <div className="flex-1 h-px bg-border-subtle mx-1" />
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">2</span>
              <span className="text-xs font-medium">Branches & Data Scope</span>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* ── Step 1: Token + Repo ── */}
          {(step === "token" || step === "validating" || step === "error") && (
            <>
              {/* Token input */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  GitHub Personal Access Token
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-sm placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
                  disabled={step === "validating"}
                />
                <p className="text-[10px] text-muted mt-1">
                  Needs <code className="bg-surface px-1 rounded">repo</code> scope.{" "}
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=BrainOS"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    Create token →
                  </a>
                </p>
              </div>

              {/* Repo URL input — supports multiple repos (one per line or comma-separated) */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Repositories
                  <span className="ml-1 text-[10px] font-normal text-muted">(paste one or more repo URLs)</span>
                </label>
                <textarea
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder={`Paste GitHub repo URLs — one per line or comma-separated\nhttps://github.com/owner/repo1\nhttps://github.com/owner/repo2\nowner/repo3`}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-sm font-mono placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all resize-none"
                  disabled={step === "validating"}
                />
                {/* Preview parsed repos */}
                {(() => {
                  const lines = repoUrl.split(/[\n,]+/).map(l => l.trim()).filter(Boolean);
                  const parsed = lines.map(l => parseRepoUrl(l)).filter(Boolean);
                  if (parsed.length <= 1) return null;
                  return (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {parsed.map((p, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent/5 border border-accent/20 text-[10px] font-mono">
                          {i === 0 && <span className="text-accent font-semibold">Primary</span>}
                          {p!.owner}/{p!.repo}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {error && (
                <div className="rounded-lg bg-danger/5 border border-danger/20 p-3 text-xs text-danger">
                  {error}
                </div>
              )}

              <button
                onClick={handleConnect}
                disabled={step === "validating"}
                className="w-full py-3 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {step === "validating" ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Validating & fetching branches...
                  </>
                ) : step === "error" ? "Try Again" : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Connect Repository
                  </>
                )}
              </button>
            </>
          )}

          {/* ── Step 2: Branch selection + lookback ── */}
          {step === "branches" && repoInfo && (
            <>
              {/* Repo summary pill */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/5 border border-success/20">
                <svg className="w-4 h-4 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium text-success">{repoInfo.fullName}</span>
                <span className="text-xs text-muted ml-auto">{repoInfo.language || "—"} · {(repoInfo.size / 1024).toFixed(0)} MB</span>
              </div>

              {/* Branch selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Branches to track
                    <span className="ml-1 text-[10px] text-muted font-normal">
                      ({selectedBranches.length} selected)
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedBranches(availableBranches.filter(b => b.startsWith("release/")))}
                      className="text-[10px] text-accent hover:underline"
                    >
                      Select release/*
                    </button>
                    <span className="text-[10px] text-muted">·</span>
                    <button
                      onClick={() => setSelectedBranches([])}
                      className="text-[10px] text-muted hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Branch search */}
                <div className="relative mb-2">
                  <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={branchSearch}
                    onChange={(e) => setBranchSearch(e.target.value)}
                    placeholder="Filter branches..."
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-surface border border-border text-xs placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                  />
                </div>

                {/* Branch list */}
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface divide-y divide-border-subtle">
                  {releaseBranches.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted bg-surface/80 sticky top-0">
                        Release branches
                      </div>
                      {releaseBranches.map((branch) => (
                        <BranchRow
                          key={branch}
                          branch={branch}
                          isDefault={branch === repoInfo.defaultBranch}
                          isSelected={selectedBranches.includes(branch)}
                          onToggle={() => toggleBranch(branch)}
                          isRelease
                        />
                      ))}
                    </>
                  )}
                  {otherBranches.length > 0 && (
                    <>
                      {releaseBranches.length > 0 && (
                        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted bg-surface/80 sticky top-0">
                          Other branches
                        </div>
                      )}
                      {otherBranches.map((branch) => (
                        <BranchRow
                          key={branch}
                          branch={branch}
                          isDefault={branch === repoInfo.defaultBranch}
                          isSelected={selectedBranches.includes(branch)}
                          onToggle={() => toggleBranch(branch)}
                        />
                      ))}
                    </>
                  )}
                  {filteredBranches.length === 0 && (
                    <div className="px-3 py-4 text-xs text-muted text-center">No branches match</div>
                  )}
                </div>

                {selectedBranches.length === 0 && (
                  <p className="text-[10px] text-danger mt-1">Select at least one branch</p>
                )}
                <p className="text-[10px] text-muted mt-1">
                  Only selected branches are ingested. <strong>release/*</strong> branches are auto-detected for release tracking.
                </p>
              </div>

              {/* Additional Repositories — multi-repo support */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Additional Repositories
                  <span className="ml-1 text-[10px] font-normal text-muted">(optional — add more repos with the same token)</span>
                </label>

                {/* Existing repos as chips */}
                {additionalRepos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {additionalRepos.map((repo, idx) => (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent/5 border border-accent/20 text-xs group"
                      >
                        <svg className="w-3 h-3 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="text-foreground font-mono font-medium">{repo.fullName}</span>
                        <button
                          onClick={() => removeAdditionalRepo(idx)}
                          className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-danger/10 text-muted hover:text-danger transition-colors ml-0.5"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Multi-line repo input */}
                <div className="flex gap-2">
                  <textarea
                    value={additionalRepoInput}
                    onChange={(e) => setAdditionalRepoInput(e.target.value)}
                    placeholder={`Add more repos — one per line or comma-separated\ne.g. tookitaki/compliance-engine\ne.g. https://github.com/tookitaki/aml-suite`}
                    rows={2}
                    className="flex-1 px-3 py-2 rounded-lg bg-surface border border-border text-xs placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all resize-none font-mono"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleAddRepo();
                      }
                    }}
                  />
                  <button
                    onClick={handleAddRepo}
                    disabled={!additionalRepoInput.trim()}
                    className="px-3 py-2 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs font-medium hover:bg-accent/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed self-end"
                  >
                    + Add
                  </button>
                </div>
                <p className="text-[10px] text-muted mt-1">
                  All repos use the same token. Branch selection above applies to the primary repo ({repoInfo?.fullName}).
                  Additional repos track their default branch. Press <kbd className="bg-surface px-1 rounded border border-border-subtle text-[9px]">⌘ Enter</kbd> to add.
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
                        name="lookback"
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

              {/* Selected summary */}
              {selectedBranches.length > 0 && (
                <div className="rounded-lg bg-surface border border-border-subtle p-3 text-xs space-y-1">
                  <div className="font-medium text-foreground mb-1">Ingestion summary</div>
                  <div className="flex justify-between text-muted">
                    <span>Branches</span>
                    <span className="font-mono text-foreground">{selectedBranches.length}</span>
                  </div>
                  <div className="flex justify-between text-muted">
                    <span>Data window</span>
                    <span className="font-mono text-foreground">
                      {LOOKBACK_OPTIONS.find(o => o.value === lookback)?.label}
                    </span>
                  </div>
                  {additionalRepos.length > 0 && (
                    <div className="flex justify-between text-muted">
                      <span>Total repos</span>
                      <span className="font-mono text-foreground">{1 + additionalRepos.length}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted">
                    <span>Release tracking</span>
                    <span className="font-mono text-foreground">
                      {selectedBranches.filter(b => b.startsWith("release/")).length > 0 ? "✓ Enabled" : "—"}
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
                  onClick={() => { setStep("token"); setError(""); }}
                  className="flex-1 py-2.5 rounded-xl border border-border text-xs font-medium hover:bg-surface-hover transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={handleStartIngestion}
                  disabled={selectedBranches.length === 0}
                  className="flex-1 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Start Brain Ingestion
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-surface/50 border-t border-border-subtle shrink-0">
          <p className="text-[10px] text-muted text-center">
            {step === "branches"
              ? "Initial sync runs in the background. Incremental syncs are fast and run hourly after that."
              : "Your token is encrypted in transit. Only repo metadata and commit/PR activity is read — no source code content."}
          </p>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

/* ── Branch Row sub-component ─────────────────────────────────────────── */

function BranchRow({
  branch,
  isDefault,
  isSelected,
  onToggle,
  isRelease = false,
}: {
  branch: string;
  isDefault: boolean;
  isSelected: boolean;
  onToggle: () => void;
  isRelease?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-hover transition-colors">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="accent-accent rounded"
      />
      <span className="flex-1 text-xs font-mono truncate">{branch}</span>
      <div className="flex items-center gap-1 shrink-0">
        {isRelease && (
          <span className="text-[9px] font-semibold uppercase tracking-wider text-brain-training bg-brain-training/10 px-1.5 py-0.5 rounded">
            Release
          </span>
        )}
        {isDefault && (
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted bg-surface px-1.5 py-0.5 rounded border border-border-subtle">
            Default
          </span>
        )}
      </div>
    </label>
  );
}
