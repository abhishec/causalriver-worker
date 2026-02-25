"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

const STEPS = [
  { id: 1, label: "AI Worker" },
  { id: 2, label: "Connect Data" },
  { id: 3, label: "Initializing" },
  { id: 4, label: "First Results" },
];

const CONNECTORS = [
  { id: "slack", name: "Slack", icon: "#", color: "bg-purple-500/20 text-purple-400" },
  { id: "hubspot", name: "HubSpot", icon: "H", color: "bg-orange-500/20 text-orange-400" },
  { id: "github", name: "GitHub", icon: "G", color: "bg-zinc-500/20 text-zinc-300" },
  { id: "stripe", name: "Stripe", icon: "S", color: "bg-indigo-500/20 text-indigo-400" },
];

const INDUSTRIES = [
  "SaaS", "E-commerce", "FinTech", "HealthTech", "EdTech", "MarketPlace", "Agency", "Other",
];

const SUGGESTED_QUESTIONS = [
  "What patterns can you find in my data?",
  "What are the key causal relationships?",
  "Where are the biggest risks right now?",
  "What should I focus on this week?",
];

// Provisioning status labels mapped to progress ranges
const PROVISION_STAGES = [
  { threshold: 0, label: "Initializing brain regions..." },
  { threshold: 15, label: "Setting up storage..." },
  { threshold: 35, label: "Registering connectors..." },
  { threshold: 55, label: "Configuring federation..." },
  { threshold: 70, label: "Scheduling autonomous learning..." },
  { threshold: 85, label: "Calibrating models..." },
  { threshold: 95, label: "Ready!" },
];

function getProvisionLabel(progress: number): string {
  let label = PROVISION_STAGES[0].label;
  for (const stage of PROVISION_STAGES) {
    if (progress >= stage.threshold) label = stage.label;
  }
  return label;
}

// ── GitHub repo type ────────────────────────────────────────────────────────
interface GitHubRepo {
  full_name: string;
  name: string;
  description: string | null;
  language: string | null;
  default_branch: string;
  private: boolean;
  stars: number;
  updated_at: string;
  owner: string;
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [industry, setIndustry] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [brainProgress, setBrainProgress] = useState(0);
  const [provisionDone, setProvisionDone] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [isDesignPartner, setIsDesignPartner] = useState(false);

