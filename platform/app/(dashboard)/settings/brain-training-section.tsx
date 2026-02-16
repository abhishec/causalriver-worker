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
    entities: number;
    patterns: number;
  };
  error?: string;
}

export function BrainTrainingSection({ orgId, connectors }: BrainTrainingSectionProps) {
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatus>({ status: 'idle' });
  const [lastTrainingDate, setLastTrainingDate] = useState<string | null>(null);

  const githubConnector = connectors.find((c) => c.connector_type === 'github');
  const hasGitHubConnected = !!githubConnector;

  const handleInitialTraining = async () => {
    if (!hasGitHubConnected) {
      setTrainingStatus({
        status: 'error',
        error: 'Please connect GitHub first to train the Brain',
      });
      return;
    }

    setTrainingStatus({ status: 'running', step: 'Starting...', progress: 0 });

    try {
      // Step 1: Sync GitHub data
      setTrainingStatus({ status: 'running', step: 'Syncing GitHub repositories...', progress: 20 });
      const syncResponse = await fetch('/api/connectors/github/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId }),
      });

      if (!syncResponse.ok) {
        throw new Error('GitHub sync failed');
      }

      const syncData = await syncResponse.json();

      // Step 2: Wait for signals to be ingested
      setTrainingStatus({
        status: 'running',
        step: 'Ingesting signals into Brain L1...',
        progress: 50,
        stats: { signals: syncData.totalSignals || 0, entities: 0, patterns: 0 }
      });

      // Give it a few seconds for stream processor to finish
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Step 3: Run P0 Early Warning analysis
      setTrainingStatus({ status: 'running', step: 'Running P0 Early Warning analysis...', progress: 75 });
      const analyzeResponse = await fetch('/api/early-warning/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId, lookbackDays: 90 }),
      });

      if (!analyzeResponse.ok) {
        throw new Error('P0 analysis failed');
      }

      const analyzeData = await analyzeResponse.json();

      // Step 4: Complete
      setTrainingStatus({
        status: 'success',
        step: 'Brain trained successfully!',
        progress: 100,
        stats: {
          signals: syncData.totalSignals || 0,
          entities: syncData.totalEntities || 0,
          patterns: analyzeData.report ? 2 : 0, // velocity + bottleneck patterns
        }
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

  return (
    <div className="space-y-6">
      {/* Initial Training Card */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-lg shrink-0">
            🧠
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold mb-1">Initial Brain Training</h3>
            <p className="text-xs text-muted mb-4">
              Run this once to train your Brain with existing GitHub data (PRs, commits, reviews).
              This enables P0 Early Warning System and Copilot intelligence.
            </p>

            {/* Prerequisites */}
            <div className="mb-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted mb-2">
                Prerequisites
              </div>
              <div className="flex items-center gap-2 text-xs">
                {hasGitHubConnected ? (
                  <>
                    <StatusDot type="active" size="sm" />
                    <span className="text-foreground">GitHub connected</span>
                    <Badge variant="success" size="xs">Ready</Badge>
                  </>
                ) : (
                  <>
                    <StatusDot type="inactive" size="sm" />
                    <span className="text-muted">GitHub not connected</span>
                    <Badge variant="neutral" size="xs">Required</Badge>
                  </>
                )}
              </div>
            </div>

            {/* Training Status */}
            {trainingStatus.status !== 'idle' && (
              <div className="mb-4 p-3 rounded-lg bg-surface border border-border-subtle">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">
                    {trainingStatus.status === 'running' && '⚙️ Training in progress...'}
                    {trainingStatus.status === 'success' && '✅ Training complete!'}
                    {trainingStatus.status === 'error' && '❌ Training failed'}
                  </span>
                  {trainingStatus.status === 'running' && trainingStatus.progress !== undefined && (
                    <span className="text-xs text-muted">{trainingStatus.progress}%</span>
                  )}
                </div>

                {trainingStatus.step && (
                  <p className="text-xs text-muted mb-2">{trainingStatus.step}</p>
                )}

                {trainingStatus.progress !== undefined && (
                  <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all duration-300",
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
                      <div className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Entities</div>
                      <div className="text-sm font-semibold">{trainingStatus.stats.entities.toLocaleString()}</div>
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

            {/* Action Button */}
            <button
              onClick={handleInitialTraining}
              disabled={!hasGitHubConnected || trainingStatus.status === 'running'}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-medium transition-all",
                hasGitHubConnected && trainingStatus.status !== 'running'
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
                  Training...
                </span>
              ) : (
                'Run Initial Training'
              )}
            </button>

            {!hasGitHubConnected && (
              <p className="text-xs text-muted mt-2">
                → Go to <span className="font-medium">Connections</span> tab to connect GitHub first
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
              <div className="text-xs font-medium mb-0.5">Engineering Domain (L1 Ingestion)</div>
              <p className="text-xs text-muted">
                PRs (merged, opened, closed), commits, code reviews, issues → <code className="text-[10px] px-1 py-0.5 bg-surface rounded">cross_domain_signals</code>
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
              <div className="text-xs font-medium mb-0.5">Copilot Intelligence</div>
              <p className="text-xs text-muted">
                Enables answering: "Why is velocity collapsing?", "Who are the bottleneck reviewers?", "How can we improve cycle time?"
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
              After initial training, your Brain learns automatically from real-time GitHub webhooks.
              New PRs, reviews, and commits are ingested immediately. P0 analysis runs daily at 2 AM.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
