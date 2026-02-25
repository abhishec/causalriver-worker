"use client";

import { useState, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function SignupForm() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams?.get("invite") ?? null;
  const inviteEmail = searchParams?.get("email") || "";

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
            ? "Click the link to activate your account and join the AI Worker."
            : "Click the link to activate your account and access your AI Worker."}
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
        <span className="text-lg font-semibold">Brain OS</span>
      </div>

      <h2 className="text-2xl font-bold mb-1">
        {isInviteFlow ? "Create your account" : "Create your AI Worker"}
      </h2>
      <p className="text-muted mb-8">
        {isInviteFlow
          ? "Sign up to accept your invitation"
          : "Set up your AI Worker and start learning"}
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
            <label htmlFor="org" className="block text-sm font-medium mb-1.5">Workspace name</label>
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
              : "Setting up..."
            : isInviteFlow
              ? "Create Account & Accept Invite"
              : "Create Account"}
        </button>
      </form>

      {/* OAuth divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border-subtle" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="px-3 bg-card text-muted">or continue with</span>
        </div>
      </div>

      {/* Social Login Buttons */}
      <div className="flex gap-3">
        <button
          onClick={async () => {
            setLoading(true);
            const callbackUrl = isInviteFlow
              ? `${window.location.origin}/callback?next=/invite/${inviteToken}`
              : `${window.location.origin}/callback`;
            await supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: callbackUrl },
            });
          }}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border hover:border-accent/30 hover:bg-surface-hover text-sm transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Google
        </button>
        <button
          onClick={async () => {
            setLoading(true);
            const callbackUrl = isInviteFlow
              ? `${window.location.origin}/callback?next=/invite/${inviteToken}`
              : `${window.location.origin}/callback`;
            await supabase.auth.signInWithOAuth({
              provider: "github",
              options: { redirectTo: callbackUrl },
            });
          }}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border hover:border-accent/30 hover:bg-surface-hover text-sm transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          GitHub
        </button>
      </div>

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
