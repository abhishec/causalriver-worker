/**
 * QBR Preparation Executor — Task 15
 * ====================================
 * Specialized executor for the `qbr_preparation` FSM process type.
 *
 * Handles: Multi-Source Data Aggregation → Insight Generation →
 *          Stakeholder-Specific Versions → Confluence QBR Page → Slack Summary
 *
 * Called from domain-executor.ts at:
 * - DECOMPOSE: aggregate data from SE-aaS/AaaS/engineering/RL + Sonnet synthesis
 * - MUTATE:    enqueue Confluence pages + Slack notification into writeback_queue
 *
 * Design:
 * - Phase 1: Parallel data collection (SE-aaS, engineering metrics, financials, RL signals)
 * - Phase 2: Claude Sonnet synthesizes into structured QBR sections with metrics
 * - Phase 3: Claude Haiku generates stakeholder-specific versions (CEO, Engineering, Finance, etc.)
 * - Phase 4: Full Markdown report assembled + write-backs enqueued via writeback_queue
 * - Graceful fallback at every parse boundary — never throws, always returns usable result.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Static env capture (Amplify Lambda SSR safe) ─────────────────────────────
const _ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const LLM_TIMEOUT_MS = 50_000;

// ── Public Types ──────────────────────────────────────────────────────────────

export interface QBRPreparationInput {
  quarterLabel: string;           // e.g. "Q1 2026"
  organizationName?: string;
  stakeholders?: Array<"ceo" | "engineering" | "finance" | "sales" | "product">;
  confluenceSpaceKey?: string;
  slackChannel?: string;
  includeFinancials?: boolean;    // pull AaaS artifact counts
  includeDelivery?: boolean;      // pull SE-aaS engagement data
  includeProduct?: boolean;       // pull PM-aaS signals (reserved)
  customMetrics?: Record<string, string | number>;
}

export interface QBRMetric {
  label: string;
  value: string;
  trend: "up" | "down" | "flat";
}

export interface QBRSection {
  title: string;
  content: string;
  metrics: QBRMetric[];
}

export interface QBRPlan {
  executiveSummary: string;
  keyHighlights: string[];
  keyRisks: string[];
  sections: QBRSection[];
  stakeholderVersions: Record<string, string>;
  fullReportMarkdown: string;
  insightsGenerated: number;
  dataSourcesQueried: string[];
  /** Original input — carried forward so MUTATE can read connector targets */
  _input: QBRPreparationInput;
}

// ── LLM Helpers ───────────────────────────────────────────────────────────────

async function callSonnetWithTimeout(
  apiKey: string,
  systemPrompt: string,
  userContent: string,
  maxTokens = 5000
): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({ apiKey });

  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`QBR Sonnet LLM timed out after ${LLM_TIMEOUT_MS}ms`)),
      LLM_TIMEOUT_MS
    );
  });

  try {
    const response = await Promise.race([
      anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
      timeoutPromise,
    ]);
    const content = response.content[0];
    return content.type === "text" ? content.text : "";
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

async function callHaikuWithTimeout(
  apiKey: string,
  userContent: string,
  maxTokens = 800
): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({ apiKey });

  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error("QBR Haiku stakeholder LLM timed out after 20s")),
      20_000
    );
  });

  try {
    const response = await Promise.race([
      anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: userContent }],
      }),
      timeoutPromise,
    ]);
    const content = response.content[0];
    return content.type === "text" ? content.text : "";
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

// ── Data Fetchers (parallel, all non-fatal) ───────────────────────────────────

async function fetchDeliveryData(
  supabase: SupabaseClient,
  orgId: string
): Promise<Record<string, unknown>> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [engagements, healthScores, scopeCreep] = await Promise.allSettled([
    supabase
      .from("engagements")
      .select("client_name, engagement_name, status, pod_name")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .limit(20),
    supabase
      .from("engagement_health_scores")
      .select("health_score, computed_at, engagement_id")
      .eq("organization_id", orgId)
      .gte("computed_at", ninetyDaysAgo)
      .order("computed_at", { ascending: false })
      .limit(50),
    supabase
      .from("scope_creep_alerts")
      .select("alert_type, sprint_name, drift_percentage, created_at")
      .eq("organization_id", orgId)
      .gte("created_at", ninetyDaysAgo)
      .limit(20),
  ]);

  const healthData =
    healthScores.status === "fulfilled" ? (healthScores.value.data ?? []) : [];
  const avgHealthScore =
    healthData.length > 0
      ? healthData.reduce((s, r) => s + ((r.health_score as number) || 0), 0) /
        healthData.length
      : null;

  return {
    activeEngagements:
      engagements.status === "fulfilled"
        ? (engagements.value.data?.length ?? 0)
        : 0,
    avgHealthScore:
      avgHealthScore !== null ? Math.round(avgHealthScore * 100) / 100 : null,
    healthDataPoints: healthData.length,
    scopeAlerts:
      scopeCreep.status === "fulfilled"
        ? (scopeCreep.value.data?.length ?? 0)
        : 0,
  };
}

