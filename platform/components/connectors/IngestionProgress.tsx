"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

interface IngestionProgressProps {
  onComplete?: () => void;
}

interface ProgressState {
  connected: boolean;
  status: string;
  ingestionProgress: {
    step: string;
    message: string;
    filesProcessed?: number;
    totalFiles?: number;
    symbolsFound?: number;
    depEdges?: number;
    depEntities?: number;
    stats?: Record<string, number>;
    completedAt?: string;
  } | null;
  signalsCount: number;
  codeFilesIndexed: number;
  repo?: { fullName: string; language: string; stars: number };
}

const STEP_ORDER = [
  "syncing_signals",
  "signals_complete",
  "fetching_tree",
  "parsing",
  "building_graphs",
  "building_expertise",
  "building_collaboration",
  "persisting",
  "complete",
];

const STEP_LABELS: Record<string, string> = {
  syncing_signals: "Syncing Signals",
  signals_complete: "Signals Ready",
  fetching_tree: "Fetching File Tree",
  parsing: "Parsing Source Code",
  building_graphs: "Building Dependency Graph",
  building_expertise: "Building Expertise Map",
  building_collaboration: "Building Collaboration Network",
  persisting: "Persisting to Database",
  complete: "Complete",
  error: "Error",
};

export function IngestionProgress({ onComplete }: IngestionProgressProps) {
  const router = useRouter();
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/connectors/github/status");
      if (res.ok) {
        const data = await res.json();
        setProgress(data);

        // Stop polling when complete
        if (data.ingestionProgress?.step === "complete") {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      }
    } catch {
      // Ignore fetch errors during polling
    }
  }, []);

  // Start polling when ingesting
  useEffect(() => {
    if (isIngesting) {
      fetchStatus();
      intervalRef.current = setInterval(fetchStatus, 3000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [isIngesting, fetchStatus]);

  // Fetch initial status
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleStartIngestion = async () => {
    if (!tokenInput.trim()) {
      setError("GitHub token is required to start ingestion");
      return;
    }
    setError("");
    setIsIngesting(true);

    try {
      // Step 1: Sync signals
      const syncRes = await fetch("/api/connectors/github/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });

      if (!syncRes.ok) {
        const syncErr = await syncRes.json();
        setError(syncErr.error || "Signal sync failed");
        setIsIngesting(false);
        return;
      }

      // Step 2: Ingest code
      const ingestRes = await fetch("/api/connectors/github/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });

      if (!ingestRes.ok) {
        const ingestErr = await ingestRes.json();
        setError(ingestErr.error || "Code ingestion failed");
        setIsIngesting(false);
        return;
      }

      setIsIngesting(false);
      await fetchStatus();
    } catch (err: any) {
      setError(err.message || "Ingestion failed");
      setIsIngesting(false);
    }
  };

  const currentStep = progress?.ingestionProgress?.step || "idle";
  const isComplete = currentStep === "complete";
  const isError = currentStep === "error";
  const stepIndex = STEP_ORDER.indexOf(currentStep);
  const progressPercent = isComplete
    ? 100
    : stepIndex >= 0
      ? Math.round((stepIndex / (STEP_ORDER.length - 1)) * 100)
      : 0;

  const stats = progress?.ingestionProgress?.stats;

  return (
    <div className="rounded-xl bg-card border border-border-subtle p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isComplete
                ? "bg-success"
                : isError
                  ? "bg-danger"
                  : isIngesting
                    ? "bg-accent animate-pulse"
                    : "bg-muted"
            }`}
          />
          <h3 className="text-sm font-semibold">Brain Ingestion Pipeline</h3>
        </div>
        {progress?.repo && (
          <span className="text-xs text-muted">
            {progress.repo.fullName}
          </span>
        )}
      </div>

      {/* Token input if not yet started */}
      {!isIngesting && !isComplete && (
        <div className="flex gap-2">
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Enter GitHub token to start ingestion"
            className="flex-1 px-3 py-2 rounded-lg bg-surface border border-border text-sm placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/30"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleStartIngestion();
            }}
          />
          <button
            onClick={handleStartIngestion}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            Start
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-danger/5 border border-danger/20 p-3 text-xs text-danger">
          {error}
        </div>
      )}

      {/* Progress bar */}
      {(isIngesting || isComplete) && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">
                {isComplete
                  ? "Pipeline complete"
                  : STEP_LABELS[currentStep] || currentStep}
              </span>
              <span className="font-medium text-accent">{progressPercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-surface overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isComplete
                    ? "bg-success"
                    : isError
                      ? "bg-danger"
                      : "bg-accent"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Current step message */}
          {progress?.ingestionProgress?.message && (
            <p className="text-xs text-muted-foreground">
              {progress.ingestionProgress.message}
            </p>
          )}

          {/* Stats when complete */}
          {isComplete && stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="rounded-lg bg-surface/50 p-3">
                <div className="text-lg font-bold text-accent">
                  {stats.filesProcessed?.toLocaleString()}
                </div>
                <div className="text-[10px] text-muted">Files Parsed</div>
              </div>
              <div className="rounded-lg bg-surface/50 p-3">
                <div className="text-lg font-bold text-accent">
                  {stats.symbolsFound?.toLocaleString()}
                </div>
                <div className="text-[10px] text-muted">Symbols Found</div>
              </div>
              <div className="rounded-lg bg-surface/50 p-3">
                <div className="text-lg font-bold text-accent">
                  {stats.dependencyEdges?.toLocaleString()}
                </div>
                <div className="text-[10px] text-muted">Dependency Edges</div>
              </div>
              <div className="rounded-lg bg-surface/50 p-3">
                <div className="text-lg font-bold text-accent">
                  {stats.expertiseContributors?.toLocaleString()}
                </div>
                <div className="text-[10px] text-muted">Contributors</div>
              </div>
            </div>
          )}

          {/* Navigation when complete */}
          {isComplete && (
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => router.push("/code-intelligence")}
                className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                View Code Intelligence →
              </button>
              <button
                onClick={() => router.push("/copilot")}
                className="flex-1 py-2.5 rounded-xl bg-surface border border-border text-sm font-medium hover:bg-surface-hover transition-colors"
              >
                Ask Copilot →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