  // GitHub inline OAuth states
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubUser, setGithubUser] = useState<{ login: string; name?: string; avatar?: string } | null>(null);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [repoSearch, setRepoSearch] = useState("");
  const [loadingRepos, setLoadingRepos] = useState(false);

  // Step 4 real results
  const [firstResults, setFirstResults] = useState<{
    prCount?: number;
    signalCount?: number;
    findingCount?: number;
    topFindings?: Array<{ type: string; summary: string }>;
  } | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  const provisionStarted = useRef(false);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "there");
    }
    getUser();
  }, [supabase, router]);

  // ── Listen for GitHub popup OAuth callback ──────────────────────────
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "github-connected") {
        setGithubConnected(true);
        setGithubUser({
          login: event.data.login,
          name: event.data.name,
          avatar: event.data.avatar,
        });
        // Auto-fetch repos after connection
        fetchRepos();
      }
      if (event.data?.type === "github-error") {
        setError(`GitHub connection failed: ${event.data.error || "Unknown error"}`);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── GitHub OAuth popup launcher ─────────────────────────────────────
  function openGitHubOAuth() {
    const popup = window.open(
      "/api/connectors/github/auth?returnMode=popup",
      "github-oauth",
      "width=600,height=700,scrollbars=yes"
    );
    if (!popup) {
      setError("Popup blocked — please allow popups for this site and try again.");
    }
  }

  // ── Fetch repos from GitHub ─────────────────────────────────────────
  async function fetchRepos() {
    setLoadingRepos(true);
    try {
      const res = await fetch("/api/connectors/github/repos");
      if (res.ok) {
        const data = await res.json();
        setGithubRepos(data.repos || []);
      }
    } catch {
      logger.warn("[Onboarding] Failed to fetch repos");
    } finally {
      setLoadingRepos(false);
    }
  }

  // ── Real provisioning call (Step 3) ─────────────────────────────
  const runProvisioning = useCallback(async () => {
    if (!orgId || provisionStarted.current) return;
    provisionStarted.current = true;
    setProvisionError(null);

    // Start smooth progress animation (0 → 90 over ~4s)
    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      currentProgress = Math.min(currentProgress + 2, 90);
      setBrainProgress(currentProgress);
    }, 100);

    try {
      const response = await fetch("/api/org/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          selectedConnectors,
          isDesignPartner,
          selectedRepos,
        }),
      });

      const result = await response.json();

      clearInterval(progressInterval);

      if (!response.ok || !result.success) {
        const errorMsg = result.errors?.length > 0
          ? result.errors.join("; ")
          : result.error || "Provisioning failed";
        logger.warn("[Onboarding] Provision partial/failed:", errorMsg);

        if (result.provisioned?.brain_cortex_state || result.provisioned?.s3_connector) {
          setBrainProgress(100);
          setProvisionDone(true);
        } else {
          setProvisionError(errorMsg);
          setBrainProgress(0);
          provisionStarted.current = false;
        }
        return;
      }

      setBrainProgress(100);
      setProvisionDone(true);

      logger.debug("[Onboarding] Provisioning complete:", result.provisioned);
    } catch (err) {
      clearInterval(progressInterval);
      const msg = err instanceof Error ? err.message : "Network error";
      setProvisionError(msg);
      setBrainProgress(0);
      provisionStarted.current = false;
      logger.error("[Onboarding] Provision error:", err);
    }
  }, [orgId, selectedConnectors, isDesignPartner, selectedRepos]);

  // Trigger provisioning when entering Step 3
  useEffect(() => {
    if (step === 3) {
      runProvisioning();
    }
  }, [step, runProvisioning]);

  // Auto-advance from step 3 after provisioning completes
  useEffect(() => {
    if (step === 3 && provisionDone && brainProgress >= 100) {
      const timer = setTimeout(() => setStep(4), 1500);
      return () => clearTimeout(timer);
    }
  }, [step, provisionDone, brainProgress]);

  // ── Fetch first results for Step 4 ──────────────────────────────────
  useEffect(() => {
    if (step !== 4 || !githubConnected || !orgId || loadingResults) return;

    async function loadFirstResults() {
      setLoadingResults(true);
      try {
        // Fetch initial data from velocity & bottleneck snapshots
        const [velRes, artRes] = await Promise.all([
          supabase
            .from("velocity_snapshots")
            .select("prs_merged", { count: "exact", head: false })
            .eq("organization_id", orgId!)
            .limit(1)
            .maybeSingle(),
          supabase
            .from("se_aas_artifacts")
            .select("id, domain_type, artifact_data", { count: "exact", head: false })
            .eq("organization_id", orgId!)
            .order("created_at", { ascending: false })
            .limit(3),
        ]);

        const prCount = velRes.data?.prs_merged ?? 0;
        const artCount = artRes.count ?? 0;
        const topFindings = (artRes.data ?? []).map((a: any) => ({
          type: a.domain_type,
          summary:
            a.artifact_data?.narrative ??
            a.artifact_data?.summary ??
            a.artifact_data?.answer ??
            "Artifact generated",
        }));

        setFirstResults({
          prCount,
          signalCount: artCount,
          findingCount: topFindings.length,
          topFindings,
        });
      } catch {
        // Silently fail — Step 4 shows fallback UI
      } finally {
        setLoadingResults(false);
      }
    }

    loadFirstResults();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, githubConnected]);

  async function handleOrgSubmit() {
    if (!orgName.trim()) {
      setError("Name is required");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: membership, error: memberError } = await supabase
        .from("org_members")
        .select("organization_id, organizations(id, name, slug)")
        .eq("user_id", user.id)
        .eq("role", "owner")
        .single();

      if (memberError) throw memberError;

      const currentOrgId = membership.organization_id;
      setOrgId(currentOrgId);

      const newSlug =
        orgName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") +
        "-" + user.id.substring(0, 8);

      const { error: updateError } = await supabase
        .from("organizations")
        .update({ name: orgName.trim(), slug: newSlug })
        .eq("id", currentOrgId);

      if (updateError) throw updateError;

      await supabase.auth.updateUser({
        data: { industry, team_size: teamSize },
      });

      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleFinish() {
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { onboarding_complete: true, org_name: orgName.trim() },
      });
      if (error) {
        logger.warn("[Onboarding] updateUser failed:", error.message);
      }
      // Refresh session so middleware sees updated user_metadata immediately
      // Without this, middleware still sees onboarding_complete=false and redirects back
      await supabase.auth.refreshSession();
      router.push("/dashboard");
    } catch {
      // Even on failure, attempt to proceed — user can retry from dashboard
      router.push("/dashboard");
    }
  }

  function toggleConnector(id: string) {
    setSelectedConnectors((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  function toggleRepo(fullName: string) {
    setSelectedRepos((prev) =>
      prev.includes(fullName) ? prev.filter((r) => r !== fullName) : [...prev, fullName]
    );
  }

  const filteredRepos = githubRepos.filter((r) =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase()) ||
    (r.description ?? "").toLowerCase().includes(repoSearch.toLowerCase())
  );

  return (
    <div className="w-full">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-2 mb-6">
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
          <span className="text-lg font-bold text-accent">N</span>
        </div>
        <span className="text-lg font-semibold">Brain OS</span>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all",
                step > s.id ? "bg-success text-white" : step === s.id ? "bg-accent text-white" : "bg-surface border border-border text-muted"
              )}
            >
              {step > s.id ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : s.id}
            </div>
            <span className={cn("text-xs hidden sm:inline", step >= s.id ? "text-foreground" : "text-muted")}>{s.label}</span>
            {i < STEPS.length - 1 && <div className={cn("w-8 h-px", step > s.id ? "bg-success" : "bg-border")} />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">{error}</div>
      )}

      {/* ── Step 1: Workspace Setup ─────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold mb-1">Welcome, {userName}!</h2>
            <p className="text-muted">Set up your workspace to get started.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="org" className="block text-sm font-medium mb-1.5">Workspace name</label>
              <input id="org" type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Inc." className="w-full px-4 py-2.5 rounded-lg bg-input border border-input-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-input-focus transition-colors" required autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Industry</label>
              <div className="flex flex-wrap gap-2">
                {INDUSTRIES.map((ind) => (
                  <button key={ind} type="button" onClick={() => setIndustry(ind)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors", industry === ind ? "bg-accent/10 border-accent/30 text-accent" : "border-border text-muted hover:text-foreground")}>{ind}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Team size</label>
              <select value={teamSize} onChange={(e) => setTeamSize(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-input border border-input-border text-foreground focus:outline-none focus:ring-2 focus:ring-input-focus">
                <option value="">Select team size</option>
                <option value="1-5">1-5</option>
                <option value="6-20">6-20</option>
                <option value="21-50">21-50</option>
                <option value="51-200">51-200</option>
                <option value="200+">200+</option>
              </select>
            </div>

            {/* Design Partner toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-surface border border-border-subtle">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium">Design Partner</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent border border-accent/20">Beta</span>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  Get early access to all features, activation tracking, and direct product feedback channels.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDesignPartner(!isDesignPartner)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background ml-4",
                  isDesignPartner ? "bg-accent" : "bg-surface-raised"
                )}
                role="switch"
                aria-checked={isDesignPartner}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    isDesignPartner ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          </div>
          <button onClick={handleOrgSubmit} disabled={loading || !orgName.trim()} className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground font-medium transition-colors disabled:opacity-50">{loading ? "Setting up..." : "Continue"}</button>
        </div>
      )}

      {/* ── Step 2: Connect Data Sources + GitHub Inline OAuth ──────────── */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold mb-1">Connect Your Data</h2>
            <p className="text-muted">Choose data sources to feed your AI Worker. You can add more later.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {CONNECTORS.map((conn) => {
              const isGH = conn.id === "github";
              const isSelected = selectedConnectors.includes(conn.id);

              return (
                <button
                  key={conn.id}
                  onClick={() => {
                    toggleConnector(conn.id);
                    // If selecting GitHub and not yet connected, trigger OAuth
                    if (isGH && !isSelected && !githubConnected) {
                      openGitHubOAuth();
                    }
                  }}
                  className={cn(
                    "p-4 rounded-xl border text-left transition-all relative",
                    isSelected ? "border-accent bg-accent/5" : "border-border-subtle hover:border-border",
                    isGH && githubConnected ? "border-success/40 bg-success/5" : ""
                  )}
                >
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold mb-3", conn.color)}>{conn.icon}</div>
                  <span className="text-sm font-medium">{conn.name}</span>
                  {isGH && githubConnected ? (
                    <div className="mt-1 flex items-center gap-1.5">
                      <svg className="w-3 h-3 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-[10px] text-success font-medium">
                        Connected as {githubUser?.login}
                      </span>
                    </div>
                  ) : isSelected ? (
                    <div className="mt-1 text-[10px] text-accent">Selected</div>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* ── GitHub Repo Picker (inline when connected) ──────────── */}
          {githubConnected && selectedConnectors.includes("github") && (
            <div className="rounded-xl bg-surface border border-border-subtle p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Select Repositories</span>
                  <span className="text-[10px] text-muted">{githubRepos.length} available</span>
                </div>
                {selectedRepos.length > 0 && (
                  <span className="text-[10px] text-accent font-medium">{selectedRepos.length} selected</span>
                )}
              </div>

              {/* Search */}
              <input
                type="text"
                value={repoSearch}
                onChange={(e) => setRepoSearch(e.target.value)}
                placeholder="Search repositories..."
                className="w-full px-3 py-2 rounded-lg bg-input border border-input-border text-foreground placeholder:text-muted text-sm focus:outline-none focus:ring-2 focus:ring-input-focus transition-colors"
              />

              {/* Repo list */}
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {loadingRepos ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                    <span className="ml-2 text-xs text-muted">Loading repositories...</span>
                  </div>
                ) : filteredRepos.length === 0 ? (
                  <p className="text-xs text-muted text-center py-4">No repositories found</p>
                ) : (
                  filteredRepos.map((repo) => (
                    <button
                      key={repo.full_name}
                      onClick={() => toggleRepo(repo.full_name)}
                      className={cn(
                        "w-full flex items-start gap-3 p-2.5 rounded-lg border text-left transition-all",
                        selectedRepos.includes(repo.full_name)
                          ? "border-accent/40 bg-accent/5"
                          : "border-transparent hover:bg-surface-hover"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors",
                        selectedRepos.includes(repo.full_name) ? "bg-accent border-accent" : "border-border"
                      )}>
                        {selectedRepos.includes(repo.full_name) && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{repo.name}</span>
                          {repo.private && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-surface-raised border border-border-subtle text-muted">Private</span>
                          )}
                          {repo.language && (
                            <span className="text-[10px] text-muted">{repo.language}</span>
                          )}
                        </div>
                        {repo.description && (
                          <p className="text-xs text-muted truncate mt-0.5">{repo.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted font-mono">{repo.default_branch}</span>
                          <span className="text-[10px] text-muted">{repo.owner}</span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="flex-1 py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground font-medium transition-colors">
              {selectedConnectors.length > 0 ? `Connect ${selectedConnectors.length} Source${selectedConnectors.length > 1 ? "s" : ""}` : "Continue"}
            </button>
            <button onClick={() => setStep(3)} className="px-4 py-2.5 rounded-lg border border-border hover:bg-surface-hover text-sm text-muted transition-colors">Skip</button>
          </div>
        </div>
      )}

      {/* ── Step 3: Brain Provisioning (REAL — calls /api/org/provision) ── */}
      {step === 3 && (
        <div className="space-y-6 text-center">
          <div className="relative mx-auto w-32 h-32">
            <div className={cn("absolute inset-0 rounded-full bg-accent/10", provisionError ? "" : "animate-pulse")} />
            <div className="absolute inset-2 rounded-full bg-accent/20 flex items-center justify-center">
              <span className="text-5xl font-bold text-accent">N</span>
            </div>
            {!provisionError && (
              <>
                <div className="absolute -top-1 right-2 w-3 h-3 rounded-full bg-success animate-ping" style={{ animationDuration: "2s" }} />
                <div className="absolute bottom-2 -left-1 w-2 h-2 rounded-full bg-warning animate-ping" style={{ animationDuration: "3s" }} />
              </>
            )}
            {provisionError && (
              <div className="absolute -top-1 right-2 w-3 h-3 rounded-full bg-danger" />
            )}
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-1">
              {provisionError ? "Provisioning Issue" : provisionDone ? "Brain is Ready!" : "Provisioning Your Brain"}
            </h2>
            <p className="text-muted">
              {provisionError
                ? "Something went wrong. You can retry."
                : provisionDone
                  ? "Storage, connectors, and learning schedules are all set."
                  : "Setting up storage, connectors, federation, and learning schedules..."}
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-xs mx-auto">
            <div className="h-2 rounded-full bg-surface overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-200",
                  provisionError
                    ? "bg-danger"
                    : "bg-gradient-to-r from-accent to-success"
                )}
                style={{ width: `${brainProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-muted">
              <span>{provisionError ? "Failed" : getProvisionLabel(brainProgress)}</span>
              <span>{brainProgress}%</span>
            </div>
          </div>

          {/* Provision details (checklist) */}
          {(brainProgress > 20 || provisionDone) && !provisionError && (
            <div className="max-w-xs mx-auto text-left space-y-1.5">
              {[
                { label: "Brain cortex state", done: brainProgress > 30 },
                { label: "S3 storage prefix", done: brainProgress > 45 },
                { label: "Connector registry", done: brainProgress > 60 },
                ...(githubConnected ? [{ label: "GitHub connected", done: true }] : []),
                { label: "Federation to Core Brain", done: brainProgress > 75 },
                { label: "Learning schedules", done: brainProgress > 88 },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  {item.done ? (
                    <svg className="w-3.5 h-3.5 text-success flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-border animate-spin flex-shrink-0">
                      <div className="w-1 h-1 rounded-full bg-accent mt-0.5 ml-0.5" />
                    </div>
                  )}
                  <span className={item.done ? "text-foreground" : "text-muted"}>{item.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Error + retry */}
          {provisionError && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm text-left max-w-xs mx-auto">
                {provisionError}
              </div>
              <button
                onClick={() => {
                  setProvisionError(null);
                  setBrainProgress(0);
                  provisionStarted.current = false;
                  runProvisioning();
                }}
                className="px-6 py-2.5 rounded-lg bg-accent text-accent-foreground font-medium transition-colors hover:bg-accent-dark"
              >
                Retry
              </button>
            </div>
          )}

          {/* Success button */}
          {provisionDone && brainProgress >= 100 && (
            <button onClick={() => setStep(4)} className="px-6 py-2.5 rounded-lg bg-success text-white font-medium transition-colors hover:bg-success/90">
              Causal memory is ready!
            </button>
          )}
        </div>
      )}

      {/* ── Step 4: First Results / First Question ─────────────────────── */}
      {step === 4 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold mb-1">
              {githubConnected && firstResults ? "Your First Insights" : "Ask Your First Question"}
            </h2>
            <p className="text-muted">
              {githubConnected && firstResults
                ? "Here's what Brain OS found from your connected data."
                : "Try asking Brain OS something. You can always explore more later."}
            </p>
          </div>

          {/* Real results if GitHub connected */}
          {githubConnected && firstResults ? (
            <>
              {/* Stats strip */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "PRs Analyzed", value: firstResults.prCount ?? 0, icon: "🔍" },
                  { label: "Signals Found", value: firstResults.signalCount ?? 0, icon: "⚡" },
                  { label: "Findings", value: firstResults.findingCount ?? 0, icon: "💡" },
                ].map((stat) => (
                  <div key={stat.label} className="p-3 rounded-xl bg-surface border border-border-subtle text-center">
                    <span className="text-lg">{stat.icon}</span>
                    <div className="text-xl font-bold tabular-nums mt-1">{stat.value}</div>
                    <div className="text-[10px] text-muted mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Top findings */}
              {firstResults.topFindings && firstResults.topFindings.length > 0 && (
                <div className="rounded-xl bg-surface border border-border-subtle divide-y divide-border-subtle">
                  {firstResults.topFindings.map((finding, i) => (
                    <div key={i} className="flex items-start gap-3 p-3.5">
                      <div className="w-6 h-6 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-xs shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-mono text-accent">{finding.type}</span>
                        <p className="text-sm text-muted leading-relaxed mt-0.5 line-clamp-2">{finding.summary}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* CTA to dashboard */}
              <button
                onClick={handleFinish}
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? "Launching..." : (
                  <>
                    Open Engineering Dashboard
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              {/* Fallback: suggested questions */}
              <div className="space-y-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button key={q} onClick={() => setSelectedQuestion(q)} className={cn("w-full text-left px-4 py-3 rounded-lg border text-sm transition-all", selectedQuestion === q ? "border-accent bg-accent/5 text-foreground" : "border-border-subtle text-muted-foreground hover:border-border hover:text-foreground")}>{q}</button>
                ))}
              </div>
              {selectedQuestion && (
                <div className="p-4 rounded-lg bg-surface border border-border-subtle">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    <span className="text-xs text-success font-medium">Brain OS thinking...</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Great question! Once your data sources are connected and signals start flowing, the AI Worker will discover cause-and-effect relationships. Head to the Copilot to explore.
                  </p>
                </div>
              )}
              <button onClick={handleFinish} disabled={loading} className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground font-medium transition-colors disabled:opacity-50">{loading ? "Launching..." : "Launch Brain OS"}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
