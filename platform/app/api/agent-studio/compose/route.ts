export const dynamic = "force-dynamic";
/**
 * Agent Composition API — Compose an agent from natural language
 * ==============================================================
 *
 * POST /api/agent-studio/compose
 *   Takes a natural language description and uses the Agent Composer
 *   to create a full agent template (persona, tools, gathering, plan).
 *
 *   Body: { description: string, workspaceId?: string }
 *   Returns: { templateId: string, composition: AgentComposition }
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";
import { composeAgent } from "@/lib/agent-composer/composer";
import { labelToCommandId } from "@/lib/templates/types";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { description, workspaceId: bodyWorkspaceId } = body;

    if (!description || typeof description !== "string" || description.trim().length < 5) {
      return NextResponse.json(
        { error: "description is required (min 5 characters)" },
        { status: 400 }
      );
    }

    const workspaceId = bodyWorkspaceId || await getCurrentWorkspaceId();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Compose agent from natural language
    const composition = await composeAgent(description.trim(), apiKey, false);

    // Save as template
    const commandId = labelToCommandId(composition.name);
    const service = await createServiceClient();

    const { data: template, error: insertError } = await service
      .from("agent_templates")
      .insert({
        org_id: workspaceId,
        created_by: user.id,
        command_id: commandId,
        label: composition.name,
        description: description.trim().slice(0, 200),
        icon: "🤖",
        prompt: composition.executionPrompt,
        category: "Custom",
        service: "custom",
        gathering_schema: composition.inferredGathering
          ? {
              params: composition.inferredGathering,
              confirmationMessage: "Ready to run this agent?",
              gatheringPrompts: {},
            }
          : null,
        agent_config: {
          persona: composition.persona,
          tools: composition.selectedTools.map(t => t.id),
          executionPlan: composition.executionPlan,
          complexity: composition.complexity,
          source_type: "composed",
        },
        is_public: false,
        is_archived: false,
        usage_count: 0,
      })
      .select("id")
      .single();

    if (insertError || !template) {
      logger.error("[AgentCompose] Insert failed:", insertError?.message);
      return NextResponse.json(
        { error: "Failed to save composed agent" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      templateId: template.id,
      composition: {
        name: composition.name,
        persona: composition.persona,
        tools: composition.selectedTools.map(t => t.id),
        executionPlan: composition.executionPlan,
        complexity: composition.complexity,
      },
    });
  } catch (error: any) {
    logger.error("[AgentCompose] Error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
