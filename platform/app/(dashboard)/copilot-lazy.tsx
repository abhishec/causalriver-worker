"use client";

import dynamic from "next/dynamic";

const CopilotOverlay = dynamic(
  () => import("@/components/copilot/CopilotOverlay").then(m => m.CopilotOverlay),
  { ssr: false },
);

export function CopilotLazy() {
  return <CopilotOverlay />;
}
