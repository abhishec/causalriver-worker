"use client";

import dynamic from "next/dynamic";

// ── SSR-safe entry point ──────────────────────────────────────────────────────
// CopilotPageClient relies on localStorage (workspace, service mode) which is
// unavailable during SSR. Using next/dynamic with ssr:false tells Next.js to
// skip server-rendering entirely — the loading fallback is rendered on both
// server and client during hydration, then swapped for the real component after
// mount. This eliminates ALL hydration mismatches caused by localStorage reads.

const LOADING_FALLBACK = (
  <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse" />
        <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse [animation-delay:300ms]" />
      </div>
      <span className="text-xs text-muted-foreground">Loading...</span>
    </div>
  </div>
);

const CopilotPageClient = dynamic(
  () => import("./CopilotPageClient"),
  {
    ssr: false,
    loading: () => LOADING_FALLBACK,
  }
);

export default function CopilotPage() {
  return <CopilotPageClient />;
}
