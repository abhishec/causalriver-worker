"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
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

export default function LineagePage() {
  const [schema, setSchema] = useState("");
  const [databaseType, setDatabaseType] = useState("PostgreSQL");
  const [queryLogs, setQueryLogs] = useState("");
  const [focusTables, setFocusTables] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const labelClass = "text-xs font-medium text-muted-foreground uppercase tracking-wider";
  const textareaClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground placeholder:text-muted p-3 resize-y focus:outline-none focus:border-accent focus:shadow-[var(--shadow-input-focus)]";
  const inputClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground p-2.5 focus:outline-none focus:border-accent focus:shadow-[var(--shadow-input-focus)]";
  const selectClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground p-2.5 focus:outline-none focus:border-accent focus:shadow-[var(--shadow-input-focus)] cursor-pointer";
  const submitClass = "px-6 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!schema.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setJobId(null);

    try {
      const res = await fetch("/api/se-aas/lineage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema,
          databaseType,
          queryLogs: queryLogs ? queryLogs.split("\n").filter(Boolean) : [],
          focusTables: focusTables ? focusTables.split(",").map((s) => s.trim()).filter(Boolean) : [],
        }),
      });
      if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
      const data = await res.json();
      setJobId(data.jobId);
      const jobData = await pollJob(data.jobId);
      setResult(jobData);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <Link href="/se-aas" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors">
        ← SE-AAS
      </Link>

      <div className="flex items-start gap-3">
        <span className="text-3xl">🔗</span>
        <div>
          <h1 className="text-lg font-semibold">Data Lineage</h1>
          <p className="text-xs text-muted mt-0.5">
            Map data flow through your system — FK relationships, transformation chains, circular dependency detection.
          </p>
        </div>
      </div>

      <Card variant="default" padding="md">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className={labelClass}>Schema <span className="text-danger">*</span></label>
            <textarea className={textareaClass} rows={10} required
              placeholder="Paste CREATE TABLE statements, ScyllaDB schema, or Elasticsearch mappings..."
              value={schema} onChange={(e) => setSchema(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Database Type</label>
            <select className={selectClass} value={databaseType} onChange={(e) => setDatabaseType(e.target.value)}>
              {["PostgreSQL", "MySQL/MariaDB", "ScyllaDB", "Elasticsearch", "SQLite"].map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Query Logs</label>
            <textarea className={textareaClass} rows={5}
              placeholder="Paste query logs to trace actual data access patterns (optional)..."
              value={queryLogs} onChange={(e) => setQueryLogs(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Focus Tables</label>
            <input type="text" className={inputClass}
              placeholder="users, transactions, alerts — comma-separated"
              value={focusTables} onChange={(e) => setFocusTables(e.target.value)} />
          </div>
          <div className="flex items-center gap-4 pt-1">
            <button type="submit" disabled={loading || !schema.trim()} className={submitClass}>
              {loading ? "Mapping…" : "Map Lineage"}
            </button>
            <Link href="/se-aas" className="text-xs text-muted hover:text-foreground transition-colors">Cancel</Link>
          </div>
        </form>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          {jobId ? `Polling job ${jobId}…` : "Submitting…"}
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
