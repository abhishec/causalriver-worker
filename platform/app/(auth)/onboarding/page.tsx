"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState("");

  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserName(
        user.user_metadata?.full_name ||
          user.email?.split("@")[0] ||
          "there"
      );
    }
    getUser();
  }, [supabase, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) {
      setError("Organization name is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get the user's org membership (created by the trigger on signup)
      const { data: membership, error: memberError } = await supabase
        .from("org_members")
        .select("organization_id, organizations(id, name, slug)")
        .eq("user_id", user.id)
        .eq("role", "owner")
        .single();

      if (memberError) throw memberError;

      const orgId = membership.organization_id;
      const newSlug =
        orgName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "") +
        "-" +
        user.id.substring(0, 8);

      // Update the organization name and slug
      const { error: updateError } = await supabase
        .from("organizations")
        .update({ name: orgName.trim(), slug: newSlug })
        .eq("id", orgId);

      if (updateError) throw updateError;

      // Mark onboarding as complete in user metadata
      await supabase.auth.updateUser({
        data: { onboarding_complete: true, org_name: orgName.trim() },
      });

      router.push("/overview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
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

      <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mb-6">
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

      <h2 className="text-2xl font-bold mb-1">
        Welcome, {userName}!
      </h2>
      <p className="text-muted mb-8">
        One last step — name your organization to get started.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="org" className="block text-sm font-medium mb-1.5">
            Organization name
          </label>
          <input
            id="org"
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Acme Inc."
            className="w-full px-4 py-2.5 rounded-lg bg-input border border-input-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-input-focus focus:border-transparent transition-colors"
            required
            autoFocus
          />
          <p className="mt-1.5 text-xs text-muted">
            This is your team&apos;s workspace. You can change it later in
            settings.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Setting up your brain..." : "Launch My Brain"}
        </button>
      </form>
    </div>
  );
}
