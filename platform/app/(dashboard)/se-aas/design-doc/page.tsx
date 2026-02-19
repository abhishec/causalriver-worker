"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SEaaSResultPanel } from "@/components/copilot/SEaaSResultPanel";
import type { SEaaSDomainData } from "@/components/copilot/CopilotChat";

type Mode = "forward" | "reverse";

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

export default function DesignDocPage() {
  const [mode, setMode] = useState<Mode>("forward");
  const [input, setInput] = useState("");
  const [title, setTitle] = useState("");
  const [stack, setStack] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const placeholder = mode === "forward"
    ? "Paste your Jira ticket, PRD, or requirements..."
    : "Paste your code or file tree...";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    abortRef.current = new AbortController();

    const body = mode === "forward"
      ? { mode, requirements: input, title, stack }
      : { mode, code: input, title, stack };

    try {
      const res = await fetch("/api/se-aas/design-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
        <span className="text-3xl">📄</span>
        <div>
          <h1 className="text-lg font-semibold">Design Document</h1>
          <p className="text-xs text-muted mt-0.5">
            Generate technical design documents from requirements (forward) or reverse-engineer them from existing code.
          </p>
        </div>
      </div>

      <Card variant="default" padding="md">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className={labelClass}>Mode</label>
            <div className="flex gap-2">
              {(["forward", "reverse"] as Mode[]).map((m) => (
                <button key={m} type="button"
                  onClick={() => { setMode(m); setInput(""); }}
                  className={[
                    "flex-1 py-2 rounded-lg text-sm font-medium transition-colors border",
                    mode === m
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-surface text-muted border-border-subtle hover:border-border",
                  ].join(" ")}>
                  {m === "forward" ? "Forward (Requirements → Design)" : "Reverse (Code → Design)"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>
              {mode === "forward" ? "Requirements" : "Code / File Tree"}
              <span className="text-danger"> *</span>
            </label>
            <textarea className={textareaClass} rows={10} required placeholder={placeholder}
              value={input} onChange={(e) => setInput(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Document Title</label>
            <input type="text" className={inputClass} placeholder="Document title"
              value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Tech Stack</label>
            <input type="text" className={inputClass} placeholder="e.g. Node.js, ScyllaDB, Kafka"
              value={stack} onChange={(e) => setStack(e.target.value)} />
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button type="submit" disabled={loading || !input.trim()} className={submitClass}>
              {loading ? "Generating…" : "Generate Design Doc"}
            </button>
            <Link href="/se-aas" className="text-xs text-muted hover:text-foreground transition-colors">Cancel</Link>
          </div>
        </form>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Generating design document…
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
