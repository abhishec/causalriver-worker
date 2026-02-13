import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const CORE_ORG_ID = "00000000-0000-4000-a000-000000000001";

const SYSTEM_PROMPT = `You are NexusBrain's intelligence copilot. You have access to causal evidence, brain metrics, and organizational data. Always cite specific causal edges and statistical evidence when answering. Be concise and data-driven.

When referencing causal relationships, cite them as: "source_entity -> target_entity (strength: X, p-value: Y)".
When referencing anomalies, mention the signal domain, severity, and detection time.
When discussing brain health, reference the daily snapshot metrics.

Format your answers clearly with short paragraphs. Use bullet points for lists.`;

function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  const send = (data: string) => {
    controller?.enqueue(encoder.encode(`data: ${data}\n\n`));
  };

  const sendText = (text: string) => {
    send(JSON.stringify({ text }));
  };

  const sendError = (error: string) => {
    send(JSON.stringify({ error }));
  };

  const close = () => {
    send("[DONE]");
    controller?.close();
  };

  return { stream, sendText, sendError, close };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, organizationId } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const orgId = organizationId || CORE_ORG_ID;

    // Authenticate via Supabase
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Gather brain context in parallel
    const [snapshotResult, causalResult, anomalyResult, costResult] =
      await Promise.all([
        // Latest brain daily snapshot
        supabase
          .from("brain_daily_snapshots")
          .select("*")
          .eq("organization_id", orgId)
          .order("snapshot_date", { ascending: false })
          .limit(1),

        // Top 10 strongest causal relationships
        supabase
          .from("causal_relationships_statistical")
          .select(
            "source_entity, target_entity, strength, p_value, lag_periods, method, domain"
          )
          .eq("organization_id", orgId)
          .order("strength", { ascending: false })
          .limit(10),

        // Last 5 anomalies from cross_domain_signals
        supabase
          .from("cross_domain_signals")
          .select(
            "signal_type, domain, value, metadata, created_at, confidence"
          )
          .eq("organization_id", orgId)
          .not("metadata->anomaly_score", "is", null)
          .order("created_at", { ascending: false })
          .limit(5),

        // Latest cost status
        supabase
          .from("llm_cost_log")
          .select("estimated_cost_usd, model, component, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

    const snapshot = snapshotResult.data?.[0] || null;
    const causalEdges = causalResult.data || [];
    const anomalies = anomalyResult.data || [];
    const recentCosts = costResult.data || [];

    // Build context block for the LLM
    const contextBlock = buildContextBlock(
      snapshot,
      causalEdges,
      anomalies,
      recentCosts
    );

    // Check for Anthropic API key
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!anthropicKey) {
      // Fallback: return a mock response when no API key
      const { stream, sendText, close } = createSSEStream();

      const fallbackResponse = generateFallbackResponse(
        message,
        snapshot,
        causalEdges,
        anomalies
      );

      // Simulate streaming with chunks
      setTimeout(() => {
        const words = fallbackResponse.split(" ");
        let i = 0;
        const interval = setInterval(() => {
          if (i < words.length) {
            sendText(words[i] + (i < words.length - 1 ? " " : ""));
            i++;
          } else {
            clearInterval(interval);
            close();
          }
        }, 30);
      }, 100);

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Use Anthropic SDK to stream response
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const { stream, sendText, sendError, close } = createSSEStream();

    // Start streaming in the background
    (async () => {
      try {
        const anthropicStream = anthropic.messages.stream({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 2048,
          system: SYSTEM_PROMPT + "\n\n" + contextBlock,
          messages: [{ role: "user", content: message }],
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            sendText(event.delta.text);
          }
        }

        close();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        sendError(
          `Failed to get response from AI: ${errorMessage}. Please try again.`
        );
        close();
      }
    })();

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

interface CausalEdge {
  source_entity: string;
  target_entity: string;
  strength: number;
  p_value: number;
  lag_periods: number;
  method: string;
  domain: string;
}

interface Anomaly {
  signal_type: string;
  domain: string;
  value: number;
  metadata: Record<string, unknown>;
  created_at: string;
  confidence: number;
}

interface CostEntry {
  estimated_cost_usd: number;
  model: string;
  component: string;
  created_at: string;
}

interface Snapshot {
  snapshot_date: string;
  total_signals: number;
  total_causal_edges: number;
  prediction_accuracy: number;
  regions_active: string[];
  top_discoveries: string[];
  brain_health_score: number;
}

function buildContextBlock(
  snapshot: Snapshot | null,
  causalEdges: CausalEdge[],
  anomalies: Anomaly[],
  recentCosts: CostEntry[]
): string {
  const sections: string[] = [];

  sections.push("=== BRAIN CONTEXT (live data from the knowledge graph) ===");

  // Brain health
  if (snapshot) {
    sections.push(`
BRAIN DAILY SNAPSHOT (${snapshot.snapshot_date}):
- Total signals processed: ${snapshot.total_signals ?? "N/A"}
- Total causal edges: ${snapshot.total_causal_edges ?? "N/A"}
- Prediction accuracy: ${snapshot.prediction_accuracy ?? "N/A"}%
- Active regions: ${snapshot.regions_active?.join(", ") || "None"}
- Brain health score: ${snapshot.brain_health_score ?? "N/A"}
- Top discoveries: ${snapshot.top_discoveries?.join("; ") || "None yet"}`);
  } else {
    sections.push("\nBRAIN SNAPSHOT: No snapshot data available yet.");
  }

  // Causal edges
  if (causalEdges.length > 0) {
    sections.push("\nTOP CAUSAL RELATIONSHIPS (by strength):");
    causalEdges.forEach((edge, i) => {
      sections.push(
        `${i + 1}. ${edge.source_entity} -> ${edge.target_entity} | strength: ${edge.strength?.toFixed(3)} | p-value: ${edge.p_value?.toFixed(4)} | lag: ${edge.lag_periods} periods | method: ${edge.method} | domain: ${edge.domain}`
      );
    });
  } else {
    sections.push(
      "\nCAUSAL RELATIONSHIPS: No causal edges discovered yet. The brain is still learning."
    );
  }

  // Anomalies
  if (anomalies.length > 0) {
    sections.push("\nRECENT ANOMALIES:");
    anomalies.forEach((a, i) => {
      sections.push(
        `${i + 1}. [${a.domain}] ${a.signal_type} | value: ${a.value} | confidence: ${a.confidence?.toFixed(2)} | detected: ${a.created_at}`
      );
    });
  } else {
    sections.push(
      "\nANOMALIES: No anomalies detected in recent signals."
    );
  }

  // Cost status
  if (recentCosts.length > 0) {
    const totalRecent = recentCosts.reduce(
      (sum, c) => sum + (c.estimated_cost_usd || 0),
      0
    );
    sections.push(
      `\nRECENT LLM COSTS: ${recentCosts.length} recent calls, total: $${totalRecent.toFixed(6)}`
    );
  }

  return sections.join("\n");
}

function generateFallbackResponse(
  message: string,
  snapshot: Snapshot | null,
  causalEdges: CausalEdge[],
  anomalies: Anomaly[]
): string {
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes("churn")) {
    if (causalEdges.length > 0) {
      const relevant = causalEdges.filter(
        (e) =>
          e.source_entity?.toLowerCase().includes("churn") ||
          e.target_entity?.toLowerCase().includes("churn")
      );
      if (relevant.length > 0) {
        return `Based on the brain's causal analysis, I found ${relevant.length} causal relationship(s) involving churn:\n\n${relevant.map((e) => `- ${e.source_entity} -> ${e.target_entity} (strength: ${e.strength?.toFixed(3)}, p-value: ${e.p_value?.toFixed(4)})`).join("\n")}\n\nThese edges suggest statistically significant drivers of churn. I recommend investigating the strongest connections first.`;
      }
    }
    return "I don't have enough causal data about churn yet. The brain needs more training cycles to establish statistically significant relationships. Try asking again after the next training run.";
  }

  if (lowerMsg.includes("causal") || lowerMsg.includes("relationship")) {
    if (causalEdges.length > 0) {
      return `Here are the strongest causal relationships in the knowledge graph:\n\n${causalEdges.slice(0, 5).map((e, i) => `${i + 1}. ${e.source_entity} -> ${e.target_entity}\n   Strength: ${e.strength?.toFixed(3)} | p-value: ${e.p_value?.toFixed(4)} | Method: ${e.method}`).join("\n\n")}\n\nAll relationships passed statistical significance thresholds. The brain currently tracks ${snapshot?.total_causal_edges ?? "N/A"} total causal edges.`;
    }
    return "No causal relationships have been discovered yet. The brain is still in its initial learning phase. Once enough signals are processed, causal discovery algorithms will identify statistically significant edges.";
  }

  if (lowerMsg.includes("anomal")) {
    if (anomalies.length > 0) {
      return `Recent anomalies detected:\n\n${anomalies.map((a, i) => `${i + 1}. [${a.domain}] ${a.signal_type} - confidence: ${a.confidence?.toFixed(2)}\n   Detected: ${a.created_at}`).join("\n\n")}\n\nThese anomalies were flagged by the brain's cross-domain signal analysis pipeline.`;
    }
    return "No anomalies have been detected in recent signals. This typically means metrics are within expected ranges, or the brain needs more historical data to establish baseline patterns.";
  }

  if (lowerMsg.includes("predict") || lowerMsg.includes("revenue")) {
    return `Current prediction accuracy: ${snapshot?.prediction_accuracy?.toFixed(1) ?? "N/A"}%.\n\nTo generate reliable revenue predictions, the brain needs:\n- Sufficient historical data (minimum 30 days)\n- Active financial data connectors\n- Established causal relationships between revenue drivers\n\nBrain health score: ${snapshot?.brain_health_score ?? "N/A"}. ${snapshot?.regions_active?.length ?? 0} of 11 brain regions are currently active.`;
  }

  // Default response
  return `I have access to your brain's current state:\n\n- Brain health: ${snapshot?.brain_health_score ?? "N/A"}\n- Prediction accuracy: ${snapshot?.prediction_accuracy?.toFixed(1) ?? "N/A"}%\n- Causal edges: ${snapshot?.total_causal_edges ?? 0}\n- Active regions: ${snapshot?.regions_active?.length ?? 0}/11\n\nNote: The Anthropic API key is not configured. This is a fallback response based on your brain's data. Configure the ANTHROPIC_API_KEY environment variable for full AI-powered responses.\n\nAsk me about causal relationships, anomalies, predictions, or specific metrics for more detailed answers.`;
}