async function fetchEngineeringMetrics(
  supabase: SupabaseClient,
  orgId: string
): Promise<Record<string, unknown>> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: jobs } = await supabase
    .from("agent_queue")
    .select("status, completed_at, created_at")
    .eq("organization_id", orgId)
    .gte("created_at", thirtyDaysAgo)
    .limit(100);

  const total = jobs?.length ?? 0;
  const completed = jobs?.filter((j) => j.status === "completed").length ?? 0;
  const running = jobs?.filter((j) => j.status === "running").length ?? 0;

  return {
    jobCompletionRate: total > 0 ? Math.round((completed / total) * 100) : null,
    totalJobsRun: total,
    completedJobs: completed,
    activeAgentJobs: running,
  };
}

async function fetchFinancialSummary(
  supabase: SupabaseClient,
  orgId: string
): Promise<Record<string, unknown>> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: artifacts } = await supabase
    .from("se_aas_artifacts")
    .select("domain_type, artifact_data, created_at")
    .eq("organization_id", orgId)
    .in("domain_type", ["bookkeep", "reconcile", "statements", "audit"])
    .gte("created_at", ninetyDaysAgo)
    .order("created_at", { ascending: false })
    .limit(20);

  const domainCoverage = [
    ...new Set((artifacts ?? []).map((a) => a.domain_type as string)),
  ];

  return {
    financialArtifactsCount: artifacts?.length ?? 0,
    lastReconciliation:
      artifacts?.find((a) => a.domain_type === "reconcile")?.created_at ?? null,
    domainCoverage,
  };
}

async function fetchRLSignals(
  supabase: SupabaseClient,
  orgId: string
): Promise<Record<string, unknown>> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: records } = await supabase
    .from("prediction_records")
    .select("domain, confidence, created_at")
    .eq("organization_id", orgId)
    .gte("created_at", thirtyDaysAgo)
    .limit(50);

  const count = records?.length ?? 0;
  const avgConfidence =
    count > 0
      ? (records ?? []).reduce((s, r) => s + ((r.confidence as number) || 0), 0) /
        count
      : 0;

  const domainSignals: Record<string, number> = {};
  for (const r of records ?? []) {
    const d = r.domain as string;
    domainSignals[d] = (domainSignals[d] ?? 0) + 1;
  }

  const topDomains = Object.entries(domainSignals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([d, c]) => `${d}(${c})`);

  return {
    totalSignals: count,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    topDomains,
  };
}

// ── Prompt Builder ────────────────────────────────────────────────────────────

function buildQBRPrompt(
  input: QBRPreparationInput,
  rawData: Record<string, unknown>
): string {
  const stakeholderList = (input.stakeholders ?? ["ceo", "engineering", "finance"]).join(
    ", "
  );

  return `You are a Chief of Staff preparing a Quarterly Business Review for ${input.quarterLabel}.

Organization: ${input.organizationName ?? "BrainOS Customer"}
Quarter: ${input.quarterLabel}
Stakeholders: ${stakeholderList}

**Raw Data Collected:**
${JSON.stringify(rawData, null, 2).slice(0, 3000)}

Generate a comprehensive QBR analysis. Respond in this EXACT JSON format:
\`\`\`json
{
  "executiveSummary": "2-3 paragraph executive summary of the quarter",
  "keyHighlights": [
    "Highlight 1 — specific metric or achievement",
    "Highlight 2",
    "Highlight 3"
  ],
  "keyRisks": [
    "Risk 1 — with recommended mitigation",
    "Risk 2"
  ],
  "sections": [
    {
      "title": "Delivery Performance",
      "content": "Detailed analysis paragraph based on the data",
      "metrics": [
        { "label": "Active Engagements", "value": "12", "trend": "up" },
        { "label": "Avg Health Score", "value": "78%", "trend": "flat" }
      ]
    },
    {
      "title": "Engineering Velocity",
      "content": "Analysis of engineering throughput and quality",
      "metrics": [
        { "label": "Job Completion Rate", "value": "94%", "trend": "up" },
        { "label": "Total Jobs Run (30d)", "value": "42", "trend": "flat" }
      ]
    },
    {
      "title": "AI Intelligence Quality",
      "content": "RL system performance and learning metrics",
      "metrics": [
        { "label": "Avg Prediction Confidence", "value": "0.82", "trend": "up" },
        { "label": "Signals This Month", "value": "128", "trend": "up" }
      ]
    }
  ],
  "insightsGenerated": 8
}
\`\`\`

Make the insights data-driven based on the raw data provided. If data is missing, use reasonable estimates and clearly note uncertainty.`;
}

