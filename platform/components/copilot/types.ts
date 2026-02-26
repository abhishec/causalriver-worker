/**
 * Shared Copilot Types
 * ═══════════════════════════════════════════════════════════════════════════
 * Shared types extracted here to break circular module dependencies.
 * Import domain types from this file, NOT from CopilotChat.tsx.
 */

// ─── Core Message Types ─────────────────────────────────────────────────────

export interface BrainMeta {
  intent: string;
  domains: string[];
  confidence: number;
  regionsUsed: string[];
  uncertainAreas: string[];
}

export interface CopilotArtifact {
  id: string;
  type: "code" | "analysis" | "table" | "chart" | "document" | "agent-execution";
  title: string;
  language?: string;
  content: string;
  createdAt: number;
  messageIndex?: number;
  /** Raw structured data for rich rendering (e.g. agent execution data) */
  rawData?: unknown;
  /** Source service */
  service?: "general" | "aas" | "seaas" | "agent";
}

// ─── Domain Result Types (AAS + SE-aaS structured outputs) ──────────────────

export interface AccountingDomainData {
  period?: string;
  profitAndLoss?: {
    revenue: number;
    expenses: number;
    netIncome: number;
    ebitda?: number;
    revenueBreakdown?: Array<{ account: string; amount: number }>;
    expenseBreakdown?: Array<{ account: string; amount: number }>;
  };
  balanceSheet?: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    assets?: Array<{ account: string; balance: number }>;
    liabilities?: Array<{ account: string; balance: number }>;
    equity?: Array<{ account: string; balance: number }>;
  };
  trialBalance?: {
    accounts: Array<{ account: string; type: string; debit: number; credit: number; netDebit: number; netCredit: number }>;
    totalDebits: number;
    totalCredits: number;
    balanced: boolean;
    period: string;
  };
  gstF5?: {
    box1_standardRatedSupplies: number;
    box2_zeroRatedSupplies: number;
    box3_exemptSupplies: number;
    box4_totalSupplies: number;
    box5_taxableSupplies: number;
    box6_outputTax: number;
    box7_inputTax: number;
    box8_netTaxPayable: number;
  };
  transactionSummary?: {
    totalTransactions: number;
    period: string;
    bySource?: Array<{ source: string; count: number; totalAmount: number }>;
    topTransactions?: Array<{ date: string; account: string; description: string; debit: number; credit: number; classification: string }>;
  };
  anomalies?: Array<{ type: string; description: string; severity: string; transactions?: unknown[] }>;
  narrative?: string;
}

export interface SEaaSDomainData {
  analysisType?: string;
  summary?: string;
  findings?: Array<{ severity: string; title: string; description: string; file?: string; line?: number }>;
  recommendations?: Array<{ priority: string; action: string; rationale: string }>;
  metrics?: Record<string, number | string>;
  codeSnippets?: Array<{ language: string; code: string; title: string }>;
}

// ─── Delivery Intelligence Types ────────────────────────────────────────────

export interface EngagementHealthData {
  engagement_id: string;
  engagement_name: string;
  client_name: string;
  pod_name?: string;
  health_score: number;
  delivery_velocity?: number;
  jira_resolution_rate?: number;
  scope_drift?: number;
  team_concentration?: number;
  slack_sentiment?: number;
  story_point_delta_pct?: number;
  predicted_completion_date?: string;
  forecast_confidence?: number;
  forecast_days_remaining?: number;
  forecast_at_risk?: boolean;
  target_end_date?: string;
  days_overdue?: number;
  status: string;
  computed_at: string;
}

export interface ScopeCreepAlert {
  id: string;
  engagement_id: string;
  severity: "warning" | "critical";
  delta_pct: number;
  baseline_pts?: number;
  current_pts?: number;
  sprint_name?: string;
  alert_message: string;
  created_at: string;
  engagements?: { engagement_name: string; client_name: string };
}

export interface PodMatchData {
  engagement_id?: string;
  recommended_pod_name: string;
  evidence: {
    avgCycleTimeHours?: number;
    weeklyPrCount?: number;
    techStackMatch?: string[];
    techStackOverlapScore?: number;
    pastEngagements?: Array<{ engagementName: string; clientName: string; healthScore: number }>;
    matchScore?: number;
  };
  confidence: number;
  created_at: string;
}

export interface EngineerHealthSummary {
  total_engineers: number;
  at_risk_count: number;
  overallocated_count: number;
  avg_review_burden: number;
  week_start: string;
}

export interface DeliveryIntelligenceData {
  health_scores: EngagementHealthData[];
  scope_alerts: ScopeCreepAlert[];
  pod_matches: PodMatchData[];
  engineer_health_summary?: EngineerHealthSummary | null;
  generated_at?: string;
}

// ─── Domain Result Union ────────────────────────────────────────────────────

