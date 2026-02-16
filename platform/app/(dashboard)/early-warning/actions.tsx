'use client';

import { useState } from 'react';
import Link from 'next/link';

interface EarlyWarningActionsProps {
  orgId: string;
}

export function EarlyWarningActions({ orgId }: EarlyWarningActionsProps) {
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

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

  return (
    <div className="rounded-xl bg-card border border-border-subtle p-5">
      <h3 className="text-sm font-medium mb-4">Setup & Actions</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
      </div>
    </div>
  );
}
