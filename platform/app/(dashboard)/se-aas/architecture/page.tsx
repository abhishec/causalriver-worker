"use client";

import { useState, useRef } from "react";
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

export default function ArchitecturePage() {
  const [codebaseContext, setCodebaseContext] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [focusArea, setFocusArea] = useState("full");
  const [kubernetesManifests, setKubernetesManifests] = useState("");
  const [language, setLanguage] = useState("TypeScript");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!codebaseContext.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/se-aas/architecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codebaseContext, repositoryUrl, focusArea, kubernetesManifests, language }),
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
  const textareaClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground placeholder:text-muted p-3 resize-y focus:outline-none focus:border-accent";
  const inputClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground p-2.5 focus:outline-none focus:border-accent";
  const selectClass = "w-full rounded-lg bg-surface border border-border-subtle text-sm text-foreground p-2.5 focus:outline-none focus:border-accent cursor-pointer";
  const submitClass = "px-6 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <Link href="/se-aas" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors">
        ← SE-AAS Dashboard
      </Link>

      <div className="flex items-start gap-3">
        <span className="text-3xl">🏛️</span>
        <div>
          <h1 className="text-lg font-semibold">Architecture Visualiser</h1>
          <p className="text-xs text-muted mt-0.5">
            Auto-generate C4 architecture diagrams and service maps from your codebase structure or repository.
          </p>
        </div>
      </div>

      <Card variant="default" padding="md">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className={labelClass}>Codebase Context <span className="text-danger">*</span></label>
            <textarea className={`${textareaClass} font-mono`} rows={10} required
              placeholder={"Paste your repository file tree or directory listing...\ne.g. output of: find . -type f -name '*.ts' | head -100"}
              value={codebaseContext} onChange={(e) => setCodebaseContext(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Repository URL <span className="text-muted normal-case tracking-normal">(optional)</span></label>
            <input type="text" className={inputClass} placeholder="https://github.com/org/repo (optional)"
              value={repositoryUrl} onChange={(e) => setRepositoryUrl(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Focus Area</label>
            <select className={selectClass} value={focusArea} onChange={(e) => setFocusArea(e.target.value)}>
              {[
                { value: "full", label: "Full Architecture" },
                { value: "services", label: "Services Map" },
                { value: "data-flow", label: "Data Flow" },
                { value: "dependencies", label: "Dependencies" },
                { value: "ownership", label: "Ownership" },
              ].map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Primary Language</label>
            <select className={selectClass} value={language} onChange={(e) => setLanguage(e.target.value)}>
              {["TypeScript", "Go", "Python", "Java", "Scala", "Mixed"].map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Kubernetes Manifests <span className="text-muted normal-case tracking-normal">(optional)</span></label>
            <textarea className={`${textareaClass} font-mono`} rows={6}
              placeholder="Paste k8s deployment YAML (optional)..."
              value={kubernetesManifests} onChange={(e) => setKubernetesManifests(e.target.value)} />
          </div>
          <div className="flex items-center gap-4 pt-1">
            <button type="submit" disabled={loading || !codebaseContext.trim()} className={submitClass}>
              {loading ? "Generating…" : "Generate Architecture"}
            </button>
            <Link href="/se-aas" className="text-xs text-muted hover:text-foreground transition-colors">Cancel</Link>
          </div>
        </form>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Analysing architecture…
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
