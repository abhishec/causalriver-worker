"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface NotificationPrefs {
  cascade_alerts: boolean;
  budget_warnings: boolean;
  training_completions: boolean;
  brain_health_alerts: boolean;
  anomaly_detections: boolean;
  min_severity: string;
  email_digest: boolean;
  digest_email_recipients: string;
  digest_slack_channel: string;
}

interface NotificationSettingsProps {
  initialPrefs: NotificationPrefs | null;
  orgId: string;
}

const CATEGORIES = [
  {
    key: "cascade_alerts" as const,
    label: "Cascade Alerts",
    description: "When a causal chain triggers across domains",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
  },
  {
    key: "budget_warnings" as const,
    label: "Budget Warnings",
    description: "When LLM or infrastructure spend exceeds threshold",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    key: "training_completions" as const,
    label: "Training Completions",
    description: "When brain training cycles finish",
    icon: "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z",
  },
  {
    key: "brain_health_alerts" as const,
    label: "Brain Health Alerts",
    description: "When brain health score drops or regions deactivate",
    icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  },
  {
    key: "anomaly_detections" as const,
    label: "Anomaly Detections",
    description: "When the brain detects unusual patterns",
    icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  },
];

const SEVERITY_OPTIONS = [
  { value: "critical", label: "Critical Only" },
  { value: "high", label: "High & Critical" },
  { value: "medium", label: "Medium+" },
  { value: "low", label: "All" },
];

export function NotificationSettings({ initialPrefs, orgId }: NotificationSettingsProps) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(
    initialPrefs || {
      cascade_alerts: true,
      budget_warnings: true,
      training_completions: true,
      brain_health_alerts: true,
      anomaly_detections: true,
      min_severity: "medium",
      email_digest: false,
      digest_email_recipients: "",
      digest_slack_channel: "",
    }
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function savePrefs() {
    setSaving(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_preferences", preferences: prefs }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Silent fail — preferences are non-critical
    } finally {
      setSaving(false);
    }
  }

  function toggleCategory(key: keyof NotificationPrefs) {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="space-y-5">
      {/* Notification Categories */}
      <div className="space-y-2">
        {CATEGORIES.map((cat) => (
          <div
            key={cat.key}
            className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface/50 border border-border-subtle"
          >
            <div className="flex items-center gap-3">
              <svg
                className="w-4 h-4 text-muted shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={cat.icon} />
              </svg>
              <div>
                <span className="text-sm font-medium">{cat.label}</span>
                <p className="text-[10px] text-muted">{cat.description}</p>
              </div>
            </div>
            <button
              onClick={() => toggleCategory(cat.key)}
              className={cn(
                "relative w-10 h-5 rounded-full transition-colors",
                prefs[cat.key] ? "bg-accent" : "bg-surface-hover border border-border"
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                  prefs[cat.key] ? "translate-x-5" : "translate-x-0.5"
                )}
              />
            </button>
          </div>
        ))}
      </div>

      {/* Severity Threshold */}
      <div className="px-4 py-3 rounded-lg bg-surface/50 border border-border-subtle">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">Minimum Severity</span>
            <p className="text-[10px] text-muted">Only show notifications at or above this level</p>
          </div>
          <select
            value={prefs.min_severity}
            onChange={(e) => setPrefs((prev) => ({ ...prev, min_severity: e.target.value }))}
            className="text-xs bg-input border border-input-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            {SEVERITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Email Digest */}
      <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface/50 border border-border-subtle">
        <div>
          <span className="text-sm font-medium">Email Digest</span>
          <p className="text-[10px] text-muted">Receive a daily summary of brain activity via email</p>
        </div>
        <button
          onClick={() => setPrefs((prev) => ({ ...prev, email_digest: !prev.email_digest }))}
          className={cn(
            "relative w-10 h-5 rounded-full transition-colors",
            prefs.email_digest ? "bg-accent" : "bg-surface-hover border border-border"
          )}
        >
          <div
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
              prefs.email_digest ? "translate-x-5" : "translate-x-0.5"
            )}
          />
        </button>
      </div>

      {/* Digest Delivery Channels */}
      <div className="space-y-3 px-4 py-3 rounded-lg bg-surface/50 border border-border-subtle">
        <div>
          <span className="text-sm font-medium">Digest Delivery Channels</span>
          <p className="text-[10px] text-muted">Configure where Monday sprint digests and early warning alerts are delivered</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted uppercase tracking-wider">
            Slack Channel
          </label>
          <input
            type="text"
            value={prefs.digest_slack_channel}
            onChange={(e) => setPrefs((prev) => ({ ...prev, digest_slack_channel: e.target.value }))}
            placeholder="#engineering-alerts"
            className="w-full text-xs bg-input border border-input-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted uppercase tracking-wider">
            Email Recipients
          </label>
          <input
            type="text"
            value={prefs.digest_email_recipients}
            onChange={(e) => setPrefs((prev) => ({ ...prev, digest_email_recipients: e.target.value }))}
            placeholder="eng-lead@company.com, cto@company.com"
            className="w-full text-xs bg-input border border-input-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <p className="text-[9px] text-muted">Comma-separated email addresses</p>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={savePrefs}
        disabled={saving}
        className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-sm font-medium transition-colors disabled:opacity-50"
      >
        {saved ? "Saved!" : saving ? "Saving..." : "Save Preferences"}
      </button>
    </div>
  );
}
