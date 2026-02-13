/**
 * Brain Query API — The universal intelligence endpoint.
 *
 * POST /api/brain/query
 *
 * This is the endpoint that makes NexusBrain callable by ANY agent.
 * It accepts a question, routes it through the brain's causal engine,
 * and returns structured intelligence (not just text).
 *
 * Auth: Supabase session cookie OR API key (Bearer nxb_...)
 *
 * Body: {
 *   question: string,           // "What drives customer churn?"
 *   action?: string,            // "forecast" | "simulate" | "explain" | "diagnose" | "query"
 *   organizationId?: string,    // Optional, defaults to user's org
 *   entityState?: object,       // Current metrics for rule evaluation
 *   domains?: string[],         // Filter to specific domains
 *   format?: "full" | "compact" // Response format
 * }
 *
 * Returns: {
 *   intent: string,
 *   domains: string[],
 *   causalGraph: { causes, effects, cascadePaths },
 *   patterns: [],
 *   rules: { matched, triggered },
 *   impactAnalysis: {},
 *   brainStats: {},
 *   artifact?: ActionArtifact,   // If action != "query"
 * }
 */

import { createClient } from "@/lib/supabase/server";
import { validateApiKey } from "@/lib/api-key-auth";
import { checkRateLimit, hashKey, setRateLimitHeaders } from "@/lib/rate-limiter";
import { NextRequest, NextResponse } from "next/server";

const CORE_ORG_ID = "00000000-0000-4000-a000-000000000001";

// Domain keyword map (matches brain-knowledge-context.ts)
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  finance: ["cash", "financial", "revenue", "burn", "runway", "arr", "mrr", "margin", "budget", "cost", "pricing", "roi"],
  growth: ["growth", "scaling", "scale", "expand", "fundraise", "traction", "pmf"],
  cs: ["customer", "churn", "retention", "nrr", "renewal", "upsell", "nps", "csat", "support"],
  marketing: ["marketing", "cac", "acquisition", "funnel", "conversion", "leads", "pipeline", "campaign", "seo"],
  product: ["product", "feature", "adoption", "usage", "engagement", "dau", "mau", "activation", "roadmap"],
  strategy: ["strategy", "forecasting", "scenario", "competitive", "market", "tam"],
  engineering: ["engineering", "code", "deploy", "technical debt", "architecture", "devops", "incidents", "velocity"],
  people: ["hiring", "talent", "culture", "team", "retention", "attrition", "compensation", "headcount"],
  revenue: ["revenue", "sales", "bookings", "deal", "quota", "win rate", "close rate"],
};

function extractDomains(question: string): string[] {
  const lower = question.toLowerCase();
  const domains: string[] = [];
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw)) && !domains.includes(domain)) {
      domains.push(domain);
    }
  }
  return domains.length > 0 ? domains : ["finance", "strategy"];
}

