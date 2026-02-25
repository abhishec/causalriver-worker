export const dynamic = "force-dynamic";
/**
 * Agent Studio Test Run API
 * ==========================
 *
 * POST /api/agent-studio/test
 *   Runs a test execution of an agent configuration.
 *   Creates a real brain_agent_task with source="studio-test".
 *
 *   Body: { agentConfig, prompt, templateId? }
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";
import { executeAgent } from "@/lib/agents/execute";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { agentConfig, prompt } = body;

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    const result = await executeAgent(service, {
      prompt: prompt.trim(),
      agentType: "general",
      organizationId: workspaceId,
      userId: user.id,
      autoExecuteThreshold: agentConfig?.auto_execute_threshold ?? 0.8,
      source: "studio-test",
    });

    return NextResponse.json(result);
  } catch (error: any) {
    logger.error("[AgentStudioTest] Error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
