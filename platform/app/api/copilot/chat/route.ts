/**
 * Brain-Powered Copilot Chat Route
 *
 * This route uses the FULL NexusBrain knowledge graph to answer questions.
 * Instead of dumping flat SQL results to Claude, it:
 *
 *   1. Queries causal_relationships_statistical for the full causal graph
 *   2. Queries ai_memory for business rules
 *   3. Queries org_cascade_rules for cascade definitions
 *   4. Reconstructs the brain's knowledge context in-memory
 *   5. Extracts relevant domains from the user's question
 *   6. Builds an intent-aware system prompt with grounded brain data
 *   7. Streams the response via Anthropic
 *
 * The brain's causal edges, effect sizes, lag days, p-values, cascade paths,
 * and matched rules are all included in the system prompt so Claude can
 * ground every answer in the brain's discovered parameters.
 */

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const CORE_ORG_ID = "00000000-0000-4000-a000-000000000001";

// ============================================================================
// DOMAIN KEYWORD MAP (mirrors brain-knowledge-context.ts)
// ============================================================================

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  finance: [
    "cash", "cash flow", "financial", "revenue", "burn", "runway", "arr",
    "mrr", "gross margin", "ltv", "payback", "unit economics", "profit",
    "loss", "budget", "forecast", "ebitda", "margin", "cost", "pricing",
    "funding", "valuation", "roi",
  ],
  growth: [
    "startup", "growth", "scaling", "scale", "expand", "hypergrowth",
    "series", "fundraise", "traction", "virality", "pmf", "go-to-market",
  ],
  cs: [
    "customer", "churn", "retention", "nrr", "grr", "customer success",
    "renewal", "upsell", "health score", "nps", "csat", "onboarding",
  ],
  marketing: [
    "marketing", "cac", "acquisition", "magic number", "plg", "funnel",
    "conversion", "leads", "pipeline", "brand", "demand gen", "campaign",
  ],
  product: [
    "product", "feature", "self-serve", "adoption", "usage", "engagement",
    "dau", "mau", "stickiness", "activation", "roadmap",
  ],
  strategy: [
    "strategy", "model", "forecasting", "scenario", "plan", "competitive",
    "moat", "positioning", "market",
  ],
  engineering: [
    "engineering", "code", "deploy", "technical debt", "architecture",
    "infrastructure", "devops", "reliability", "incidents", "velocity",
  ],
  people: [
    "hiring", "talent", "culture", "team", "attrition", "compensation",
    "headcount", "leadership", "performance",
  ],
  revenue: [
    "revenue", "sales", "bookings", "deal", "pipeline", "quota",
    "close rate", "win rate",
  ],
  macro: [
    "macro", "economy", "gdp", "inflation", "interest rate", "fed",
    "recession", "unemployment",
  ],
};

// ============================================================================
// TYPES
// ============================================================================

interface DBCausalEdge {
  source_domain: string;
  target_domain: string;
  effect_size: number;
  granger_p_value: number;
  optimal_lag_days: number;
  granger_f_statistic: number | null;
  sample_size: number | null;
  confidence_interval_lower: number | null;
  confidence_interval_upper: number | null;
  natural_language: string | null;
  is_significant: boolean | null;
}

interface DBRule {
  content: string;
  importance: number;
  domain: string;
  metadata: Record<string, unknown> | null;
}

interface DBCascadeRule {
  rule_name: string;
  trigger_domain: string;
  trigger_signal_type: string;
  propagation_chain: Array<{
    source_domain: string;
    target_domain: string;
    severity: string;
    reason_template?: string;
  }>;
  is_active: boolean;
}

type UserIntent = "build" | "explain" | "diagnose" | "predict" | "general";

// ============================================================================
// SSE STREAM HELPER
// ============================================================================

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

// ============================================================================
// DOMAIN EXTRACTION + INTENT DETECTION
// ============================================================================

function extractDomains(question: string): string[] {
  const lower = question.toLowerCase();
  const domains: string[] = [];

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        if (!domains.includes(domain)) domains.push(domain);
        break;
      }
    }
  }

  if (domains.length === 0) {
    domains.push("finance", "strategy");
  }

  return domains;
}

