"use client";

import { CopilotChat } from "@/components/copilot/CopilotChat";

/**
 * Admin Copilot — uses the shared CopilotChat component
 * with the core org ID for platform-wide intelligence.
 */
export default function AdminCopilotPage() {
  return (
    <CopilotChat
      endpoint="/api/copilot/chat"
      extraParams={{
        organizationId: "00000000-0000-4000-a000-000000000001",
      }}
      persona={{
        name: "Admin Brain",
        description:
          "Platform-wide intelligence — query the core brain across all organizations",
        color: "red",
      }}
      examplePrompts={[
        "What did the brain learn across all orgs this week?",
        "Show me the strongest causal relationships in the core brain",
        "Why did AWS costs spike?",
        "Which org has the highest anomaly rate?",
      ]}
      showHeader={true}
    />
  );
}
