"use client";

import { useRouter } from "next/navigation";

interface ConnectorsTabProps {
  orgId: string;
}

export function ConnectorsTab({ orgId: _orgId }: ConnectorsTabProps) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-1">Connectors</h2>
        <p className="text-xs text-muted-foreground">
          Manage data connectors for this AI worker space. Connectors feed signals into the Brain for learning and analysis.
        </p>
      </div>

      {/* Redirect card */}
      <div className="rounded-xl border border-border-subtle bg-surface p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
            />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1.5">Manage Connectors</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Add, configure, and monitor connectors in the dedicated Connectors page. Supports GitHub, Jira, Slack, S3, and more.
        </p>
        <button
          onClick={() => router.push("/connectors")}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
          Open Connectors
        </button>
      </div>
    </div>
  );
}
