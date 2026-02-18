"use client";

import { useState } from "react";
import { StatusDot } from "@/components/ui/StatusDot";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

interface BrainTrainingSectionProps {
  orgId: string;
  connectors: Array<{
    id: string;
    connector_type: string;
    display_name: string;
    status: string;
    last_sync_at: string | null;
  }>;
}

interface TrainingStatus {
  status: 'idle' | 'running' | 'success' | 'error';
  step?: string;
  progress?: number;
  stats?: {
    signals: number;
    connectorsSynced: number;
    patterns: number;
  };
  error?: string;
}

export function BrainTrainingSection({ orgId, connectors }: BrainTrainingSectionProps) {
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatus>({ status: 'idle' });
  const [trainNowStatus, setTrainNowStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [lastTrainingDate, setLastTrainingDate] = useState<string | null>(null);

  const activeConnectors = connectors.filter(
    (c) => c.status === 'active' || c.status === 'connected'
  );
  const hasAnyConnector = activeConnectors.length > 0;

  const handleSyncAndTrain = async () => {
    if (!hasAnyConnector) {
      setTrainingStatus({
        status: 'error',
        error: 'Please connect at least one data source first',
      });
      return;
    }

    setTrainingStatus({ status: 'running', step: 'Starting...', progress: 0 });

    try {
      // ── Step 1: Sync ALL active connectors ────────────────────────────
      // Pass skipBrainCycle=true so sync-all does NOT auto-fire a brain cycle
      // internally — we call it ourselves below so we can show accurate progress.
      setTrainingStatus({
        status: 'running',
        step: `Syncing ${activeConnectors.length} connector(s)...`,
        progress: 15,
      });

      const syncResponse = await fetch('/api/connectors/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId, skipBrainCycle: true }),
      });

      if (!syncResponse.ok) {
        const syncErr = await syncResponse.json().catch(() => ({}));
        throw new Error((syncErr as any).error || 'Connector sync failed');
      }

      const syncData = await syncResponse.json();
      const totalSignals: number = syncData.totalSignals || 0;
      const connectorsSynced: number = syncData.successCount || 0;

      // ── Step 2: P0 Early Warning analysis (non-blocking) ──────────────
      // Detects velocity collapse, bottleneck risk, and P0 patterns.
      // If this step fails we log it but continue — sync+brain still succeeded.
      setTrainingStatus({
        status: 'running',
        step: 'Running P0 Early Warning analysis...',
        progress: 40,
        stats: { signals: totalSignals, connectorsSynced, patterns: 0 },
      });

      let patternsFound = 0;
      try {
        const analyzeResponse = await fetch('/api/early-warning/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId: orgId, lookbackDays: 90 }),
        });
        if (analyzeResponse.ok) {
          const analyzeData = await analyzeResponse.json();
          // Use real counts from the report, not a hardcoded guess
          patternsFound =
            (analyzeData.report?.velocityAlerts?.length ?? 0) +
            (analyzeData.report?.bottlenecks?.length ?? 0) +
            (analyzeData.patterns?.length ?? 0);
        }
      } catch (p0Err) {
        console.warn('[BrainTraining] P0 analysis non-fatal:', p0Err);
      }

      // ── Step 3: Full brain training cycle (all 30 layers) ─────────────
      // Full cognitive pipeline: signal processing → causal inference →
      // entity linking → strategic synthesis → memory consolidation.
      setTrainingStatus({
        status: 'running',
        step: 'Running full brain training cycle (30 layers)...',
        progress: 65,
        stats: { signals: totalSignals, connectorsSynced, patterns: patternsFound },
      });

      const brainResponse = await fetch('/api/brain/cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId, mode: 'full' }),
      });

      if (!brainResponse.ok) {
        const brainErr = await brainResponse.json().catch(() => ({}));
        throw new Error((brainErr as any).error || 'Brain training cycle failed');
      }

      const brainData = await brainResponse.json();
      const brainPatterns: number =
        brainData.result?.patterns?.length ||
        brainData.result?.surfacedInsights ||
        0;
      const finalPatterns = Math.max(patternsFound, brainPatterns);

      // ── Step 4: Sleep cycle — consolidate memory ───────────────────────
      // Strengthens high-confidence causal edges and crystallises new
      // knowledge into long-term memory. Non-blocking.
      setTrainingStatus({
        status: 'running',
        step: 'Consolidating memory (sleep cycle)...',
        progress: 88,
        stats: { signals: totalSignals, connectorsSynced, patterns: finalPatterns },
      });

      try {
        await fetch('/api/brain/cycle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId: orgId, mode: 'sleep' }),
        });
      } catch (sleepErr) {
        console.warn('[BrainTraining] Sleep cycle non-fatal:', sleepErr);
      }

      // ── Complete ───────────────────────────────────────────────────────
      setTrainingStatus({
        status: 'success',
        step: 'Sync & training complete!',
        progress: 100,
        stats: { signals: totalSignals, connectorsSynced, patterns: finalPatterns },
      });

      setLastTrainingDate(new Date().toISOString());
    } catch (error: any) {
      console.error('[Brain Training] Error:', error);
      setTrainingStatus({
        status: 'error',
        error: error.message || 'Training failed. Please try again.',
      });
    }
  };

  const handleTrainNow = async () => {
    setTrainNowStatus('running');
    try {
      const res = await fetch('/api/brain/cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId, mode: 'full' }),
      });
      if (!res.ok) throw new Error('Brain cycle failed');
      setTrainNowStatus('success');
      setTimeout(() => setTrainNowStatus('idle'), 5000);
    } catch {
      setTrainNowStatus('error');
      setTimeout(() => setTrainNowStatus('idle'), 5000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sync & Train Card */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-lg shrink-0">
            🧠
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold mb-1">Sync & Train Brain</h3>
            <p className="text-xs text-muted mb-4">
              Sync all connected data sources and train your Brain. This pulls data from
              every active connector (GitHub, Jira, Slack, Linear, etc.) and runs a training cycle.
            </p>

            {/* Prerequisites — show all connectors */}
            <div className="mb-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted mb-2">
                Data Sources
              </div>
              {activeConnectors.length > 0 ? (
                <div className="space-y-1.5">
                  {activeConnectors.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <StatusDot type="active" size="sm" />
                      <span className="text-foreground capitalize">{c.connector_type}</span>
                      {c.display_name && (
                        <span className="text-muted">({c.display_name})</span>
                      )}
                      <Badge variant="success" size="xs">Connected</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <StatusDot type="inactive" size="sm" />
                  <span className="text-muted">No connectors active</span>
                  <Badge variant="outline" size="xs">Required</Badge>
                </div>
              )}
            </div>

            {/* Training Status */}
            {trainingStatus.status !== 'idle' && (
              <div className={cn(
                "mb-4 p-3 rounded-lg border",
                trainingStatus.status === 'success' ? "bg-success/5 border-success/20"
                : trainingStatus.status === 'error' ? "bg-danger/5 border-danger/20"
                : "bg-surface border-border-subtle"
              )}>
                <div className="flex items-center justify-between mb-2">
                  <span className={cn(
                    "text-xs font-medium",
                    trainingStatus.status === 'success' && "text-success",
                    trainingStatus.status === 'error' && "text-danger",
                  )}>
                    {trainingStatus.status === 'running' && 'Training in progress...'}
                    {trainingStatus.status === 'success' && '✓ Training complete!'}
                    {trainingStatus.status === 'error' && '✗ Training failed'}
                  </span>
                  {trainingStatus.status === 'running' && trainingStatus.progress !== undefined && (
                    <span className="text-xs text-muted">{trainingStatus.progress}%</span>
                  )}
                </div>

                {trainingStatus.step && (
                  <p className="text-xs text-muted mb-2">{trainingStatus.step}</p>
                )}

                {trainingStatus.progress !== undefined && trainingStatus.status !== 'error' && (
                  <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all duration-500 ease-in-out",
                        trainingStatus.status === 'success' ? 'bg-success' : 'bg-accent'
                      )}
                      style={{ width: `${trainingStatus.progress}%` }}
                    />
                  </div>
                )}

                {trainingStatus.stats && (
                  <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-border-subtle">
                    <div>
                      <div className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Signals</div>
                      <div className="text-sm font-semibold">{trainingStatus.stats.signals.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Sources Synced</div>
                      <div className="text-sm font-semibold">{trainingStatus.stats.connectorsSynced}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Patterns</div>
                      <div className="text-sm font-semibold">{trainingStatus.stats.patterns}</div>
                    </div>
                  </div>
                )}

                {trainingStatus.error && (
                  <p className="text-xs text-danger mt-2">{trainingStatus.error}</p>
                )}
              </div>
            )}

            {/* Last Training Info */}
            {lastTrainingDate && trainingStatus.status === 'success' && (
              <div className="mb-4 text-xs text-muted">
                Last trained: {new Date(lastTrainingDate).toLocaleString()}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSyncAndTrain}
                disabled={!hasAnyConnector || trainingStatus.status === 'running'}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-medium transition-all",
                  hasAnyConnector && trainingStatus.status !== 'running'
                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                    : "bg-surface text-muted cursor-not-allowed"
                )}
              >
                {trainingStatus.status === 'running' ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Syncing & Training...
                  </span>
                ) : (
                  'Sync & Train'
                )}
              </button>

              <button
                onClick={handleTrainNow}
                disabled={trainNowStatus === 'running'}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-medium transition-all border",
                  trainNowStatus === 'running'
                    ? "bg-surface text-muted cursor-not-allowed border-border-subtle"
                    : trainNowStatus === 'success'
                    ? "bg-success/10 text-success border-success/30"
                    : trainNowStatus === 'error'
                    ? "bg-danger/10 text-danger border-danger/30"
                    : "bg-surface text-foreground border-border hover:border-accent/30"
                )}
              >
                {trainNowStatus === 'running' ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Training...
                  </span>
                ) : trainNowStatus === 'success' ? (
                  'Brain cycle started!'
                ) : trainNowStatus === 'error' ? (
                  'Cycle failed'
                ) : (
                  'Train Now'
                )}
              </button>
            </div>

            {!hasAnyConnector && (
              <p className="text-xs text-muted mt-2">
                Go to <span className="font-medium">Connections</span> tab to connect a data source first
              </p>
            )}
          </div>
        </div>
      </div>

      {/* What Gets Trained */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <h3 className="text-sm font-semibold mb-3">What gets trained?</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded bg-accent/10 flex items-center justify-center text-xs shrink-0 mt-0.5">
              🔄
            </div>
            <div className="flex-1">
              <div className="text-xs font-medium mb-0.5">Multi-Domain Signals (L1 Ingestion)</div>
              <p className="text-xs text-muted">
                GitHub (PRs, commits, reviews), Jira (issues, sprints), Slack (activity), Linear (issues), and more
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded bg-accent/10 flex items-center justify-center text-xs shrink-0 mt-0.5">
              📊
            </div>
            <div className="flex-1">
              <div className="text-xs font-medium mb-0.5">P0 Early Warning Patterns</div>
              <p className="text-xs text-muted">
                Velocity Collapse detection (25% drop threshold), Bottleneck Risk (Gini coefficient, reviewer concentration)
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded bg-accent/10 flex items-center justify-center text-xs shrink-0 mt-0.5">
              🤖
            </div>
            <div className="flex-1">
              <div className="text-xs font-medium mb-0.5">Brain Training Cycle (L1–L30)</div>
              <p className="text-xs text-muted">
                Full cognitive pipeline: signal processing, pattern recognition, causal inference, and memory consolidation
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Continuous Learning */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center text-base shrink-0">
            ✓
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold mb-1">Continuous Learning</h3>
            <p className="text-xs text-muted">
              After initial training, your Brain learns automatically from real-time webhooks
              across all connected sources. A full brain cycle runs nightly at 5 AM UTC
              and memory consolidation runs at 4 AM UTC — or trigger either manually above.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
