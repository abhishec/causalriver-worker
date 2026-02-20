"use client";

/**
 * PartnerDashboard — Design Partner Settings Tab
 * ================================================
 *
 * 4 sections:
 *   1. Activation Progress — ProgressRing + badge grid
 *   2. Feature Usage Heatmap — 17 SE-aaS + 6 AAAS domain tiles
 *   3. Feedback Collection — star rating + text areas
 *   4. Quick Actions — action links grid
 *
 * Design: Follows existing settings-client.tsx patterns (Card, Badge, section headers).
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { DOMAIN_CATALOGUE, AAAS_AGENT_CATALOGUE } from "@/lib/se-aas/domain-catalogue";

interface PartnerDashboardProps {
  orgId: string;
  orgName: string;
}

interface ActivationState {
  items: string[];
  completedCount: number;
  totalItems: number;
  dismissed: boolean;
}

interface UsageData {
  domain_type: string;
  count: number;
  last_used: string | null;
}

export function PartnerDashboard({ orgId, orgName }: PartnerDashboardProps) {
  const [activation, setActivation] = useState<ActivationState | null>(null);
  const [usage, setUsage] = useState<UsageData[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(true);

  // Feedback form
  const [rating, setRating] = useState(0);
  const [whatsWorking, setWhatsWorking] = useState("");
  const [whatsMissing, setWhatsMissing] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  // Fetch activation state
  const fetchActivation = useCallback(async () => {
    try {
      const res = await fetch("/api/partner/activation");
      if (res.ok) {
        const data = await res.json();
        setActivation(data);
      }
    } catch {
      // Silently fail
    }
  }, []);

  // Fetch usage data from se_aas_artifacts — group by domain_type with counts
  const fetchUsage = useCallback(async () => {
    setLoadingUsage(true);
    try {
      const supabase = createClient();
      const { data: artifacts } = await supabase
        .from("se_aas_artifacts")
        .select("domain_type, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(500);

      if (artifacts && artifacts.length > 0) {
        // Group by domain_type and count
        const counts: Record<string, { count: number; last_used: string | null }> = {};
        for (const a of artifacts) {
          const dt = a.domain_type;
          if (!counts[dt]) counts[dt] = { count: 0, last_used: null };
          counts[dt].count++;
          if (!counts[dt].last_used) counts[dt].last_used = a.created_at;
        }
        setUsage(
          Object.entries(counts).map(([domain_type, { count, last_used }]) => ({
            domain_type,
            count,
            last_used,
          }))
        );
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingUsage(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchActivation();
    fetchUsage();
  }, [fetchActivation, fetchUsage]);

  async function submitFeedback() {
    if (rating === 0) return;
    setSubmittingFeedback(true);
    try {
      const res = await fetch("/api/partner/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          whats_working: whatsWorking.trim() || undefined,
          whats_missing: whatsMissing.trim() || undefined,
        }),
      });
      if (res.ok) {
        setFeedbackSent(true);
        setRating(0);
        setWhatsWorking("");
        setWhatsMissing("");
        // Reset after 3s
        setTimeout(() => setFeedbackSent(false), 3000);
      }
    } catch {
      // Silently fail
    } finally {
      setSubmittingFeedback(false);
    }
  }

  const completedCount = activation?.completedCount ?? 0;
  const totalItems = activation?.totalItems ?? 9;
  const progressPercent = Math.round((completedCount / totalItems) * 100);

  return (
    <div>
      <h2 className="text-sm font-medium mb-1">Design Partner Program</h2>
      <p className="text-xs text-muted mb-6">
        Track your activation, explore features, and share feedback with us.
      </p>

      <div className="space-y-6">
        {/* ── Section 1: Activation Progress ─────────────────────────────── */}
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">
            Activation Progress
          </h3>
          <Card variant="default" padding="md">
            <div className="flex items-center gap-6">
              <ProgressRing
                value={progressPercent}
                size={80}
                strokeWidth={6}
                color="accent"
              />
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold tabular-nums">
                  {completedCount}/{totalItems}
                </div>
                <p className="text-xs text-muted mt-0.5">
                  Activation steps completed for {orgName}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {activation?.items?.map((id) => (
                    <Badge key={id} variant="success" size="xs">
                      {id.replace(/_/g, " ")}
                    </Badge>
                  ))}
                  {Array.from({ length: totalItems - completedCount }).map((_, i) => (
                    <Badge key={`pending-${i}`} variant="default" size="xs" className="opacity-40">
                      pending
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* ── Section 2: Feature Usage Heatmap ───────────────────────────── */}
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">
            Feature Usage
          </h3>
          <Card variant="default" padding="md">
            <p className="text-xs text-muted mb-4">
              SE-aaS capabilities — color intensity reflects usage depth
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
              {DOMAIN_CATALOGUE.map((domain) => {
                const domainUsage = usage.find((u) => u.domain_type === domain.id);
                const count = domainUsage?.count ?? 0;
                const intensity = count === 0 ? "opacity-30" : count < 3 ? "opacity-60" : count < 10 ? "opacity-80" : "opacity-100";

                return (
                  <Link
                    key={domain.id}
                    href={domain.href || `/copilot?service=seaas&q=${encodeURIComponent(domain.copilotPrompt || "")}`}
                    className={cn(
                      "p-2.5 rounded-lg border border-border-subtle text-center transition-all hover:border-border hover:bg-surface-hover group",
                      intensity
                    )}
                  >
                    <div className="text-lg mb-1">{domain.icon}</div>
                    <div className="text-[10px] font-medium truncate">{domain.label}</div>
                    <div className={cn("text-[9px] tabular-nums mt-0.5", count > 0 ? domain.colorClass : "text-muted")}>
                      {count > 0 ? `${count} use${count !== 1 ? "s" : ""}` : "unused"}
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* AAAS agents */}
            <p className="text-xs text-muted mt-5 mb-3">
              AAAS accounting agents
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {AAAS_AGENT_CATALOGUE.map((agent) => {
                const agentUsage = usage.find((u) => u.domain_type === agent.id);
                const count = agentUsage?.count ?? 0;
                const intensity = count === 0 ? "opacity-30" : count < 3 ? "opacity-60" : "opacity-100";

                return (
                  <Link
                    key={agent.id}
                    href="/copilot?service=aaas"
                    className={cn(
                      "p-2.5 rounded-lg border border-border-subtle text-center transition-all hover:border-border hover:bg-surface-hover",
                      intensity
                    )}
                  >
                    <div className="text-lg mb-1">{agent.icon}</div>
                    <div className="text-[10px] font-medium truncate">{agent.label}</div>
                    <div className={cn("text-[9px] tabular-nums mt-0.5", count > 0 ? agent.colorClass : "text-muted")}>
                      {count > 0 ? `${count}` : "—"}
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        </section>

        {/* ── Section 3: Feedback Collection ──────────────────────────────── */}
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">
            Share Feedback
          </h3>
          <Card variant="default" padding="md">
            {feedbackSent ? (
              <div className="flex items-center gap-3 py-6 justify-center">
                <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium text-success">Thank you! Feedback submitted.</span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Star rating */}
                <div>
                  <label className="block text-xs font-medium mb-2">
                    How would you rate Brain OS so far?
                  </label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setRating(star)}
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-all",
                          star <= rating
                            ? "bg-accent/10 text-accent"
                            : "text-muted hover:text-foreground hover:bg-surface-hover"
                        )}
                      >
                        {star <= rating ? "★" : "☆"}
                      </button>
                    ))}
                    {rating > 0 && (
                      <span className="text-xs text-muted ml-2">
                        {["", "Needs work", "Fair", "Good", "Great", "Amazing"][rating]}
                      </span>
                    )}
                  </div>
                </div>

                {/* Text areas */}
                <div>
                  <label className="block text-xs font-medium mb-1.5">
                    What&apos;s working well?
                  </label>
                  <textarea
                    value={whatsWorking}
                    onChange={(e) => setWhatsWorking(e.target.value)}
                    placeholder="Features or workflows you find valuable..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-input border border-input-border text-foreground placeholder:text-muted text-sm focus:outline-none focus:ring-2 focus:ring-input-focus resize-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5">
                    What&apos;s missing or needs improvement?
                  </label>
                  <textarea
                    value={whatsMissing}
                    onChange={(e) => setWhatsMissing(e.target.value)}
                    placeholder="Missing features, rough edges, ideas..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-input border border-input-border text-foreground placeholder:text-muted text-sm focus:outline-none focus:ring-2 focus:ring-input-focus resize-none transition-colors"
                  />
                </div>

                <button
                  onClick={submitFeedback}
                  disabled={rating === 0 || submittingFeedback}
                  className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {submittingFeedback ? "Submitting..." : "Submit Feedback"}
                </button>
              </div>
            )}
          </Card>
        </section>

        {/* ── Section 4: Quick Actions ────────────────────────────────────── */}
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Invite Teammates", icon: "👥", href: "/settings?tab=members", desc: "Grow your workspace" },
              { label: "Configure Alerts", icon: "🔔", href: "/settings?tab=notifications", desc: "Set up digest emails" },
              { label: "Open Copilot", icon: "💬", href: "/copilot?service=seaas", desc: "Ask the engineering AI" },
              { label: "Contact Support", icon: "📧", href: "mailto:support@monetiz3.com", desc: "We're here to help" },
            ].map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="p-4 rounded-xl border border-border-subtle hover:border-border hover:bg-surface-hover transition-all group"
              >
                <div className="text-xl mb-2">{action.icon}</div>
                <div className="text-sm font-medium group-hover:text-accent transition-colors">{action.label}</div>
                <div className="text-[10px] text-muted mt-0.5">{action.desc}</div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
