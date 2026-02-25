export const dynamic = "force-dynamic";
/**
 * Agent Chain API — Execute dynamic multi-agent chains
 *
 * POST /api/agents/chain
 *   Body: { chain: AgentChain, input: string, organizationId?: string }
 *   Auth: Authenticated user with org membership
 *
 * Returns: { chainId, results[], status, totalDurationMs }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { executeAgentChain } from "@/lib/agents/chain-executor";
import type { AgentChain } from "@/lib/agents/chain-executor";
import { AGENT_TYPE_TO_BRAIN_AGENT } from "@/lib/agents/execute";
import { logger } from "@/lib/logger";

const MAX_STEPS = 5;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      chain,
      input,
      organizationId,
    } = body as {
      chain: AgentChain;
      input: string;
      organizationId?: string;
    };

    const workspaceId = organizationId || await getCurrentWorkspaceId();

    // Validate
    if (!chain || !chain.steps || chain.steps.length === 0) {
      return NextResponse.json({ error: "Chain must have at least one step" }, { status: 400 });
    }

    if (!input) {
      return NextResponse.json({ error: "Input is required" }, { status: 400 });
    }

    if (chain.steps.length > MAX_STEPS) {
      return NextResponse.json(
        { error: `Chain exceeds maximum of ${MAX_STEPS} steps` },
        { status: 400 },
      );
    }

    // Validate agent types
    const validTypes = Object.keys(AGENT_TYPE_TO_BRAIN_AGENT);
    for (const step of chain.steps) {
      if (!validTypes.includes(step.agentType)) {
        return NextResponse.json(
          { error: `Invalid agent type: ${step.agentType}. Valid types: ${validTypes.join(", ")}` },
          { status: 400 },
        );
      }
    }

    // Verify membership
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .maybeSingle();

    if (!membership) {
      const { data: admin } = await supabase
        .from("org_members")
        .select("is_platform_admin")
        .eq("user_id", user.id)
        .eq("is_platform_admin", true)
        .limit(1)
        .maybeSingle();

      if (!admin) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    // Execute chain
    const result = await executeAgentChain(supabase, chain, {
      organizationId: workspaceId,
      userId: user.id,
      originalInput: input,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    logger.error("[AgentChainAPI] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * GET /api/agents/chain/patterns
 *   Returns all available swarm patterns.
 */
export async function GET() {
  try {
    const { getSwarmPatterns } = await import("@/lib/agents/swarm-patterns");
    const patterns = getSwarmPatterns();

    return NextResponse.json({
      patterns: patterns.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        icon: p.icon,
        category: p.category,
        steps: p.chain.steps.map((s) => ({
          agentType: s.agentType,
          label: s.label,
        })),
        mode: p.chain.mode,
      })),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
