"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface InviteInfo {
  orgName: string;
  role: string;
  inviteeEmail: string;
  expired: boolean;
  accepted: boolean;
}

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) ?? "";

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function load() {
      // Check if user is logged in
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);

      // Fetch invitation info
      const { data: invite } = await supabase
        .from("org_invitations")
        .select(
          "invitee_email, role, status, expires_at, organizations:organization_id(name)"
        )
        .eq("token", token)
        .maybeSingle();

      if (invite) {
        const org = (invite as any).organizations;
        setInfo({
          orgName: org?.name || "Unknown AI Worker",
          role: invite.role,
          inviteeEmail: invite.invitee_email,
          expired: new Date(invite.expires_at) < new Date(),
          accepted: invite.status === "accepted",
        });
      }

      setLoading(false);
    }
    load();
  }, [token, supabase]);

  async function handleAccept() {
    setAccepting(true);
    setError(null);

    try {
      const res = await fetch("/api/org-members/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to accept invitation");
        setAccepting(false);
        return;
      }

      setSuccess(true);

      // Set the workspace in localStorage + cookie and redirect (new + old keys for compat)
      if (data.orgId) {
        localStorage.setItem("nexus_current_workspace", data.orgId);
        localStorage.setItem("nexus_current_org", data.orgId);
        document.cookie = `nexus_current_workspace=${data.orgId};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
        document.cookie = `nexus_current_org=${data.orgId};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
      }

      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch {
      setError("Failed to accept invitation — please try again or request a new invite");
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted text-sm">Loading invitation...</p>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-danger/20 flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-danger"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-2">Invalid Invitation</h2>
        <p className="text-muted mb-6">
          This invitation link is invalid or has been revoked.
        </p>
        <Link href="/login" className="text-accent hover:text-accent-light text-sm">
          Go to login
        </Link>
      </div>
    );
  }

  if (info.accepted) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-success"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-2">Already Accepted</h2>
        <p className="text-muted mb-6">
          This invitation has already been accepted.
        </p>
        <Link
          href="/dashboard"
          className="text-accent hover:text-accent-light text-sm"
        >
          Go to copilot
        </Link>
      </div>
    );
  }

  if (info.expired) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-warning"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-2">Invitation Expired</h2>
        <p className="text-muted mb-6">
          This invitation to <strong>{info.orgName}</strong> has expired. Ask your
          admin to send a new one.
        </p>
        <Link href="/login" className="text-accent hover:text-accent-light text-sm">
          Go to login
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-success"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-2">Welcome!</h2>
        <p className="text-muted mb-6">
          You&apos;ve joined <strong>{info.orgName}</strong>. Redirecting to
          dashboard...
        </p>
      </div>
    );
  }

  /* Main invite acceptance UI */
  return (
    <div>
      <div className="lg:hidden flex items-center gap-2 mb-8">
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
          <span className="text-lg font-bold text-accent">N</span>
        </div>
        <span className="text-lg font-semibold">Brain OS</span>
      </div>

      <h2 className="text-2xl font-bold mb-1">You&apos;re invited</h2>
      <p className="text-muted mb-8">
        Join <strong className="text-foreground">{info.orgName}</strong> as a{" "}
        <span className="capitalize">{info.role}</span>
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
          {error}
        </div>
      )}

      <div className="rounded-xl bg-card border border-border-subtle p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
            <span className="text-xl font-bold text-accent">
              {info.orgName?.charAt(0) ?? "?"}
            </span>
          </div>
          <div>
            <div className="font-medium">{info.orgName}</div>
            <div className="text-sm text-muted capitalize">
              Role: {info.role}
            </div>
          </div>
        </div>
      </div>

      {user ? (
        /* Logged in — show accept button */
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Logged in as{" "}
            <span className="text-foreground font-medium">{user.email}</span>
          </p>
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground font-medium transition-colors disabled:opacity-50"
          >
            {accepting ? "Joining..." : "Accept & Join"}
          </button>
        </div>
      ) : (
        /* Not logged in — show login/signup options */
        <div className="space-y-3">
          <p className="text-sm text-muted mb-4">
            Sign in or create an account to accept this invitation.
          </p>
          <Link
            href={`/login?next=/invite/${token}`}
            className="block w-full py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground font-medium transition-colors text-center"
          >
            Sign in to accept
          </Link>
          <Link
            href={`/signup?invite=${token}&email=${encodeURIComponent(info.inviteeEmail)}`}
            className="block w-full py-2.5 rounded-lg border border-border hover:border-accent/30 hover:bg-accent/5 text-sm text-muted hover:text-foreground transition-colors text-center"
          >
            Create account & accept
          </Link>
        </div>
      )}
    </div>
  );
}
