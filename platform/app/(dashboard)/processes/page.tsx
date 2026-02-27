"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { BPAAS_PROCESS_TYPES, type BPaaSProcessType } from "@/lib/bpaas/process-registry";

/* ── Process template metadata (UI display only) ─────────────────────── */

const PROCESS_META: Record<BPaaSProcessType, {
  name: string;
  description: string;
  icon: string;
  category: string;
  complexity: "low" | "medium" | "high";
}> = {
  hr_offboarding: {
    name: "HR Employee Offboarding",
    description: "End-to-end employee offboarding with PTO, severance, equity handling, and system access revocation.",
    icon: "👤",
    category: "HR",
    complexity: "medium",
  },
  procurement: {
    name: "Procurement Request",
    description: "Purchase order processing with vendor vetting, amount-based approval routing, and policy enforcement.",
    icon: "🛒",
    category: "Finance",
    complexity: "medium",
  },
  order_management: {
    name: "Order Modification",
    description: "Customer order changes with refund or charge recalculation and downstream notifications.",
    icon: "📦",
    category: "Operations",
    complexity: "low",
  },
  expense_approval: {
    name: "Expense Approval",
    description: "Employee expense claim processing with receipt validation and policy enforcement.",
    icon: "🧾",
    category: "Finance",
    complexity: "low",
  },
  customer_onboarding: {
    name: "Customer Onboarding",
    description: "New customer KYC, account provisioning, and welcome communications with compliance checks.",
    icon: "🤝",
    category: "Operations",
    complexity: "medium",
  },
  insurance_claim: {
    name: "Insurance Claim Processing",
    description: "End-to-end claim evaluation with fraud detection, coverage sublimits, and partial approval.",
    icon: "🏥",
    category: "Insurance",
    complexity: "high",
  },
  invoice_reconciliation: {
    name: "Multi-Vendor Invoice Reconciliation",
    description: "Invoice matching against POs with duplicate detection, price variance checks, and FX conversion.",
    icon: "📊",
    category: "Finance",
    complexity: "high",
  },
  sla_breach_escalation: {
    name: "SLA Breach Escalation",
    description: "SLA compliance monitoring with breach calculation, credit computation, and cascading escalation.",
    icon: "⚡",
    category: "Operations",
    complexity: "medium",
  },
  travel_rebooking: {
    name: "Multi-Leg Travel Rebooking",
    description: "Travel itinerary modification with fare class rules, loyalty benefits, and company policy enforcement.",
    icon: "✈️",
    category: "Operations",
    complexity: "high",
  },
  compliance_audit: {
    name: "Regulatory Compliance Audit",
    description: "KYC/AML verification with document gap detection, PEP screening, and remediation deadlines.",
    icon: "🔍",
    category: "Compliance",
    complexity: "high",
  },
  subscription_migration: {
    name: "Customer Subscription Migration",
    description: "Plan downgrade/upgrade with prorated refund, feature conflict detection, and compliance warnings.",
    icon: "🔄",
    category: "Operations",
    complexity: "medium",
  },
  dispute_resolution: {
    name: "Multi-Party Dispute Resolution",
    description: "E-commerce dispute handling with evidence review, buyer frequency checks, and transaction hold.",
    icon: "⚖️",
    category: "Operations",
    complexity: "medium",
  },
  financial_close: {
    name: "Month-End Financial Close",
    description: "Bank reconciliation, P&L generation, cash flow statement, and audit trail with suspense accounts.",
    icon: "📅",
    category: "Finance",
    complexity: "high",
  },
  product_workflow: {
    name: "Product Story to Engineering",
    description: "PM brief to Confluence PRD to Jira epic decomposition with capacity checks and stakeholder notifications.",
    icon: "🗂️",
    category: "Engineering",
    complexity: "medium",
  },
  ar_collections: {
    name: "AR Collections Workflow",
    description: "Aging analysis with 6-path routing: enterprise exemption, credit notes, payment plans, and write-offs.",
    icon: "💰",
    category: "Finance",
    complexity: "high",
  },
  incident_response: {
    name: "IT Incident Response & Post-Mortem",
    description: "Production triage, root cause analysis, PCI/security-compliant remediation, and blameless post-mortem.",
    icon: "🚨",
    category: "Engineering",
    complexity: "high",
  },
  qbr_preparation: {
    name: "Quarterly Business Review Preparation",
    description: "Multi-source QBR data aggregation, cross-system reconciliation, and stakeholder-specific deck variants.",
    icon: "📈",
    category: "Operations",
    complexity: "high",
  },
};

const CATEGORIES = ["All", "Finance", "HR", "Operations", "Engineering", "Compliance", "Insurance"] as const;
type Category = typeof CATEGORIES[number];

const COMPLEXITY_COLORS: Record<string, string> = {
  low: "text-emerald-500",
  medium: "text-amber-500",
  high: "text-red-400",
};

const COMPLEXITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/* ── Recent Process Instances ─────────────────────────────────────────── */

interface ProcessInstance {
  id: string;
  process_type: string;
  status: string;
  created_at: string;
  payload?: { description?: string };
}

