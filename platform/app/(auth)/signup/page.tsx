"use client";

import { useState, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function SignupForm() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const inviteEmail = searchParams.get("email") || "";

  const [email, setEmail] = useState(inviteEmail);
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const supabase = createClient();

  const isInviteFlow = !!inviteToken;

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Build redirect URL — if invite flow, redirect to invite page after email confirmation
    const redirectTo = isInviteFlow
      ? `${window.location.origin}/callback?next=/invite/${inviteToken}`
      : `${window.location.origin}/callback`;

    // Create user account with org name in metadata
    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          // Only set org_name if NOT in invite flow (invite users join existing org)
          ...(isInviteFlow ? {} : { org_name: orgName }),
          ...(isInviteFlow ? { invite_token: inviteToken } : {}),
        },
      },
    });

    if (signupError) {
      setError(signupError.message);
      setLoading(false);
      return;
    }

    if (data?.user) {
      setSuccess(true);
    }
    setLoading(false);
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-2">Check your email</h2>
        <p className="text-muted mb-6">
          We sent a confirmation link to <span className="text-foreground font-medium">{email}</span>
        </p>
        <p className="text-sm text-muted">
          {isInviteFlow
            ? "Click the link to activate your account and join the organization."
            : "Click the link to activate your account and access your brain."}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-2 mb-8">
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
          <span className="text-lg font-bold text-accent">N</span>
        </div>
        <span className="text-lg font-semibold">NexusBrain</span>
      </div>

      <h2 className="text-2xl font-bold mb-1">
        {isInviteFlow ? "Create your account" : "Create your brain"}
      </h2>
      <p className="text-muted mb-8">
        {isInviteFlow
          ? "Sign up to accept your invitation"
          : "Set up your organization and start learning"}
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSignup} className="space-y-4">
        {/* Only show org name field if NOT in invite flow */}
        {!isInviteFlow && (
          <div>
            <label htmlFor="org" className="block text-sm font-medium mb-1.5">Organization name</label>
            <input
              id="org"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Inc."
              className="w-full px-4 py-2.5 rounded-lg bg-input border border-input-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-input-focus focus:border-transparent transition-colors"
              required
            />
          </div>
        )}
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1.5">Work email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full px-4 py-2.5 rounded-lg bg-input border border-input-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-input-focus focus:border-transparent transition-colors"
            required
            readOnly={isInviteFlow && !!inviteEmail}
          />
          {isInviteFlow && inviteEmail && (
            <p className="text-xs text-muted mt-1">
              This email matches your invitation. Use this to accept.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1.5">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            minLength={6}
            className="w-full px-4 py-2.5 rounded-lg bg-input border border-input-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-input-focus focus:border-transparent transition-colors"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? isInviteFlow
              ? "Creating account..."
              : "Creating your brain..."
            : isInviteFlow
              ? "Create Account & Accept Invite"
              : "Create Account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link
          href={isInviteFlow ? `/login?next=/invite/${inviteToken}` : "/login"}
          className="text-accent hover:text-accent-light font-medium"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