function detectIntent(question: string): UserIntent {
  const lower = question.toLowerCase();

  const buildKw = ["build", "create", "design", "model", "template", "generate", "formula", "code", "spreadsheet", "dashboard"];
  const diagnoseKw = ["diagnose", "debug", "wrong", "problem", "issue", "declining", "dropping", "increasing", "why is", "root cause"];
  const predictKw = ["predict", "forecast", "what would", "what if", "scenario", "project", "estimate", "simulate", "happen if"];
  const explainKw = ["explain", "why", "how does", "what is", "what are", "describe", "tell me about"];

  if (buildKw.some((kw) => lower.includes(kw))) return "build";
  if (diagnoseKw.some((kw) => lower.includes(kw))) return "diagnose";
  if (predictKw.some((kw) => lower.includes(kw))) return "predict";
  if (explainKw.some((kw) => lower.includes(kw))) return "explain";

  return "general";
}

// ============================================================================
// BRAIN CONTEXT BUILDER (reconstructs knowledge graph from DB rows)
// ============================================================================

function buildBrainContext(
  message: string,
  causalEdges: DBCausalEdge[],
  rules: DBRule[],
  cascadeRules: DBCascadeRule[]
): { systemPrompt: string; intent: UserIntent; domains: string[] } {
  const domains = extractDomains(message);
  const intent = detectIntent(message);
  const primaryDomain = domains[0] || "finance";

  const sections: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────
  const activeEdges = causalEdges.filter((e) => e.is_significant !== false);
  sections.push(
    `## Brain Knowledge Context`,
    `Domains detected: ${domains.join(", ")} | ` +
      `Causal Edges: ${activeEdges.length} | ` +
      `Business Rules: ${rules.length} | ` +
      `Cascade Rules: ${cascadeRules.length} | ` +
      `Intent: ${intent}`
  );

  // ── Direct Causes per domain ────────────────────────────────────────
  for (const domain of domains) {
    const causes = activeEdges
      .filter((e) => e.target_domain === domain)
      .sort((a, b) => Math.abs(b.effect_size) - Math.abs(a.effect_size));
    if (causes.length > 0) {
      sections.push(`\n### What DRIVES ${domain}? (Direct Causes)`);
      for (const c of causes.slice(0, 10)) {
        sections.push(
          `- ${c.source_domain} -> ${domain}: effect=${(c.effect_size * 100).toFixed(1)}%, lag=${c.optimal_lag_days}d, p=${c.granger_p_value.toFixed(4)}${c.natural_language ? " -- " + c.natural_language : ""}`
        );
      }
    }
  }

  // ── Direct Effects per domain ───────────────────────────────────────
  for (const domain of domains) {
    const effects = activeEdges
      .filter((e) => e.source_domain === domain)
      .sort((a, b) => Math.abs(b.effect_size) - Math.abs(a.effect_size));
    if (effects.length > 0) {
      sections.push(`\n### What does ${domain} AFFECT? (Direct Effects)`);
      for (const e of effects.slice(0, 10)) {
        sections.push(
          `- ${domain} -> ${e.target_domain}: effect=${(e.effect_size * 100).toFixed(1)}%, lag=${e.optimal_lag_days}d, p=${e.granger_p_value.toFixed(4)}${e.natural_language ? " -- " + e.natural_language : ""}`
        );
      }
    }
  }

  // ── Cascade Paths (multi-hop via BFS) ───────────────────────────────
  const cascadePaths = findCascadePathsBFS(activeEdges, domains, primaryDomain);
  if (cascadePaths.length > 0) {
    sections.push(`\n### Cross-Domain Cascade Paths`);
    for (const p of cascadePaths.slice(0, 15)) {
      sections.push(`- ${p}`);
    }
  }

  // ── Cascade Rules from org_cascade_rules ────────────────────────────
  const activeCascades = cascadeRules.filter((r) => r.is_active);
  if (activeCascades.length > 0) {
    sections.push(`\n### Active Cascade Alert Rules`);
    for (const r of activeCascades.slice(0, 10)) {
      const chain = r.propagation_chain
        .map((c) => `${c.source_domain} -> ${c.target_domain} [${c.severity}]`)
        .join(", ");
      sections.push(`- ${r.rule_name}: ${chain}`);
    }
  }

  // ── Business Rules ──────────────────────────────────────────────────
  if (rules.length > 0) {
    sections.push(`\n### Trained Business Rules`);
    for (const r of rules.slice(0, 15)) {
      try {
        const parsed = JSON.parse(r.content);
        const title = parsed.title || "Untitled Rule";
        const nl = parsed.natural_language || parsed.naturalLanguage || parsed.description || "";
        sections.push(`- [${r.domain}] ${title}: ${nl}`);
      } catch {
        sections.push(`- [${r.domain}] ${r.content.substring(0, 100)}`);
      }
    }
  }

  // ── Strongest Relationships (top 10) ────────────────────────────────
  const strongest = [...activeEdges]
    .sort((a, b) => Math.abs(b.effect_size) - Math.abs(a.effect_size))
    .slice(0, 10);
  if (strongest.length > 0) {
    sections.push(`\n### Strongest Relationships in Brain`);
    for (const r of strongest) {
      sections.push(
        `- ${r.source_domain} -> ${r.target_domain}: effect=${(r.effect_size * 100).toFixed(1)}%, lag=${r.optimal_lag_days}d, p=${r.granger_p_value.toFixed(4)}`
      );
    }
  }

  const brainContextText = sections.join("\n");

  // ── Build intent-aware system prompt ────────────────────────────────
  const systemPrompt = `You are the FinanceJarvis copilot powered by NexusBrain. You have access to a trained causal knowledge graph with ${new Set([...activeEdges.map((e) => e.source_domain), ...activeEdges.map((e) => e.target_domain)]).size} domains, ${activeEdges.length} causal edges, ${rules.length} business rules, and ${cascadeRules.length} cascade rules.

CRITICAL: When answering, you MUST use the brain's discovered parameters (effect sizes, lag days, p-values) from the context below. Do NOT use generic knowledge. Every claim must be grounded in the brain's data.

When the user asks to BUILD something (model, forecast, template):
- Use the brain's causal edges to define the model structure
- Use the brain's effect sizes as actual coefficients
- Use the brain's lag days as time delays
- Generate actual formulas or code using these numbers

When the user asks to EXPLAIN something:
- Cite specific causal edges with their statistics
- Reference matched rules and their conditions
- Quote the brain's discovered relationships, not generic advice

When the user asks to DIAGNOSE something:
- Walk the causal cascade paths step by step
- Show which rules are relevant and why
- Reference the impact analysis (affected domains, cascade depth)

When the user asks to PREDICT something:
- Use the brain's cascade paths to trace forward effects
- Use specific effect sizes and lag days as parameters
- Quantify uncertainty using p-values and sample sizes

Format your answers clearly with short paragraphs. Use bullet points for lists. When citing brain data, use the exact numbers from the context.

${brainContextText}`;

  return { systemPrompt, intent, domains };
}

