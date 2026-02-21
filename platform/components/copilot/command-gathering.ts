/**
 * Command Gathering Schema
 * ========================
 *
 * Declarative definitions of what parameters each slash command needs
 * before execution. When a user selects a command, the copilot uses
 * these schemas to conversationally gather context — Claude-style.
 *
 * Flow: command selected → gathering starts → params collected → confirmed → executed
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface GatheringParam {
  /** Unique param ID (e.g. "org", "workspace", "time_range") */
  id: string;
  /** Human-readable label shown in UI */
  label: string;
  /** Input type for rendering */
  type: "select" | "date" | "date_range" | "number" | "text" | "chips" | "file" | "gl_check";
  /** Whether this param must be filled before execution */
  required: boolean;
  /** API endpoint to fetch dynamic options (e.g. "/api/org/list") */
  optionsEndpoint?: string;
  /** JSON key in API response to extract options array */
  optionsKey?: string;
  /** Static options for known enums */
  staticOptions?: { value: string; label: string; icon?: string }[];
  /** Default value if user skips */
  defaultValue?: string | number;
  /** Help text shown alongside the gathering prompt */
  description?: string;
  /** Another param ID that must be filled first (for dependent selects) */
  dependsOn?: string;
  /** For file type: accepted MIME types */
  accept?: string;
  /** For file type: whether multiple files can be uploaded */
  multiple?: boolean;
  /** For gl_check type: API endpoint to check GL data status */
  glStatusEndpoint?: string;
}

export interface CommandGathering {
  /** Must match SlashCommand.id */
  commandId: string;
  /** Ordered list of params to gather */
  params: GatheringParam[];
  /** Confirmation template — use {{paramId}} for interpolation */
  confirmationMessage: string;
  /** Natural language prompts the copilot asks per param */
  gatheringPrompts: Record<string, string>;
  /** Optional: build a richer prompt from gathered params */
  promptBuilder?: (params: Record<string, unknown>) => string;
  /**
   * When true, this command produces multiple artifacts from a single run.
   * E.g. AAS full review → P&L + Balance Sheet + GST + Anomalies.
   * Each sub-result creates a separate artifact tab.
   */
  multiArtifact?: boolean;
  /** IDs of sub-artifacts this command can produce (used for multi-artifact commands) */
  subArtifactIds?: string[];
}

// ── P0 SE-aaS: Delivery Intelligence ─────────────────────────────────────────

