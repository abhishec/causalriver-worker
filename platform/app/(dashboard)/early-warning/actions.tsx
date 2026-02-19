'use client';

import { useState } from 'react';
import Link from 'next/link';

interface EarlyWarningActionsProps {
  orgId: string;
}

export function EarlyWarningActions({ orgId }: EarlyWarningActionsProps) {
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [digesting, setDigesting] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [digestResult, setDigestResult] = useState<{
    status: 'ok' | 'error';
    headline?: string;
    overallStatus?: string;
    topActions?: string[];
  } | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/connectors/github/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setSyncResult(`Synced ${data.signalsGenerated} signals from ${data.recordsProcessed} records in ${(data.duration_ms / 1000).toFixed(1)}s`);
      } else {
        setSyncResult(`Sync failed: ${data.error || data.errors?.join(', ')}`);
      }
    } catch (err: any) {
      setSyncResult(`Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const res = await fetch('/api/early-warning/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: orgId,
          lookbackDays: 90,
          forecastDays: 7,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const report = data.report;
        const parts = [
          `Velocity: ${report.velocityCollapse.detected ? '⚠️ COLLAPSE DETECTED' : '✅ Stable'}`,
          `Drop: ${report.velocityCollapse.percentDrop?.toFixed(1)}%`,
          `Bottleneck: ${report.bottleneckRisk.riskLevel} (score: ${report.bottleneckRisk.riskScore?.toFixed(0)})`,
          `Gini: ${report.bottleneckRisk.giniCoefficient?.toFixed(2)}`,
        ];
        if (report.signalsEmitted?.length > 0) {
          parts.push(`Signals: ${report.signalsEmitted.join(', ')}`);
        }
        setAnalysisResult(parts.join(' | '));
      } else {
        setAnalysisResult(`Analysis failed: ${data.error}`);
      }
    } catch (err: any) {
      setAnalysisResult(`Error: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  /**
   * Generate sprint digest — P0-01 spec:
   * "Receives a Slack/email digest every Monday morning summarising velocity
   *  collapse warnings and bottleneck risk from the past sprint."
   */
  const handleDigest = async (digestType: 'weekly_monday' | 'mid_sprint_urgent' = 'weekly_monday') => {
    setDigesting(true);
    setDigestResult(null);
    try {
      const res = await fetch('/api/se-aas/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digestType }),
      });
      const data = await res.json();
      if (data.success && data.digest) {
        setDigestResult({
          status: 'ok',
          headline: data.digest.headline,
          overallStatus: data.digest.overallStatus,
          topActions: data.digest.topActions ?? [],
        });
      } else {
        setDigestResult({ status: 'error', headline: `Failed: ${data.error ?? 'Unknown error'}` });
      }
    } catch (err: any) {
      setDigestResult({ status: 'error', headline: `Error: ${err.message}` });
    } finally {
      setDigesting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Setup & Actions row ────────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <h3 className="text-sm font-medium mb-4">Setup & Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Link
            href="/connectors"
            className="p-4 rounded-lg border border-border-subtle hover:bg-surface-hover transition-colors"
          >
            <div className="text-sm font-medium mb-1">1. Connect GitHub</div>
            <div className="text-xs text-muted">
              Connect your GitHub repositories to start ingesting PR data
            </div>
          </Link>

          <button
            className="p-4 rounded-lg border border-border-subtle hover:bg-surface-hover transition-colors text-left disabled:opacity-50"
            onClick={handleSync}
            disabled={syncing}
          >
            <div className="text-sm font-medium mb-1">
              {syncing ? '⏳ Syncing...' : '2. Sync Historical Data'}
            </div>
            <div className="text-xs text-muted">
              {syncResult || 'Backfill 90 days of PR/review data for velocity modeling'}
            </div>
          </button>

          <button
            className="p-4 rounded-lg border border-border-subtle hover:bg-surface-hover transition-colors text-left disabled:opacity-50"
            onClick={handleAnalysis}
            disabled={analyzing}
          >
            <div className="text-sm font-medium mb-1">
              {analyzing ? '⏳ Analyzing...' : '3. Run Analysis'}
            </div>
            <div className="text-xs text-muted">
              {analysisResult || 'Generate velocity + bottleneck risk predictions'}
            </div>
          </button>

          {/* 4. Generate Digest — P0-01 spec Monday Digest */}
          <button
            className="p-4 rounded-lg border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors text-left disabled:opacity-50"
            onClick={() => handleDigest('weekly_monday')}
            disabled={digesting}
          >
            <div className="text-sm font-medium mb-1 text-indigo-400">
              {digesting ? '⏳ Generating...' : '4. Generate Digest'}
            </div>
            <div className="text-xs text-muted">
              Generate Monday sprint digest with velocity + bottleneck summary
            </div>
          </button>
        </div>
      </div>

      {/* ── Digest Result Preview ─────────────────────────────────────────── */}
      {digestResult && (
        <div className={`rounded-xl border p-5 ${
          digestResult.status === 'error'
            ? 'border-danger/30 bg-danger/5'
            : digestResult.overallStatus === 'critical'
            ? 'border-danger/30 bg-danger/5'
            : digestResult.overallStatus === 'at_risk'
            ? 'border-warning/30 bg-warning/5'
            : 'border-success/30 bg-success/5'
        }`}>
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">📊</span>
                <h4 className="text-sm font-semibold">Sprint Digest Generated</h4>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  digestResult.overallStatus === 'critical' ? 'bg-danger/20 text-danger' :
                  digestResult.overallStatus === 'at_risk' ? 'bg-warning/20 text-warning' :
                  'bg-success/20 text-success'
                }`}>
                  {digestResult.overallStatus === 'critical' ? '🔴 Critical' :
                   digestResult.overallStatus === 'at_risk' ? '🟡 At Risk' : '🟢 Healthy'}
                </span>
              </div>
              <p className="text-sm text-foreground">{digestResult.headline}</p>
            </div>
            <button
              type="button"
              onClick={() => handleDigest('mid_sprint_urgent')}
              disabled={digesting}
              className="text-[10px] px-2.5 py-1.5 rounded-lg border border-border-subtle text-muted hover:text-foreground hover:bg-surface-hover transition-colors shrink-0"
            >
              Send Mid-Sprint Alert
            </button>
          </div>

          {digestResult.topActions && digestResult.topActions.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
                Top Recommended Actions
              </div>
              <ol className="space-y-1.5">
                {digestResult.topActions.map((action, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-surface border border-border-subtle flex items-center justify-center text-[9px] font-bold">
                      {i + 1}
                    </span>
                    {action}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <p className="text-[10px] text-muted mt-3">
            Digest saved to notifications. Slack/email delivery requires Slack or email connector to be configured.
          </p>
        </div>
      )}
    </div>
  );
}
