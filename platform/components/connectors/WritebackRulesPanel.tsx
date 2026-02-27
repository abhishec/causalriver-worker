"use client";

/**
 * WritebackRulesPanel
 * ===================
 * Lets users configure automated write-back actions so AI Worker
 * domain results (pod-match, scope-creep, etc.) automatically push
 * output to Slack / Jira / GitHub.
 *
 * Features:
 *   - Rules list: name, domain trigger, connector, action, enabled toggle, delete
 *   - Add Rule form: name, domain, connector, action, connector-specific config
 *   - Recent activity: last 10 write-back queue executions
 *   - Template variable helper text per domain
 */

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type DomainTrigger =
  | "pod-match"
  | "scope-creep"
  | "early-warning"
  | "incident-diagnosis"
  | "pr-review"
  | "delivery-intelligence";

type ConnectorType = "slack" | "jira" | "github";

type SlackAction = "post-message";
type JiraAction = "create-ticket";
type GitHubAction = "create-issue" | "add-pr-comment";

type ActionType = SlackAction | JiraAction | GitHubAction;

interface SlackConfig {
  channelId: string;
  messageTemplate: string;
}

interface JiraConfig {
  projectKey: string;
  issueType: string;
  summaryTemplate: string;
  descriptionTemplate: string;
}

interface GitHubConfig {
  owner: string;
  repo: string;
  titleTemplate: string;
  bodyTemplate: string;
  labels: string;
}

type RuleConfig = SlackConfig | JiraConfig | GitHubConfig;

interface WritebackRule {
  id: string;
  name: string;
  domainTrigger: DomainTrigger;
  connector: ConnectorType;
  action: ActionType;
  config: RuleConfig;
  enabled: boolean;
  createdAt: string;
  lastTriggeredAt: string | null;
}

