"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SEaaSResultPanel } from "@/components/copilot/SEaaSResultPanel";
import type { SEaaSDomainData } from "@/components/copilot/CopilotChat";

type SeverityKey = "debug" | "info" | "warn" | "error" | "fatal";

interface JobResult {
  jobId: string;
  status: "success" | "error";
  result?: SEaaSDomainData;
  error?: string;
  artifactId?: string;
}

async function pollJob(jobId: string): Promise<JobResult> {
  const MAX_ATTEMPTS = 90;
  let attempts = 0;
  while (attempts < MAX_ATTEMPTS) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`/api/se-aas/jobs/${jobId}`);
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
    const data = await res.json();
    if (data.status === "success" || data.status === "error") return data as JobResult;
    attempts++;
  }
  throw new Error("Job timed out after 3 minutes");
}

export default function LogQueryPage() {
  const [query, setQuery] = useState("");
  const [logs, setLogs] = useState("");
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [severity, setSeverity] = useState<Record<SeverityKey, boolean>>({
    debug: false, info: false, warn: false, error: true, fatal: true,
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedSeverity = (Object.keys(severity) as SeverityKey[]).filter((k) => severity[k]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || !logs.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/se-aas/log-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          logs: logs.split("\n").filter(Boolean),
          timeRange: { start: timeStart, end: timeEnd },
          severityFilter: selectedSeverity,
        }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
      const data = await res.json();
      const jobData = await pollJob(data.jobId);
      setResult(jobData);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const labelClass = "text-xs font-medium text-muted-foreground uppercase tracking-wider";
  const textareaClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground placeholder:text-muted p-3 resize-y focus:outline-none focus:border-accent focus:shadow-[var(--shadow-input-focus)]";
  const inputClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground p-2.5 focus:outline-none focus:border-accent focus:shadow-[var(--shadow-input-focus)]";
  const submitClass = "px-6 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <Link href="/se-aas" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors">
        ← SE-AAS Dashboard
      </Link>

      <div className="flex items-start gap-3">
        <span className="text-3xl">📋</span>
        <div>
          <h1 className="text-lg font-semibold">Log Query</h1>
          <p className="text-xs text-muted mt-0.5">
            Natural-language log querying with pattern extraction, anomaly detection, and root cause correlation.
          </p>
        </div>
      </div>

      <Card variant="default" padding="md">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className={labelClass}>Natural Language Query <span className="text-danger">*</span></label>
            <input type="text" className={inputClass} required
              placeholder="Show me all errors in the last 2 hours for the FRAML service"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Log Lines <span className="text-danger">*</span></label>
            <textarea className={`${textareaClass} font-mono`} rows={10} required
              placeholder="Paste log lines here (one per line)..."
              value={logs} onChange={(e) => setLogs(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Time Range <span className="text-muted normal-case tracking-normal">(optional)</span></label>
            <div className="grid grid-cols-2 gap-3">
              <input type="text" className={inputClass} placeholder="Start (e.g. 2024-01-15T10:00:00Z)"
                value={timeStart} onChange={(e) => setTimeStart(e.target.value)} />
              <input type="text" className={inputClass} placeholder="End (e.g. 2024-01-15T12:00:00Z)"
                value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Severity Filter</label>
            <div className="flex flex-wrap gap-3">
              {(Object.keys(severity) as SeverityKey[]).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={severity[k]}
                    onChange={(e) => setSeverity((prev) => ({ ...prev, [k]: e.target.checked }))}
                    className="accent-accent" />
                  <span className={k === "fatal" ? "text-danger" : k === "error" ? "text-danger/80" : k === "warn" ? "text-warning" : "text-muted"}>
                    {k.toUpperCase()}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 pt-1">
            <button type="submit" disabled={loading || !query.trim() || !logs.trim()} className={submitClass}>
              {loading ? "Querying…" : "Run Log Query"}
            </button>
            <Link href="/se-aas" className="text-xs text-muted hover:text-foreground transition-colors">Cancel</Link>
          </div>
        </form>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Analysing logs…
        </div>
      )}
      {error && <div className="rounded-lg bg-danger/10 border border-danger/20 p-4 text-sm text-danger">{error}</div>}
      {result && result.status === "success" && result.result && (
        <div className="h-[600px]">
          <SEaaSResultPanel data={result.result} />
          {result.artifactId && (
            <Link href={`/se-aas/artifacts/${result.artifactId}`}
              className="inline-block mt-3 text-xs text-accent hover:text-accent/80 transition-colors">View full artifact →</Link>
          )}
        </div>
      )}
      {result && result.status === "error" && (
        <div className="rounded-lg bg-danger/10 border border-danger/20 p-4 text-sm text-danger">{String(result.error)}</div>
      )}
    </div>
  );
}
