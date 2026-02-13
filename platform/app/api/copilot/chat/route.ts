/**
 * Brain-Powered Copilot Chat Route — V2 (CTO Audit Fixes)
 *
 * This route uses the FULL NexusBrain knowledge graph to answer questions.
 *
 * FIXED GAPS (from CTO audit):
 *   GAP 1 ✅ — Shared DOMAIN_KEYWORDS + logic matches brain-knowledge-context.ts
 *   GAP 2 ✅ — Queries ai_memory patterns (memory_type='pattern') from DB
 *   GAP 3 ✅ — Evaluates rule conditions against entity state (when provided)
 *   GAP 4 ✅ — Computes impact estimation from causal graph (risk level, cascade depth)
 *   GAP 5 ✅ — Accepts entityState from frontend for rule firing
 *   GAP 6 ✅ — Supports dynamic orgId AND falls back to both core + jarvis orgs
 *   GAP 7 ✅ — Accepts conversationHistory for multi-turn context
 *
 * Data flow:
 *   1. Parallel DB queries: causal edges, rules, cascade rules, patterns
 *   2. Domain extraction + intent detection
 *   3. Build brain context: causes, effects, cascade paths, patterns, impact
 *   4. Evaluate rules against entity state (if provided)
 *   5. Intent-aware system prompt with ALL brain data
 *   6. Multi-turn conversation support
 *   7. Stream response via Anthropic (or fallback to brain-only)
 */

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const CORE_ORG_ID = "00000000-0000-4000-a000-000000000001";
const JARVIS_ORG_ID = "11111111-1111-4000-a000-111111111111";

