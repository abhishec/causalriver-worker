"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { CopilotChat } from "@/components/copilot/CopilotChat";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

// Demo org ID — hardwired so this page works without org selection
const DEMO_ORG_ID = "00000000-0000-4000-b000-000000000001";

export default function DemoChatPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAuthorized(false); return; }

      // Allow platform admins or members of the demo org
      const { data: membership } = await supabase
        .from("org_members")
        .select("id, is_platform_admin")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      const isPlatformAdmin = membership?.is_platform_admin === true;
      if (isPlatformAdmin) { setAuthorized(true); return; }

      // Check if user is a member of the demo org
      const { data: demoMember } = await supabase
        .from("org_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("organization_id", DEMO_ORG_ID)
        .maybeSingle();

      setAuthorized(!!demoMember);
    }
    checkAccess();
  }, [supabase]);

  if (authorized === null) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-7rem)]">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-7rem)]">
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">Access Restricted</h2>
          <p className="text-sm text-muted">This demo workspace is only available to platform admins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-7rem)]">
      <ErrorBoundary section="Demo Chat">
        <CopilotChat
          endpoint="/api/copilot/chat"
          extraParams={{ organizationId: DEMO_ORG_ID }}
          persona={{
            name: "Brain OS Demo",
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
