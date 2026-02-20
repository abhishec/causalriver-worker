"use client";

import { useState, useEffect } from "react";
import { useOrg } from "@/lib/org-context";
import { cn } from "@/lib/utils";

/**
 * Artifacts Gallery — Claude-style artifacts page
 * Shows all artifacts created across conversations,
 * filterable by service type.
 */

interface ArtifactItem {
  id: string;
  title: string;
  domain_type: string;
  created_at: string;
  result_data: unknown;
}

const SERVICE_FILTER = [
  { id: "all", label: "All" },
  { id: "aas", label: "Accounting" },
  { id: "seaas", label: "Engineering" },
];

function ArtifactTypeIcon({ domainType }: { domainType: string }) {
  const isAAS = domainType?.startsWith("aas-");
  return (
    <svg
      className={cn("w-5 h-5", isAAS ? "text-emerald-500" : "text-blue-500")}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      {isAAS ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      )}
    </svg>
  );
}

export default function ArtifactsPage() {
  const { currentOrg } = useOrg();
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!currentOrg?.id) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    async function loadArtifacts() {
      try {
        const res = await fetch(
          `/api/se-aas/artifacts?organizationId=${currentOrg!.id}&limit=50`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const json = await res.json();
          setArtifacts(json.artifacts || []);
        }
      } catch {
        // silent — timeout or network error
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    }
    loadArtifacts();

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [currentOrg?.id]);

  const filtered = filter === "all"
    ? artifacts
    : artifacts.filter((a) => {
        if (filter === "aas") return a.domain_type?.startsWith("aas-");
        if (filter === "seaas") return !a.domain_type?.startsWith("aas-");
        return true;
      });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Artifacts</h1>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-6">
        {SERVICE_FILTER.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors",
              filter === f.id
                ? "bg-foreground text-background"
                : "bg-surface border border-border-subtle text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted">
          Loading artifacts...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1">No artifacts yet</p>
          <p className="text-[12px] text-muted max-w-xs">
            Artifacts are created when you use the Intelligence copilot. Try generating a P&L statement or code analysis.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((artifact) => (
            <a
              key={artifact.id}
              href={`/se-aas/artifacts/${artifact.id}`}
              className="group rounded-xl border border-border-subtle hover:border-border bg-card hover:shadow-sm p-4 transition-all"
            >
              <div className="flex items-start gap-3">
                <ArtifactTypeIcon domainType={artifact.domain_type} />
                <div className="flex-1 min-w-0">
                  <h3 className="text-[13px] font-medium text-foreground truncate group-hover:text-accent transition-colors">
                    {artifact.title || artifact.domain_type || "Artifact"}
                  </h3>
                  <p className="text-[11px] text-muted mt-0.5">
                    {artifact.domain_type?.startsWith("aas-") ? "Accounting" : "Engineering"}
                  </p>
                  <p className="text-[10px] text-muted/70 mt-1">
                    {new Date(artifact.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
