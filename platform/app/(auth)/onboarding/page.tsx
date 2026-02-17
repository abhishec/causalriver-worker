"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Organization" },
  { id: 2, label: "Connect Data" },
  { id: 3, label: "Initializing" },
  { id: 4, label: "First Question" },
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
        }),
      });

      const result = await response.json();

      clearInterval(progressInterval);

      if (!response.ok || !result.success) {
        // Partial success — show what was provisioned but flag the error
        const errorMsg = result.errors?.length > 0
          ? result.errors.join("; ")
          : result.error || "Provisioning failed";
        console.warn("[Onboarding] Provision partial/failed:", errorMsg);

        // Still allow continuing if at least some things provisioned
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

      // Full success — animate to 100%
      setBrainProgress(100);
      setProvisionDone(true);

      console.log("[Onboarding] Provisioning complete:", result.provisioned);
    } catch (err) {
      clearInterval(progressInterval);
      const msg = err instanceof Error ? err.message : "Network error";
      setProvisionError(msg);
      setBrainProgress(0);
      provisionStarted.current = false;
      console.error("[Onboarding] Provision error:", err);
    }
  }, [orgId, selectedConnectors]);

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

  async function handleOrgSubmit() {
    if (!orgName.trim()) {
      setError("Organization name is required");
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
      await supabase.auth.updateUser({
        data: { onboarding_complete: true, org_name: orgName.trim() },
      });
      router.push("/overview");
    } catch {
      router.push("/overview");
    }
  }

  function toggleConnector(id: string) {
    setSelectedConnectors((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  return (
    <div className="w-full">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-2 mb-6">
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
          <span className="text-lg font-bold text-accent">N</span>
        </div>
        <span className="text-lg font-semibold">NexusBrain</span>
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

      {/* Step 1: Organization Setup */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold mb-1">Welcome, {userName}!</h2>
            <p className="text-muted">Set up your organization to get started.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="org" className="block text-sm font-medium mb-1.5">Organization name</label>
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
          </div>
          <button onClick={handleOrgSubmit} disabled={loading || !orgName.trim()} className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground font-medium transition-colors disabled:opacity-50">{loading ? "Setting up..." : "Continue"}</button>
        </div>
      )}

      {/* Step 2: Connect Data Sources */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold mb-1">Connect Your Data</h2>
            <p className="text-muted">Choose data sources to feed the causal memory. You can add more later.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {CONNECTORS.map((conn) => (
              <button key={conn.id} onClick={() => toggleConnector(conn.id)} className={cn("p-4 rounded-xl border text-left transition-all", selectedConnectors.includes(conn.id) ? "border-accent bg-accent/5" : "border-border-subtle hover:border-border")}>
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold mb-3", conn.color)}>{conn.icon}</div>
                <span className="text-sm font-medium">{conn.name}</span>
                {selectedConnectors.includes(conn.id) && <div className="mt-1 text-[10px] text-accent">Selected</div>}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="flex-1 py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground font-medium transition-colors">
              {selectedConnectors.length > 0 ? `Connect ${selectedConnectors.length} Source${selectedConnectors.length > 1 ? "s" : ""}` : "Continue"}
            </button>
            <button onClick={() => setStep(3)} className="px-4 py-2.5 rounded-lg border border-border hover:bg-surface-hover text-sm text-muted transition-colors">Skip</button>
          </div>
        </div>
      )}

      {/* Step 3: Brain Provisioning (REAL — calls /api/org/provision) */}
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

      {/* Step 4: First Question */}
      {step === 4 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold mb-1">Ask Your First Question</h2>
            <p className="text-muted">Try asking NexusBrain something. You can always explore more later.</p>
          </div>
          <div className="space-y-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button key={q} onClick={() => setSelectedQuestion(q)} className={cn("w-full text-left px-4 py-3 rounded-lg border text-sm transition-all", selectedQuestion === q ? "border-accent bg-accent/5 text-foreground" : "border-border-subtle text-muted-foreground hover:border-border hover:text-foreground")}>{q}</button>
            ))}
          </div>
          {selectedQuestion && (
            <div className="p-4 rounded-lg bg-surface border border-border-subtle">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-xs text-success font-medium">NexusBrain thinking...</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Great question! Once your data sources are connected and signals start flowing, the causal memory will discover cause-and-effect relationships. Head to the Copilot to explore.
              </p>
            </div>
          )}
          <button onClick={handleFinish} disabled={loading} className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground font-medium transition-colors disabled:opacity-50">{loading ? "Launching..." : "Launch NexusBrain"}</button>
        </div>
      )}
    </div>
  );
}
