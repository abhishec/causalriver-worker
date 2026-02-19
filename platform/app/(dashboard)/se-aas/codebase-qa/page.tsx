"use client";

import { useState } from "react";
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

export default function CodebaseQAPage() {
  const [question, setQuestion] = useState("");
  const [codebaseContext, setCodebaseContext] = useState("");
  const [language, setLanguage] = useState("Any");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const labelClass = "text-xs font-medium text-muted-foreground uppercase tracking-wider";
  const textareaClass =
    "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground placeholder:text-muted p-3 resize-y focus:outline-none focus:border-accent";
  const selectClass =
    "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground p-2.5 focus:outline-none focus:border-accent cursor-pointer";
  const submitClass =
    "px-6 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setJobId(null);

    try {
      const res = await fetch("/api/se-aas/codebase-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, codebaseContext, language }),
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
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Back */}
      <Link
        href="/se-aas"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
      >
        ← SE-AAS
      </Link>

      {/* Header */}
      <div className="mt-4 mb-6 flex items-start gap-3">
        <span className="text-3xl">💬</span>
        <div>
          <h1 className="text-lg font-semibold">Codebase Q&A</h1>
          <p className="text-xs text-muted mt-0.5">
            Ask anything about your codebase — Brain answers using learned architectural patterns and cross-module
            dependency knowledge.
          </p>
        </div>
      </div>

      {/* Form */}
      <Card variant="default" padding="md">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* question */}
          <div className="space-y-1.5">
            <label className={labelClass}>
              Question <span className="text-danger">*</span>
            </label>
            <textarea
              className={textareaClass}
              rows={5}
              required
              placeholder="Where does the FRAML engine decide to generate an alert? How does data flow from Kafka to the UI?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>

          {/* codebaseContext */}
          <div className="space-y-1.5">
            <label className={labelClass}>Codebase Context</label>
            <textarea
              className={textareaClass}
              rows={6}
              placeholder="Paste file tree, README, or relevant code snippets for context (optional)..."
              value={codebaseContext}
              onChange={(e) => setCodebaseContext(e.target.value)}
            />
          </div>

          {/* language */}
          <div className="space-y-1.5">
            <label className={labelClass}>Language</label>
            <select className={selectClass} value={language} onChange={(e) => setLanguage(e.target.value)}>
              {["Any", "TypeScript", "Python", "Go", "Java", "Scala"].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button type="submit" disabled={loading || !question.trim()} className={submitClass}>
              {loading ? "Thinking…" : "Ask Brain"}
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
          {jobId ? `Polling job ${jobId}…` : "Submitting…"}
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
              <Badge variant="success" size="xs">
                Complete
              </Badge>
            ) : (
              <Badge variant="danger" size="xs">
                Error
              </Badge>
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