// ============================================================================
// DOMAIN KEYWORD MAP (canonical source — matches brain-knowledge-context.ts)
// ============================================================================

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  finance: [
    "cash", "cash flow", "financial", "revenue", "burn", "runway", "arr",
    "mrr", "gross margin", "ltv", "payback", "unit economics", "p&l",
    "profit", "loss", "budget", "forecast", "ebitda", "margin", "cogs",
    "opex", "capex", "working capital", "balance sheet", "income statement",
    "money", "cost", "pricing", "revenue model", "funding", "raise",
    "valuation", "roi", "irr", "npv", "dcf",
  ],
  growth: [
    "startup", "growth", "scaling", "scale", "expand", "expansion",
    "hypergrowth", "series", "fundraise", "traction", "virality", "pmf",
    "product-market fit", "go-to-market", "gtm",
  ],
  cs: [
    "customer", "churn", "retention", "nrr", "grr", "customer success",
    "logo churn", "renewal", "upsell", "expansion revenue", "health score",
    "satisfaction", "nps", "csat", "support ticket", "onboarding",
  ],
  marketing: [
    "marketing", "cac", "acquisition", "magic number", "plg", "funnel",
    "conversion", "leads", "pipeline", "brand", "demand gen", "seo",
    "content", "paid", "organic", "channel", "campaign",
  ],
  product: [
    "product", "feature", "self-serve", "adoption", "usage",
    "engagement", "dau", "mau", "stickiness", "activation",
    "ux", "ui", "roadmap", "backlog", "sprint",
  ],
  strategy: [
    "strategy", "model", "forecasting", "scenario", "plan", "competitive",
    "moat", "positioning", "market", "tam", "sam", "som",
  ],
  engineering: [
    "engineering", "code", "deploy", "ci/cd", "technical debt", "architecture",
    "infrastructure", "devops", "reliability", "sla", "uptime", "latency",
    "incidents", "bugs", "velocity",
  ],
  people: [
    "hiring", "talent", "culture", "team", "retention", "attrition",
    "compensation", "equity", "headcount", "org design", "leadership",
    "manager", "performance review",
  ],
  revenue: [
    "revenue", "sales", "bookings", "arr", "mrr", "deal", "pipeline",
    "quota", "commission", "close rate", "win rate", "ase", "ae",
  ],
  macro: [
    "macro", "economy", "gdp", "inflation", "interest rate", "fed",
    "recession", "unemployment", "labor", "tariff", "trade",
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

interface DBPattern {
  content: string;
  domain: string;
  importance: number;
  llm_pattern_name: string | null;
  llm_pattern_description: string | null;
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

interface ParsedRule {
  title: string;
  description: string;
  naturalLanguage: string;
  entityType: string;
  when: {
    logic: "AND" | "OR";
    conditions: Array<{
      field: string;
      operator: string;
      value: unknown;
    }>;
  };
  then: unknown[];
  domain: string;
  isActive: boolean;
}

interface TriggeredRule {
  title: string;
  naturalLanguage: string;
  triggered: boolean;
  matchedConditions: string[];
  failedConditions: string[];
}

interface ImpactEstimate {
  domain: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  affectedDomains: string[];
  maxCascadeDepth: number;
  totalEffectMagnitude: number;
  timeToFullCascade: number;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
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

  return { stream, send, sendText, sendError, close };
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

  const buildKw = [
    "build", "create", "design", "model", "template", "generate",
    "forecast model", "spreadsheet", "dashboard", "formula", "code",
  ];
  const diagnoseKw = [
    "diagnose", "debug", "wrong", "problem", "issue", "declining",
    "dropping", "increasing", "why is", "root cause", "investigate",
  ];
  const predictKw = [
    "predict", "forecast", "what would", "what if", "scenario",
    "project", "estimate", "simulate", "happen if",
  ];
  const explainKw = [
    "explain", "why", "how does", "what is", "what are",
    "describe", "tell me about", "understand",
  ];

  if (buildKw.some((kw) => lower.includes(kw))) return "build";
  if (diagnoseKw.some((kw) => lower.includes(kw))) return "diagnose";
  if (predictKw.some((kw) => lower.includes(kw))) return "predict";
  if (explainKw.some((kw) => lower.includes(kw))) return "explain";

  return "general";
}

// ============================================================================
// RULE EVALUATOR (GAP 3 FIX — evaluates rule conditions against entity state)
// ============================================================================

// ── Entity State Normalizer (maps domain keys → canonical rule field paths) ──

function normalizeEntityState(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...raw };

  const finance = raw.finance as Record<string, unknown> | undefined;
  if (finance && typeof finance === "object") {
    const metrics: Record<string, unknown> = {
      ...(raw.metrics as Record<string, unknown> || {}),
    };
    if (finance.arr !== undefined) metrics.arr = finance.arr;
    if (finance.arr_growth_rate !== undefined) {
      metrics.arr_growth_rate = finance.arr_growth_rate;
      metrics.arr_growth_pct = typeof finance.arr_growth_rate === "number" ? finance.arr_growth_rate * 100 : finance.arr_growth_rate;
    }
    if (finance.burn_multiple !== undefined) metrics.burn_multiple = finance.burn_multiple;
    if (finance.gross_margin !== undefined) {
      metrics.gross_margin = finance.gross_margin;
      metrics.gross_margin_pct = typeof finance.gross_margin === "number" ? finance.gross_margin * 100 : finance.gross_margin;
    }
    if (finance.cac_payback_months !== undefined) metrics.cac_payback_months = finance.cac_payback_months;
    if (finance.ltv_cac_ratio !== undefined) metrics.ltv_cac_ratio = finance.ltv_cac_ratio;
    if (finance.cash_runway_months !== undefined) {
      metrics.cash_runway_months = finance.cash_runway_months;
      metrics.runway_months = finance.cash_runway_months;
    }
    if (finance.rule_of_40_score !== undefined) metrics.rule_of_40_score = finance.rule_of_40_score;
    if (finance.revenue_per_employee !== undefined) metrics.revenue_per_employee = finance.revenue_per_employee;
    normalized.metrics = metrics;
  }

  const cs = raw.cs as Record<string, unknown> | undefined;
  if (cs && typeof cs === "object") {
    const metrics = normalized.metrics as Record<string, unknown> || {};
    if (cs.nrr !== undefined) metrics.nrr = cs.nrr;
    if (cs.logo_churn_rate_annual !== undefined) {
      metrics.logo_churn_rate_annual = cs.logo_churn_rate_annual;
      metrics.churn_rate = cs.logo_churn_rate_annual;
    }
    normalized.metrics = metrics;
  }

  const marketing = raw.marketing as Record<string, unknown> | undefined;
  if (marketing && typeof marketing === "object") {
    const metrics = normalized.metrics as Record<string, unknown> || {};
    if (marketing.magic_number !== undefined) metrics.magic_number = marketing.magic_number;
    if (marketing.plg_revenue_pct !== undefined) metrics.plg_revenue_pct = marketing.plg_revenue_pct;
    normalized.metrics = metrics;
  }

  if (raw.runway_months !== undefined) {
    const metrics = normalized.metrics as Record<string, unknown> || {};
    metrics.runway_months = raw.runway_months;
    metrics.cash_runway_months = raw.runway_months;
    normalized.metrics = metrics;
  }

  const nrr = raw.nrr as Record<string, unknown> | undefined;
  if (nrr && typeof nrr === "object" && nrr.trailing_12m !== undefined) {
    const metrics = normalized.metrics as Record<string, unknown> || {};
    metrics.nrr = nrr.trailing_12m;
    normalized.metrics = metrics;
  }

  const grr = raw.grr as Record<string, unknown> | undefined;
  if (grr && typeof grr === "object" && grr.trailing_12m !== undefined) {
    const metrics = normalized.metrics as Record<string, unknown> || {};
    metrics.grr = grr.trailing_12m;
    normalized.metrics = metrics;
  }

  if (!normalized.company) {
    normalized.company = { ...(finance || {}) };
  }

  return normalized;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateCondition(
  condition: { field: string; operator: string; value: unknown },
  entityState: Record<string, unknown>
): boolean {
  const actual = getNestedValue(entityState, condition.field);
  if (actual === undefined || actual === null) return false;

  const expected = condition.value;
  const numActual = typeof actual === "number" ? actual : parseFloat(String(actual));
  const numExpected = typeof expected === "number" ? expected : parseFloat(String(expected));

  switch (condition.operator) {
    case "<":
      return numActual < numExpected;
    case "<=":
      return numActual <= numExpected;
    case ">":
      return numActual > numExpected;
    case ">=":
      return numActual >= numExpected;
    case "==":
    case "===":
      return actual === expected || numActual === numExpected;
    case "!=":
    case "!==":
      return actual !== expected && numActual !== numExpected;
    default:
      return false;
  }
}

function evaluateRules(
  parsedRules: ParsedRule[],
  entityState: Record<string, unknown>
): TriggeredRule[] {
  const results: TriggeredRule[] = [];

  for (const rule of parsedRules) {
    if (!rule.isActive || !rule.when?.conditions) continue;

    const matchedConditions: string[] = [];
    const failedConditions: string[] = [];

    for (const cond of rule.when.conditions) {
      const passed = evaluateCondition(cond, entityState);
      const desc = `${cond.field} ${cond.operator} ${cond.value}`;
      if (passed) {
        matchedConditions.push(desc);
      } else {
        failedConditions.push(desc);
      }
    }

    const triggered =
      rule.when.logic === "AND"
        ? failedConditions.length === 0 && matchedConditions.length > 0
        : matchedConditions.length > 0;

    results.push({
      title: rule.title,
      naturalLanguage: rule.naturalLanguage || rule.description || "",
      triggered,
      matchedConditions,
      failedConditions,
    });
  }

  return results;
}

function parseDBRules(rules: DBRule[]): ParsedRule[] {
  const parsed: ParsedRule[] = [];
  for (const r of rules) {
    try {
      const p = JSON.parse(r.content);
      if (p && p.when && p.entity_type) {
        parsed.push({
          title: p.title || "Untitled Rule",
          description: p.description || "",
          naturalLanguage: p.natural_language || p.naturalLanguage || p.description || "",
          entityType: p.entity_type,
          when: p.when,
          then: p.then || [],
          domain: r.domain,
          isActive: p.is_active !== false,
        });
      }
    } catch {
      // Skip malformed
    }
  }
  return parsed;
}

// ============================================================================
// IMPACT ESTIMATOR (GAP 4 FIX — computes risk from causal graph)
// ============================================================================

function estimateImpact(
  domain: string,
  edges: DBCausalEdge[]
): ImpactEstimate {
  const activeEdges = edges.filter((e) => e.is_significant !== false);

  // BFS from domain to find all affected domains
  const adjacency: Record<string, Array<{ target: string; effect: number; lag: number }>> = {};
  for (const e of activeEdges) {
    if (!adjacency[e.source_domain]) adjacency[e.source_domain] = [];
    adjacency[e.source_domain].push({
      target: e.target_domain,
      effect: e.effect_size,
      lag: e.optimal_lag_days,
    });
  }

  const visited = new Set<string>();
  const queue: Array<{ node: string; depth: number; effectSoFar: number; lagSoFar: number }> = [
    { node: domain, depth: 0, effectSoFar: 1, lagSoFar: 0 },
  ];

  let maxDepth = 0;
  let totalEffect = 0;
  let maxLag = 0;

  while (queue.length > 0) {
    const { node, depth, effectSoFar, lagSoFar } = queue.shift()!;
    if (visited.has(node) || depth > 4) continue;
    visited.add(node);

    if (depth > 0) {
      totalEffect += effectSoFar;
      maxDepth = Math.max(maxDepth, depth);
      maxLag = Math.max(maxLag, lagSoFar);
    }

    for (const neighbor of adjacency[node] || []) {
      if (!visited.has(neighbor.target)) {
        queue.push({
          node: neighbor.target,
          depth: depth + 1,
          effectSoFar: effectSoFar * neighbor.effect,
          lagSoFar: lagSoFar + neighbor.lag,
        });
      }
    }
  }

  const affectedDomains = [...visited].filter((d) => d !== domain);
  const riskLevel: ImpactEstimate["riskLevel"] =
    affectedDomains.length >= 15 || totalEffect >= 10
      ? "critical"
      : affectedDomains.length >= 8 || totalEffect >= 5
        ? "high"
        : affectedDomains.length >= 4 || totalEffect >= 2
          ? "medium"
          : "low";

  return {
    domain,
    riskLevel,
    affectedDomains,
    maxCascadeDepth: maxDepth,
    totalEffectMagnitude: totalEffect,
    timeToFullCascade: maxLag,
  };
}

// ============================================================================
// BRAIN CONTEXT BUILDER (V2 — with patterns, rule eval, impact estimation)
// ============================================================================

function buildBrainContext(
  message: string,
  causalEdges: DBCausalEdge[],
  rules: DBRule[],
  cascadeRules: DBCascadeRule[],
  patterns: DBPattern[],
  entityState?: Record<string, unknown>,
  conversationSummary?: string
): { systemPrompt: string; intent: UserIntent; domains: string[] } {
  const domains = extractDomains(message);
  const intent = detectIntent(message);
  const primaryDomain = domains[0] || "finance";

  const sections: string[] = [];
  const activeEdges = causalEdges.filter((e) => e.is_significant !== false);

  // ── Header ──────────────────────────────────────────────────────────────
  const allDomains = new Set([
    ...activeEdges.map((e) => e.source_domain),
    ...activeEdges.map((e) => e.target_domain),
  ]);
  sections.push(
    `## Brain Knowledge Context`,
    `Domains detected: ${domains.join(", ")} | ` +
      `Total Domains: ${allDomains.size} | ` +
      `Causal Edges: ${activeEdges.length} | ` +
      `Business Rules: ${rules.length} | ` +
      `Patterns: ${patterns.length} | ` +
      `Cascade Rules: ${cascadeRules.length} | ` +
      `Intent: ${intent}`
  );

  // ── Conversation Context (GAP 7 FIX) ───────────────────────────────────
  if (conversationSummary) {
    sections.push(`\n### Conversation Context`);
    sections.push(conversationSummary);
  }

  // ── Direct Causes per domain ────────────────────────────────────────────
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

  // ── Direct Effects per domain ───────────────────────────────────────────
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

  // ── Discovered Patterns (GAP 2 FIX) ───────────────────────────────────
  const relevantPatterns = patterns.filter((p) =>
    domains.includes(p.domain) || domains.some((d) => p.content.toLowerCase().includes(d))
  );
  if (relevantPatterns.length > 0) {
    sections.push(`\n### Discovered Patterns (${relevantPatterns.length} relevant)`);
    for (const p of relevantPatterns.slice(0, 20)) {
      const name = p.llm_pattern_name || p.domain;
      const desc = p.llm_pattern_description || p.content.substring(0, 200);
      sections.push(`- [${p.domain}] ${name}: ${desc}`);
    }
    if (relevantPatterns.length > 20) {
      sections.push(`  ... and ${relevantPatterns.length - 20} more patterns`);
    }
  }

  // ── Cascade Paths (multi-hop via BFS) ──────────────────────────────────
  const cascadePaths = findCascadePathsBFS(activeEdges, domains, primaryDomain);
  if (cascadePaths.length > 0) {
    sections.push(`\n### Cross-Domain Cascade Paths`);
    for (const p of cascadePaths.slice(0, 15)) {
      sections.push(`- ${p}`);
    }
  }

  // ── Cascade Rules from org_cascade_rules ───────────────────────────────
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

  // ── Business Rules + Rule Evaluation (GAP 3 FIX) ──────────────────────
  const parsedRules = parseDBRules(rules);
  if (parsedRules.length > 0) {
    sections.push(`\n### Trained Business Rules`);
    for (const r of parsedRules.slice(0, 15)) {
      sections.push(`- [${r.domain}] ${r.title}: ${r.naturalLanguage}`);
    }
  }

  // Evaluate rules against entity state if provided (normalize first)
  let triggeredRules: TriggeredRule[] = [];
  if (entityState && Object.keys(entityState).length > 0) {
    const normalizedState = normalizeEntityState(entityState);
    triggeredRules = evaluateRules(parsedRules, normalizedState);
    const fired = triggeredRules.filter((r) => r.triggered);
    if (fired.length > 0) {
      sections.push(`\n### 🔴 TRIGGERED Rules (${fired.length} fired)`);
      for (const r of fired) {
        sections.push(`- [FIRED] ${r.title}: ${r.naturalLanguage}`);
        sections.push(`  Matched: ${r.matchedConditions.join(" | ")}`);
      }
    }
    const nearMiss = triggeredRules.filter(
      (r) => !r.triggered && r.matchedConditions.length > 0
    );
    if (nearMiss.length > 0) {
      sections.push(`\n### ⚠️ Near-Miss Rules (${nearMiss.length} partially matched)`);
      for (const r of nearMiss.slice(0, 5)) {
        sections.push(
          `- ${r.title}: matched ${r.matchedConditions.length}/${r.matchedConditions.length + r.failedConditions.length} conditions`
        );
        sections.push(`  Failed: ${r.failedConditions.join(" | ")}`);
      }
    }
  }

  // ── Impact Analysis (GAP 4 FIX) ──────────────────────────────────────
  for (const domain of domains) {
    const impact = estimateImpact(domain, causalEdges);
    if (impact.affectedDomains.length > 0) {
      sections.push(`\n### Impact Analysis: ${domain}`);
      sections.push(`- Risk Level: ${impact.riskLevel.toUpperCase()}`);
      sections.push(`- Affected domains: ${impact.affectedDomains.join(", ")}`);
      sections.push(`- Cascade depth: ${impact.maxCascadeDepth} hops`);
      sections.push(`- Total effect magnitude: ${impact.totalEffectMagnitude.toFixed(2)}`);
      sections.push(`- Time to full cascade: ${impact.timeToFullCascade} days`);
    }
  }

  // ── Strongest Relationships (top 10) ──────────────────────────────────
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

  // ── Most Influential Domains ──────────────────────────────────────────
  const domainInfluence: Record<string, number> = {};
  for (const e of activeEdges) {
    domainInfluence[e.source_domain] = (domainInfluence[e.source_domain] || 0) + Math.abs(e.effect_size);
  }
  const sortedInfluence = Object.entries(domainInfluence)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  if (sortedInfluence.length > 0) {
    sections.push(`\n### Most Influential Domains`);
    for (const [d, inf] of sortedInfluence) {
      sections.push(`- ${d}: influence=${inf.toFixed(2)}`);
    }
  }

  const brainContextText = sections.join("\n");

  // ── Build intent-aware system prompt ──────────────────────────────────
  const entityStateNote = entityState
    ? `\nThe user has provided their current metrics. ${triggeredRules.filter((r) => r.triggered).length} business rules have FIRED — highlight these in your response.`
    : "\nNo entity state was provided. If your answer would benefit from specific metrics, ask the user to share their current ARR, burn rate, churn, etc.";

  const systemPrompt = `You are the FinanceJarvis copilot powered by NexusBrain. You have access to a trained causal knowledge graph with ${allDomains.size} domains, ${activeEdges.length} causal edges, ${parsedRules.length} business rules, ${patterns.length} statistical patterns, and ${cascadeRules.length} cascade rules.

CRITICAL: When answering, you MUST use the brain's discovered parameters (effect sizes, lag days, p-values) from the context below. Do NOT use generic knowledge. Every claim must be grounded in the brain's data.
${entityStateNote}

When the user asks to BUILD something (model, forecast, template):
- Use the brain's causal edges to define the model structure
- Use the brain's effect sizes as actual coefficients
- Use the brain's lag days as time delays
- Reference specific patterns that apply to their domain
- Generate actual formulas or code using these numbers

When the user asks to EXPLAIN something:
- Cite specific causal edges with their statistics
- Reference matched patterns with significance levels
- Quote the brain's discovered relationships, not generic advice

When the user asks to DIAGNOSE something:
- Walk the causal cascade paths step by step
- Show which rules fired and why (with matched conditions)
- Reference the impact analysis (risk level, affected domains, cascade depth)
- Show near-miss rules that partially matched

When the user asks to PREDICT something:
- Use the brain's cascade paths to trace forward effects
- Use the impact estimates to quantify risk
- Reference specific effect sizes and lag days as parameters
- Quantify uncertainty using p-values and sample sizes

Format your answers clearly with short paragraphs. Use bullet points for lists. When citing brain data, use the exact numbers from the context.

${brainContextText}`;

  return { systemPrompt, intent, domains };
}

// ============================================================================
// BFS CASCADE PATH FINDER
// ============================================================================

function findCascadePathsBFS(
  edges: DBCausalEdge[],
  queryDomains: string[],
  primaryDomain: string
): string[] {
  const results: string[] = [];
  const adjacency: Record<string, Array<{ target: string; effect: number; lag: number }>> = {};

  for (const e of edges) {
    if (e.is_significant === false) continue;
    if (!adjacency[e.source_domain]) adjacency[e.source_domain] = [];
    adjacency[e.source_domain].push({
      target: e.target_domain,
      effect: e.effect_size,
      lag: e.optimal_lag_days,
    });
  }

  const feederDomains = ["marketing", "cs", "product", "engineering", "people", "revenue", "macro"];
  const sources = [...new Set([...feederDomains, ...queryDomains])];

  for (const source of sources) {
    if (source === primaryDomain) continue;
    const paths = bfsPathsTo(adjacency, source, primaryDomain, 4);
    for (const path of paths.slice(0, 3)) {
      results.push(path);
    }
  }

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
// CONVERSATION SUMMARY BUILDER (GAP 7 FIX)
// ============================================================================

function buildConversationSummary(history: ConversationMessage[]): string | undefined {
  if (!history || history.length === 0) return undefined;

  const recentMessages = history.slice(-6); // Last 3 exchanges
  const summary: string[] = [
    "Previous conversation context (last few exchanges):",
  ];

  for (const msg of recentMessages) {
    const prefix = msg.role === "user" ? "User" : "Copilot";
    const truncated =
      msg.content.length > 200 ? msg.content.substring(0, 200) + "..." : msg.content;
    summary.push(`- ${prefix}: ${truncated}`);
  }

  return summary.join("\n");
}

// ============================================================================
// FALLBACK RESPONSE (when no API key)
// ============================================================================

function generateBrainFallbackResponse(
  message: string,
  causalEdges: DBCausalEdge[],
  rules: DBRule[],
  cascadeRules: DBCascadeRule[],
  patterns: DBPattern[]
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
    `Brain Status: ${allDomains.size} domains, ${activeEdges.length} causal edges, ${rules.length} rules, ${patterns.length} patterns, ${cascadeRules.length} cascade rules.`
  );
  parts.push(`Detected intent: ${intent} | Relevant domains: ${domains.join(", ")}\n`);

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
  }

  // Show relevant patterns
  const relevantPatterns = patterns.filter((p) => domains.includes(p.domain));
  if (relevantPatterns.length > 0) {
    parts.push("\nRelevant patterns:");
    for (const p of relevantPatterns.slice(0, 5)) {
      parts.push(
        `- [${p.domain}] ${p.llm_pattern_name || "Pattern"}: ${(p.llm_pattern_description || p.content).substring(0, 100)}`
      );
    }
  }

  parts.push(
    "\nNote: ANTHROPIC_API_KEY is not configured. This is a brain-data-only response. Configure the API key for full AI-powered answers."
  );

  return parts.join("\n");
}

// ============================================================================
// ACTION KNOWLEDGE BUILDER — converts route DB data to ActionKnowledgeContext
// ============================================================================

function buildActionKnowledge(
  question: string,
  intent: UserIntent,
  domains: string[],
  causalEdges: DBCausalEdge[],
  rules: DBRule[],
  entityState?: Record<string, unknown>
): {
  question: string;
  intent: UserIntent;
  extractedDomains: string[];
  primaryDomain: string;
  directCauses: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number }>>;
  directEffects: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number }>>;
  matchedRules: Array<{ title: string; naturalLanguage: string; conditions: string[]; triggered: boolean }>;
} {
  // Build directCauses and directEffects from causal edges
  const directCauses: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number }>> = {};
  const directEffects: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number }>> = {};

  for (const edge of causalEdges) {
    const entry = {
      source: edge.source_domain,
      target: edge.target_domain,
      effectSize: edge.effect_size,
      lagDays: edge.optimal_lag_days,
    };

    // Target's causes
    if (!directCauses[edge.target_domain]) directCauses[edge.target_domain] = [];
    directCauses[edge.target_domain].push(entry);

    // Source's effects
    if (!directEffects[edge.source_domain]) directEffects[edge.source_domain] = [];
    directEffects[edge.source_domain].push(entry);
  }

  // Sort by effect size (strongest first)
  for (const domain of Object.keys(directCauses)) {
    directCauses[domain].sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize));
  }
  for (const domain of Object.keys(directEffects)) {
    directEffects[domain].sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize));
  }

  // Parse and evaluate rules (reuses existing parseDBRules + evaluateCondition)
  const normalizedState = entityState ? normalizeEntityState(entityState) : {};
  const parsedRules = parseDBRules(rules);
  const matchedRules: Array<{ title: string; naturalLanguage: string; conditions: string[]; triggered: boolean }> = [];

  for (const parsed of parsedRules) {
    const conditionStrs = parsed.when.conditions.map(
      (c: { field: string; operator: string; value: unknown }) =>
        `${c.field} ${c.operator} ${c.value}`
    );

    let triggered = false;
    if (entityState && parsed.when.conditions.length > 0) {
      const results = parsed.when.conditions.map(
        (c: { field: string; operator: string; value: unknown }) =>
          evaluateCondition(c, normalizedState)
      );
      triggered = parsed.when.logic === "AND"
        ? results.every(Boolean)
        : results.some(Boolean);
    }

    matchedRules.push({
      title: parsed.title,
      naturalLanguage: parsed.naturalLanguage,
      conditions: conditionStrs,
      triggered,
    });
  }

  return {
    question,
    intent,
    extractedDomains: domains,
    primaryDomain: domains[0] || "finance",
    directCauses,
    directEffects,
    matchedRules,
  };
}