function useRecentProcesses() {
  const [instances, setInstances] = useState<ProcessInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/process/list")
      .then((r) => (r.ok ? r.json() : { jobs: [] }))
      .then((json) => {
        if (!cancelled) setInstances((json.jobs || []).slice(0, 5));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { instances, loading };
}

/* ── Status badge ─────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() ?? "pending";
  const map: Record<string, { label: string; className: string }> = {
    completed: { label: "Done", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    pending:   { label: "Pending", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    running:   { label: "Running", className: "bg-accent/10 text-accent border-accent/20" },
    failed:    { label: "Failed", className: "bg-red-500/10 text-red-400 border-red-500/20" },
  };
  const { label, className } = map[s] ?? map.pending;
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border", className)}>
      {label}
    </span>
  );
}

/* ── Start Process Modal ──────────────────────────────────────────────── */

function StartProcessModal({
  template,
  onClose,
}: {
  template: BPaaSProcessType;
  onClose: () => void;
}) {
  const router = useRouter();
  const meta = PROCESS_META[template];
  const [context, setContext] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/process/${template}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: context.trim() || `Start a ${meta.name} process` }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setJobId(data.jobId || data.id || "queued");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start process");
    } finally {
      setSubmitting(false);
    }
  }

  if (jobId) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-card border border-border-subtle rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-foreground mb-1">Process queued</h2>
          <p className="text-xs text-muted mb-5">
            <span className="font-medium text-foreground">{meta.name}</span> has been queued and will run shortly.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-border-subtle text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => router.push("/copilot")}
              className="flex-1 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              View in Copilot
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border-subtle rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{meta.icon}</span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">{meta.name}</h2>
              <p className="text-xs text-muted mt-0.5">{meta.category}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Description */}
        <p className="text-xs text-muted mb-4 leading-relaxed">{meta.description}</p>

        {/* Context form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Process context / input
              <span className="text-muted font-normal ml-1">(optional)</span>
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder={`e.g. Employee: Jane Smith, departure date: March 15, final salary: $85,000\u2026`}
              rows={4}
              className="w-full px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none text-foreground placeholder:text-muted transition-colors"
            />
            <p className="text-[10px] text-muted mt-1">
              Provide any specific data or context the AI should use when running this process.
            </p>
          </div>

          {error && (
            <div className="text-xs text-danger bg-danger/5 border border-danger/10 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Starting\u2026
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                  </svg>
                  Start Process
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                const encodedCmd = encodeURIComponent("process-start");
                const encodedMsg = encodeURIComponent(context.trim() || `Start a ${meta.name} process`);
                router.push(`/copilot?cmd=${encodedCmd}&msg=${encodedMsg}&template=${template}`);
              }}
              className="px-3 py-2.5 rounded-lg border border-border-subtle text-xs text-muted hover:text-foreground hover:bg-surface-hover transition-colors flex items-center gap-1.5"
              title="Run via Copilot instead"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Copilot
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2.5 rounded-lg border border-border-subtle text-xs text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────── */

export default function ProcessesPage() {
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<BPaaSProcessType | null>(null);
  const { instances, loading: instancesLoading } = useRecentProcesses();

  const filteredTemplates = BPAAS_PROCESS_TYPES.filter((type) => {
    const meta = PROCESS_META[type];
    if (!meta) return false;
    const matchesCategory = activeCategory === "All" || meta.category === activeCategory;
    const matchesSearch = !searchQuery ||
      meta.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      meta.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      meta.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <PageHeader
        title="Process Engine"
        description="AI-powered business process automation — run any process as a structured workflow with policy enforcement and audit trail."
        badge={
          <Badge variant="default" size="sm">
            {BPAAS_PROCESS_TYPES.length} templates
          </Badge>
        }
        actions={
          <a
            href="/copilot"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Open Copilot
          </a>
        }
      />

      {/* Recent Activity */}
      <div className="mt-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Recent Processes</h2>
        </div>
        {instancesLoading ? (
          <div className="flex gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 flex-1 rounded-xl bg-surface-hover/40 animate-pulse" />
            ))}
          </div>
        ) : instances.length === 0 ? (
          <Card padding="md" className="flex items-center gap-3 text-muted">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375" />
            </svg>
            <span className="text-xs">No process runs yet — pick a template below to start.</span>
          </Card>
        ) : (
          <div className="space-y-2">
            {instances.map((inst) => {
              const meta = PROCESS_META[inst.process_type as BPaaSProcessType];
              return (
                <div key={inst.id} className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-card border border-border-subtle">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-base">{meta?.icon ?? "⚙️"}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{meta?.name ?? inst.process_type}</p>
                      <p className="text-[10px] text-muted">{new Date(inst.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <StatusBadge status={inst.status} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Search + Category Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border-subtle bg-card text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                activeCategory === cat
                  ? "bg-accent text-white"
                  : "bg-card border border-border-subtle text-muted hover:text-foreground hover:bg-surface-hover"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Template Grid */}
      <div className="text-xs text-muted mb-3">
        {filteredTemplates.length} of {BPAAS_PROCESS_TYPES.length} templates
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((type) => {
          const meta = PROCESS_META[type];
          return (
            <Card
              key={type}
              variant="interactive"
              padding="md"
              onClick={() => setSelectedTemplate(type)}
              className="flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xl shrink-0">{meta.icon}</span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-foreground leading-snug">{meta.name}</h3>
                    <p className="text-[10px] text-muted mt-0.5">{meta.category}</p>
                  </div>
                </div>
                <span className={cn("text-[10px] font-medium shrink-0 mt-0.5", COMPLEXITY_COLORS[meta.complexity])}>
                  {COMPLEXITY_LABELS[meta.complexity]}
                </span>
              </div>
              <p className="text-[11px] text-muted leading-relaxed line-clamp-2">{meta.description}</p>
              <div className="flex items-center justify-between mt-auto pt-1">
                <span className="text-[10px] font-mono text-muted/60">{type}</span>
                <span className="text-[11px] text-accent font-medium flex items-center gap-1">
                  Start
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="py-16 flex flex-col items-center gap-3 text-center">
          <svg className="w-8 h-8 text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <p className="text-sm text-muted">No templates match your search.</p>
          <button
            onClick={() => { setSearchQuery(""); setActiveCategory("All"); }}
            className="text-xs text-accent hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Start Process Modal */}
      {selectedTemplate && (
        <StartProcessModal
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
        />
      )}
    </div>
  );
}