export type DomainResult =
  | { service: "aas"; data: AccountingDomainData; messageIndex?: number }
  | { service: "seaas"; data: SEaaSDomainData; messageIndex?: number }
  | { service: "pm-aas"; data: Record<string, unknown>; messageIndex?: number }
  | { service: "delivery-intelligence"; data: DeliveryIntelligenceData; messageIndex?: number }
  | { service: "custom"; data: Record<string, unknown>; messageIndex?: number }
  | { service: "general"; data: Record<string, unknown>; messageIndex?: number };

// ─── Agent Streaming Types ──────────────────────────────────────────────────

export interface AgentStep {
  stepNumber: number;
  type: "thinking" | "querying" | "acting" | "observing" | "reflecting";
  title: string;
  content?: string;
  toolName?: string;
  durationMs?: number;
  status: "started" | "completed" | "failed";
}

export interface AgentStatus {
  taskId: string;
  status: "starting" | "running" | "completed" | "failed" | "awaiting_approval";
  agentType?: string;
  message?: string;
}

export interface ProgressiveArtifact {
  id: string;
  type: string;
  title: string;
  content: string;
  isPartial: boolean;
  service?: "seaas" | "aas" | "core";
}

export interface ProactiveInsight {
  domain: string;
  content: string;
  importance: number;
}

/** Agent Composer: composition progress event */
export interface CompositionStep {
  phase: "analyzing" | "selecting-tools" | "building-persona" | "inferring-params" | "planning" | "ready";
  title: string;
  detail?: string;
}

/** Workflow progress event — streamed during workflow execution */
export interface WorkflowProgress {
  runId: string;
  workflowId: string;
  workflowName: string;
  status: "running" | "paused" | "completed" | "failed";
  currentStep: number;
  totalSteps: number;
  steps: Array<{
    order: number;
    label: string;
    status: "pending" | "running" | "completed" | "failed" | "skipped";
    parallel_group?: string;
  }>;
}

/** Agent Composer: full composition result */
export interface CompositionResult {
  name: string;
  persona: string;
  selectedTools: Array<{ id: string; name: string; description: string; source: string; category: string }>;
  inferredGathering: Array<{ id: string; label: string; type: string; required: boolean; description?: string }> | null;
  executionPrompt: string;
  executionPlan: string[];
  complexity: "light" | "medium" | "heavy";
}

/**
 * Orchestrator Queued Info — sent when a brain-dependent job is queued because
 * the brain isn't ready yet (e.g. brain-population still running).
 * The frontend shows a pulsing badge and polls the job status endpoint.
 */
export interface OrchestratorQueuedInfo {
  type: "queued";
  message: string;
  jobId: string | null;
  domain: string;
  taskType: string;
  estimatedWaitMs: number;
  blockingJobId: string | null;
  blockingJobType: string;
  brainReadiness: "empty" | "populating" | "ready";
  brainSignalCount: number;
}

/** Brain Learning Pulse — RL metrics streamed to frontend for visible learning indicator */
export interface LearningPulse {
  intelligenceScore: number;
  predictionAccuracy: number | null;
  totalCorrections: number;
  totalFeedback: number;
  satisfactionRate: number;
  recentEmergenceEvents: Array<{ event_type: string; summary: string; created_at: string }>;
  learningVelocity: string;
  brierScore: number | null;
  edgesLearned: number;
  memoriesStored: number;
  lastLearningCycle: string | null;
}

// ─── Agent Communication Protocol ────────────────────────────────────────────
// Types for the Heart / Mind / Speech communication layer used by every agent.
// Full implementation in platform/lib/agents/agent-comms.ts

export interface AgentHeart {
  confidence: number;
  energy: "focused" | "overloaded" | "idle" | "recovering";
  signal: "curious" | "confident" | "cautious" | "stuck";
  pulse: number;
}

export interface AgentMind {
  currentStep: string;
  progress: number;
  reasoning: string;
  planSteps: string[];
  completedSteps: string[];
}

export interface AgentSpeech {
  format: "artifact" | "report" | "answer" | "error" | "intro";
  headline: string;
  body: string;
  tone: "analytical" | "advisory" | "empathetic" | "urgent";
  artifacts?: string[];
}

export interface AgentCommsPayload {
  agentId: string;
  agentType: string;
  orgId: string;
  heart: AgentHeart;
  mind: AgentMind;
  speech: AgentSpeech;
  timestamp: string;
}

// ─── Agent Input Request ──────────────────────────────────────────────────────
// Emitted when the agent needs more information before it can execute.

export interface AgentInputSpec {
  key: string;
  label: string;
  type: "text" | "select" | "date" | "number";
  required: boolean;
  hint?: string;
  options?: string[];
}

export interface AgentInputRequest {
  agentType: string;
  missing: AgentInputSpec[];
  message: string;
}

