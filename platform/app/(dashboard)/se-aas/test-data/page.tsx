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

export default function TestDataPage() {
  const [schema, setSchema] = useState("");
  const [description, setDescription] = useState("");
  const [dataVolume, setDataVolume] = useState("Medium (100-500 rows)");
  const [format, setFormat] = useState("JSON");
  const [anonymisation, setAnonymisation] = useState("PII-safe (fake names, emails)");
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
    if (!schema.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setJobId(null);

    try {
      const res = await fetch("/api/se-aas/test-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema, description, dataVolume, format, anonymisation }),
      });
      if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
      const data = await res.json();
      setJobId(data.jobId);
      const jobData = await pollJob(data.jobId);
      setResult(jobData);
    } catch (err: unknown) {
      if (err instanceof Error) setError("Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <Link href="/se-aas" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors">
        &larr; SE-AAS
      </Link>

      <div className="flex items-start gap-3">
        <span className="text-3xl">&#x1F3B2;</span>
        <div>
          <h1 className="text-lg font-semibold">Test Data</h1>
          <p className="text-xs text-muted mt-0.5">
            Synthetic test data generation with referential integrity, PII-safe anonymisation, and scenario-based dataset creation for realistic load testing.
          </p>
        </div>
      </div>

      <Card variant="default" padding="md">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className={labelClass}>Schema / Data Model <span className="text-danger">*</span></label>
            <textarea className={textareaClass} rows={10} required
              placeholder="Paste your DB schema (SQL DDL), TypeScript interface, JSON schema, or describe the data model you need test data for..."
              value={schema} onChange={(e) => setSchema(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Scenario / Context</label>
            <textarea className={textareaClass} rows={4}
              placeholder="Describe the testing scenario: e-commerce checkout flow, user registration, bulk import, edge case data..."
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}>Data Volume</label>
              <select className={selectClass} value={dataVolume} onChange={(e) => setDataVolume(e.target.value)}>
                {["Small (10-50 rows)", "Medium (100-500 rows)", "Large (1,000+ rows)", "Load test (10,000+ rows)"].map((v) => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Output Format</label>
              <select className={selectClass} value={format} onChange={(e) => setFormat(e.target.value)}>
                {["JSON", "CSV", "SQL INSERT", "TypeScript fixtures", "YAML"].map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Anonymisation</label>
              <select className={selectClass} value={anonymisation} onChange={(e) => setAnonymisation(e.target.value)}>
                {["None (raw values)", "PII-safe (fake names, emails)", "Full anonymisation (hashed IDs)", "GDPR-compliant"].map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-4 pt-1">
            <button type="submit" disabled={loading || !schema.trim()} className={submitClass}>
              {loading ? "Generating\u2026" : "Generate Test Data"}
            </button>
            <Link href="/se-aas" className="text-xs text-muted hover:text-foreground transition-colors">Cancel</Link>
          </div>
        </form>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          {jobId ? `Polling job ${jobId}\u2026` : "Submitting\u2026"}
        </div>
      )}
      {error && <div className="rounded-lg bg-danger/10 border border-danger/20 p-4 text-sm text-danger">{error}</div>}
      {result && result.status === "success" && result.result && (
        <div className="h-[600px]">
          <SEaaSResultPanel data={result.result} />
          {result.artifactId && (
            <Link href={`/se-aas/artifacts/${result.artifactId}`}
              className="inline-block mt-3 text-xs text-accent hover:text-accent/80 transition-colors">View full artifact &rarr;</Link>
          )}
        </div>
      )}
      {result && result.status === "error" && (
        <div className="rounded-lg bg-danger/10 border border-danger/20 p-4 text-sm text-danger">{String(result.error)}</div>
      )}
    </div>
  );
}
