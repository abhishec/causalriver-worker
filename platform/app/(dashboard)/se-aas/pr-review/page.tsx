"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SEaaSResultPanel } from "@/components/copilot/SEaaSResultPanel";
import type { SEaaSDomainData } from "@/components/copilot/CopilotChat";

// ── Types ────────────────────────────────────────────────────────────────────

type FocusKey = "security" | "performance" | "correctness" | "style" | "tests";

interface JobResult {
  jobId: string;
  status: "success" | "error";
  result?: SEaaSDomainData;
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

export default function PRReviewPage() {
  const [diff, setDiff] = useState("");
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("TypeScript");
  const [focus, setFocus] = useState<Record<FocusKey, boolean>>({
    security: true,
    performance: true,
    correctness: true,
    style: true,
    tests: true,
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedFocus = (Object.keys(focus) as FocusKey[]).filter((k) => focus[k]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!diff.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/se-aas/pr-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diff, title, languages: [language], focus: selectedFocus }),
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
  const selectClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground p-2.5 focus:outline-none focus:border-accent focus:shadow-[var(--shadow-input-focus)] cursor-pointer";
  const submitClass = "px-6 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <Link href="/se-aas" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors">
        ← SE-AAS Dashboard
      </Link>

      <div className="flex items-start gap-3">
        <span className="text-3xl">🔍</span>
        <div>
          <h1 className="text-lg font-semibold">PR Review</h1>
          <p className="text-xs text-muted mt-0.5">
            AI-powered pull request analysis with causal cascade, security scanning, and actionable feedback.
          </p>
        </div>
      </div>

      <Card variant="default" padding="md">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className={labelClass}>Diff <span className="text-danger">*</span></label>
            <textarea
              className={textareaClass}
              rows={10}
              required
              placeholder="Paste your PR diff here..."
              value={diff}
              onChange={(e) => setDiff(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>PR Title</label>
            <input
              type="text"
              className={inputClass}
              placeholder="PR title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Language</label>
            <select className={selectClass} value={language} onChange={(e) => setLanguage(e.target.value)}>
              {["TypeScript", "JavaScript", "Python", "Go", "Java", "Scala", "Other"].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className={labelClass}>Focus Areas</label>
            <div className="flex flex-wrap gap-3">
              {(Object.keys(focus) as FocusKey[]).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={focus[k]}
                    onChange={(e) => setFocus((prev) => ({ ...prev, [k]: e.target.checked }))}
                    className="accent-accent"
                  />
                  {k.charAt(0).toUpperCase() + k.slice(1)}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button type="submit" disabled={loading || !diff.trim()} className={submitClass}>
              {loading ? "Analysing…" : "Run PR Review"}
            </button>
            <Link href="/se-aas" className="text-xs text-muted hover:text-foreground transition-colors">
              Cancel
            </Link>
          </div>
        </form>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Analysing PR…
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-danger/10 border border-danger/20 p-4 text-sm text-danger">{error}</div>
      )}

      {result && result.status === "success" && result.result && (
        <div className="h-[600px]">
          <SEaaSResultPanel data={result.result} />
          {result.artifactId && (
            <Link
              href={`/se-aas/artifacts/${result.artifactId}`}
              className="inline-block mt-3 text-xs text-accent hover:text-accent/80 transition-colors"
            >
              View full artifact →
            </Link>
          )}
        </div>
      )}
      {result && result.status === "error" && (
        <div className="rounded-lg bg-danger/10 border border-danger/20 p-4 text-sm text-danger">
          {String(result.error)}
        </div>
      )}
    </div>
  );
}