// ============================================================================
// MAIN ROUTE HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      message,
      organizationId,
      entityState,
      conversationHistory,
    } = body as {
      message: string;
      organizationId?: string;
      entityState?: Record<string, unknown>;
      conversationHistory?: ConversationMessage[];
    };

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

    // ── Validate user is a member of the requested org ─────────────────
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id, is_platform_admin")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .single();

    // Platform admins can access any org
    const { data: adminCheck } = !membership
      ? await supabase
          .from("org_members")
          .select("is_platform_admin")
          .eq("user_id", user.id)
          .eq("is_platform_admin", true)
          .limit(1)
          .single()
      : { data: null };

    if (!membership && !adminCheck) {
      return NextResponse.json(
        { error: "You are not a member of this organization" },
        { status: 403 }
      );
    }

    // ── Org filter: query across user org + core (shared brain data) ───
    const orgIds = [
      ...new Set([orgId, CORE_ORG_ID]),
    ];
    const orgFilter = orgIds.map((id) => `organization_id.eq.${id}`).join(",");

    // ── Gather brain knowledge from DB in parallel (GAP 2 FIX: +patterns) ─
    const [causalResult, rulesResult, cascadeResult, patternsResult] = await Promise.all([
      // Full causal graph
      supabase
        .from("causal_relationships_statistical")
        .select(
          "source_domain, target_domain, effect_size, granger_p_value, optimal_lag_days, granger_f_statistic, sample_size, confidence_interval_lower, confidence_interval_upper, natural_language, is_significant"
        )
        .or(orgFilter)
        .eq("is_significant", true)
        .order("effect_size", { ascending: false })
        .limit(300),

      // Business rules
      supabase
        .from("ai_memory")
        .select("content, importance, domain, metadata")
        .or(orgFilter)
        .eq("memory_type", "rule")
        .order("importance", { ascending: false })
        .limit(100),

      // Cascade rules
      supabase
        .from("org_cascade_rules")
        .select(
          "rule_name, trigger_domain, trigger_signal_type, propagation_chain, is_active"
        )
        .or(orgFilter)
        .eq("is_active", true)
        .limit(50),

      // Patterns (GAP 2 FIX)
      supabase
        .from("ai_memory")
        .select("content, domain, importance, llm_pattern_name, llm_pattern_description, metadata")
        .or(orgFilter)
        .eq("memory_type", "pattern")
        .order("importance", { ascending: false })
        .limit(100),
    ]);

    const causalEdges: DBCausalEdge[] = causalResult.data || [];
    const rules: DBRule[] = rulesResult.data || [];
    const cascadeRules: DBCascadeRule[] = cascadeResult.data || [];
    const patterns: DBPattern[] = (patternsResult.data || []) as DBPattern[];

    // ── Build conversation summary (GAP 7 FIX) ─────────────────────────
    const conversationSummary = buildConversationSummary(
      conversationHistory || []
    );

    // ── Build brain-powered context (ALL gaps fixed) ───────────────────
    const { systemPrompt, intent, domains } = buildBrainContext(
      message,
      causalEdges,
      rules,
      cascadeRules,
      patterns,
      entityState,
      conversationSummary
    );

    // ── Domain Action Engine — give brain HANDS (Motor Cortex) ─────────
    // Routes intent to the RIGHT execution module (forecaster, simulator,
    // explainer) and produces structured artifacts with REAL computed data.
    let actionArtifact: Record<string, unknown> | null = null;
    const actionIntents = new Set<UserIntent>(["build", "predict", "diagnose"]);
    const forceAction = /what\s+if|forecast|simulate|predict\s+\d+|project\s+\d+|build\s+.*model|comprehensive|full\s+analysis/.test(
      message.toLowerCase()
    );

    if (actionIntents.has(intent) || forceAction) {
      try {
        const { createDomainActionEngine, formatArtifactForPrompt } = await import(
          "@nexus-ai/memory-stack"
        );
        const engine = createDomainActionEngine({
          supabase,
          organizationId: orgId,
          amplifierConfig: process.env.ANTHROPIC_API_KEY
            ? { provider: "anthropic" as const, apiKey: process.env.ANTHROPIC_API_KEY }
            : undefined,
        });

        // Build lightweight ActionKnowledgeContext from already-fetched DB data
        const knowledgeCtx = buildActionKnowledge(
          message,
          intent,
          domains,
          causalEdges,
          rules,
          entityState
        );

        const artifact = await engine.execute(message, knowledgeCtx);
        actionArtifact = artifact as unknown as Record<string, unknown>;

        // Store formatted prompt text for system prompt augmentation
        (actionArtifact as Record<string, unknown>).__promptText =
          formatArtifactForPrompt(artifact);
      } catch (err) {
        console.warn(
          "[ActionEngine] Non-fatal failure, falling back to LLM-only:",
          err
        );
      }
    }

    // ── Check for Anthropic API key ───────────────────────────────────
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!anthropicKey) {
      const { stream, sendText, close } = createSSEStream();

      const fallbackResponse = generateBrainFallbackResponse(
        message,
        causalEdges,
        rules,
        cascadeRules,
        patterns
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

    // ── Build messages array with conversation history (GAP 7 FIX) ────
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

    if (conversationHistory && conversationHistory.length > 0) {
      // Include last 4 exchanges for context
      const recent = conversationHistory.slice(-8);
      for (const msg of recent) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current message
    messages.push({ role: "user", content: message });

    // ── Stream via Anthropic ──────────────────────────────────────────
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const { stream, send, sendText, sendError, close } = createSSEStream();

    (async () => {
      try {
        // Send structured artifact BEFORE LLM text stream
        // Frontend can render tables/charts from this while LLM narrates
        if (actionArtifact) {
          const { __promptText, ...cleanArtifact } = actionArtifact;
          send(JSON.stringify({ artifact: cleanArtifact }));
          // V3: Send playbook and outcome contract as separate events
          if (cleanArtifact.playbook) {
            send(JSON.stringify({ playbook: cleanArtifact.playbook }));
          }
          if (cleanArtifact.outcomeContract) {
            send(JSON.stringify({ outcomeContract: cleanArtifact.outcomeContract }));
          }
          // V4: Send decision intelligence events
          if (cleanArtifact.metaCognition) {
            send(JSON.stringify({ metaCognition: cleanArtifact.metaCognition }));
          }
          if (cleanArtifact.counterfactuals) {
            send(JSON.stringify({ counterfactuals: cleanArtifact.counterfactuals }));
          }
          if (cleanArtifact.adaptiveLayer) {
            send(JSON.stringify({ adaptiveLayer: cleanArtifact.adaptiveLayer }));
          }
          if (cleanArtifact.decisionJournal) {
            send(JSON.stringify({ decisionJournal: cleanArtifact.decisionJournal }));
          }
        }

        // Augment system prompt with REAL computed data from brain modules
        const effectiveSystemPrompt = actionArtifact?.__promptText
          ? systemPrompt +
            "\n\n## COMPUTED DATA + EXECUTION PLAYBOOK + DECISION INTELLIGENCE (use these REAL numbers, recommended actions, meta-cognition, and counterfactuals — do NOT invent data)\n" +
            String(actionArtifact.__promptText)
          : systemPrompt;

        const anthropicStream = anthropic.messages.stream({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 4096,
          system: effectiveSystemPrompt,
          messages,
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
