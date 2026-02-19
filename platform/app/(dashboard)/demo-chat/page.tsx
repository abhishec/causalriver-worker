"use client";

import { CopilotChat } from "@/components/copilot/CopilotChat";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

// Demo org ID — hardwired so this page works without org selection
const DEMO_ORG_ID = "00000000-0000-4000-b000-000000000001";

export default function DemoChatPage() {
  return (
    <div className="h-[calc(100vh-7rem)]">
      <ErrorBoundary section="Demo Chat">
        <CopilotChat
          endpoint="/api/copilot/chat"
          extraParams={{ organizationId: DEMO_ORG_ID }}
          persona={{
            name: "NexusBrain Demo",
            description: "Demo workspace — causal intelligence, SE-aaS, and accounting in one place",
          }}
          examplePrompts={[
            "Why is churn increasing?",
            "Show me the strongest causal relationships",
            "Predict next month's revenue",
            "Review the latest PR for security issues",
            "Generate the P&L for 2025",
            "What anomalies were detected today?",
          ]}
        />
      </ErrorBoundary>
    </div>
  );
}
