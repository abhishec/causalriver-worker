"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ConnectorIcon } from "@/components/ui/ConnectorIcon";
import { StatusDot } from "@/components/ui/StatusDot";

// ============================================================================
// Types
// ============================================================================

interface ConnectorInstance {
  id: string;
  connector_type: string;
  instance_name: string;
  display_name: string | null;
  status: string;
  last_sync_at: string | null;
  config: Record<string, any>;
  metadata: Record<string, any>;
  signals_count: number;
  error_message: string | null;
}

interface IntegrationsSectionProps {
  connectors: ConnectorInstance[];
  orgId: string;
}

// ============================================================================
// Connector type definitions
// ============================================================================

interface ConnectorTypeDef {
  type: string;
  label: string;
  description: string;
  addLabel: string;
  fields: FieldDef[];
}

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "password" | "email";
  required: boolean;
  helpUrl?: string;
  helpText?: string;
}

const CONNECTOR_TYPES: ConnectorTypeDef[] = [
  {
    type: "jira",
    label: "Jira Cloud",
    description: "Connect to your Jira Cloud instance",
    addLabel: "Add Jira Instance",
    fields: [
      { key: "domain", label: "Jira Domain", placeholder: "your-company.atlassian.net", type: "text", required: true, helpText: "Your Jira Cloud domain (without https://)" },
      { key: "email", label: "Email", placeholder: "you@company.com", type: "email", required: true, helpText: "The email associated with your Atlassian account" },
      { key: "apiToken", label: "API Token", placeholder: "Your Atlassian API token", type: "password", required: true, helpUrl: "https://id.atlassian.com/manage-profile/security/api-tokens", helpText: "Create an API token from your Atlassian account." },
    ],
  },
  {
    type: "github",
    label: "GitHub",
    description: "Connect to your GitHub repositories",
    addLabel: "Add GitHub Repo",
    fields: [
      { key: "token", label: "Personal Access Token", placeholder: "ghp_xxxxxxxxxxxx", type: "password", required: true, helpUrl: "https://github.com/settings/tokens?type=beta", helpText: "Create a fine-grained token with repo & workflow permissions." },
      { key: "owner", label: "Default Owner", placeholder: "your-org", type: "text", required: true, helpText: "GitHub organization or username" },
      { key: "repo", label: "Default Repository", placeholder: "your-repo", type: "text", required: true, helpText: "Default repository name" },
    ],
  },
  {
    type: "slack",
    label: "Slack",
    description: "Send notifications to Slack channels",
    addLabel: "Add Slack Workspace",
    fields: [
      { key: "botToken", label: "Bot Token", placeholder: "xoxb-xxxxxxxxxxxx", type: "password", required: true, helpUrl: "https://api.slack.com/apps", helpText: "Bot User OAuth Token from your Slack app settings." },
      { key: "webhookUrl", label: "Webhook URL (Optional)", placeholder: "https://hooks.slack.com/services/...", type: "text", required: false, helpText: "Incoming webhook URL for simple notifications" },
      { key: "defaultChannel", label: "Default Channel", placeholder: "#general", type: "text", required: false, helpText: "Default channel for notifications (include #)" },
    ],
  },
  {
    type: "freshdesk",
    label: "Freshdesk",
    description: "Connect to your Freshdesk helpdesk",
    addLabel: "Add Freshdesk Instance",
    fields: [
      { key: "domain", label: "Freshdesk Domain", placeholder: "acme", type: "text", required: true, helpText: "Your Freshdesk subdomain (e.g., 'acme' for acme.freshdesk.com)" },
      { key: "apiKey", label: "API Key", placeholder: "Your Freshdesk API key", type: "password", required: true, helpUrl: "https://support.freshdesk.com/en/support/solutions/articles/215517-how-to-find-your-api-key", helpText: "Find your API key in Profile Settings." },
    ],
  },
];

// ============================================================================
// Helper
// ============================================================================

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ============================================================================
// Add Instance Form
// ============================================================================

