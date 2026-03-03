/**
 * Reflex Dispatcher — ADR-030 L31 Delegation Router
 * ==================================================
 *
 * Routes delegate-type reflex actions to their actual handler functions.
 * Uses dynamic imports so handler modules are only loaded when needed
 * (Lambda-safe: no upfront import cost for unused handlers).
 *
 * Called from chat/route.ts when the reflex engine returns a "delegate" action.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export interface ReflexDelegateParams {
  handler: string;
  params: Record<string, unknown>;
  supabase: SupabaseClient;
}

export interface ReflexDelegateResult {
  success: boolean;
  /** SSE-serializable result to send to frontend */
  result?: Record<string, unknown>;
  /** Text response for bypass-style results (agent returns a narrative) */
  narrative?: string;
  /** Error message if handler failed */
  error?: string;
}

/**
 * Dispatch a reflex delegate action to the appropriate handler.
 *
 * Supported handlers:
 *   - runCompetitorIntelligence → competitor-intel.ts template
 *   - initializeProductAnalyst → product-analyst.ts template
 *   - continueAgentSession    → interactive-executor.ts
 */
export async function dispatchReflexDelegate(
  params: ReflexDelegateParams,
): Promise<ReflexDelegateResult> {
  const { handler, params: handlerParams, supabase } = params;

  try {
    switch (handler) {
      // ── Competitor Intelligence ──────────────────────────────────────
      case "runCompetitorIntelligence": {
        const { runCompetitorIntelligence } = await import(
          "@/lib/agents/templates/competitor-intel"
        );

        const result = await runCompetitorIntelligence(supabase, {
          organizationId: handlerParams.organizationId as string,
          userId: handlerParams.userId as string,
          aiWorkerId: handlerParams.aiWorkerId as string | undefined,
          competitorUrls: (handlerParams.competitorUrls as string[]) || [],
          productName: (handlerParams.productName as string) || "Our Product",
        });

        return {
          success: true,
          result: {
            type: "competitor-intelligence",
            sessionId: result.sessionId,
            competitors: result.competitors,
            comparisonMatrix: result.comparisonMatrix,
            totalPagesScanned: result.totalPagesScanned,
          },
          narrative: result.summary,
        };
      }

      // ── Product Analyst Initialization ──────────────────────────────
      case "initializeProductAnalyst": {
        const { initializeProductAnalyst } = await import(
          "@/lib/agents/templates/product-analyst"
        );

        // Extract Confluence space keys from URLs
        const confluenceUrls = (handlerParams.confluenceUrls as string[]) || [];
        const driveUrls = (handlerParams.driveUrls as string[]) || [];
        const docUrls = (handlerParams.docUrls as string[]) || [];

        // Parse space keys from Confluence URLs (e.g., /wiki/spaces/TM/...)
        const spaceKeys = confluenceUrls
          .map((url) => {
            const match = url.match(/\/wiki\/spaces\/([^/]+)/);
            return match?.[1];
          })
          .filter(Boolean) as string[];

        // Parse folder ID from Google Drive URLs
        const driveFolderId = driveUrls
          .map((url) => {
            const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
            return match?.[1];
          })
          .find(Boolean);

        const session = await initializeProductAnalyst(supabase, {
          organizationId: handlerParams.organizationId as string,
          userId: handlerParams.userId as string,
          aiWorkerId: handlerParams.aiWorkerId as string | undefined,
          sessionName: "Product Analyst Session",
          confluenceSpaceKeys: spaceKeys.length > 0 ? spaceKeys : undefined,
          googleDriveFolderId: driveFolderId,
        });

        return {
          success: true,
          result: {
            type: "product-analyst",
            sessionId: session.sessionId,
            corpusId: session.corpusId,
            status: session.status,
            ingestionJobIds: session.ingestionJobIds,
          },
          narrative: session.message,
        };
      }

      // ── Continue Interactive Agent Session ──────────────────────────
      case "continueAgentSession": {
        const { executeInteractiveAgent } = await import(
          "@/lib/agents/interactive-executor"
        );

        // Find the most recent active session for this worker/org
        const { data: activeSession } = await supabase
          .from("agent_sessions")
          .select("id, agent_type")
          .eq("organization_id", handlerParams.organizationId as string)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!activeSession) {
          return {
            success: false,
            error:
              "No active agent session found. Start a new session first (e.g., 'create a product analyst from my Confluence docs').",
          };
        }

        const result = await executeInteractiveAgent(supabase, {
          sessionId: activeSession.id,
          userInput: handlerParams.userInput as string,
          organizationId: handlerParams.organizationId as string,
          userId: handlerParams.userId as string,
          agentType: activeSession.agent_type,
        });

        return {
          success: true,
          result: {
            type: "session-continue",
            sessionId: result.sessionId,
            turnNumber: result.turnNumber,
            turnId: result.turnId,
          },
          narrative: result.output,
        };
      }

      // ── Unknown handler ─────────────────────────────────────────────
      default: {
        logger.warn("[reflex-dispatcher] Unknown handler", { handler });
        return {
          success: false,
          error: `Unknown reflex handler: ${handler}`,
        };
      }
    }
  } catch (err) {
    logger.warn("[reflex-dispatcher] Handler execution failed", {
      handler,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