function detectIntent(question: string): string {
  const lower = question.toLowerCase();
  if (["build", "create", "model", "forecast", "project"].some((k) => lower.includes(k))) return "build";
  if (["diagnose", "wrong", "problem", "declining", "why is", "root cause"].some((k) => lower.includes(k))) return "diagnose";
  if (["predict", "what if", "scenario", "simulate", "happen if"].some((k) => lower.includes(k))) return "predict";
  if (["explain", "why", "how does", "what is", "describe"].some((k) => lower.includes(k))) return "explain";
  return "general";
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth: Try session first, then API key ────────────────────────
    let orgId: string | null = null;
    let userId: string | null = null;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      userId = user.id;
    } else {
      // Try API key
      const authHeader = request.headers.get("authorization");
      const apiKeyResult = await validateApiKey(authHeader);
      if (apiKeyResult) {
        orgId = apiKeyResult.organizationId;
        if (!apiKeyResult.permissions.includes("read")) {
          return NextResponse.json({ error: "API key lacks read permission" }, { status: 403 });
        }

        // ── BLOCKER 4: Enforce rate limit ───────────────────────────
        const rawKey = authHeader!.replace("Bearer ", "");
        const rateLimitResult = await checkRateLimit(
          hashKey(rawKey),
          apiKeyResult.rateLimitPerMinute
        );
        if (!rateLimitResult.allowed) {
          const res = NextResponse.json(
            { error: rateLimitResult.error, retryAfter: rateLimitResult.resetAt.toISOString() },
            { status: 429 }
          );
          setRateLimitHeaders(res.headers, rateLimitResult, apiKeyResult.rateLimitPerMinute);
          return res;
        }
      } else {
        return NextResponse.json({ error: "Unauthorized. Provide session cookie or API key (Bearer nxb_...)" }, { status: 401 });
      }
    }

    // ── Parse body ───────────────────────────────────────────────────
    const body = await request.json();
    const { question, action, organizationId, entityState, format } = body as {
      question: string;
      action?: string;
      organizationId?: string;
      entityState?: Record<string, unknown>;
      format?: "full" | "compact";
    };

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    // Resolve org
    if (!orgId) {
      orgId = organizationId || null;
      if (!orgId && userId) {
        const { data: membership } = await supabase
          .from("org_members")
          .select("organization_id")
          .eq("user_id", userId)
          .order("joined_at", { ascending: true })
          .limit(1)
          .single();
        orgId = membership?.organization_id || CORE_ORG_ID;
      }
    }

    // Validate membership (skip for API key auth — already validated)
    if (userId && orgId !== CORE_ORG_ID) {
      const { data: membership } = await supabase
        .from("org_members")
        .select("organization_id")
        .eq("user_id", userId)
        .eq("organization_id", orgId!)
        .single();

      if (!membership) {
        // Check platform admin
        const { data: admin } = await supabase
          .from("org_members")
          .select("is_platform_admin")
          .eq("user_id", userId)
          .eq("is_platform_admin", true)
          .limit(1)
          .single();
        if (!admin) {
          return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
        }
      }
    }

    // ── Extract intelligence ─────────────────────────────────────────
    const domains = extractDomains(question);
    const intent = detectIntent(question);
    const orgIds = [...new Set([orgId!, CORE_ORG_ID])];
    const orgFilter = orgIds.map((id) => `organization_id.eq.${id}`).join(",");

    // Parallel DB queries
    const [causalResult, rulesResult, patternsResult, cascadeResult] = await Promise.all([
      supabase
        .from("causal_relationships_statistical")
        .select("source_domain, target_domain, effect_size, granger_p_value, optimal_lag_days, natural_language, is_significant")
        .or(orgFilter)
        .eq("is_significant", true)
        .order("effect_size", { ascending: false })
        .limit(200),

      supabase
        .from("ai_memory")
        .select("content, importance, domain, metadata")
        .or(orgFilter)
        .eq("memory_type", "rule")
        .order("importance", { ascending: false })
        .limit(50),

      supabase
        .from("ai_memory")
        .select("content, domain, importance, llm_pattern_name, llm_pattern_description")
        .or(orgFilter)
        .eq("memory_type", "pattern")
        .order("importance", { ascending: false })
        .limit(50),

      supabase
        .from("org_cascade_rules")
        .select("rule_name, trigger_domain, trigger_signal_type, propagation_chain, is_active")
        .or(orgFilter)
        .eq("is_active", true)
        .limit(30),
    ]);

    const edges = causalResult.data || [];
    const rules = rulesResult.data || [];
    const patterns = patternsResult.data || [];
    const cascadeRules = cascadeResult.data || [];

    // ── Build causal graph context ───────────────────────────────────
    const directCauses: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number; description: string | null }>> = {};
    const directEffects: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number; description: string | null }>> = {};

    for (const e of edges) {
      const entry = {
        source: e.source_domain,
        target: e.target_domain,
        effectSize: e.effect_size,
        lagDays: e.optimal_lag_days,
        description: e.natural_language,
      };
      if (!directCauses[e.target_domain]) directCauses[e.target_domain] = [];
      directCauses[e.target_domain].push(entry);
      if (!directEffects[e.source_domain]) directEffects[e.source_domain] = [];
      directEffects[e.source_domain].push(entry);
    }

    // Sort by effect size
    for (const d of Object.keys(directCauses)) {
      directCauses[d].sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize));
    }
    for (const d of Object.keys(directEffects)) {
      directEffects[d].sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize));
    }

    // Filter to relevant domains
    const relevantCauses: Record<string, typeof directCauses[string]> = {};
    const relevantEffects: Record<string, typeof directEffects[string]> = {};
    for (const d of domains) {
      if (directCauses[d]) relevantCauses[d] = directCauses[d].slice(0, 10);
      if (directEffects[d]) relevantEffects[d] = directEffects[d].slice(0, 10);
    }

    // Filter patterns
    const relevantPatterns = patterns
      .filter((p) => domains.includes(p.domain) || domains.some((d) => (p.content || "").toLowerCase().includes(d)))
      .slice(0, 15)
      .map((p) => ({
        domain: p.domain,
        name: p.llm_pattern_name || p.domain,
        description: p.llm_pattern_description || (p.content || "").substring(0, 200),
        importance: p.importance,
      }));

    // Impact analysis per domain
    const impactAnalysis: Record<string, { affectedDomains: string[]; maxCascadeDepth: number; riskLevel: string }> = {};
    for (const domain of domains) {
      const adjacency: Record<string, string[]> = {};
      for (const e of edges) {
        if (!adjacency[e.source_domain]) adjacency[e.source_domain] = [];
        adjacency[e.source_domain].push(e.target_domain);
      }
      const visited = new Set<string>();
      const queue = [{ node: domain, depth: 0 }];
      let maxDepth = 0;
      while (queue.length > 0) {
        const { node, depth } = queue.shift()!;
        if (visited.has(node) || depth > 4) continue;
        visited.add(node);
        maxDepth = Math.max(maxDepth, depth);
        for (const n of adjacency[node] || []) {
          if (!visited.has(n)) queue.push({ node: n, depth: depth + 1 });
        }
      }
      const affected = [...visited].filter((d) => d !== domain);
      impactAnalysis[domain] = {
        affectedDomains: affected,
        maxCascadeDepth: maxDepth,
        riskLevel: affected.length >= 10 ? "critical" : affected.length >= 6 ? "high" : affected.length >= 3 ? "medium" : "low",
      };
    }

    // Brain stats
    const allDomains = new Set([
      ...edges.map((e) => e.source_domain),
      ...edges.map((e) => e.target_domain),
    ]);

    const brainStats = {
      totalDomains: allDomains.size,
      totalCausalEdges: edges.length,
      totalPatterns: patterns.length,
      totalRules: rules.length,
      totalCascadeRules: cascadeRules.length,
      domainsDetected: domains,
      intentDetected: intent,
    };

    // ── Run action engine if requested ───────────────────────────────
    let artifact = null;
    const actionType = action || (intent === "build" ? "forecast" : intent === "predict" ? "simulate" : intent === "diagnose" ? "diagnose" : intent === "explain" ? "explain" : null);

    if (actionType && actionType !== "query") {
      try {
        const { createDomainActionEngine } = await import("@nexus-ai/memory-stack");
        const engine = createDomainActionEngine({
          supabase,
          organizationId: orgId!,
          amplifierConfig: process.env.ANTHROPIC_API_KEY
            ? { provider: "anthropic" as const, apiKey: process.env.ANTHROPIC_API_KEY }
            : undefined,
        });

        const knowledgeCtx = {
          question,
          intent: intent as any,
          extractedDomains: domains,
          primaryDomain: domains[0] || "finance",
          directCauses: Object.fromEntries(
            Object.entries(directCauses).map(([k, v]) => [k, v.map(e => ({ source: e.source, target: e.target, effectSize: e.effectSize, lagDays: e.lagDays }))])
          ),
          directEffects: Object.fromEntries(
            Object.entries(directEffects).map(([k, v]) => [k, v.map(e => ({ source: e.source, target: e.target, effectSize: e.effectSize, lagDays: e.lagDays }))])
          ),
          matchedRules: rules.slice(0, 15).map((r) => {
            try {
              const parsed = JSON.parse(r.content);
              return {
                title: parsed.title || "Rule",
                naturalLanguage: parsed.natural_language || parsed.description || "",
                conditions: (parsed.when?.conditions || []).map((c: any) => `${c.field} ${c.operator} ${c.value}`),
                triggered: false,
              };
            } catch {
              return { title: "Rule", naturalLanguage: r.content?.substring(0, 100) || "", conditions: [], triggered: false };
            }
          }),
        };

        artifact = await engine.execute(question, knowledgeCtx);
      } catch (err) {
        // Non-fatal: return brain intelligence without action artifact
        console.warn("[Brain API] Action engine error (non-fatal):", err);
      }
    }

    // ── Build response ───────────────────────────────────────────────
    const compact = format === "compact";

    const response: Record<string, unknown> = {
      question,
      intent,
      domains,
      organizationId: orgId,
      brainStats,
      causalGraph: {
        causes: compact ? Object.fromEntries(Object.entries(relevantCauses).map(([k, v]) => [k, v.slice(0, 5)])) : relevantCauses,
        effects: compact ? Object.fromEntries(Object.entries(relevantEffects).map(([k, v]) => [k, v.slice(0, 5)])) : relevantEffects,
      },
      patterns: compact ? relevantPatterns.slice(0, 5) : relevantPatterns,
      impactAnalysis,
      cascadeRules: cascadeRules.map((r) => ({
        name: r.rule_name,
        triggerDomain: r.trigger_domain,
        signalType: r.trigger_signal_type,
        chainLength: r.propagation_chain?.length || 0,
      })),
    };

    if (artifact) {
      // Strip internal fields for API response
      const { __promptText, ...cleanArtifact } = artifact as any;
      response.artifact = cleanArtifact;
    }

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/brain/query — Brain health check + capabilities
 */
export async function GET() {
  return NextResponse.json({
    name: "NexusBrain Intelligence API",
    version: "1.0.0",
    capabilities: [
      "causal_discovery",
      "pattern_mining",
      "temporal_forecasting",
      "counterfactual_simulation",
      "anomaly_diagnosis",
      "cascade_analysis",
      "impact_estimation",
      "rule_evaluation",
    ],
    actions: ["forecast", "simulate", "explain", "diagnose", "query"],
    auth: ["supabase_session", "api_key (Bearer nxb_...)"],
    docs: "POST a JSON body with { question, action?, organizationId?, entityState? }",
  });
}