export interface SSECallbacks {
  onText: (text: string, accumulated: string) => void;
  onError: (error: string) => void;
  onBrainMeta: (meta: BrainMeta) => void;
  onDomainResult: (result: DomainResult) => void;
  onAgentStep?: (step: AgentStep) => void;
  onAgentStatus?: (status: AgentStatus) => void;
  onProgressiveArtifact?: (artifact: ProgressiveArtifact) => void;
  onProactiveInsights?: (insights: ProactiveInsight[]) => void;
  onAgentExecutionArtifact?: (artifact: { id: string; type: string; title: string; service: string; rawData: unknown }) => void;
  /** Agent Composer: composition progress (phase updates) */
  onCompositionStep?: (step: CompositionStep) => void;
  /** Agent Composer: full composition result */
  onCompositionResult?: (result: CompositionResult) => void;
  /** Workflow execution progress updates */
  onWorkflowProgress?: (progress: WorkflowProgress) => void;
  /** Brain RL learning pulse — intelligence metrics for visible learning indicator */
  onLearningPulse?: (pulse: LearningPulse) => void;
  /** Agent name: which agent/domain handled this query — shown as "Handled by: [name]" */
  onAgentName?: (name: string) => void;
  /** Agent created: emitted when an agent is successfully created via Copilot */
  onAgentCreated?: (agent: {
    agentId: string;
    name: string;
    domain: string;
    trigger: string;
    schedule?: string;
    brainEnabled?: boolean;
    rlEnabled?: boolean;
    memoryTracking?: boolean;
    createdAt?: string;
  }) => void;
  /**
   * Orchestrator queued: emitted when a brain-dependent job is queued because
   * the brain isn't ready yet. The frontend should show a queued badge and poll
   * GET /api/se-aas/jobs/:jobId every 5s until status === "success".
   */
  onOrchestratorQueued?: (info: OrchestratorQueuedInfo) => void;
  /**
   * Brain IQ warning: emitted when Brain IQ is below 10 (not ready).
   * The frontend shows an amber banner above the response.
   */
  onBrainWarning?: (warning: string, brainIq: number) => void;
  /** Agent communications: heart/mind/speech payload for visible agent state */
  onAgentComms?: (comms: AgentCommsPayload) => void;
  /** Agent input request: agent needs more info before it can run */
  onAgentInputRequest?: (request: AgentInputRequest) => void;
  /** SE-aaS domain status: emitted when a domain agent starts/completes execution */
  onSeaasDomainStatus?: (event: { type: 'agent_status'; status: 'running' | 'complete'; domain: string; message?: string }) => void;
  onDone: () => void;
}

// ─── Unified Artifact Type System ────────────────────────────────────────────
// All service outputs (code, financial statements, engineering analysis, charts)
// render as artifacts in the same artifact pane — exactly like Claude Cowork.

export type ArtifactType =
  | "code"
  | "analysis"
  | "table"
  | "chart"
  | "document"
  | "financial-statement"
  | "engineering-analysis"
  | "mermaid-diagram"
  | "agent-execution"
  | "presentation"
  | "pdf"
  | "infographic";

export interface UnifiedArtifact {
  id: string;
  type: ArtifactType;
  title: string;
  language?: string;
  content: string;
  /** Parsed domain data for rich rendering (financial statements, engineering analysis) */
  rawData?: unknown;
  createdAt: number;
  /** Index of the message that produced this artifact */
  messageIndex?: number;
  /** DB conversation ID for persistence */
  conversationId?: string;
  /** Whether the user has pinned this artifact */
  pinned?: boolean;
  /** Which service produced this artifact */
  service?: "general" | "aas" | "seaas" | "agent";
  /** Domain ID (e.g. "pr-review", "balance-sheet") */
  domainId?: string;
}

// ─── Artifact type display helpers ───────────────────────────────────────────

export const ARTIFACT_TYPE_LABELS: Record<ArtifactType, string> = {
  code: "Code",
  analysis: "Analysis",
  table: "Table",
  chart: "Chart",
  document: "Document",
  "financial-statement": "Financial Statement",
  "engineering-analysis": "Engineering Analysis",
  "mermaid-diagram": "Diagram",
  "agent-execution": "Agent Execution",
  presentation: "Presentation",
  pdf: "PDF",
  infographic: "Infographic",
};

export const ARTIFACT_TYPE_ICONS: Record<ArtifactType, string> = {
  code: "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5",
  analysis: "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5",
  table: "M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125m0 0h-7.5",
  chart: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
  document: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  "financial-statement": "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
  "engineering-analysis": "M11.42 15.17l-5.1-5.1a1 1 0 010-1.42l.71-.71a1 1 0 011.41 0L12 11.5l3.54-3.54a1 1 0 011.42 0l.7.71a1 1 0 010 1.41l-5.1 5.1a1.5 1.5 0 01-2.12 0z",
  "mermaid-diagram": "M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z",
  "agent-execution": "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z",
  presentation: "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5",
  pdf: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  infographic: "M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z M13.5 3.5a7.5 7.5 0 017.5 7.5h-7.5V3.5z",
};