const SEAAS_P0_GATHERING: CommandGathering[] = [
  {
    commandId: "early-warning",
    params: [
      {
        id: "org",
        label: "Workspace",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/list",
        optionsKey: "organizations",
      },
      {
        id: "workspace",
        label: "Workspace",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/{{org}}/workspaces",
        optionsKey: "workspaces",
        dependsOn: "org",
        description: "Only workspaces with Git configured are shown",
      },
      {
        id: "time_range",
        label: "Time Range",
        type: "select",
        required: false,
        staticOptions: [
          { value: "7d", label: "Last 7 days" },
          { value: "14d", label: "Last 14 days" },
          { value: "30d", label: "Last 30 days" },
          { value: "90d", label: "Last quarter" },
        ],
        defaultValue: "30d",
      },
    ],
    confirmationMessage:
      "Run early warning analysis for **{{workspace}}** over **{{time_range}}**?",
    gatheringPrompts: {
      org: "Which workspace do you want to check for velocity risks?",
      workspace:
        "I found {{count}} workspaces with Git configured. Which one should I analyze?",
      time_range: "What time range should I look at? The default is 30 days.",
    },
    promptBuilder: (p) =>
      `Analyse delivery velocity and predict risk of velocity collapse for workspace "${p.workspace}" over the ${p.time_range || "last 30 days"}. Include SPOF bottleneck risk via Gini, HHI & Betweenness Centrality.`,
  },
  {
    commandId: "delivery-intelligence",
    params: [
      {
        id: "org",
        label: "Workspace",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/list",
        optionsKey: "organizations",
      },
      {
        id: "engagement",
        label: "Engagement",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/{{org}}/engagements",
        optionsKey: "engagements",
        dependsOn: "org",
      },
    ],
    confirmationMessage:
      "Show delivery intelligence dashboard for **{{engagement}}**?",
    gatheringPrompts: {
      org: "Which workspace's delivery health do you want to see?",
      engagement:
        "Which engagement should I analyze? Here are the active ones:",
    },
    promptBuilder: (p) =>
      `Show the delivery intelligence dashboard with engagement health scores, scope alerts, and team health for engagement "${p.engagement}"`,
  },
  {
    commandId: "pod-match",
    params: [
      {
        id: "org",
        label: "Workspace",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/list",
        optionsKey: "organizations",
      },
      {
        id: "engagement",
        label: "Engagement",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/{{org}}/engagements",
        optionsKey: "engagements",
        dependsOn: "org",
      },
      {
        id: "tech_stack_filter",
        label: "Tech Stack",
        type: "chips",
        required: false,
        staticOptions: [
          { value: "react", label: "React", icon: "⚛️" },
          { value: "node", label: "Node.js", icon: "🟢" },
          { value: "python", label: "Python", icon: "🐍" },
          { value: "typescript", label: "TypeScript", icon: "🔷" },
          { value: "java", label: "Java", icon: "☕" },
          { value: "go", label: "Go", icon: "🔵" },
        ],
        description: "Filter by specific tech stack (optional)",
      },
    ],
    confirmationMessage:
      "Find the best pod match for **{{engagement}}**{{tech_stack_filter}}?",
    gatheringPrompts: {
      org: "Which workspace needs a pod recommendation?",
      engagement: "Which engagement are you staffing?",
      tech_stack_filter:
        "Want to filter by specific tech stack? Pick one or more, or skip.",
    },
    promptBuilder: (p) => {
      const stack = p.tech_stack_filter
        ? ` filtering for ${Array.isArray(p.tech_stack_filter) ? (p.tech_stack_filter as string[]).join(", ") : p.tech_stack_filter}`
        : "";
      return `Recommend the best pod for engagement "${p.engagement}"${stack}. Include tech stack overlap, past performance, cycle time, and capacity analysis.`;
    },
  },
  {
    commandId: "scope-creep",
    params: [
      {
        id: "org",
        label: "Workspace",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/list",
        optionsKey: "organizations",
      },
      {
        id: "engagement",
        label: "Engagement",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/{{org}}/engagements",
        optionsKey: "engagements",
        dependsOn: "org",
      },
    ],
    confirmationMessage:
      "Check for scope creep in **{{engagement}}**?",
    gatheringPrompts: {
      org: "Which workspace are you checking for scope creep?",
      engagement: "Which engagement should I audit for scope drift?",
    },
    promptBuilder: (p) =>
      `Check for scope creep alerts in engagement "${p.engagement}" — story point drift, sprint scope changes, and baseline vs current workload analysis.`,
  },
];

// ── AAS: Shared GL Data Param ────────────────────────────────────────────────
// Every AAS command requires GL data. This param checks for existing uploads
// and allows the user to upload new GL files directly in the chat flow.

const GL_DATA_PARAM: GatheringParam = {
  id: "gl_data",
  label: "General Ledger Data",
  type: "gl_check",
  required: true,
  dependsOn: "org",
  glStatusEndpoint: "/api/aaas/gl-status",
  description: "Upload or confirm your General Ledger data",
};

// ── AAS: Accounting Commands ─────────────────────────────────────────────────

