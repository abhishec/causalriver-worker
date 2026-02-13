"use client";

import { CopilotChat } from "@/components/copilot/CopilotChat";
import { useOrg } from "@/lib/org-context";

/**
 * Generic Copilot Page — ONE copilot for ALL orgs.
 *
 * The org's name, data, and persona come from the BACKEND
 * (via brainMeta, data connectors, brain context builder).
 * This page is just a thin wrapper around the shared CopilotChat component.
 *
 * If the org has finance data connected (Xero, Volopay), the copilot
 * automatically gets finance intelligence. If it has GitHub, it gets
 * code intelligence. The org name is just a name.
 */
export default function CopilotPage() {
  const { currentOrg } = useOrg();

  return (
    <CopilotChat
      endpoint="/api/copilot/chat"
      extraParams={{ organizationId: currentOrg?.id }}
      persona={{
        name: "Copilot",
        description:
          "Your intelligence co-pilot, backed by causal evidence",
      }}
      examplePrompts={[
        "Why is churn increasing?",
        "Show me the strongest causal relationships",
        "What anomalies were detected today?",
        "Predict next month's revenue",
        "What's our burn rate and runway?",
        "Give me the full intelligence report",
      ]}
    />
  );
}
