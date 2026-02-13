"use client";

import { useState, useCallback } from "react";
import { useOrg } from "@/lib/org-context";

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
}

interface GitHubSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: (repo: RepoInfo) => void;
}

type Step = "token" | "validating" | "confirmed" | "error";

export function GitHubSetupModal({
  isOpen,
  onClose,
  onConnected,
}: GitHubSetupModalProps) {
  const { currentOrg } = useOrg();
  const [step, setStep] = useState<Step>("token");
  const [token, setToken] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState("");
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);

  const parseRepoUrl = useCallback((input: string): { owner: string; repo: string } | null => {
    // Support formats:
    // https://github.com/calcom/cal.com
    // github.com/calcom/cal.com
    // calcom/cal.com
    const cleaned = input.trim().replace(/\/$/, "");

    // Full URL
    const urlMatch = cleaned.match(
      /(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)/
    );
    if (urlMatch) {
      return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/, "") };
    }

    // owner/repo format
    const slashMatch = cleaned.match(/^([^/\s]+)\/([^/\s]+)$/);
    if (slashMatch) {
      return { owner: slashMatch[1], repo: slashMatch[2] };
    }

    return null;
  }, []);

  const handleConnect = async () => {
    if (!token.trim()) {
      setError("Please enter your GitHub Personal Access Token");
      return;
    }
    if (!repoUrl.trim()) {
      setError("Please enter a repository URL or owner/repo");
      return;
    }

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      setError(
        "Invalid repository format. Use: owner/repo or https://github.com/owner/repo"
      );
      return;
    }

    setError("");
    setStep("validating");

    try {
      const response = await fetch("/api/connectors/github/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          owner: parsed.owner,
          repo: parsed.repo,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to connect to GitHub");
        setStep("error");
        return;
      }

      setRepoInfo(data.repo);
      setStep("confirmed");
    } catch (err: any) {
      setError(err.message || "Network error");
      setStep("error");
    }
  };

  const handleStartIngestion = async () => {
    if (repoInfo) {
      onConnected(repoInfo);
    }
    handleClose();
  };

  const handleClose = () => {
    setStep("token");
    setToken("");
    setRepoUrl("");
    setError("");
    setRepoInfo(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🐙</span>
            <div>
              <h2 className="text-base font-semibold">Connect GitHub</h2>
              <p className="text-xs text-muted">
                Link a repository to build code intelligence
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

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {step === "confirmed" && repoInfo ? (
            /* Success state */
            <div className="space-y-4">
              <div className="rounded-xl bg-success/5 border border-success/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium text-success">
                    Repository Connected
                  </span>
                </div>
                <h3 className="text-lg font-semibold mb-1">{repoInfo.fullName}</h3>
                {repoInfo.description && (
                  <p className="text-xs text-muted mb-3">{repoInfo.description}</p>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-muted">Language</div>
                    <div className="text-sm font-medium">{repoInfo.language || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Stars</div>
                    <div className="text-sm font-medium">
                      {repoInfo.stars.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Size</div>
                    <div className="text-sm font-medium">
                      {(repoInfo.size / 1024).toFixed(0)} MB
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Branch</div>
                    <div className="text-sm font-medium">{repoInfo.defaultBranch}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Open Issues</div>
                    <div className="text-sm font-medium">
                      {repoInfo.openIssues.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Visibility</div>
                    <div className="text-sm font-medium">
                      {repoInfo.isPrivate ? "Private" : "Public"}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleStartIngestion}
                className="w-full py-3 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Start Brain Ingestion
              </button>
            </div>
          ) : (
            /* Input state */
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
                    href="https://github.com/settings/tokens/new?scopes=repo&description=NexusBrain"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    Create token →
                  </a>
                </p>
              </div>

              {/* Repo URL input */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Repository
                </label>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="calcom/cal.com or https://github.com/calcom/cal.com"
                  className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-sm placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
                  disabled={step === "validating"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConnect();
                  }}
                />
              </div>

              {/* Error message */}
              {error && (
                <div className="rounded-lg bg-danger/5 border border-danger/20 p-3 text-xs text-danger">
                  {error}
                </div>
              )}

              {/* Connect button */}
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
                    Validating...
                  </>
                ) : step === "error" ? (
                  "Try Again"
                ) : (
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
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 bg-surface/50 border-t border-border/30">
          <p className="text-[10px] text-muted text-center">
            Your token is validated but not stored in the database. It will be needed again for sync operations.
          </p>
        </div>
      </div>
    </div>
  );
}
