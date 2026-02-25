"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SEaaSResultPanel } from "@/components/copilot/SEaaSResultPanel";
import type { SEaaSDomainData } from "@/components/copilot/types";

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

export default function IncidentPage() {
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("high");
  const [logs, setLogs] = useState("");
  const [stackTrace, setStackTrace] = useState("");
  const [affectedServices, setAffectedServices] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/se-aas/incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          severity,
          logs: logs ? logs.split("\n") : [],
          stackTrace,
          affectedServices: affectedServices.split(",").map((s) => s.trim()).filter(Boolean),
        }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
      const data = await res.json();
      const jobData = await pollJob(data.jobId);
      setResult(jobData);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") setError("Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  const labelClass = "text-xs font-medium text-muted-foreground uppercase tracking-wider";
  const textareaClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground placeholder:text-muted p-3 resize-y focus:outline-none focus:border-accent focus:shadow-[var(--shadow-input-focus)]";
  const inputClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground p-2.5 focus:outline-none focus:border-accent focus:shadow-[var(--shadow-input-focus)]";
  const selectClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground p-2.5 focus:outline-none focus:border-accent focus:shadow-[var(--shadow-input-focus)] cursor-pointer";
  const submitClass = "px-6 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50";

  const severityBadge = severity === "critical" ? "danger" : severity === "high" ? "warning" : severity === "medium" ? "info" : "default";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <Link href="/se-aas" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors">
        ← SE-AAS Dashboard
      </Link>

      <div className="flex items-start gap-3">
        <span className="text-3xl">🚨</span>
        <div>
          <h1 className="text-lg font-semibold">Incident Analysis</h1>
          <p className="text-xs text-muted mt-0.5">
            AI-guided incident triage with root cause analysis, blast radius assessment, and remediation playbook.
          </p>
        </div>
      </div>

      <Card variant="default" padding="md">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className={labelClass}>Incident Description <span className="text-danger">*</span></label>
            <textarea className={textareaClass} rows={5} required
              placeholder="Describe the incident: what broke, when, symptoms..."
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className={labelClass}>Severity</label>
              <Badge variant={severityBadge as "danger" | "warning" | "info" | "default"} size="xs">{severity}</Badge>
            </div>
            <select className={selectClass} value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {["critical", "high", "medium", "low"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Error Logs <span className="text-muted normal-case tracking-normal">(optional)</span></label>
            <textarea className={`${textareaClass} font-mono`} rows={6}
              placeholder="Paste relevant error logs..."
              value={logs} onChange={(e) => setLogs(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Stack Trace <span className="text-muted normal-case tracking-normal">(optional)</span></label>
            <textarea className={`${textareaClass} font-mono`} rows={5}
              placeholder="Paste stack trace if available..."
              value={stackTrace} onChange={(e) => setStackTrace(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Affected Services <span className="text-muted normal-case tracking-normal">(optional)</span></label>
            <input type="text" className={inputClass}
              placeholder="e.g. framl-engine, transaction-processor"
              value={affectedServices} onChange={(e) => setAffectedServices(e.target.value)} />
            <p className="text-xs text-muted mt-1">Comma-separated list of service names</p>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button type="submit" disabled={loading || !description.trim()} className={submitClass}>
              {loading ? "Analysing…" : "Analyse Incident"}
            </button>
            <Link href="/se-aas" className="text-xs text-muted hover:text-foreground transition-colors">Cancel</Link>
          </div>
        </form>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Analysing incident…
        </div>
      )}

      {error && <div className="rounded-lg bg-danger/10 border border-danger/20 p-4 text-sm text-danger">{error}</div>}

      {result && result.status === "success" && result.result && (
        <div className="h-[600px]">
          <SEaaSResultPanel data={result.result} />
          {result.artifactId && (
            <Link href={`/se-aas/artifacts/${result.artifactId}`}
              className="inline-block mt-3 text-xs text-accent hover:text-accent/80 transition-colors">
              View full artifact →
            </Link>
          )}
        </div>
      )}
      {result && result.status === "error" && (
        <div className="rounded-lg bg-danger/10 border border-danger/20 p-4 text-sm text-danger">{String(result.error)}</div>
      )}
    </div>
  );
}
