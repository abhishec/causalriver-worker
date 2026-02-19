"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SEaaSResultPanel } from "@/components/copilot/SEaaSResultPanel";
import type { SEaaSDomainData } from "@/components/copilot/CopilotChat";

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

export default function DeadCodePage() {
  const [codebase, setCodebase] = useState("");
  const [language, setLanguage] = useState("TypeScript");
  const [includeTests, setIncludeTests] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const labelClass = "text-xs font-medium text-muted-foreground uppercase tracking-wider";
  const textareaClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground placeholder:text-muted p-3 resize-y focus:outline-none focus:border-accent focus:shadow-[var(--shadow-input-focus)]";
  const selectClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground p-2.5 focus:outline-none focus:border-accent focus:shadow-[var(--shadow-input-focus)] cursor-pointer";
  const submitClass = "px-6 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!codebase.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setJobId(null);

    try {
      const res = await fetch("/api/se-aas/dead-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codebase, language, includeTests }),
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
        <span className="text-3xl">🧹</span>
        <div>
          <h1 className="text-lg font-semibold">Dead Code Detector</h1>
          <p className="text-xs text-muted mt-0.5">
            Find unreachable functions, unused imports, dead files — with a safe removal plan ranked by confidence.
          </p>
        </div>
      </div>

      <Card variant="default" padding="md">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className={labelClass}>Codebase <span className="text-danger">*</span></label>
            <textarea className={textareaClass} rows={10} required
              placeholder={`Paste code files, function signatures, or export/import lists...\n\nTip: run 'grep -r "export" src/ --include="*.ts"' and paste results`}
              value={codebase} onChange={(e) => setCodebase(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Language</label>
            <select className={selectClass} value={language} onChange={(e) => setLanguage(e.target.value)}>
              {["TypeScript", "JavaScript", "Python", "Go", "Java", "Scala"].map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Options</label>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
              <input type="checkbox" checked={includeTests}
                onChange={(e) => setIncludeTests(e.target.checked)} className="accent-accent" />
              Include test files in analysis
            </label>
          </div>
          <div className="flex items-center gap-4 pt-1">
            <button type="submit" disabled={loading || !codebase.trim()} className={submitClass}>
              {loading ? "Scanning…" : "Detect Dead Code"}
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
