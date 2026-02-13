"use client";

import { useState } from "react";

interface Props {
  orgId: string;
  onClose: () => void;
  onInvited: () => void;
}

export function InviteMemberModal({ orgId, onClose, onInvited }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/org-members/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, email, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send invitation");
        setLoading(false);
        return;
      }

      setInviteUrl(data.inviteUrl);
      // Wait a moment then close
      setTimeout(() => {
        onInvited();
      }, 3000);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card border border-border/50 rounded-xl shadow-2xl w-full max-w-md p-6 mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Invite Team Member</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface transition-colors"
          >
            <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {inviteUrl ? (
          /* Success state */
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium mb-2">Invitation Created!</p>
            <p className="text-xs text-muted mb-4">
              Share this link with <span className="text-foreground font-medium">{email}</span>
            </p>
            <div className="bg-surface border border-border/30 rounded-lg p-3">
              <code className="text-xs text-accent break-all">{inviteUrl}</code>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(inviteUrl);
              }}
              className="mt-3 text-xs text-accent hover:text-accent-light font-medium"
            >
              Copy to clipboard
            </button>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleInvite} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="invite-email" className="block text-xs font-medium text-muted-foreground mb-1.5">
                Email address
              </label>
              <input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full px-3 py-2 rounded-lg bg-input border border-input-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-input-focus focus:border-transparent transition-colors"
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="invite-role" className="block text-xs font-medium text-muted-foreground mb-1.5">
                Role
              </label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-input border border-input-border text-sm focus:outline-none focus:ring-2 focus:ring-input-focus focus:border-transparent"
              >
                <option value="admin">Admin — Full access, can invite others</option>
                <option value="member">Member — Can view and use brain features</option>
                <option value="viewer">Viewer — Read-only access</option>
              </select>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg border border-border hover:bg-surface text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !email}
                className="flex-1 py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending..." : "Send Invitation"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
