"use client";

import { useState } from "react";
import { cn, timeAgo } from "@/lib/utils";

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  permissions: string[];
  rate_limit_per_minute: number;
  last_used_at: string | null;
  created_at: string;
  is_active: boolean;
}

interface ApiKeysSectionProps {
  initialKeys: ApiKey[];
  orgId: string;
}

const PERMISSION_OPTIONS = [
  { value: "read", label: "Read", description: "Query brain data, edges, signals" },
  { value: "write", label: "Write", description: "Ingest signals, create edges" },
  { value: "admin", label: "Admin", description: "Manage training, connectors" },
];

const RATE_LIMIT_OPTIONS = [
  { value: 30, label: "30/min" },
  { value: 60, label: "60/min" },
  { value: 120, label: "120/min" },
  { value: 300, label: "300/min" },
];

export function ApiKeysSection({ initialKeys, orgId }: ApiKeysSectionProps) {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys || []);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyPermissions, setNewKeyPermissions] = useState<string[]>(["read"]);
  const [newKeyRateLimit, setNewKeyRateLimit] = useState(60);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          permissions: newKeyPermissions,
          rateLimitPerMinute: newKeyRateLimit,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create key");

      // Show the raw key (only time it's visible)
      setCreatedKey(data.rawKey);

      // Refresh key list
      const listRes = await fetch("/api/keys");
      const listData = await listRes.json();
      if (listRes.ok) setKeys(listData.keys || []);

      // Reset form
      setNewKeyName("");
      setNewKeyPermissions(["read"]);
      setNewKeyRateLimit(60);
      setShowCreateForm(false);
    } catch (err: unknown) {
      setError("Failed to create key. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevokeKey(keyId: string) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke key");

      // Remove from local state
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
    } catch (err: unknown) {
      setError("Failed to revoke key. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function togglePermission(perm: string) {
    setNewKeyPermissions((prev) =>
      prev.includes(perm)
        ? prev.filter((p) => p !== perm)
        : [...prev, perm]
    );
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const activeKeys = keys.filter((k) => k.is_active);

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
          {error}
        </div>
      )}

      {/* Created Key Modal */}
      {createdKey && (
        <div className="p-4 rounded-lg bg-success/10 border border-success/30">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-success shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-success mb-1">
                API Key Created Successfully
              </p>
              <p className="text-xs text-muted mb-3">
                Copy this key now — it will never be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-surface px-3 py-2 rounded-lg border border-border-subtle text-foreground break-all select-all">
                  {createdKey}
                </code>
                <button
                  onClick={() => copyToClipboard(createdKey)}
                  className="shrink-0 px-3 py-2 rounded-lg bg-surface border border-border-subtle hover:border-accent/30 text-xs font-medium transition-colors"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            className="mt-3 text-xs text-muted hover:text-foreground transition-colors"
          >
            I&apos;ve saved my key
          </button>
        </div>
      )}

      {/* Key List */}
      {activeKeys.length > 0 ? (
        <div className="space-y-2">
          {activeKeys.map((key) => (
            <div
              key={key.id}
              className="flex items-center gap-4 px-4 py-3 rounded-lg bg-surface/50 border border-border-subtle"
            >
              {/* Key info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{key.name}</span>
                  <code className="text-xs font-mono text-muted bg-surface px-1.5 py-0.5 rounded">
                    {key.key_prefix}...
                  </code>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-muted">
                    {(key.permissions || []).join(", ")}
                  </span>
                  <span className="text-[10px] text-muted">
                    {key.rate_limit_per_minute}/min
                  </span>
                  <span className="text-[10px] text-muted">
                    Created {timeAgo(key.created_at)}
                  </span>
                  {key.last_used_at && (
                    <span className="text-[10px] text-muted">
                      Last used {timeAgo(key.last_used_at)}
                    </span>
                  )}
                </div>
              </div>

              {/* Revoke */}
              <button
                onClick={() => handleRevokeKey(key.id)}
                disabled={loading}
                className="shrink-0 px-3 py-1.5 rounded-lg border border-danger/20 text-xs text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      ) : !showCreateForm ? (
        <div className="text-center py-6">
          <svg
            className="w-8 h-8 text-muted/40 mx-auto mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
            />
          </svg>
          <p className="text-sm text-muted-foreground">No API keys yet</p>
          <p className="text-xs text-muted mt-1">
            Generate a key to start using the Brain OS SDK
          </p>
        </div>
      ) : null}

      {/* Create Form */}
      {showCreateForm ? (
        <form onSubmit={handleCreateKey} className="rounded-lg bg-surface border border-border-subtle p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Key Name
            </label>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Production API, CI/CD Pipeline"
              className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">
              Permissions
            </label>
            <div className="flex flex-wrap gap-2">
              {PERMISSION_OPTIONS.map((perm) => (
                <button
                  key={perm.value}
                  type="button"
                  onClick={() => togglePermission(perm.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                    newKeyPermissions.includes(perm.value)
                      ? "bg-accent/10 border-accent/30 text-accent"
                      : "bg-surface border-border-subtle text-muted hover:text-foreground hover:border-border"
                  )}
                >
                  {perm.label}
                  <span className="ml-1 text-[10px] font-normal text-muted">
                    — {perm.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Rate Limit
            </label>
            <select
              value={newKeyRateLimit}
              onChange={(e) => setNewKeyRateLimit(Number(e.target.value))}
              className="rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
            >
              {RATE_LIMIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={loading || !newKeyName.trim() || newKeyPermissions.length === 0}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Generating..." : "Generate Key"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 rounded-lg border border-border hover:bg-surface-hover text-sm text-muted-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Generate New Key
        </button>
      )}
    </div>
  );
}