const AAS_GATHERING: CommandGathering[] = [
  {
    commandId: "aas-pl",
    params: [
      {
        id: "org",
        label: "Workspace",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/list",
        optionsKey: "organizations",
      },
      GL_DATA_PARAM,
      {
        id: "fiscal_period",
        label: "Fiscal Period",
        type: "select",
        required: true,
        staticOptions: [
          { value: "2026-Q1", label: "Q1 2026 (Jan-Mar)" },
          { value: "2025-Q4", label: "Q4 2025 (Oct-Dec)" },
          { value: "2025-Q3", label: "Q3 2025 (Jul-Sep)" },
          { value: "2025-Q2", label: "Q2 2025 (Apr-Jun)" },
          { value: "2025-Q1", label: "Q1 2025 (Jan-Mar)" },
          { value: "2025-FY", label: "Full Year 2025" },
          { value: "2024-FY", label: "Full Year 2024" },
        ],
      },
      {
        id: "comparison_period",
        label: "Compare With",
        type: "select",
        required: false,
        staticOptions: [
          { value: "previous_quarter", label: "Previous Quarter" },
          { value: "same_quarter_ly", label: "Same Quarter Last Year" },
          { value: "previous_year", label: "Previous Year" },
          { value: "none", label: "No Comparison" },
        ],
        defaultValue: "previous_quarter",
      },
    ],
    confirmationMessage:
      "Generate P&L statement for **{{fiscal_period}}**{{comparison_period}}?",
    gatheringPrompts: {
      org: "Which workspace's P&L do you need?",
      gl_data: "Let me check if you have General Ledger data available...",
      fiscal_period: "Which fiscal period should I generate the statement for?",
      comparison_period:
        "Want to compare against a prior period? Default is previous quarter.",
    },
    promptBuilder: (p) => {
      const comp =
        p.comparison_period && p.comparison_period !== "none"
          ? ` compared to ${p.comparison_period}`
          : "";
      return `Generate the Profit & Loss statement for ${p.fiscal_period}${comp}`;
    },
  },
  {
    commandId: "aas-balance",
    params: [
      {
        id: "org",
        label: "Workspace",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/list",
        optionsKey: "organizations",
      },
      GL_DATA_PARAM,
      {
        id: "as_of_date",
        label: "As of Date",
        type: "date",
        required: true,
        defaultValue: "today",
        description: "The date the balance sheet should reflect",
      },
    ],
    confirmationMessage:
      "Generate balance sheet as of **{{as_of_date}}**?",
    gatheringPrompts: {
      org: "Which workspace's balance sheet do you need?",
      gl_data: "Let me check if you have General Ledger data available...",
      as_of_date:
        "What date should the balance sheet reflect? Default is today.",
    },
    promptBuilder: (p) =>
      `Generate the balance sheet as of ${p.as_of_date === "today" ? "today" : p.as_of_date}`,
  },
  {
    commandId: "aas-trial",
    params: [
      {
        id: "org",
        label: "Workspace",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/list",
        optionsKey: "organizations",
      },
      GL_DATA_PARAM,
      {
        id: "period",
        label: "Period",
        type: "select",
        required: true,
        staticOptions: [
          { value: "2026-01", label: "January 2026" },
          { value: "2025-12", label: "December 2025" },
          { value: "2025-Q4", label: "Q4 2025" },
          { value: "2025-FY", label: "Full Year 2025" },
        ],
      },
    ],
    confirmationMessage: "Generate trial balance for **{{period}}**?",
    gatheringPrompts: {
      org: "Which workspace?",
      gl_data: "Let me check if you have General Ledger data available...",
      period: "Which period do you need the trial balance for?",
    },
    promptBuilder: (p) =>
      `Generate the trial balance for ${p.period}`,
  },
  {
    commandId: "aas-gst",
    params: [
      {
        id: "org",
        label: "Workspace",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/list",
        optionsKey: "organizations",
      },
      GL_DATA_PARAM,
      {
        id: "filing_period",
        label: "Filing Period",
        type: "select",
        required: true,
        staticOptions: [
          { value: "2026-Q1", label: "Q1 2026 (Jan-Mar)" },
          { value: "2025-Q4", label: "Q4 2025 (Oct-Dec)" },
          { value: "2025-Q3", label: "Q3 2025 (Jul-Sep)" },
          { value: "2025-Q2", label: "Q2 2025 (Apr-Jun)" },
        ],
      },
    ],
    confirmationMessage:
      "Check GST F5 compliance for **{{filing_period}}**?",
    gatheringPrompts: {
      org: "Which workspace's GST compliance do you need?",
      gl_data: "Let me check if you have General Ledger data available...",
      filing_period: "Which filing period should I check?",
    },
    promptBuilder: (p) =>
      `Check GST F5 compliance for the ${p.filing_period} filing period`,
  },
  {
    commandId: "aas-anomaly",
    params: [
      {
        id: "org",
        label: "Workspace",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/list",
        optionsKey: "organizations",
      },
      GL_DATA_PARAM,
      {
        id: "sensitivity_level",
        label: "Sensitivity",
        type: "select",
        required: false,
        staticOptions: [
          { value: "low", label: "Low — only major anomalies" },
          { value: "medium", label: "Medium — balanced detection" },
          { value: "high", label: "High — catch subtle patterns" },
        ],
        defaultValue: "medium",
      },
    ],
    confirmationMessage:
      "Scan for transaction anomalies at **{{sensitivity_level}}** sensitivity?",
    gatheringPrompts: {
      org: "Which workspace should I scan for anomalies?",
      gl_data: "Let me check if you have General Ledger data available...",
      sensitivity_level:
        "How sensitive should the detection be? Default is medium.",
    },
    promptBuilder: (p) =>
      `Analyse transaction patterns to detect unusual activity and risk factors at ${p.sensitivity_level || "medium"} sensitivity`,
  },
  {
    commandId: "aas-transactions",
    params: [
      {
        id: "org",
        label: "Workspace",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/list",
        optionsKey: "organizations",
      },
      GL_DATA_PARAM,
      {
        id: "date_range",
        label: "Date Range",
        type: "date_range",
        required: true,
        description: "Start and end dates for transaction lookup",
      },
      {
        id: "min_amount",
        label: "Minimum Amount",
        type: "number",
        required: false,
        defaultValue: 0,
        description: "Filter transactions above this amount (SGD)",
      },
    ],
    confirmationMessage:
      "Show transactions from **{{date_range}}**{{min_amount}}?",
    gatheringPrompts: {
      org: "Which workspace's transactions do you want to see?",
      gl_data: "Let me check if you have General Ledger data available...",
      date_range: "What date range should I pull transactions for?",
      min_amount:
        "Filter by minimum amount? Leave blank to show all transactions.",
    },
    promptBuilder: (p) => {
      const amt =
        p.min_amount && Number(p.min_amount) > 0
          ? ` above $${p.min_amount}`
          : "";
      return `Show the top transactions and transaction summary for ${p.date_range}${amt}`;
    },
  },
  {
    commandId: "aas-benchmark",
    params: [
      {
        id: "org",
        label: "Workspace",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/list",
        optionsKey: "organizations",
      },
      GL_DATA_PARAM,
      {
        id: "benchmark_type",
        label: "Benchmark Type",
        type: "select",
        required: true,
        staticOptions: [
          { value: "saas", label: "SaaS Industry" },
          { value: "smb", label: "Small & Medium Business" },
          { value: "enterprise", label: "Enterprise" },
          { value: "custom", label: "Custom Baseline" },
        ],
      },
    ],
    confirmationMessage:
      "Generate **{{benchmark_type}}** benchmark report?",
    gatheringPrompts: {
      org: "Which workspace do you want to benchmark?",
      gl_data: "Let me check if you have General Ledger data available...",
      benchmark_type: "What benchmark type should I compare against?",
    },
    promptBuilder: (p) =>
      `Generate a ${p.benchmark_type} benchmark comparison report — show each line item with AI-computed value, status, and validation notes for manual review`,
  },
];