// ── Response Parser ────────────────────────────────────────────────────────────

function parseQBRResponse(
  text: string,
  input: QBRPreparationInput,
  dataSourcesQueried: string[]
): QBRPlan {
  try {
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]) as Partial<QBRPlan>;
      return {
        executiveSummary: parsed.executiveSummary ?? "",
        keyHighlights: parsed.keyHighlights ?? [],
        keyRisks: parsed.keyRisks ?? [],
        sections: parsed.sections ?? [],
        stakeholderVersions: {},
        fullReportMarkdown: "",
        insightsGenerated: parsed.insightsGenerated ?? 0,
        dataSourcesQueried,
        _input: input,
      };
    }
  } catch (err) {
    logger.warn("[QBR/DECOMPOSE] JSON parse error — using fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    executiveSummary: `${input.quarterLabel} QBR — data aggregated from ${dataSourcesQueried.join(", ")}.`,
    keyHighlights: [
      "Data collected from multiple sources",
      "Analysis pending review",
    ],
    keyRisks: ["Insufficient data for full analysis — verify data connectors"],
    sections: [],
    stakeholderVersions: {},
    fullReportMarkdown: "",
    insightsGenerated: 0,
    dataSourcesQueried,
    _input: input,
  };
}

// ── Stakeholder Version Generator ─────────────────────────────────────────────

const STAKEHOLDER_PROMPTS: Record<string, string> = {
  ceo: "Write a 1-page CEO summary of this QBR. Focus on business outcomes, key risks, and 3 strategic recommendations. Avoid technical jargon. Use bullet points.",
  engineering:
    "Write an engineering-focused QBR summary. Include velocity metrics, system reliability, agent throughput, and team capacity. Recommend 2 specific technical actions.",
  finance:
    "Write a finance-focused QBR summary. Focus on revenue recognition, costs, forecasts, and financial risks. Include key financial metrics and reconciliation status.",
  sales:
    "Write a sales-focused QBR summary. Focus on customer success metrics, engagement health, pod performance, and expansion opportunities.",
  product:
    "Write a product-focused QBR summary. Include feature delivery velocity, AI quality signals, roadmap health, and priority risks for next quarter.",
};

async function generateStakeholderVersions(
  plan: QBRPlan,
  apiKey: string
): Promise<void> {
  const contextSummary = [
    `Executive Summary: ${plan.executiveSummary}`,
    `Key Highlights: ${plan.keyHighlights.join("; ")}`,
    `Key Risks: ${plan.keyRisks.join("; ")}`,
    `Sections: ${plan.sections.map((s) => `${s.title}: ${s.content.slice(0, 200)}`).join(" | ")}`,
  ].join("\n");

  for (const stakeholder of plan._input.stakeholders ?? ["ceo"]) {
    const prompt = STAKEHOLDER_PROMPTS[stakeholder];
    if (!prompt) continue;

    try {
      const content = await callHaikuWithTimeout(
        apiKey,
        `${prompt}\n\nQBR Data:\n${contextSummary}`,
        800
      );
      plan.stakeholderVersions[stakeholder] = content;
    } catch (err) {
      logger.warn("[QBR/DECOMPOSE] Stakeholder version generation failed", {
        stakeholder,
        error: err instanceof Error ? err.message : String(err),
      });
      plan.stakeholderVersions[stakeholder] =
        `${stakeholder.toUpperCase()} summary generation failed — please generate manually.`;
    }
  }
}

// ── Full Report Builder ────────────────────────────────────────────────────────

