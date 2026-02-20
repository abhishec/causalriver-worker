"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const supabase = createClient();

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const redirectTo = `${window.location.origin}/callback?type=recovery`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-2">Check your email</h2>
        <p className="text-muted mb-6">
          We sent a password reset link to <span className="text-foreground font-medium">{email}</span>
        </p>
        <p className="text-sm text-muted mb-6">
          Click the link in your email to reset your password. The link expires in 24 hours.
        </p>
        <Link href="/login" className="text-accent hover:text-accent-light text-sm">
          Back to sign in
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

      <h2 className="text-2xl font-bold mb-1">Reset your password</h2>
      <p className="text-muted mb-8">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleResetRequest} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1.5">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full px-4 py-2.5 rounded-lg bg-input border border-input-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-input-focus focus:border-transparent transition-colors"
            required
            autoFocus
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Sending link..." : "Send Reset Link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Remember your password?{" "}
        <Link href="/login" className="text-accent hover:text-accent-light font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}
