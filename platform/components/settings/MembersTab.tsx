"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { InviteMemberModal } from "./InviteMemberModal";

/* ── Types ───────────────────────────────────────────────────────── */

interface Member {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  is_platform_admin: boolean;
  joined_at: string;
  email: string;
  name: string;
  invited_by?: string;
  invited_by_name?: string | null;
}

interface PendingInvite {
  id: string;
  invitee_email: string;
  role: "admin" | "member" | "viewer";
  status: "pending" | "accepted" | "expired";
  created_at: string;
  expires_at: string;
}

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-accent/10 text-accent",
  admin: "bg-brain-training/10 text-brain-training",
  member: "bg-info/10 text-info",
  viewer: "bg-muted/20 text-muted-foreground",
};

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

/* ── Component ───────────────────────────────────────────────────── */

export function MembersTab({ orgId }: { orgId: string }) {
  const { currentRole, isPlatformAdmin } = useWorkspace();

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [removingUser, setRemovingUser] = useState<string | null>(null);

  const canManage = isPlatformAdmin || currentRole === "owner" || currentRole === "admin";

  /* ── Fetch members ─────────────────────────────────────────────── */
  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/org-members?orgId=${orgId}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to load members");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setMembers(data.members || []);
      setInvites(data.pendingInvitations || []);
    } catch {
      setError("Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  /* ── Role change ───────────────────────────────────────────────── */
  async function handleRoleChange(memberId: string, newRole: string) {
    setChangingRole(memberId);
    setError(null);
    try {
      const res = await fetch("/api/org-members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, memberId, role: newRole }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to change role");
        return;
      }
      await loadMembers();
    } catch {
      setError("Failed to change role");
    } finally {
      setChangingRole(null);
    }
  }

  /* ── Remove member ─────────────────────────────────────────────── */
  async function handleRemove(memberId: string) {
    if (!confirm("Are you sure you want to remove this member?")) return;
    setRemovingUser(memberId);
    setError(null);
    try {
      const res = await fetch("/api/org-members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, memberId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to remove member");
        return;
      }
      await loadMembers();
    } catch {
      setError("Failed to remove member");
    } finally {
      setRemovingUser(null);
    }
  }

  /* ── Revoke invite ─────────────────────────────────────────────── */
  async function handleRevokeInvite(inviteId: string) {
    if (!confirm("Revoke this invitation?")) return;
    try {
      const res = await fetch(`/api/org-members/invite?inviteId=${inviteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to revoke invite");
        return;
      }
      await loadMembers();
    } catch {
      setError("Failed to revoke invite");
    }
  }

  /* ── Render ────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
          {error}
        </div>
      )}

      {/* Header + Invite button */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-muted">
          {members.length} member{members.length !== 1 ? "s" : ""}
        </div>
        {canManage && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Invite Member
          </button>
        )}
      </div>

      {/* Members list */}
      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted border-b border-border-subtle bg-surface/50">
              <th className="text-left py-2.5 px-4 font-medium">Member</th>
              <th className="text-left py-2.5 px-4 font-medium">Role</th>
              <th className="text-left py-2.5 px-4 font-medium hidden sm:table-cell">Invited By</th>
              <th className="text-left py-2.5 px-4 font-medium">Joined</th>
              {canManage && <th className="text-right py-2.5 px-4 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr
                key={m.id}
                className="border-b border-border-subtle hover:bg-surface-hover transition-colors"
              >
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-accent uppercase">
                        {(m.name || m.email || "?").charAt(0)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">
                        {m.name || m.email?.split("@")[0]}
                      </div>
                      <div className="text-xs text-muted truncate">{m.email}</div>
                    </div>
                    {m.is_platform_admin && (
                      <span className="text-[10px] font-medium uppercase tracking-wider bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                        Admin
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4">
                  {canManage && m.role !== "owner" ? (
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.id, e.target.value)}
                      disabled={changingRole === m.id}
                      className="rounded-md bg-surface border border-border-subtle px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                    >
                      {ROLE_OPTIONS.filter((r) =>
                        currentRole === "owner" ? true : r.value !== "owner"
                      ).map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                        ROLE_COLORS[m.role] || ROLE_COLORS.viewer
                      }`}
                    >
                      {m.role}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-xs text-muted hidden sm:table-cell">
                  {m.invited_by_name || (
                    <span className="text-muted/50">—</span>
                  )}
                </td>
                <td className="py-3 px-4 text-xs text-muted font-mono">
                  {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "—"}
                </td>
                {canManage && (
                  <td className="py-3 px-4 text-right">
                    {m.role !== "owner" && (
                      <button
                        onClick={() => handleRemove(m.id)}
                        disabled={removingUser === m.id}
                        className="text-xs text-danger hover:text-danger/80 font-medium disabled:opacity-50"
                      >
                        {removingUser === m.id ? "Removing..." : "Remove"}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="mt-6">
          <h4 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
            Pending Invitations ({invites.length})
          </h4>
          <div className="rounded-lg border border-border-subtle overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted border-b border-border-subtle bg-surface/50">
                  <th className="text-left py-2 px-4 font-medium">Email</th>
                  <th className="text-left py-2 px-4 font-medium">Role</th>
                  <th className="text-left py-2 px-4 font-medium">Expires</th>
                  {canManage && <th className="text-right py-2 px-4 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-border-subtle hover:bg-surface-hover transition-colors"
                  >
                    <td className="py-2.5 px-4 text-sm truncate max-w-[200px]">{inv.invitee_email}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                          ROLE_COLORS[inv.role] || ROLE_COLORS.viewer
                        }`}
                      >
                        {inv.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-muted font-mono">
                      {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : "—"}
                    </td>
                    {canManage && (
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() => handleRevokeInvite(inv.id)}
                          className="text-xs text-danger hover:text-danger/80 font-medium"
                        >
                          Revoke
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <InviteMemberModal
          orgId={orgId}
          onClose={() => setShowInviteModal(false)}
          onInvited={() => {
            setShowInviteModal(false);
            loadMembers();
          }}
        />
      )}
    </div>
  );
}