// ── AAS: Full Financial Review (multi-artifact) ─────────────────────────────

const AAS_FULL_REVIEW: CommandGathering = {
  commandId: "aas-full-review",
  multiArtifact: true,
  subArtifactIds: ["aas-pl", "aas-balance", "aas-trial", "aas-gst", "aas-anomaly", "aas-transactions"],
  params: [
    {
      id: "org",
      label: "Workspace",
      type: "select",
      required: true,
      optionsEndpoint: "/api/org/list",
      optionsKey: "organizations",
    },
    GL_DATA_PARAM,
    {
      id: "fiscal_period",
      label: "Fiscal Period",
      type: "select",
      required: true,
      staticOptions: [
        { value: "2026-Q1", label: "Q1 2026" },
        { value: "2025-Q4", label: "Q4 2025" },
        { value: "2025-FY", label: "Full Year 2025" },
      ],
    },
  ],
  confirmationMessage:
    "Run full financial review for **{{fiscal_period}}**? This will generate P&L, Balance Sheet, Trial Balance, GST F5, Anomaly Detection, and Transaction Summary — each as a separate artifact.",
  gatheringPrompts: {
    org: "Which workspace should I review?",
    gl_data: "Let me check if you have General Ledger data available...",
    fiscal_period: "Which fiscal period should I review?",
  },
  promptBuilder: (p) =>
    `Run a full financial review for ${p.fiscal_period}. Generate: P&L statement, Balance Sheet, Trial Balance, GST F5 compliance check, Anomaly detection, and Transaction summary. Create each as a separate artifact.`,
};

// ── AAS: Financial Intelligence Commands ─────────────────────────────────────

