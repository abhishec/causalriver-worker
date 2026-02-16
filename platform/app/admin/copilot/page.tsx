"use client";

import { CopilotChat } from "@/components/copilot/CopilotChat";
import { CORE_ORG_ID } from "@/lib/constants";

/**
 * Admin Copilot — uses the shared CopilotChat component
 * with the core org ID for platform-wide intelligence.
 */
export default function AdminCopilotPage() {
  return (
    <CopilotChat
      endpoint="/api/copilot/chat"
      extraParams={{
        organizationId: CORE_ORG_ID,
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
