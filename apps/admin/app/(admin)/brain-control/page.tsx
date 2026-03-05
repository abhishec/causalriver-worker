"use client";

import { useEffect, useState } from "react";

interface OrgBrainStatus {
  orgId: string;
  orgName: string;
  nightlyEnabled: boolean;
  weeklyEnabled: boolean;
  lastRun: string | null;
  signalCount: number;
}

export default function BrainControlPage() {
  const [orgs, setOrgs] = useState<OrgBrainStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchBrainStatus();
  }, []);

  async function fetchBrainStatus() {
    try {
      const resp = await fetch("/api/brain/status");
      if (resp.ok) {
        const data = await resp.json();
        setOrgs(data.orgs ?? []);
      }
    } catch {
      // silently fail — data will be empty
    } finally {
      setLoading(false);
    }
  }

  async function triggerBrainRun(orgId: string, type: "nightly" | "weekly") {
    setTriggering(`${orgId}-${type}`);
    setMessage(null);
    try {
      const resp = await fetch("/api/brain/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, type }),
      });
      if (resp.ok) {
        setMessage(`${type.charAt(0).toUpperCase() + type.slice(1)} brain run triggered for org ${orgId.slice(0, 8)}`);
      } else {
        setMessage("Failed to trigger brain run");
      }
    } catch {
      setMessage("Network error");
    } finally {
      setTriggering(null);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Brain Control</h1>
        <p className="text-[#888880] text-sm">Manage nightly and weekly brain runs per customer</p>
      </div>

      {message && (
        <div className="mb-6 p-3 rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/20 text-[#22c55e] text-sm">
          {message}
        </div>
      )}

      {/* Info card */}
      <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-white mb-3">Brain Run Schedule</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#1a1a1a] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🌙</span>
              <p className="text-sm font-medium text-white">Nightly Run</p>
            </div>
            <p className="text-xs text-[#888880]">
              Processes all cross-domain signals, updates RL feedback, compresses conversation memory.
              Runs at 2 AM UTC.
            </p>
          </div>
          <div className="bg-[#1a1a1a] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">📅</span>
              <p className="text-sm font-medium text-white">Weekly Run</p>
            </div>
            <p className="text-xs text-[#888880]">
              Deep knowledge federation, brain layer evolution (L25–L29), cognitive planning refresh.
              Runs Sunday at 3 AM UTC.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-[#ea580c] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#2a2a2a]">
            <h2 className="text-sm font-semibold text-white">Per-Customer Brain Control</h2>
          </div>
          <div className="divide-y divide-[#1e1e1e]">
            {orgs.length === 0 && (
              <div className="px-6 py-8 text-center text-[#888880] text-sm">
                No organization data available. Brain status API endpoint not configured.
              </div>
            )}
            {orgs.map((org) => (
              <div key={org.orgId} className="px-6 py-4 flex items-center gap-6">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{org.orgName}</p>
                  <p className="text-xs text-[#888880]">{org.orgId}</p>
                  {org.lastRun && (
                    <p className="text-xs text-[#555] mt-0.5">Last run: {new Date(org.lastRun).toLocaleString()}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#888880]">{org.signalCount} signals</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => triggerBrainRun(org.orgId, "nightly")}
                    disabled={triggering === `${org.orgId}-nightly`}
                    className="px-3 py-1.5 text-xs rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-[#888880] hover:text-white hover:border-[#ea580c]/50 transition-colors disabled:opacity-50"
                  >
                    {triggering === `${org.orgId}-nightly` ? "Triggering..." : "Run Nightly"}
                  </button>
                  <button
                    onClick={() => triggerBrainRun(org.orgId, "weekly")}
                    disabled={triggering === `${org.orgId}-weekly`}
                    className="px-3 py-1.5 text-xs rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-[#888880] hover:text-white hover:border-[#3b82f6]/50 transition-colors disabled:opacity-50"
                  >
                    {triggering === `${org.orgId}-weekly` ? "Triggering..." : "Run Weekly"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
