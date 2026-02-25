"use client";

/**
 * CreateWorkspaceModal
 * ════════════════════════════════════════════════════════════════════
 * Button + modal dialog for creating a new workspace (org) under a
 * customer directly from the admin panel.
 *
 * Usage:
 *   <CreateWorkspaceModal customers={customers} onCreated={() => router.refresh()} />
 */

import { useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

interface Customer {
  id:               string;
  name:             string;
  slug:             string;
  plan:             string;
  is_design_partner: boolean;
}

const AVAILABLE_CONNECTORS = [
  { id: "github",   label: "GitHub"   },
  { id: "jira",     label: "Jira"     },
  { id: "slack",    label: "Slack"    },
  { id: "hubspot",  label: "HubSpot"  },
  { id: "linear",   label: "Linear"   },
  { id: "xero",     label: "Xero"     },
  { id: "stripe",   label: "Stripe"   },
];

export function CreateWorkspaceModal({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalTarget(document.body); }, []);
  const [open, setOpen]             = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [customerId,      setCustomerId]      = useState(customers[0]?.id ?? "");
  const [workspaceName,   setWorkspaceName]   = useState("");
  const [branchName,      setBranchName]      = useState("");
  const [releaseVersion,  setReleaseVersion]  = useState("");
  const [selectedConns,   setSelectedConns]   = useState<string[]>([]);
  const [error,           setError]           = useState("");
  const [result,          setResult]          = useState<null | { workspace: { id: string; name: string; slug: string }; membersAdded: number }>(null);

  function toggleConnector(id: string) {
    setSelectedConns(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (!customerId || !workspaceName.trim()) {
      setError("Customer and workspace name are required.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/workspaces/create", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId,
            workspaceName:  workspaceName.trim(),
            branchName:     branchName.trim()     || undefined,
            releaseVersion: releaseVersion.trim()  || undefined,
            connectors:     selectedConns,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setError(data?.error || "Failed to create AI Worker."); return; }

        setResult({ workspace: data.workspace, membersAdded: data.membersAdded });
        router.refresh(); // Refresh server component data
      } catch {
        setError("Unexpected error — please try again.");
      }
    });
  }

  function handleClose() {
    setOpen(false);
    setWorkspaceName("");
    setBranchName("");
    setReleaseVersion("");
    setSelectedConns([]);
    setError("");
    setResult(null);
  }

  const selectedCustomer = customers.find(c => c.id === customerId);

  return (
    <>
      {/* ── Trigger button ───────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        New AI Worker
      </button>

      {/* ── Modal overlay ────────────────────────────────────────── */}
      {open && portalTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Dialog */}
          <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
              <div>
                <h2 className="text-sm font-semibold">New AI Worker</h2>
                <p className="text-[11px] text-muted mt-0.5">
                  Creates an isolated AI Worker brain under a customer
                </p>
              </div>
              <button
                onClick={handleClose}
                className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-foreground hover:bg-surface transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Success state */}
            {result ? (
              <div className="p-5 space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-success/10 border border-success/20">
                  <svg className="w-5 h-5 text-success mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-[12px]">
                    <p className="font-semibold text-success">AI Worker created!</p>
                    <p className="text-muted mt-0.5">
                      <span className="text-foreground font-medium">{result.workspace.name}</span>
                      {" "}is live under{" "}
                      <span className="text-foreground font-medium">{selectedCustomer?.name}</span>
                    </p>
                    <p className="text-muted mt-1">
                      {result.membersAdded} existing customer member{result.membersAdded !== 1 ? "s" : ""} added automatically
                    </p>
                  </div>
                </div>
                <div className="text-[11px] text-muted space-y-1 px-1">
                  <div className="flex gap-2"><span className="text-muted/60">ID</span><span className="font-mono">{result.workspace.id}</span></div>
                  <div className="flex gap-2"><span className="text-muted/60">Slug</span><span className="font-mono">{result.workspace.slug}</span></div>
                </div>
                <button
                  onClick={handleClose}
                  className="w-full px-4 py-2 rounded-lg text-xs font-medium bg-surface hover:bg-surface-hover border border-border transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              /* Form */
              <form onSubmit={handleSubmit} className="p-5 space-y-4">

                {/* Customer picker */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted uppercase tracking-wider">Customer</label>
                  <select
                    value={customerId}
                    onChange={e => setCustomerId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {customers.filter(c => c.slug !== "nexusbrain").map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.is_design_partner ? " ★" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Workspace name */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted uppercase tracking-wider">
                    AI Worker Name <span className="text-accent">*</span>
                  </label>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={e => setWorkspaceName(e.target.value)}
                    placeholder={`e.g. ${selectedCustomer?.name ?? "Tookitaki"} 6.x`}
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-accent"
                    required
                  />
                </div>

                {/* Branch / Release (optional) */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted uppercase tracking-wider">
                      Branch <span className="text-muted/50">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={branchName}
                      onChange={e => setBranchName(e.target.value)}
                      placeholder="release/6.3.4"
                      className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted uppercase tracking-wider">
                      Version <span className="text-muted/50">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={releaseVersion}
                      onChange={e => setReleaseVersion(e.target.value)}
                      placeholder="6.3.4"
                      className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                </div>

                {/* Connectors */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted uppercase tracking-wider">
                    Connectors <span className="text-muted/50">(optional — can add later)</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {AVAILABLE_CONNECTORS.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleConnector(c.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                          selectedConns.includes(c.id)
                            ? "bg-accent/20 border-accent/40 text-accent"
                            : "bg-surface border-border text-muted hover:text-foreground hover:border-border-strong"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* What will happen */}
                <div className="px-3 py-2.5 rounded-lg bg-surface border border-border-subtle text-[11px] text-muted space-y-1">
                  <p className="font-medium text-foreground">What gets created:</p>
                  <p>✓ New isolated AI Worker brain under <strong>{selectedCustomer?.name}</strong></p>
                  <p>✓ Brain state, cortex, federation, scheduled jobs auto-provisioned</p>
                  <p>✓ S3 storage prefix created</p>
                  <p>✓ All existing <strong>{selectedCustomer?.name}</strong> members added automatically</p>
                  {selectedConns.length > 0 && (
                    <p>✓ {selectedConns.join(", ")} connectors registered (pending OAuth)</p>
                  )}
                </div>

                {/* Error */}
                {error && (
                  <p className="text-[11px] text-destructive px-1">{error}</p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 px-4 py-2 rounded-lg text-xs font-medium bg-surface hover:bg-surface-hover border border-border transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || !workspaceName.trim()}
                    className="flex-1 px-4 py-2 rounded-lg text-xs font-semibold bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isPending ? "Creating…" : "Create AI Worker"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        portalTarget
      )}
    </>
  );
}