interface QueueEntry {
  id: string;
  ruleId: string;
  ruleName: string;
  domainTrigger: DomainTrigger;
  connector: ConnectorType;
  action: ActionType;
  status: "pending" | "running" | "success" | "error";
  errorMessage: string | null;
  executedAt: string | null;
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DOMAIN_TRIGGERS: { value: DomainTrigger; label: string; icon: string }[] = [
  { value: "pod-match", label: "Pod Match", icon: "🎯" },
  { value: "scope-creep", label: "Scope Creep", icon: "📊" },
  { value: "early-warning", label: "Early Warning", icon: "⚡" },
  { value: "incident-diagnosis", label: "Incident Diagnosis", icon: "🚨" },
  { value: "pr-review", label: "PR Review", icon: "🔎" },
  { value: "delivery-intelligence", label: "Delivery Intelligence", icon: "🔍" },
];

const CONNECTOR_TYPES: { value: ConnectorType; label: string; icon: string }[] = [
  { value: "slack", label: "Slack", icon: "💬" },
  { value: "jira", label: "Jira", icon: "🔵" },
  { value: "github", label: "GitHub", icon: "🐙" },
];

const ACTIONS_BY_CONNECTOR: Record<ConnectorType, { value: ActionType; label: string }[]> = {
  slack: [{ value: "post-message", label: "Post Message" }],
  jira: [{ value: "create-ticket", label: "Create Ticket" }],
  github: [
    { value: "create-issue", label: "Create Issue" },
    { value: "add-pr-comment", label: "Add PR Comment" },
  ],
};

const TEMPLATE_VARS: Record<DomainTrigger, string[]> = {
  "pod-match": ["{{organization_id}}", "{{_domain}}", "{{top_recommendation}}", "{{confidence}}", "{{engagement_name}}"],
  "scope-creep": ["{{organization_id}}", "{{_domain}}", "{{alert_type}}", "{{severity}}", "{{description}}"],
  "early-warning": ["{{organization_id}}", "{{_domain}}", "{{alert_count}}", "{{engineer_count}}", "{{engagement_name}}"],
  "incident-diagnosis": ["{{organization_id}}", "{{_domain}}", "{{title}}", "{{root_cause}}", "{{impact}}"],
  "pr-review": ["{{organization_id}}", "{{_domain}}", "{{repo}}", "{{pr_number}}", "{{summary}}"],
  "delivery-intelligence": ["{{organization_id}}", "{{_domain}}", "{{engagement_name}}", "{{health_score}}"],
};

const DOMAIN_COLORS: Record<DomainTrigger, { bg: string; text: string; border: string }> = {
  "pod-match": { bg: "bg-accent/10", text: "text-accent", border: "border-accent/20" },
  "scope-creep": { bg: "bg-danger/10", text: "text-danger", border: "border-danger/20" },
  "early-warning": { bg: "bg-warning/10", text: "text-warning", border: "border-warning/20" },
  "incident-diagnosis": { bg: "bg-danger/10", text: "text-danger", border: "border-danger/20" },
  "pr-review": { bg: "bg-brain-discovery/10", text: "text-brain-discovery", border: "border-brain-discovery/20" },
  "delivery-intelligence": { bg: "bg-info/10", text: "text-info", border: "border-info/20" },
};

const CONNECTOR_COLORS: Record<ConnectorType, { bg: string; text: string }> = {
  slack: { bg: "bg-success/10", text: "text-success" },
  jira: { bg: "bg-info/10", text: "text-info" },
  github: { bg: "bg-muted/10", text: "text-muted-foreground" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function getDefaultConfig(connector: ConnectorType, action: ActionType): RuleConfig {
  if (connector === "slack") {
    return { channelId: "", messageTemplate: "{{top_recommendation}} for {{engagement_name}}" } as SlackConfig;
  }
  if (connector === "jira") {
    return {
      projectKey: "",
      issueType: "Task",
      summaryTemplate: "[{{_domain}}] {{engagement_name}}",
      descriptionTemplate: "{{description}}",
    } as JiraConfig;
  }
  // github
  if (action === "add-pr-comment") {
    return {
      owner: "",
      repo: "",
      titleTemplate: "",
      bodyTemplate: "{{summary}}",
      labels: "",
    } as GitHubConfig;
  }
  return {
    owner: "",
    repo: "",
    titleTemplate: "[{{_domain}}] {{engagement_name}}",
    bodyTemplate: "{{description}}\n\n**Root Cause:** {{root_cause}}",
    labels: "ai-worker,automated",
  } as GitHubConfig;
}

// ── Config Fields sub-form ────────────────────────────────────────────────────

interface ConfigFieldsProps {
  connector: ConnectorType;
  action: ActionType;
  domain: DomainTrigger;
  config: RuleConfig;
  onChange: (config: RuleConfig) => void;
}

function ConfigFields({ connector, action, domain, config, onChange }: ConfigFieldsProps) {
  const vars = TEMPLATE_VARS[domain] ?? [];

  const helperText = (
    <p className="text-[10px] text-muted mt-1">
      Available vars:{" "}
      {vars.map((v, i) => (
        <span key={v}>
          <code className="font-mono bg-surface-hover px-0.5 rounded">{v}</code>
          {i < vars.length - 1 && ", "}
        </span>
      ))}
    </p>
  );

  if (connector === "slack") {
    const cfg = config as SlackConfig;
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Channel ID <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={cfg.channelId}
            onChange={(e) => onChange({ ...cfg, channelId: e.target.value })}
            placeholder="C0123456789"
            className="w-full px-3 py-2 text-sm font-mono bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
          />
          <p className="text-[10px] text-muted mt-1">
            Right-click a Slack channel → Copy Link → the ID is at the end of the URL.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Message Template <span className="text-danger">*</span>
          </label>
          <textarea
            value={cfg.messageTemplate}
            onChange={(e) => onChange({ ...cfg, messageTemplate: e.target.value })}
            placeholder="{{top_recommendation}} matched for {{engagement_name}} (confidence: {{confidence}})"
            rows={3}
            className="w-full px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted resize-none"
          />
          {helperText}
        </div>
      </div>
    );
  }

  if (connector === "jira") {
    const cfg = config as JiraConfig;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Project Key <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={cfg.projectKey}
              onChange={(e) => onChange({ ...cfg, projectKey: e.target.value.toUpperCase() })}
              placeholder="PROJ"
              className="w-full px-3 py-2 text-sm font-mono bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Issue Type</label>
            <select
              value={cfg.issueType}
              onChange={(e) => onChange({ ...cfg, issueType: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground"
            >
              {["Task", "Bug", "Story", "Epic", "Subtask"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Summary Template <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={cfg.summaryTemplate}
            onChange={(e) => onChange({ ...cfg, summaryTemplate: e.target.value })}
            placeholder="[{{_domain}}] {{engagement_name}}"
            className="w-full px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
          />
          {helperText}
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Description Template</label>
          <textarea
            value={cfg.descriptionTemplate}
            onChange={(e) => onChange({ ...cfg, descriptionTemplate: e.target.value })}
            placeholder="{{description}}"
            rows={3}
            className="w-full px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted resize-none"
          />
        </div>
      </div>
    );
  }

  // github
  const cfg = config as GitHubConfig;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Owner <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={cfg.owner}
            onChange={(e) => onChange({ ...cfg, owner: e.target.value })}
            placeholder="myorg"
            className="w-full px-3 py-2 text-sm font-mono bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Repo <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={cfg.repo}
            onChange={(e) => onChange({ ...cfg, repo: e.target.value })}
            placeholder="my-repo"
            className="w-full px-3 py-2 text-sm font-mono bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
          />
        </div>
      </div>
      {action === "create-issue" && (
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Title Template <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={cfg.titleTemplate}
            onChange={(e) => onChange({ ...cfg, titleTemplate: e.target.value })}
            placeholder="[{{_domain}}] {{engagement_name}}"
            className="w-full px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
          />
          {helperText}
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Body Template <span className="text-danger">*</span>
        </label>
        <textarea
          value={cfg.bodyTemplate}
          onChange={(e) => onChange({ ...cfg, bodyTemplate: e.target.value })}
          placeholder="{{summary}}"
          rows={3}
          className="w-full px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted resize-none"
        />
        {action === "add-pr-comment" && helperText}
      </div>
      {action === "create-issue" && (
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Labels{" "}
            <span className="text-muted font-normal">(comma-separated)</span>
          </label>
          <input
            type="text"
            value={cfg.labels}
            onChange={(e) => onChange({ ...cfg, labels: e.target.value })}
            placeholder="ai-worker,automated"
            className="w-full px-3 py-2 text-sm font-mono bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
          />
        </div>
      )}
    </div>
  );
}

// ── Add Rule Form ─────────────────────────────────────────────────────────────

interface AddRuleFormProps {
  onCreated: (rule: WritebackRule) => void;
  onCancel: () => void;
}

function AddRuleForm({ onCreated, onCancel }: AddRuleFormProps) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState<DomainTrigger>("pod-match");
  const [connector, setConnector] = useState<ConnectorType>("slack");
  const [action, setAction] = useState<ActionType>("post-message");
  const [config, setConfig] = useState<RuleConfig>(getDefaultConfig("slack", "post-message"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync action when connector changes
  function handleConnectorChange(c: ConnectorType) {
    setConnector(c);
    const firstAction = ACTIONS_BY_CONNECTOR[c][0].value;
    setAction(firstAction);
    setConfig(getDefaultConfig(c, firstAction));
  }

  function handleActionChange(a: ActionType) {
    setAction(a);
    setConfig(getDefaultConfig(connector, a));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/connectors/writeback/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), domainTrigger: domain, connector, action, config }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const created: WritebackRule = await res.json();
      onCreated(created);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save rule — check your connection and try again");
    } finally {
      setSaving(false);
    }
  }

  const availableActions = ACTIONS_BY_CONNECTOR[connector];

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border border-accent/20 rounded-xl p-5 space-y-4"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold">New Write-back Rule</h3>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded-lg hover:bg-surface-hover text-muted transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Rule Name <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Pod match → #eng-alerts"
          className="w-full px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
          autoFocus
          required
        />
      </div>

      {/* Domain + Connector row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Domain Trigger */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Domain Trigger <span className="text-danger">*</span>
          </label>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value as DomainTrigger)}
            className="w-full px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground"
          >
            {DOMAIN_TRIGGERS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.icon} {d.label}
              </option>
            ))}
          </select>
        </div>

        {/* Connector */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Connector <span className="text-danger">*</span>
          </label>
          <div className="flex gap-2">
            {CONNECTOR_TYPES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => handleConnectorChange(c.value)}
                className={cn(
                  "flex-1 py-2 text-xs font-medium rounded-lg border transition-colors",
                  connector === c.value
                    ? "bg-accent/10 text-accent border-accent/20"
                    : "bg-background border-border-subtle text-muted hover:text-foreground"
                )}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Action</label>
        <div className="flex gap-2">
          {availableActions.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => handleActionChange(a.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                action === a.value
                  ? "bg-accent/10 text-accent border-accent/20"
                  : "bg-background border-border-subtle text-muted hover:text-foreground"
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Config fields */}
      <div className="rounded-lg bg-surface p-4 border border-border-subtle space-y-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted mb-3">
          {CONNECTOR_TYPES.find((c) => c.value === connector)?.label} Configuration
        </p>
        <ConfigFields
          connector={connector}
          action={action}
          domain={domain}
          config={config}
          onChange={setConfig}
        />
      </div>

      {error && (
        <div className="text-xs text-danger bg-danger/5 border border-danger/10 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="flex-1 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Creating..." : "Create Rule"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-muted hover:text-foreground border border-border-subtle rounded-lg hover:bg-surface-hover transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Rule Row ──────────────────────────────────────────────────────────────────

interface RuleRowProps {
  rule: WritebackRule;
  onToggle: (rule: WritebackRule) => void;
  onDelete: (rule: WritebackRule) => void;
}

function RuleRow({ rule, onToggle, onDelete }: RuleRowProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const domainInfo = DOMAIN_TRIGGERS.find((d) => d.value === rule.domainTrigger);
  const connectorInfo = CONNECTOR_TYPES.find((c) => c.value === rule.connector);
  const domainColors = DOMAIN_COLORS[rule.domainTrigger];
  const connectorColors = CONNECTOR_COLORS[rule.connector];
  const actionInfo = ACTIONS_BY_CONNECTOR[rule.connector].find((a) => a.value === rule.action);

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all duration-200",
        rule.enabled
          ? "border-border-subtle bg-card hover:border-border"
          : "border-border-subtle bg-surface/30 opacity-70"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Domain icon */}
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-lg mt-0.5", domainColors.bg)}>
          {domainInfo?.icon ?? "⚙️"}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-semibold truncate">{rule.name}</span>
            {!rule.enabled && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted/10 text-muted border border-border-subtle">
                Disabled
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Domain trigger tag */}
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border",
                domainColors.bg, domainColors.text, domainColors.border
              )}
            >
              {domainInfo?.icon} {domainInfo?.label ?? rule.domainTrigger}
            </span>

            {/* Arrow */}
            <svg className="w-3 h-3 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>

            {/* Connector tag */}
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border border-border-subtle",
                connectorColors.bg, connectorColors.text
              )}
            >
              {connectorInfo?.icon} {connectorInfo?.label ?? rule.connector}
            </span>

            {/* Action tag */}
            <span className="text-[10px] text-muted bg-surface px-2 py-0.5 rounded-md border border-border-subtle">
              {actionInfo?.label ?? rule.action}
            </span>

            {/* Last triggered */}
            <span className="text-[10px] text-muted ml-auto">
              Last triggered: {formatTimeAgo(rule.lastTriggeredAt)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Enable/disable toggle */}
          <button
            onClick={() => onToggle(rule)}
            title={rule.enabled ? "Disable rule" : "Enable rule"}
            className={cn(
              "relative inline-flex items-center h-5 w-9 rounded-full transition-colors focus:outline-none",
              rule.enabled ? "bg-accent" : "bg-border-subtle"
            )}
          >
            <span
              className={cn(
                "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                rule.enabled ? "translate-x-4" : "translate-x-0.5"
              )}
            />
          </button>

          {/* Delete */}
          {showDeleteConfirm ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => { onDelete(rule); setShowDeleteConfirm(false); }}
                className="px-2 py-1 text-[10px] font-medium bg-danger/10 text-danger border border-danger/20 rounded-lg hover:bg-danger/20 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-2 py-1 text-[10px] font-medium text-muted hover:text-foreground border border-border-subtle rounded-lg hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              title="Delete rule"
              className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/5 transition-colors border border-transparent hover:border-danger/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Queue Entry Row ───────────────────────────────────────────────────────────

function QueueEntryRow({ entry }: { entry: QueueEntry }) {
  const domainInfo = DOMAIN_TRIGGERS.find((d) => d.value === entry.domainTrigger);
  const connectorInfo = CONNECTOR_TYPES.find((c) => c.value === entry.connector);

  const statusColors: Record<string, string> = {
    success: "text-success bg-success/10 border-success/20",
    error: "text-danger bg-danger/10 border-danger/20",
    running: "text-accent bg-accent/10 border-accent/20",
    pending: "text-muted bg-muted/10 border-border-subtle",
  };

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border-subtle last:border-0">
      <div className="text-base shrink-0">{domainInfo?.icon ?? "⚙️"}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium truncate">{entry.ruleName}</span>
          <span className="text-[10px] text-muted">
            {connectorInfo?.icon} {connectorInfo?.label}
          </span>
        </div>
        {entry.errorMessage && (
          <p className="text-[10px] text-danger mt-0.5 font-mono line-clamp-1">{entry.errorMessage}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded border",
            statusColors[entry.status] ?? statusColors.pending
          )}
        >
          {entry.status}
        </span>
        <span className="text-[10px] text-muted whitespace-nowrap">
          {formatTimeAgo(entry.executedAt ?? entry.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export interface WritebackRulesPanelProps {
  organizationId: string;
  /** User role from org_members — "admin" and "owner" can create/delete rules; others can only view */
  userRole?: string | null;
}

export function WritebackRulesPanel({ organizationId: _organizationId, userRole }: WritebackRulesPanelProps) {
  const canManageRules = userRole === "admin" || userRole === "owner";
  const [rules, setRules] = useState<WritebackRule[]>([]);
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(true);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Fetch rules ────────────────────────────────────────────────────────────

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/connectors/writeback/rules");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRules(data.rules ?? []);
      setRulesError(null);
    } catch (e: unknown) {
      setRulesError(e instanceof Error ? e.message : "Failed to load rules");
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/connectors/writeback/queue?limit=10");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setQueueEntries(data.entries ?? []);
    } catch {
      // Non-fatal — queue section is informational
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchQueue();
  }, [fetchRules, fetchQueue]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleCreated = useCallback((rule: WritebackRule) => {
    setRules((prev) => [rule, ...prev]);
    setShowAddForm(false);
  }, []);

  const handleToggle = useCallback(async (rule: WritebackRule) => {
    const newEnabled = !rule.enabled;
    // Optimistic update
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: newEnabled } : r)));
    try {
      const res = await fetch(`/api/connectors/writeback/rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (!res.ok) {
        // Roll back
        setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r)));
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || "Failed to update rule");
      }
    } catch {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r)));
      setActionError("Network error — could not update rule");
    }
  }, []);

  const handleDelete = useCallback(async (rule: WritebackRule) => {
    // Optimistic remove
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
    try {
      const res = await fetch(`/api/connectors/writeback/rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) {
        setRules((prev) => [rule, ...prev]);
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || "Failed to delete rule");
      }
    } catch {
      setRules((prev) => [rule, ...prev]);
      setActionError("Network error — could not delete rule");
    }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Rules section */}
      <div className="space-y-4">
        {/* Section header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Write-back Rules</h2>
            <p className="text-[11px] text-muted mt-0.5">
              {rulesLoading
                ? "Loading..."
                : `${rules.length} rule${rules.length !== 1 ? "s" : ""} configured`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { fetchRules(); fetchQueue(); }}
              className="p-1.5 rounded-lg border border-border-subtle text-muted hover:text-foreground hover:bg-surface transition-colors"
              title="Refresh"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            {canManageRules && (
              <button
                onClick={() => setShowAddForm(true)}
                disabled={showAddForm}
                className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent/90 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Rule
              </button>
            )}
          </div>
        </div>

        {/* Add rule form — only rendered when role permits */}
        {canManageRules && showAddForm && (
          <AddRuleForm
            onCreated={handleCreated}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {/* Action error banner */}
        {actionError && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-danger/5 border border-danger/20 rounded-xl text-xs text-danger">
            <span>{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              className="ml-3 opacity-70 hover:opacity-100 transition-opacity"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Rules list or loading/empty states */}
        {rulesLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-surface rounded-xl animate-pulse border border-border-subtle" />
            ))}
          </div>
        ) : rulesError ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-danger/5 border border-danger/20 rounded-xl text-xs text-danger">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span>Failed to load rules: {rulesError}</span>
            <button
              onClick={fetchRules}
              className="ml-auto underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        ) : rules.length === 0 && !showAddForm ? (
          <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-border-subtle bg-card">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-xl mb-3">
              ↗
            </div>
            <h3 className="text-sm font-medium mb-1">No write-back rules configured</h3>
            <p className="text-xs text-muted max-w-xs">
              Add one to start automating your AI Worker&apos;s outputs — push pod matches to Slack, open Jira tickets on scope creep, and more.
            </p>
            {canManageRules && (
              <button
                onClick={() => setShowAddForm(true)}
                className="mt-3 px-3 py-1.5 bg-accent/10 text-accent text-xs font-medium rounded-lg hover:bg-accent/20 transition-colors"
              >
                Add First Rule
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent activity section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent Activity</h3>
          <span className="text-[10px] text-muted">Last 10 executions</span>
        </div>

        <div className="rounded-xl border border-border-subtle bg-card overflow-hidden">
          {queueLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-surface rounded animate-pulse" />
              ))}
            </div>
          ) : queueEntries.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-xs text-muted">
              No recent executions — rules trigger automatically when AI Worker runs a matching domain.
            </div>
          ) : (
            <div className="px-4">
              {queueEntries.map((entry) => (
                <QueueEntryRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