// ============================================================================
// BFS CASCADE PATH FINDER (lightweight, no external dependency)
// ============================================================================

function findCascadePathsBFS(
  edges: DBCausalEdge[],
  queryDomains: string[],
  primaryDomain: string
): string[] {
  const results: string[] = [];
  const adjacency: Record<string, Array<{ target: string; effect: number; lag: number }>> = {};

  for (const e of edges) {
    if (!adjacency[e.source_domain]) adjacency[e.source_domain] = [];
    adjacency[e.source_domain].push({
      target: e.target_domain,
      effect: e.effect_size,
      lag: e.optimal_lag_days,
    });
  }

  // Find paths FROM feeder domains TO primary domain
  const feederDomains = ["marketing", "cs", "product", "engineering", "people", "revenue", "macro"];
  const sources = [...new Set([...feederDomains, ...queryDomains])];

  for (const source of sources) {
    if (source === primaryDomain) continue;
    const paths = bfsPathsTo(adjacency, source, primaryDomain, 4);
    for (const path of paths.slice(0, 3)) {
      results.push(path);
    }
  }

  // Also find paths between query domains
  for (let i = 0; i < queryDomains.length; i++) {
    for (let j = 0; j < queryDomains.length; j++) {
      if (i === j) continue;
      const paths = bfsPathsTo(adjacency, queryDomains[i], queryDomains[j], 4);
      for (const path of paths.slice(0, 2)) {
        if (!results.includes(path)) results.push(path);
      }
    }
  }

  return results;
}

function bfsPathsTo(
  adjacency: Record<string, Array<{ target: string; effect: number; lag: number }>>,
  source: string,
  target: string,
  maxDepth: number
): string[] {
  const results: string[] = [];
  const queue: Array<{ node: string; path: string[]; totalEffect: number; totalLag: number }> = [
    { node: source, path: [source], totalEffect: 1, totalLag: 0 },
  ];

  while (queue.length > 0) {
    const { node, path, totalEffect, totalLag } = queue.shift()!;
    if (path.length > maxDepth + 1) continue;

    if (node === target && path.length > 1) {
      results.push(
        `${path.join(" -> ")} (effect: ${(totalEffect * 100).toFixed(1)}%, lag: ${totalLag}d)`
      );
      continue;
    }

    const neighbors = adjacency[node] || [];
    for (const n of neighbors) {
      if (path.includes(n.target)) continue;
      queue.push({
        node: n.target,
        path: [...path, n.target],
        totalEffect: totalEffect * n.effect,
        totalLag: totalLag + n.lag,
      });
    }
  }

  return results.sort((a, b) => {
    const effectA = parseFloat(a.match(/effect: ([\d.-]+)%/)?.[1] || "0");
    const effectB = parseFloat(b.match(/effect: ([\d.-]+)%/)?.[1] || "0");
    return Math.abs(effectB) - Math.abs(effectA);
  });
}

