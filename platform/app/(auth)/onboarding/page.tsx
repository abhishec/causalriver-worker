"use client";

import { useState, useEffect } from "react";
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

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState("");
  const [industry, setIndustry] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [brainProgress, setBrainProgress] = useState(0);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);

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

  // Brain waking animation (step 3)
  useEffect(() => {
    if (step !== 3) return;
    setBrainProgress(0);
    const interval = setInterval(() => {
      setBrainProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 2;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [step]);

  // Auto-advance from step 3 after completion
  useEffect(() => {
    if (step === 3 && brainProgress >= 100) {
      const timer = setTimeout(() => setStep(4), 1500);
      return () => clearTimeout(timer);
    }
  }, [step, brainProgress]);

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

      const orgId = membership.organization_id;
      const newSlug =
        orgName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") +
        "-" + user.id.substring(0, 8);

      const { error: updateError } = await supabase
        .from("organizations")
        .update({ name: orgName.trim(), slug: newSlug })
        .eq("id", orgId);

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
              <button key={conn.id} onClick={() => toggleConnector(conn.id)} className={cn("p-4 rounded-xl border text-left transition-all", selectedConnectors.includes(conn.id) ? "border-accent bg-accent/5" : "border-border/50 hover:border-border")}>
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

      {/* Step 3: Brain Waking Up */}
      {step === 3 && (
        <div className="space-y-6 text-center">
          <div className="relative mx-auto w-32 h-32">
            <div className="absolute inset-0 rounded-full bg-accent/10 animate-pulse" />
            <div className="absolute inset-2 rounded-full bg-accent/20 flex items-center justify-center">
              <span className="text-5xl font-bold text-accent">N</span>
            </div>
            <div className="absolute -top-1 right-2 w-3 h-3 rounded-full bg-success animate-ping" style={{ animationDuration: "2s" }} />
            <div className="absolute bottom-2 -left-1 w-2 h-2 rounded-full bg-warning animate-ping" style={{ animationDuration: "3s" }} />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-1">Your Causal Memory is Initializing</h2>
            <p className="text-muted">Activating brain regions and establishing causal connections...</p>
          </div>
          <div className="w-full max-w-xs mx-auto">
            <div className="h-2 rounded-full bg-surface overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-accent to-success transition-all duration-200" style={{ width: `${brainProgress}%` }} />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-muted">
              <span>{brainProgress < 30 ? "Activating regions..." : brainProgress < 60 ? "Building connections..." : brainProgress < 90 ? "Calibrating models..." : "Ready!"}</span>
              <span>{brainProgress}%</span>
            </div>
          </div>
          {brainProgress >= 100 && (
            <button onClick={() => setStep(4)} className="px-6 py-2.5 rounded-lg bg-success text-white font-medium transition-colors hover:bg-success/90">Causal memory is ready!</button>
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
              <button key={q} onClick={() => setSelectedQuestion(q)} className={cn("w-full text-left px-4 py-3 rounded-lg border text-sm transition-all", selectedQuestion === q ? "border-accent bg-accent/5 text-foreground" : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground")}>{q}</button>
            ))}
          </div>
          {selectedQuestion && (
            <div className="p-4 rounded-lg bg-surface border border-border/30">
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
