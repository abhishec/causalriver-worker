"use client";

import { useState, useEffect, useCallback } from "react";

interface ThresholdConfig {
  enabled: boolean;
  min_prediction_score: number;
  min_causal_graph_score: number;
  min_signal_score: number;
  min_connector_score: number;
  min_job_score: number;
  min_pipeline_sla_score: number;
  min_overall_score: number;
  cooldown_hours: number;
}

interface NotificationPrefs {
  brain_health_alerts: boolean;
  cascade_alerts: boolean;
  anomaly_detections: boolean;
  min_severity: string;
  email_digest: boolean;
  digest_email_recipients: string;
  slack_webhook_url: string;
}

const DIMENSION_LABELS: Record<string, { label: string; description: string }> = {
  min_prediction_score: { label: "Predictions", description: "Prediction accuracy and volume" },
  min_causal_graph_score: { label: "Causal Graph", description: "Graph edges, significance, and freshness" },
  min_signal_score: { label: "Signals", description: "Signal volume and domain diversity" },
  min_connector_score: { label: "Connectors", description: "Connected and recently synced" },
  min_job_score: { label: "Jobs", description: "Job success rate in last 48h" },
  min_pipeline_sla_score: { label: "Pipeline SLA", description: "Nightly consolidation within 2-7 AM UTC" },
  min_overall_score: { label: "Overall", description: "Average of all dimensions" },
};

export default function AlertSettingsPage() {
  const [thresholds, setThresholds] = useState<ThresholdConfig | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs | null>(null);
  const [defaults, setDefaults] = useState<ThresholdConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts/config");
      if (!res.ok) throw new Error("Failed to load config");
      const data = await res.json();
      setThresholds(data.thresholds);
      setNotifPrefs(data.notification_preferences);
      setDefaults(data.defaults);
    } catch (err) {
      setError("Failed to load alert configuration. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/alerts/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thresholds, notification_preferences: notifPrefs }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError("Failed to save alert configuration. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (defaults) {
      setThresholds({ ...defaults });
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-surface-hover rounded w-48" />
          <div className="h-64 bg-surface-hover rounded" />
        </div>
      </div>
    );
  }

  if (!thresholds || !notifPrefs) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-red-500">{error || "Failed to load alert configuration"}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Alert Settings</h1>
        <p className="text-sm text-muted mt-1">
          Configure health monitoring thresholds and notification channels.
          Alerts fire when a dimension score drops below its threshold.
        </p>
      </div>

      {/* Enable/Disable */}
      <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-surface">
        <div>
          <p className="font-medium">Health Alerting</p>
          <p className="text-xs text-muted">Enable automated health threshold monitoring</p>
        </div>
        <button
          onClick={() => setThresholds({ ...thresholds, enabled: !thresholds.enabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            thresholds.enabled ? "bg-accent" : "bg-surface-hover"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              thresholds.enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Threshold Configuration */}
      <div className="border border-border rounded-lg bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-surface-hover/50">
          <h2 className="font-medium">Dimension Thresholds</h2>
          <p className="text-xs text-muted mt-0.5">Score range: 0-100. Alert fires when score drops below threshold.</p>
        </div>
        <div className="divide-y divide-border">
          {Object.entries(DIMENSION_LABELS).map(([key, { label, description }]) => (
            <div key={key} className="flex items-center justify-between px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted">{description}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={(thresholds as unknown as Record<string, number>)[key] ?? 0}
                  onChange={(e) =>
                    setThresholds({ ...thresholds, [key]: parseInt(e.target.value) || 0 })
                  }
                  className="w-16 px-2 py-1 text-sm border border-border rounded bg-background text-right"
                  disabled={!thresholds.enabled}
                />
                <span className="text-xs text-muted w-6">/100</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cooldown */}
      <div className="border border-border rounded-lg bg-surface p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Alert Cooldown</p>
            <p className="text-xs text-muted">Minimum time between re-alerting the same dimension</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={48}
              value={thresholds.cooldown_hours}
              onChange={(e) =>
                setThresholds({ ...thresholds, cooldown_hours: parseInt(e.target.value) || 4 })
              }
              className="w-16 px-2 py-1 text-sm border border-border rounded bg-background text-right"
            />
            <span className="text-xs text-muted">hours</span>
          </div>
        </div>
      </div>

      {/* Notification Channels */}
      <div className="border border-border rounded-lg bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-surface-hover/50">
          <h2 className="font-medium">Notification Channels</h2>
          <p className="text-xs text-muted mt-0.5">Configure how you receive alerts</p>
        </div>
        <div className="p-4 space-y-4">
          {/* Severity filter */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Minimum Severity</p>
              <p className="text-xs text-muted">Only notify for alerts at or above this level</p>
            </div>
            <select
              value={notifPrefs.min_severity}
              onChange={(e) => setNotifPrefs({ ...notifPrefs, min_severity: e.target.value })}
              className="px-2 py-1 text-sm border border-border rounded bg-background"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical only</option>
            </select>
          </div>

          {/* Email */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Email Notifications</p>
                <p className="text-xs text-muted">Send alerts via email (requires Resend API key)</p>
              </div>
              <button
                onClick={() => setNotifPrefs({ ...notifPrefs, email_digest: !notifPrefs.email_digest })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  notifPrefs.email_digest ? "bg-accent" : "bg-surface-hover"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    notifPrefs.email_digest ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            {notifPrefs.email_digest && (
              <input
                type="text"
                placeholder="admin@company.com, ops@company.com"
                value={notifPrefs.digest_email_recipients}
                onChange={(e) => setNotifPrefs({ ...notifPrefs, digest_email_recipients: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded bg-background placeholder:text-muted/50"
              />
            )}
          </div>

          {/* Slack */}
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-sm font-medium">Slack Webhook</p>
            <p className="text-xs text-muted">Paste an incoming webhook URL to receive alerts in Slack</p>
            <input
              type="text"
              placeholder="https://hooks.slack.com/services/..."
              value={notifPrefs.slack_webhook_url}
              onChange={(e) => setNotifPrefs({ ...notifPrefs, slack_webhook_url: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-border rounded bg-background placeholder:text-muted/50"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleResetDefaults}
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          Reset to defaults
        </button>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-500">Saved!</span>}
          {error && <span className="text-sm text-red-500">{error}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