// ============================================================================
// FALLBACK RESPONSE (when no API key)
// ============================================================================

function generateBrainFallbackResponse(
  message: string,
  causalEdges: DBCausalEdge[],
  rules: DBRule[],
  cascadeRules: DBCascadeRule[]
): string {
  const domains = extractDomains(message);
  const intent = detectIntent(message);
  const activeEdges = causalEdges.filter((e) => e.is_significant !== false);
  const allDomains = new Set([
    ...activeEdges.map((e) => e.source_domain),
    ...activeEdges.map((e) => e.target_domain),
  ]);

  const parts: string[] = [];

  parts.push(
    `Brain Status: ${allDomains.size} domains, ${activeEdges.length} causal edges, ${rules.length} rules, ${cascadeRules.length} cascade rules.`
  );
  parts.push(`Detected intent: ${intent} | Relevant domains: ${domains.join(", ")}\n`);

  // Show relevant edges
  const relevantEdges = activeEdges.filter(
    (e) => domains.includes(e.source_domain) || domains.includes(e.target_domain)
  );
  if (relevantEdges.length > 0) {
    parts.push("Relevant causal relationships:");
    for (const e of relevantEdges.slice(0, 8)) {
      parts.push(
        `- ${e.source_domain} -> ${e.target_domain}: ${(e.effect_size * 100).toFixed(1)}% effect, ${e.optimal_lag_days}d lag${e.natural_language ? " -- " + e.natural_language : ""}`
      );
    }
  } else {
    parts.push(
      "No causal edges found for these domains yet. The brain needs more training data."
    );
  }

  parts.push(
    "\nNote: ANTHROPIC_API_KEY is not configured. This is a brain-data-only response. Configure the API key for full AI-powered answers."
  );

  return parts.join("\n");
}

// ============================================================================
// MAIN ROUTE HANDLER
// ============================================================================

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

    // ── Gather brain knowledge from DB in parallel ────────────────────
    const [causalResult, rulesResult, cascadeResult] = await Promise.all([
      // Full causal graph (all significant edges for this org + core brain)
      supabase
        .from("causal_relationships_statistical")
        .select(
          "source_domain, target_domain, effect_size, granger_p_value, optimal_lag_days, granger_f_statistic, sample_size, confidence_interval_lower, confidence_interval_upper, natural_language, is_significant"
        )
        .or(`organization_id.eq.${orgId},organization_id.eq.${CORE_ORG_ID}`)
        .eq("is_significant", true)
        .order("effect_size", { ascending: false })
        .limit(200),

      // Business rules from ai_memory
      supabase
        .from("ai_memory")
        .select("content, importance, domain, metadata")
        .or(`organization_id.eq.${orgId},organization_id.eq.${CORE_ORG_ID}`)
        .eq("memory_type", "rule")
        .order("importance", { ascending: false })
        .limit(50),

      // Cascade rules
      supabase
        .from("org_cascade_rules")
        .select(
          "rule_name, trigger_domain, trigger_signal_type, propagation_chain, is_active"
        )
        .or(`organization_id.eq.${orgId},organization_id.eq.${CORE_ORG_ID}`)
        .eq("is_active", true)
        .limit(30),
    ]);

    const causalEdges: DBCausalEdge[] = causalResult.data || [];
    const rules: DBRule[] = rulesResult.data || [];
    const cascadeRules: DBCascadeRule[] = cascadeResult.data || [];

    // ── Build brain-powered context ───────────────────────────────────
    const { systemPrompt, intent, domains } = buildBrainContext(
      message,
      causalEdges,
      rules,
      cascadeRules
    );

    // ── Check for Anthropic API key ───────────────────────────────────
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!anthropicKey) {
      // Fallback: brain-data-only response
      const { stream, sendText, close } = createSSEStream();

      const fallbackResponse = generateBrainFallbackResponse(
        message,
        causalEdges,
        rules,
        cascadeRules
      );

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

    // ── Stream via Anthropic ──────────────────────────────────────────
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const { stream, sendText, sendError, close } = createSSEStream();

    (async () => {
      try {
        const anthropicStream = anthropic.messages.stream({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 4096,
          system: systemPrompt,
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