const AAS_INTELLIGENCE_GATHERING: CommandGathering[] = [
  {
    commandId: "aas-cash-forecast",
    params: [
      {
        id: "org",
        label: "Workspace",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/list",
        optionsKey: "organizations",
      },
      GL_DATA_PARAM,
      {
        id: "forecast_weeks",
        label: "Forecast Period",
        type: "select",
        required: false,
        staticOptions: [
          { value: "4", label: "4 weeks" },
          { value: "8", label: "8 weeks" },
          { value: "13", label: "13 weeks (default)" },
          { value: "26", label: "26 weeks" },
        ],
        defaultValue: "13",
      },
    ],
    confirmationMessage:
      "Generate **{{forecast_weeks}}-week** causal cash flow forecast?",
    gatheringPrompts: {
      org: "Which workspace's cash flow should I forecast?",
      gl_data: "Let me check if you have General Ledger data available...",
      forecast_weeks: "How far out should the forecast go? Default is 13 weeks.",
    },
    promptBuilder: (p) =>
      `Generate a ${p.forecast_weeks || 13}-week cash flow forecast with causal analysis of risk factors`,
  },
  {
    commandId: "aas-revenue-leakage",
    params: [
      {
        id: "org",
        label: "Workspace",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/list",
        optionsKey: "organizations",
      },
      GL_DATA_PARAM,
    ],
    confirmationMessage:
      "Scan for revenue leakage — under-billing, missed renewals, and pricing gaps?",
    gatheringPrompts: {
      org: "Which workspace should I scan for revenue leakage?",
      gl_data: "Let me check if you have General Ledger data available...",
    },
    promptBuilder: () =>
      `Scan for revenue leakage — find under-billing, missed renewals, and pricing gaps across all contracts`,
  },
  {
    commandId: "aas-causal-pl",
    params: [
      {
        id: "org",
        label: "Workspace",
        type: "select",
        required: true,
        optionsEndpoint: "/api/org/list",
        optionsKey: "organizations",
      },
      GL_DATA_PARAM,
      {
        id: "comparison",
        label: "Compare Against",
        type: "select",
        required: false,
        staticOptions: [
          { value: "previous_quarter", label: "Previous Quarter" },
          { value: "same_quarter_ly", label: "Same Quarter Last Year" },
          { value: "previous_year", label: "Previous Year" },
        ],
        defaultValue: "previous_quarter",
      },
    ],
    confirmationMessage:
      "Generate causal P&L analysis compared to **{{comparison}}**?",
    gatheringPrompts: {
      org: "Which workspace's P&L should I analyse causally?",
      gl_data: "Let me check if you have General Ledger data available...",
      comparison: "Which period should I compare against? Default is previous quarter.",
    },
    promptBuilder: (p) =>
      `Generate a causal P&L analysis showing why each line item changed versus ${p.comparison || "previous quarter"}`,
  },
];

// ── Lookup Map ───────────────────────────────────────────────────────────────

/** All gathering definitions keyed by command ID */
export const COMMAND_GATHERING_MAP: Record<string, CommandGathering> =
  Object.fromEntries(
    [...SEAAS_P0_GATHERING, ...AAS_GATHERING, ...AAS_INTELLIGENCE_GATHERING, AAS_FULL_REVIEW].map((g) => [g.commandId, g])
  );

/** Set of command IDs that have gathering defined */
export const GATHERING_COMMAND_IDS = new Set(
  Object.keys(COMMAND_GATHERING_MAP)
);

/** Get gathering definition for a command, or null if none */
export function getCommandGathering(
  commandId: string
): CommandGathering | null {
  return COMMAND_GATHERING_MAP[commandId] ?? null;
}

// ── Dynamic Gathering Utilities (for custom agent templates) ────────────────

/** Merge system gathering map with custom template gatherings at runtime. */
export function mergedGatheringMap(
  customGatherings: Record<string, CommandGathering>
): Record<string, CommandGathering> {
  return { ...COMMAND_GATHERING_MAP, ...customGatherings };
}

/** Check if a command ID has gathering (including custom definitions). */
export function hasGathering(
  commandId: string,
  customGatherings?: Record<string, CommandGathering>
): boolean {
  return (
    GATHERING_COMMAND_IDS.has(commandId) ||
    !!(customGatherings && commandId in customGatherings)
  );
}