function AddInstanceForm({
  typeDef,
  onSave,
  onCancel,
}: {
  typeDef: ConnectorTypeDef;
  onSave: (data: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Check required fields
    for (const field of typeDef.fields) {
      if (field.required && !values[field.key]?.trim()) {
        setError(`${field.label} is required`);
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({ ...values, displayName: displayName.trim() || "" });
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-card border border-accent/20 p-5 space-y-4">
      <div className="flex items-center gap-3 mb-1">
        <ConnectorIcon type={typeDef.type} size="md" />
        <div>
          <div className="text-sm font-medium">New {typeDef.label} Instance</div>
          <div className="text-[10px] text-muted">{typeDef.description}</div>
        </div>
      </div>

      {/* Display Name */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Display Name <span className="text-muted">(optional)</span>
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={`e.g. "Backend API", "Main Repo"`}
          className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
        />
      </div>

      {/* Dynamic fields */}
      {typeDef.fields.map((field) => (
        <div key={field.key}>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            {field.label}
            {field.required && <span className="text-danger ml-0.5">*</span>}
          </label>
          {field.helpText && (
            <p className="text-[10px] text-muted mb-1.5">
              {field.helpText}
              {field.helpUrl && (
                <>
                  {" "}
                  <a
                    href={field.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    Get one
                  </a>
                </>
              )}
            </p>
          )}
          <input
            type={field.type}
            value={values[field.key] || ""}
            onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
            placeholder={field.placeholder}
            required={field.required}
            className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
          />
        </div>
      ))}

      {error && (
        <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? "Validating..." : "Validate & Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-border hover:bg-surface-hover text-sm text-muted-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ============================================================================
// Instance Card
// ============================================================================

function InstanceCard({
  instance,
  typeDef,
  onRemove,
  onTest,
  onSync,
}: {
  instance: ConnectorInstance;
  typeDef: ConnectorTypeDef;
  onRemove: (id: string) => void;
  onTest: (id: string) => void;
  onSync: (id: string) => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [syncing, setSyncing] = useState(false);

  const isHealthy = instance.status === "active" || instance.status === "connected";

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/connectors/${instance.connector_type}/status?connectorId=${instance.id}`);
      setTestResult(res.ok ? "ok" : "fail");
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch(`/api/connectors/${instance.connector_type}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId: instance.id }),
      });
    } catch {
      // non-fatal
    } finally {
      setSyncing(false);
    }
  };

  // Extract display info from config/metadata
  const getDetail = (): string => {
    const c = instance.config || {};
    const m = instance.metadata || {};
    switch (instance.connector_type) {
      case "jira":
        return c.site_name || m.site_name || c.site_url || "";
      case "github":
        return c.repoFullName || `${c.owner}/${c.repo}` || "";
      case "slack":
        return m.team_name || c.team_name || "";
      case "freshdesk":
        return c.domain ? `${c.domain}.freshdesk.com` : "";
      default:
        return instance.instance_name;
    }
  };

  return (
    <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-card border border-border-subtle hover:bg-card-hover transition-colors">
      <ConnectorIcon type={instance.connector_type} size="md" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {instance.display_name || instance.instance_name}
          </span>
          <StatusDot type={isHealthy ? "active" : "error"} size="sm" pulse={isHealthy} />
          {testResult === "ok" && (
            <span className="text-[10px] text-success font-medium">Connected</span>
          )}
          {testResult === "fail" && (
            <span className="text-[10px] text-danger font-medium">Failed</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[10px] text-muted font-mono truncate">{getDetail()}</span>
          {instance.signals_count > 0 && (
            <span className="text-[10px] text-muted">{instance.signals_count.toLocaleString()} signals</span>
          )}
          {instance.last_sync_at && (
            <span className="text-[10px] text-muted">Synced {timeAgo(instance.last_sync_at)}</span>
          )}
        </div>
        {instance.error_message && (
          <div className="text-[10px] text-danger mt-0.5 truncate">{instance.error_message}</div>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={handleTest}
          disabled={testing}
          className="px-2.5 py-1.5 rounded-lg border border-border-subtle text-[11px] text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          {testing ? "..." : "Test"}
        </button>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-2.5 py-1.5 rounded-lg border border-border-subtle text-[11px] text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          {syncing ? "..." : "Sync"}
        </button>
        {confirmRemove ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onRemove(instance.id)}
              className="px-2.5 py-1.5 rounded-lg bg-danger/10 border border-danger/20 text-[11px] text-danger font-medium hover:bg-danger/20 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmRemove(false)}
              className="px-2.5 py-1.5 rounded-lg border border-border-subtle text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmRemove(true)}
            className="px-2.5 py-1.5 rounded-lg border border-border-subtle text-[11px] text-muted-foreground hover:text-danger hover:border-danger/20 transition-colors"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Connector Type Section
// ============================================================================

function ConnectorTypeSection({
  typeDef,
  instances,
  onAdd,
  onRemove,
}: {
  typeDef: ConnectorTypeDef;
  instances: ConnectorInstance[];
  onAdd: (type: string, data: Record<string, string>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [showAddForm, setShowAddForm] = useState(false);

  const handleSave = async (data: Record<string, string>) => {
    await onAdd(typeDef.type, data);
    setShowAddForm(false);
  };

  const configured = instances.length > 0;

  return (
    <div className="rounded-xl bg-surface/30 border border-border-subtle p-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <ConnectorIcon type={typeDef.type} size="lg" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{typeDef.label}</h3>
            {instances.length > 0 && (
              <span className="text-[10px] tabular-nums text-muted bg-surface px-1.5 py-0.5 rounded-full">
                {instances.length}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted">{typeDef.description}</p>
        </div>
        {!configured && !showAddForm && (
          <span className="text-[10px] text-muted-foreground bg-surface/50 px-2 py-1 rounded-md">Not configured</span>
        )}
      </div>

      {/* Existing instances */}
      {instances.length > 0 && (
        <div className="space-y-2 mb-3">
          {instances.map((inst) => (
            <InstanceCard
              key={inst.id}
              instance={inst}
              typeDef={typeDef}
              onRemove={(id) => onRemove(id)}
              onTest={() => {}}
              onSync={() => {}}
            />
          ))}
        </div>
      )}

      {/* Add form or button */}
      {showAddForm ? (
        <AddInstanceForm
          typeDef={typeDef}
          onSave={handleSave}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-[11px] font-medium transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {typeDef.addLabel}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function IntegrationsSection({ connectors, orgId }: IntegrationsSectionProps) {
  const [instances, setInstances] = useState<ConnectorInstance[]>(connectors);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleAdd = async (connectorType: string, data: Record<string, string>) => {
    const { displayName, ...rest } = data;
    const res = await fetch("/api/connectors/instances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectorType, displayName, ...rest }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Failed to add instance");

    // Refresh instances
    const listRes = await fetch(`/api/connectors/instances`);
    const listData = await listRes.json();
    if (listRes.ok) setInstances(listData.instances);

    showToast("success", `${displayName || result.instanceName} connected successfully`);
  };

  const handleRemove = async (id: string) => {
    const res = await fetch("/api/connectors/instances", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (!res.ok) {
      const data = await res.json();
      showToast("error", data.error || "Failed to remove");
      return;
    }

    setInstances((prev) => prev.filter((c) => c.id !== id));
    showToast("success", "Instance removed");
  };

  return (
    <div className="space-y-6">
      {CONNECTOR_TYPES.map((typeDef) => {
        const typeInstances = instances.filter(
          (c) => c.connector_type === typeDef.type && c.status !== "disabled"
        );
        return (
          <ConnectorTypeSection
            key={typeDef.type}
            typeDef={typeDef}
            instances={typeInstances}
            onAdd={handleAdd}
            onRemove={handleRemove}
          />
        );
      })}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-lg",
            toast.type === "success"
              ? "bg-success/10 border-success/20 text-success"
              : "bg-danger/10 border-danger/20 text-danger"
          )}>
            <span className="text-xs font-medium">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
