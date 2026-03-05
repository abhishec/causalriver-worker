"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [checking, setChecking] = useState(true);

  const supabase = createClient();

  // Check if user has a valid recovery session
  useEffect(() => {
    async function checkSession() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setNoSession(true);
      }
      setChecking(false);
    }
    checkSession();
  }, [supabase]);

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError("Password reset failed");
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  }

  // Loading spinner while checking session
  if (checking) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // No valid recovery session — link is invalid or expired
  if (noSession) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-2">Invalid or expired link</h2>
        <p className="text-muted mb-6">
          This password reset link is no longer valid. Please request a new one.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block w-full py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground font-medium transition-colors text-center"
        >
          Request new link
        </Link>
      </div>
    );
  }

  // Password successfully reset
  if (success) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-2">Password updated</h2>
        <p className="text-muted mb-6">
          Your password has been successfully reset. You can now sign in with your new password.
        </p>
        <Link
          href="/login"
          className="inline-block w-full py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground font-medium transition-colors text-center"
        >
          Sign in
        </Link>
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

      <h2 className="text-2xl font-bold mb-1">Set a new password</h2>
      <p className="text-muted mb-8">
        Enter your new password below. Must be at least 6 characters.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handlePasswordReset} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1.5">New password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            minLength={6}
            className="w-full px-4 py-2.5 rounded-lg bg-input border border-input-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-input-focus focus:border-transparent transition-colors"
            required
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1.5">Confirm password</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
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
          {loading ? "Resetting password..." : "Reset Password"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="text-accent hover:text-accent-light font-medium">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
