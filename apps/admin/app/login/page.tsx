"use client";

import { useState, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const errorParam = searchParams?.get("error");

  const [email, setEmail] = useState("abhishek@tookitaki.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam === "unauthorized" ? "Access denied. Superadmin only." : null
  );

  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError("Invalid credentials");
      setLoading(false);
      return;
    }

    // Check if this is the superadmin
    const { data: { user } } = await supabase.auth.getUser();
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "abhishek@tookitaki.com";
    if (user?.email !== adminEmail) {
      await supabase.auth.signOut();
      setError("Access denied. Superadmin only.");
      setLoading(false);
      return;
    }

    window.location.href = "/customers";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#ea580c]/10 border border-[#ea580c]/20 mb-4">
            <span className="text-2xl font-bold text-[#ea580c]">B</span>
          </div>
          <h1 className="text-2xl font-bold text-white">BrainOS Admin</h1>
          <p className="text-[#888880] text-sm mt-1">Superadmin Platform</p>
        </div>

        {/* Card */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-8">
          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#f0ede8] mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0ede8] placeholder:text-[#888880] focus:outline-none focus:ring-2 focus:ring-[#ea580c]/50 focus:border-[#ea580c]/50 transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#f0ede8] mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-2.5 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0ede8] placeholder:text-[#888880] focus:outline-none focus:ring-2 focus:ring-[#ea580c]/50 focus:border-[#ea580c]/50 transition-colors"
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-[#ea580c] hover:bg-[#c2410c] text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[#888880] mt-6">
          Restricted to authorized personnel only
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
