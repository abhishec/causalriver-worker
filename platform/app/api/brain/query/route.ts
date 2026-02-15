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
import { brainQuerySchema, validateBody } from "@/lib/api-schemas";
import { corsHeaders, createRequestLogger, checkSessionRateLimit, validateCsrf, parseAndValidateBody } from "@/lib/security-middleware";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

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
      // Session rate limit for browser users
      const sessionRL = checkSessionRateLimit(user.id, "/api/brain/query");
      if (!sessionRL.allowed) {
        return NextResponse.json(
          { error: "Too many requests. Please slow down." },
          { status: 429, headers: { ...corsHeaders(request), "Retry-After": "60" } }
        );
      }
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

    // ── Parse & validate body (Zod schema) ─────────────────────────
    const bodyResult = await parseAndValidateBody(request);
    if ("error" in bodyResult) {
      return NextResponse.json({ error: bodyResult.error }, { status: 400, headers: corsHeaders(request) });
    }
    const validation = validateBody(brainQuerySchema, bodyResult.data);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400, headers: corsHeaders(request) });
    }
    const { question, action, organizationId, entityState, format } = validation.data;

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

    // ── Brain Commander: Single unified intelligence pipeline ─────────
    const { createBrainCommander } = await import("@nexus-ai/memory-stack");
    const commander = createBrainCommander({
      supabase,
      organizationId: orgId!,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      enableActions: true,
      enableMotorCommands: false,
    });

    const result = await commander.command(question, {
      userId: userId || undefined,
      action,
      entityState,
      format,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Brain command failed" }, { status: 500 });
    }

    // ── Build response (backwards-compatible with existing API contract) ──
    const compact = format === "compact";
    const { intelligence, dispatch, artifact } = result;

    // Filter patterns to relevant domains
    const relevantPatterns = intelligence.patterns
      .filter((p) => dispatch.domains.includes(p.domain as any) || dispatch.domains.some((d) => (p.content || "").toLowerCase().includes(d)))
      .slice(0, compact ? 5 : 15)
      .map((p) => ({
        domain: p.domain,
        name: p.llm_pattern_name || p.domain,
        description: p.llm_pattern_description || (p.content || "").substring(0, 200),
        importance: p.importance,
      }));

    const response: Record<string, unknown> = {
      question,
      intent: dispatch.intent,
      domains: dispatch.domains,
      organizationId: orgId,
      brainStats: {
        ...intelligence.stats,
        domainsDetected: dispatch.domains,
        intentDetected: dispatch.intent,
      },
      causalGraph: {
        causes: compact
          ? Object.fromEntries(Object.entries(intelligence.causalGraph.causes).map(([k, v]) => [k, v.slice(0, 5)]))
          : intelligence.causalGraph.causes,
        effects: compact
          ? Object.fromEntries(Object.entries(intelligence.causalGraph.effects).map(([k, v]) => [k, v.slice(0, 5)]))
          : intelligence.causalGraph.effects,
      },
      patterns: relevantPatterns,
      impactAnalysis: intelligence.impactAnalysis,
      cascadeRules: intelligence.cascadeRules.map((r) => ({
        name: r.rule_name,
        triggerDomain: r.trigger_domain,
        signalType: r.trigger_signal_type,
        chainLength: r.propagation_chain?.length || 0,
      })),
      // Commander metadata
      dispatch: {
        route: dispatch.route,
        complexity: dispatch.complexityScore,
        confidence: dispatch.confidence,
        latencyMs: dispatch.latencyMs,
      },
      timing: result.timing,
    };

    if (artifact) {
      const { __promptText, ...cleanArtifact } = artifact as any;
      response.artifact = cleanArtifact;
    }

    // Cognitive Stack — expose L3-L15 reasoning output to API clients
    // Without this, SDK users get richer output than API clients, which is
    // an information asymmetry that breaks dashboard and integration use cases.
    if (result.cognitiveStack) {
      const cs = result.cognitiveStack as unknown as Record<string, unknown>;
      response.cognitiveStack = compact
        ? {
            // Compact mode: key summaries only
            narrative: cs.narrative,
            redTeam: cs.redTeam ? { predictionsTested: (cs.redTeam as any).predictionsTested, challengesRaised: (cs.redTeam as any).challengesRaised } : null,
            imagination: cs.imagination ? { hypothesesGenerated: (cs.imagination as any).hypothesesGenerated } : null,
            curiosity: cs.curiosity ? { questionsGenerated: (cs.curiosity as any).questionsGenerated } : null,
            healthSummary: cs.healthSummary,
          }
        : cs;
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
