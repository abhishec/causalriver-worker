"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

// ── Types ────────────────────────────────────────────────────────────────────

interface JobResult {
  jobId: string;
  status: "success" | "error";
  result?: unknown;
  error?: string;
  artifactId?: string;
}

// ── Polling helper ───────────────────────────────────────────────────────────

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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ScaffoldingPage() {
  const [name, setName] = useState("");
  const [type, setType] = useState("REST API");
  const [language, setLanguage] = useState("TypeScript");
  const [database, setDatabase] = useState("None");
  const [description, setDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/se-aas/boilerplate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, language, database, description }),
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
  const inputClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground p-2.5 focus:outline-none focus:border-accent";
  const selectClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground p-2.5 focus:outline-none focus:border-accent cursor-pointer";
  const textareaClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground placeholder:text-muted p-3 resize-y focus:outline-none focus:border-accent";
  const submitClass = "px-6 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50";

  return (
    <div className="min-h-screen bg-background p-6 max-w-3xl mx-auto">
      {/* Back link */}
      <Link href="/se-aas" className="text-xs text-muted hover:text-foreground transition-colors">
        ← SE-AAS Dashboard
      </Link>

      {/* Header */}
      <div className="mt-4 mb-6 flex items-start gap-3">
        <span className="text-3xl">🏗️</span>
        <div>
          <h1 className="text-lg font-semibold">Service Scaffolding</h1>
          <p className="text-xs text-muted mt-0.5">
            Generate production-ready boilerplate for any service type with best-practice structure and config.
          </p>
        </div>
      </div>

      {/* Form */}
      <Card variant="default" padding="md">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* name */}
          <div className="space-y-1.5">
            <label className={labelClass}>Service Name <span className="text-danger">*</span></label>
            <input
              type="text"
              className={inputClass}
              placeholder="my-service"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* type */}
          <div className="space-y-1.5">
            <label className={labelClass}>Service Type</label>
            <select className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
              {["REST API", "Microservice", "React Component", "CLI Tool", "Kafka Consumer", "gRPC Service"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* language */}
          <div className="space-y-1.5">
            <label className={labelClass}>Language</label>
            <select className={selectClass} value={language} onChange={(e) => setLanguage(e.target.value)}>
              {["TypeScript", "Go", "Python", "Java", "Scala"].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>

          {/* database */}
          <div className="space-y-1.5">
            <label className={labelClass}>Database</label>
            <select className={selectClass} value={database} onChange={(e) => setDatabase(e.target.value)}>
              {["None", "PostgreSQL", "ScyllaDB", "MariaDB", "MongoDB"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* description */}
          <div className="space-y-1.5">
            <label className={labelClass}>Description</label>
            <textarea
              className={textareaClass}
              rows={4}
              placeholder="What does this service do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button type="submit" disabled={loading || !name.trim()} className={submitClass}>
              {loading ? "Generating…" : "Generate Scaffolding"}
            </button>
            <Link href="/se-aas" className="text-xs text-muted hover:text-foreground transition-colors">
              Cancel
            </Link>
          </div>
        </form>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted mt-4">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Generating scaffolding…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg bg-danger/10 border border-danger/20 p-4 text-sm text-danger">{error}</div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-xl bg-surface border border-border-subtle p-5 mt-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium">Result</span>
            {result.status === "success" ? (
              <Badge variant="success" size="xs">Complete</Badge>
            ) : (
              <Badge variant="danger" size="xs">Error</Badge>
            )}
          </div>
          <pre className="text-xs font-mono text-muted leading-relaxed overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(result.status === "success" ? result.result : result.error, null, 2)}
          </pre>
          {result.artifactId && (
            <Link
              href={`/se-aas/artifacts/${result.artifactId}`}
              className="inline-block mt-4 text-xs text-accent hover:text-accent/80 transition-colors"
            >
              View full artifact →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