function buildFullReport(plan: QBRPlan): string {
  const now = new Date().toISOString().split("T")[0];
  const input = plan._input;

  const sectionsMarkdown = plan.sections
    .map((section) => {
      const metricsTable =
        section.metrics.length > 0
          ? `| Metric | Value | Trend |\n|--------|-------|-------|\n${section.metrics.map((m) => `| ${m.label} | ${m.value} | ${m.trend === "up" ? "up" : m.trend === "down" ? "down" : "flat"} |`).join("\n")}`
          : "";
      return `\n## ${section.title}\n\n${section.content}\n\n${metricsTable}`;
    })
    .join("\n");

  const stakeholderMarkdown = Object.entries(plan.stakeholderVersions)
    .map(([s, content]) => `\n## ${s.toUpperCase()} Version\n\n${content}`)
    .join("\n\n---\n");

  return [
    `# ${input.quarterLabel} Quarterly Business Review`,
    ``,
    `**Prepared by:** BrainOS Process Intelligence`,
    `**Date:** ${now}`,
    `**Organization:** ${input.organizationName ?? "BrainOS Customer"}`,
    `**Data Sources:** ${plan.dataSourcesQueried.join(", ")}`,
    ``,
    `---`,
    ``,
    `## Executive Summary`,
    ``,
    plan.executiveSummary,
    ``,
    `---`,
    ``,
    `## Key Highlights`,
    ``,
    plan.keyHighlights.map((h) => `- ${h}`).join("\n"),
    ``,
    `---`,
    ``,
    `## Key Risks`,
    ``,
    plan.keyRisks.map((r) => `- ${r}`).join("\n"),
    ``,
    `---`,
    sectionsMarkdown,
    ``,
    `---`,
    ``,
    `## Stakeholder Versions`,
    stakeholderMarkdown,
    ``,
    `---`,
    ``,
    `*Generated by BrainOS Process Intelligence — QBR Preparation Workflow*`,
    `*${plan.insightsGenerated} insights generated from ${plan.dataSourcesQueried.length} data sources*`,
  ].join("\n");
}

// ── Public: DECOMPOSE Phase ───────────────────────────────────────────────────

/**
 * Called from domain-executor.ts DECOMPOSE state when processType === "qbr_preparation".
 *
 * Aggregates data from SE-aaS, AaaS, engineering metrics, and RL signals in parallel,
 * synthesizes via Claude Sonnet, and generates stakeholder-specific versions via Haiku.
 *
 * Returns a decomposedPlan-compatible object carrying the full QBRPlan for MUTATE.
 */
