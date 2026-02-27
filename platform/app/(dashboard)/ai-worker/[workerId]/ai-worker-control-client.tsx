"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { OverviewTab } from "./tabs/OverviewTab";
import { AgentsTab } from "./tabs/AgentsTab";
import { ConnectorsTab } from "./tabs/ConnectorsTab";
import { BrainTab } from "./tabs/BrainTab";

/* ── Types ──────────────────────────────────────────────────────────────── */

type ActiveTab = "overview" | "agents" | "connectors" | "brain";

interface RLStatus {
  signalsThisHour: number;
  signalsThisSession: number;
  totalSignals24h: number;
  learningVelocity: number;
  improvementThisSession: number;
  feedbackTotal: number;
  feedbackHelpful: number;
  feedbackNotHelpful: number;
}

interface AIWorkerControlClientProps {
  orgId: string;
  workerId: string;
}

/* ── Tab config ─────────────────────────────────────────────────────────── */

const TABS: { id: ActiveTab; label: string; icon: string }[] = [
  {
    id: "overview",
    label: "Overview",
    icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
  },
  {
    id: "agents",
    label: "Agents",
    icon: "M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7",
  },
  {
    id: "connectors",
    label: "Connectors",
    icon: "M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244",
  },
  {
    id: "brain",
    label: "Brain",
    icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
  },
];

/* ── Worker Header ──────────────────────────────────────────────────────── */

function WorkerHeader({
  workerName,
  serviceMode,
  rlStatus,
  onOpenCopilot,
  onOpenSettings,
}: {
  workerName: string;
  serviceMode: string;
  rlStatus: RLStatus | null;
  onOpenCopilot: () => void;
  onOpenSettings: () => void;
}) {
  const isActive = true; // Workers are active by default; extend with real status later

  const serviceBadge: Record<string, { label: string; color: string }> = {
    seaas: { label: "SE-aaS", color: "bg-blue-500/10 text-blue-400" },
    aas: { label: "AAAS", color: "bg-emerald-500/10 text-emerald-400" },
    general: { label: "General AI", color: "bg-accent/10 text-accent" },
  };
  const badge = serviceBadge[serviceMode] ?? { label: serviceMode || "General AI", color: "bg-accent/10 text-accent" };

  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      {/* Left: name + mode + status */}
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 mb-1.5">
          {/* Status dot */}
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${isActive ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`}
          />
          <h1 className="text-xl font-semibold text-foreground truncate">{workerName}</h1>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${badge.color}`}>
            {badge.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          AI Worker Control Center
          {rlStatus && rlStatus.learningVelocity > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-brain-training">
              <span className="w-1.5 h-1.5 rounded-full bg-brain-training animate-pulse" />
              Learning active
            </span>
          )}
        </p>
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onOpenCopilot}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
            />
          </svg>
          Open Copilot
        </button>
        <button
          onClick={onOpenSettings}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-surface border border-border-subtle text-foreground hover:bg-surface-hover transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────────── */

export function AIWorkerControlClient({ orgId, workerId }: AIWorkerControlClientProps) {
  const router = useRouter();

  // All hooks MUST come before any early returns (ESLint hooks rule)
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [workerName, setWorkerName] = useState("AI Worker");
  const [serviceMode, setServiceMode] = useState("general");
  const [rlStatus, setRLStatus] = useState<RLStatus | null>(null);
  const [mounted, setMounted] = useState(false);

  // Read worker name and service mode from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const name = localStorage.getItem("nexus_ai_worker_name");
    const service = localStorage.getItem("nexus_service_mode");
    if (name) setWorkerName(name);
    if (service) setServiceMode(service);
  }, []);

  // Fetch RL status for the header indicator
  const fetchRLStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/brain/rl-status");
      if (res.ok) {
        const data = await res.json();
        setRLStatus(data);
      }
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchRLStatus();
    const interval = setInterval(fetchRLStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchRLStatus]);

  const handleOpenCopilot = useCallback(() => {
    router.push("/copilot");
  }, [router]);

  const handleOpenSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  // Show a minimal state before hydration to avoid flash
  if (!mounted) {
    return (
      <div className="space-y-6">
        <div className="h-16 bg-surface-hover rounded-xl animate-pulse" />
        <div className="h-10 bg-surface-hover rounded-lg animate-pulse" />
        <div className="h-64 bg-surface-hover rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Worker Header */}
      <WorkerHeader
        workerName={workerName}
        serviceMode={serviceMode}
        rlStatus={rlStatus}
        onOpenCopilot={handleOpenCopilot}
        onOpenSettings={handleOpenSettings}
      />

      {/* Tab Navigation */}
      <div className="flex items-center gap-0 border-b border-border-subtle mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border-subtle"
            }`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "overview" && <OverviewTab orgId={orgId} />}
        {activeTab === "agents" && <AgentsTab orgId={orgId} />}
        {activeTab === "connectors" && <ConnectorsTab orgId={orgId} />}
        {activeTab === "brain" && <BrainTab orgId={orgId} />}
      </div>
    </div>
  );
}