export async function decomposeQBRPreparation(
  supabase: SupabaseClient,
  organizationId: string,
  apiKey: string,
  inputPayload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const input: QBRPreparationInput = {
    quarterLabel:
      (inputPayload.quarterLabel as string) ||
      (inputPayload.quarter as string) ||
      `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`,
    organizationName: inputPayload.organizationName as string | undefined,
    stakeholders: (inputPayload.stakeholders as QBRPreparationInput["stakeholders"]) ?? [
      "ceo",
      "engineering",
      "finance",
    ],
    confluenceSpaceKey: inputPayload.confluenceSpaceKey as string | undefined,
    slackChannel: inputPayload.slackChannel as string | undefined,
    includeFinancials: (inputPayload.includeFinancials as boolean) !== false,
    includeDelivery: (inputPayload.includeDelivery as boolean) !== false,
    includeProduct: (inputPayload.includeProduct as boolean) !== false,
    customMetrics: inputPayload.customMetrics as
      | Record<string, string | number>
      | undefined,
  };

  const resolvedApiKey = apiKey || _ANTHROPIC_API_KEY || "";
  const dataSourcesQueried: string[] = [];
  const rawData: Record<string, unknown> = {};

  // Phase 1: Parallel data collection — all non-fatal
  const fetchers: Promise<void>[] = [];

  if (input.includeDelivery !== false) {
    fetchers.push(
      fetchDeliveryData(supabase, organizationId)
        .then((data) => {
          rawData.delivery = data;
          dataSourcesQueried.push("SE-aaS Delivery Intelligence");
        })
        .catch((err) =>
          logger.warn("[QBR/DECOMPOSE] Delivery data fetch failed (non-fatal)", {
            error: err instanceof Error ? err.message : String(err),
          })
        )
    );
  }

  fetchers.push(
    fetchEngineeringMetrics(supabase, organizationId)
      .then((data) => {
        rawData.engineering = data;
        dataSourcesQueried.push("Engineering Metrics");
      })
      .catch((err) =>
        logger.warn("[QBR/DECOMPOSE] Engineering metrics fetch failed (non-fatal)", {
          error: err instanceof Error ? err.message : String(err),
        })
      )
  );

  if (input.includeFinancials !== false) {
    fetchers.push(
      fetchFinancialSummary(supabase, organizationId)
        .then((data) => {
          rawData.financial = data;
          dataSourcesQueried.push("AaaS Financial Records");
        })
        .catch((err) =>
          logger.warn("[QBR/DECOMPOSE] Financial data fetch failed (non-fatal)", {
            error: err instanceof Error ? err.message : String(err),
          })
        )
    );
  }

  fetchers.push(
    fetchRLSignals(supabase, organizationId)
      .then((data) => {
        rawData.rlSignals = data;
        dataSourcesQueried.push("RL Quality Signals");
      })
      .catch((err) =>
        logger.warn("[QBR/DECOMPOSE] RL signals fetch failed (non-fatal)", {
          error: err instanceof Error ? err.message : String(err),
        })
      )
  );

  await Promise.allSettled(fetchers);

  logger.warn("[QBR/DECOMPOSE] Data collection complete", {
    dataSourcesQueried,
    organizationId,
  });

  // Phase 2: Synthesize with Sonnet
  const systemPrompt =
    "You are a Chief of Staff preparing a data-driven Quarterly Business Review. Be specific and quantitative.";
  const userContent = buildQBRPrompt(input, rawData);

  let qbrText = "";
  try {
    qbrText = await callSonnetWithTimeout(
      resolvedApiKey,
      systemPrompt,
      userContent,
      5000
    );
  } catch (err) {
    logger.warn("[QBR/DECOMPOSE] Sonnet synthesis failed — using fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const plan = parseQBRResponse(qbrText, input, dataSourcesQueried);

  // Phase 3: Generate stakeholder-specific versions (Haiku, sequential but fast)
  await generateStakeholderVersions(plan, resolvedApiKey);

  // Phase 4: Build full Markdown report
  plan.fullReportMarkdown = buildFullReport(plan);

  logger.warn("[QBR/DECOMPOSE] QBR plan generated", {
    quarterLabel: input.quarterLabel,
    sectionsCount: plan.sections.length,
    stakeholderVersionsCount: Object.keys(plan.stakeholderVersions).length,
    insightsGenerated: plan.insightsGenerated,
    dataSourcesCount: dataSourcesQueried.length,
  });

  // Return as decomposedPlan-compatible shape for FSM ASSESS/COMPUTE/POLICY_CHECK states
  return {
    steps: ["assess", "compute", "reconcile", "policy_check", "mutate", "schedule_notify"],
    entities: {
      quarterLabel: input.quarterLabel,
      sectionsCount: plan.sections.length,
      stakeholderVersionsCount: Object.keys(plan.stakeholderVersions).length,
      insightsGenerated: plan.insightsGenerated,
      dataSourcesCount: dataSourcesQueried.length,
      hasConfluence: !!input.confluenceSpaceKey,
      hasSlack: !!input.slackChannel,
    },
    constraints: [
      "report_before_distribution",
      ...(input.confluenceSpaceKey ? ["confluence_required"] : []),
      ...(input.slackChannel ? ["slack_notification_required"] : []),
    ],
    metadata: {
      processType: "qbr_preparation",
      quarterLabel: input.quarterLabel,
    },
    // Full QBR plan carried through FSM context for MUTATE
    qbrPlan: plan,
  };
}

// ── Public: MUTATE Phase ──────────────────────────────────────────────────────

/**
 * Called from domain-executor.ts MUTATE state when processType === "qbr_preparation".
 *
 * Reads the QBRPlan from context.decomposedPlan.qbrPlan and enqueues:
 * - Main QBR Confluence page
 * - Per-stakeholder Confluence pages
 * - Slack notification with highlights and risks
 *
 * Returns a mutationResult-compatible object.
 */
export async function mutateQBRPreparation(
  supabase: SupabaseClient,
  organizationId: string,
  jobId: string,
  processInstanceId: string,
  decomposedPlan: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const plan = decomposedPlan?.qbrPlan as QBRPlan | undefined;

  if (!plan) {
    logger.warn(
      "[QBR/MUTATE] No qbrPlan in decomposedPlan — skipping write-backs",
      { jobId, processInstanceId }
    );
    return {
      mutated: true,
      mutatedAt: new Date().toISOString(),
      writebacksEnqueued: 0,
      note: "No qbrPlan found in decomposedPlan — write-backs skipped",
    };
  }

  const input = plan._input;
  // Each entry is an async thunk — wrapping the Supabase insert (PostgrestFilterBuilder)
  // in an async function so Promise.allSettled can handle them correctly.
  const writebacks: Array<() => Promise<{ error: { message: string } | null } | unknown>> = [];

  // 1. Confluence: Main QBR page
  if (input.confluenceSpaceKey) {
    writebacks.push(
      async () =>
        supabase.from("writeback_queue").insert({
          organization_id: organizationId,
          job_id: jobId,
          action_type: "create_page",
          connector_type: "confluence",
          action_payload: {
            spaceKey: input.confluenceSpaceKey,
            title: `${input.quarterLabel} Quarterly Business Review`,
            body: plan.fullReportMarkdown,
            labels: ["qbr", "quarterly-review", "brain-os-generated"],
          },
          status: "pending",
          attempts: 0,
          created_at: new Date().toISOString(),
        })
    );

    // 2. Confluence: Per-stakeholder pages
    for (const [stakeholder, stakeholderContent] of Object.entries(plan.stakeholderVersions)) {
      if (!stakeholderContent) continue;
      const capturedStakeholder = stakeholder;
      const capturedContent = stakeholderContent;
      writebacks.push(
        async () =>
          supabase.from("writeback_queue").insert({
            organization_id: organizationId,
            job_id: jobId,
            action_type: "create_page",
            connector_type: "confluence",
            action_payload: {
              spaceKey: input.confluenceSpaceKey,
              title: `${input.quarterLabel} QBR — ${capturedStakeholder.toUpperCase()} Version`,
              body: capturedContent,
              labels: ["qbr", capturedStakeholder, "brain-os-generated"],
            },
            status: "pending",
            attempts: 0,
            created_at: new Date().toISOString(),
          })
      );
    }
  }

  // 3. Slack: QBR summary notification
  if (input.slackChannel) {
    const highlightLines = plan.keyHighlights
      .slice(0, 3)
      .map((h) => `- ${h}`)
      .join("\n");
    const riskLines = plan.keyRisks
      .slice(0, 2)
      .map((r) => `- ${r}`)
      .join("\n");

    writebacks.push(
      async () =>
        supabase.from("writeback_queue").insert({
          organization_id: organizationId,
          job_id: jobId,
          action_type: "post_message",
          connector_type: "slack",
          action_payload: {
            channel: input.slackChannel,
            text: [
              `*${input.quarterLabel} QBR Ready*`,
              ``,
              `*Key Highlights:*`,
              highlightLines,
              ``,
              `*Risks Identified:*`,
              riskLines,
              ``,
              `_${plan.insightsGenerated} insights generated from ${plan.dataSourcesQueried.length} sources. Stakeholder versions ready in Confluence._`,
            ].join("\n"),
          },
          status: "pending",
          attempts: 0,
          created_at: new Date().toISOString(),
        })
    );
  }

  // 4. Store artifact record
  writebacks.push(
    async () =>
      supabase.from("se_aas_artifacts").insert({
        organization_id: organizationId,
        job_id: jobId,
        domain_type: "qbr_preparation",
        artifact_data: {
          quarterLabel: plan._input.quarterLabel,
          sectionsCount: plan.sections.length,
          insightsGenerated: plan.insightsGenerated,
          dataSourcesQueried: plan.dataSourcesQueried,
          stakeholders: Object.keys(plan.stakeholderVersions),
        },
        metadata: {
          processInstanceId,
          confluenceSpaceKey: input.confluenceSpaceKey ?? null,
          slackChannel: input.slackChannel ?? null,
        },
        created_by: "process-engine",
      })
  );

  const results = await Promise.allSettled(writebacks.map((fn) => fn()));
  const failedCount = results.filter((r) => r.status === "rejected").length;
  const enqueuedCount = results.length - failedCount;

  if (failedCount > 0) {
    logger.warn("[QBR/MUTATE] Some write-backs failed (non-fatal)", {
      processInstanceId,
      enqueuedCount,
      failedCount,
    });
  }

  return {
    mutated: true,
    mutatedAt: new Date().toISOString(),
    writebacksEnqueued: enqueuedCount,
    writebacksFailed: failedCount,
    quarterLabel: plan._input.quarterLabel,
    sectionsCount: plan.sections.length,
    insightsGenerated: plan.insightsGenerated,
    dataSourcesQueried: plan.dataSourcesQueried,
    stakeholderVersionsGenerated: Object.keys(plan.stakeholderVersions).length,
    confluencePageEnqueued: !!input.confluenceSpaceKey,
    slackNotificationEnqueued: !!input.slackChannel,
  };
}
