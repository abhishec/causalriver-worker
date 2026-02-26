/**
 * Agent Communication Protocol
 * ==============================
 *
 * Every agent in BrainOS (SE-aaS, AaaS, PM-aaS, created agents) communicates
 * through three layers — Heart, Mind, and Speech — giving each agent a
 * human voice with visible internal state.
 *
 * Heart: vitals (confidence, energy, emotional signal)
 * Mind:  what the agent is planning / currently doing (chain of thought, progress)
 * Speech: output expressed in human voice (artifact card, report, answer, error)
 */

// ============================================================================
// CORE TYPES
// ============================================================================

export interface AgentHeart {
  /** 0–1 confidence score computed from step success rate */
  confidence: number;
  energy: "focused" | "overloaded" | "idle" | "recovering";
  signal: "curious" | "confident" | "cautious" | "stuck";
  /** Milliseconds since the agent started */
  pulse: number;
}

export interface AgentMind {
  /** e.g. "Step 3: Assembling domain context mesh" */
  currentStep: string;
  /** 0–100 progress percentage */
  progress: number;
  /** 1-2 sentence natural language description of what the agent is thinking */
  reasoning: string;
  /** All steps the agent plans to take */
  planSteps: string[];
  /** Steps completed so far */
  completedSteps: string[];
}

export interface AgentSpeech {
  format: "artifact" | "report" | "answer" | "error" | "intro";
  /** Bold first line, written in human voice */
  headline: string;
  /** Main body content */
  body: string;
  tone: "analytical" | "advisory" | "empathetic" | "urgent";
  /** Artifact IDs produced by this execution */
  artifacts?: string[];
}

export interface AgentCommsPayload {
  agentId: string;
  /** e.g. "se-aas:early-warning" or "aas:journal-entry" */
  agentType: string;
  orgId: string;
  heart: AgentHeart;
  mind: AgentMind;
  speech: AgentSpeech;
  timestamp: string;
}

// ============================================================================
// INPUT DISCOVERY TYPES
// ============================================================================

export interface AgentInputSpec {
  key: string;
  label: string;
  type: "text" | "select" | "date" | "number";
  required: boolean;
  hint?: string;
  options?: string[];
}

// ============================================================================
// AGENT STEP PLANS
// Per-domain step plans used for mind.planSteps
// ============================================================================

const SE_AAS_STEPS = [
  "Step 0: Booting up — loading case-log priors and brain context",
  "Step 1: Assembling brain context mesh",
  "Step 2: Building domain execution context",
  "Step 3: Executing domain analysis",
  "Step 4: Saving artifact to workspace",
  "Step 5: Running brain feedback loop",
  "Step 6: Applying domain-specific side effects",
  "Step 7: Federating causal learning to core brain",
  "Step 8: Recording RL outcome and retro",
];

const AAS_STEPS = [
  "Step 0: Loading brain context and causal priors",
  "Step 1: Assembling accounting context via mesh",
  "Step 2: Building agent execution context",
  "Step 3: Running accounting agent",
  "Step 4: Persisting result and artifact",
  "Step 5: Running brain feedback loop",
  "Step 6: Federating causal deltas to core",
];

// Domain-specific human-readable descriptions for reasoning text
const DOMAIN_REASONING: Record<string, string[]> = {
  "early-warning": [
    "Pulling engagement health scores and velocity metrics to spot drift early.",
    "Cross-referencing sprint data with historical patterns to identify at-risk signals.",
    "Synthesizing findings into a risk-ranked view across your active engagements.",
  ],
  "pod-match": [
    "Analyzing your requirement description against available pod profiles.",
    "Scoring tech stack overlap, past engagement performance, and capacity signals.",
    "Building a confidence-ranked recommendation with evidence.",
  ],
  "scope-creep": [
    "Scanning story point history for delta spikes beyond the baseline threshold.",
    "Correlating sprint additions with engagement health scores.",
    "Generating severity-ranked alerts with timeline context.",
  ],
  "delivery-intelligence": [
    "Assembling the full delivery health snapshot across all active engagements.",
    "Pulling pod performance, scope drift, and engineer velocity into one view.",
    "Computing composite health scores and forecast confidence intervals.",
  ],
  "incident-diagnosis": [
    "Tracing the error chain from symptoms to root cause candidates.",
    "Correlating log patterns and deployment history to narrow the blast radius.",
    "Producing a ranked diagnosis with confidence scores and fix recommendations.",
  ],
  "impact-analysis": [
    "Mapping the change surface across service dependencies.",
    "Scoring risk by blast radius, historical change frequency, and test coverage gaps.",
    "Building an annotated impact report with recommended review priorities.",
  ],
  "test-data-generator": [
    "Analyzing the schema and use cases to generate representative test fixtures.",
    "Ensuring edge cases and boundary conditions are covered.",
    "Producing clean, documented test data ready for immediate use.",
  ],
  "pr-review": [
    "Scanning the diff for logic errors, security concerns, and code quality signals.",
    "Checking test coverage, documentation completeness, and naming consistency.",
    "Generating a structured review with line-level annotations and summary verdict.",
  ],
  "bookkeep": [
    "Classifying each transaction using the chart of accounts structure.",
    "Applying double-entry rules and reconciling against expected balances.",
    "Flagging unusual entries for review and computing period totals.",
  ],
  "statements": [
    "Aggregating classified transactions into trial balance form.",
    "Computing P&L, balance sheet, and cash flow statement from GL data.",
    "Generating narrative commentary on material movements.",
  ],
};

function getDomainReasoning(domainType: string, progress: number): string {
  const lines = DOMAIN_REASONING[domainType];
  if (!lines || lines.length === 0) {
    return progress < 40
      ? "Assembling context and preparing analysis inputs."
      : progress < 80
        ? "Running domain analysis with brain context."
        : "Finalizing result and recording to workspace.";
  }
  if (progress < 40) return lines[0];
  if (progress < 80) return lines[Math.min(1, lines.length - 1)];
  return lines[lines.length - 1];
}

// ============================================================================
// HELPER: computeAgentHeart
// ============================================================================

export function computeAgentHeart(
  completedSteps: number,
  totalSteps: number,
  hasError: boolean,
  elapsedMs: number,
): AgentHeart {
  if (hasError) {
    return {
      confidence: 0.1,
      energy: "recovering",
      signal: "stuck",
      pulse: elapsedMs,
    };
  }

  const stepRatio = totalSteps > 0 ? completedSteps / totalSteps : 0;
  const confidence = Math.min(0.95, 0.3 + stepRatio * 0.65);

  // Energy: overloaded early, focused mid-execution, recovering at end
  let energy: AgentHeart["energy"];
  if (elapsedMs < 500) {
    energy = "idle";
  } else if (stepRatio < 0.2) {
    energy = "focused";
  } else if (stepRatio < 0.85) {
    energy = "focused";
  } else {
    energy = "recovering";
  }

  // Signal based on confidence level
  let signal: AgentHeart["signal"];
  if (confidence >= 0.75) {
    signal = "confident";
  } else if (confidence >= 0.55) {
    signal = "curious";
  } else {
    signal = "cautious";
  }

  return { confidence, energy, signal, pulse: elapsedMs };
}

// ============================================================================
// HELPER: buildIntroSpeech
// ============================================================================

const INTRO_HEADLINES: Record<string, string> = {
  "early-warning": "On it. Scanning your delivery signals now.",
  "pod-match": "On it. I'll find your best-fit pod.",
  "scope-creep": "On it. Checking for scope drift across your engagements.",
  "delivery-intelligence": "On it. Assembling your delivery health snapshot.",
  "incident-diagnosis": "On it. Tracing the incident chain.",
  "impact-analysis": "On it. Mapping the blast radius of this change.",
  "test-data-generator": "On it. Generating test fixtures for your schema.",
  "test-case-generator": "On it. Writing test cases from your spec.",
  "tdd-code-generator": "On it. Building TDD-first code from your spec.",
  "pr-review": "On it. Reading the diff and building my review.",
  "sql-analyzer": "On it. Analyzing your query for performance and correctness.",
  "log-query": "On it. Searching your logs for the pattern.",
  "dead-code-detector": "On it. Scanning the codebase for unused code.",
  "dependency-upgrade": "On it. Checking your dependency graph for safe upgrades.",
  "performance-profiler": "On it. Profiling hotspots and bottlenecks.",
  "design-doc-generator": "On it. Drafting a design document from your inputs.",
  "bookkeep": "On it. Classifying and posting your GL transactions.",
  "reconcile": "On it. Reconciling your accounts.",
  "statements": "On it. Generating your financial statements.",
  "tax": "On it. Running your tax compliance analysis.",
  "anomaly": "On it. Hunting for anomalies in your transaction data.",
  "cash-forecast": "On it. Building your cash flow forecast.",
  "revenue-leakage": "On it. Scanning for revenue leakage patterns.",
  "causal-pl": "On it. Running the causal P&L narrator.",
};

const INTRO_BODIES: Record<string, string> = {
  "early-warning": "I'm pulling engagement health scores, velocity indices, and flight-risk signals. I'll have a ranked view of your at-risk engagements ready in a moment.",
  "pod-match": "I'm scoring available pods against your requirement — looking at tech stack overlap, past engagement outcomes, and current capacity.",
  "scope-creep": "I'm scanning story point deltas and sprint history across your active engagements to surface any creep that's exceeded the alert threshold.",
  "delivery-intelligence": "I'm assembling health scores, pod performance, scope drift, and engineer velocity into a single delivery snapshot.",
  "incident-diagnosis": "I'm tracing the error chain and correlating it with recent deployments and log patterns.",
  "impact-analysis": "I'm mapping affected services, checking test coverage gaps, and scoring the risk of this change.",
  "pr-review": "I'm reading the diff, checking logic, security, test coverage, and naming consistency.",
  "bookkeep": "I'm classifying transactions, applying double-entry rules, and flagging anything unusual for review.",
  "statements": "I'm aggregating GL data into P&L, balance sheet, and cash flow statement form.",
};

export function buildIntroSpeech(
  agentType: string,
  _inputs: Record<string, unknown>,
): AgentSpeech {
  // Normalize: strip "se-aas:" or "aas:" prefix if present
  const domainKey = agentType.includes(":") ? agentType.split(":").pop()! : agentType;

  const headline = INTRO_HEADLINES[domainKey] ?? "I'm on it.";
  const body =
    INTRO_BODIES[domainKey] ??
    "Assembling context and preparing to run the analysis. I'll update you as I progress.";

  return {
    format: "intro",
    headline,
    body,
    tone: "analytical",
  };
}

// ============================================================================
// HELPER: buildCompletionSpeech
// ============================================================================

const COMPLETION_TEMPLATES: Record<
  string,
  (result: unknown, durationMs: number) => { headline: string; body: string; format: AgentSpeech["format"]; tone: AgentSpeech["tone"] }
> = {
  "early-warning": (result, durationMs) => {
    const r = result as Record<string, unknown>;
    const atRisk = (r?.data as Record<string, unknown>)?.at_risk_count as number | undefined;
    const total = (r?.data as Record<string, unknown>)?.total_engagements as number | undefined;
    const countStr = typeof atRisk === "number" && typeof total === "number"
      ? `${atRisk} of your ${total} active engagement${total !== 1 ? "s" : ""} showing early warning signals`
      : "your engagements";
    return {
      headline: `I've scanned your delivery signals. ${atRisk ? `${atRisk} engagement${atRisk !== 1 ? "s" : ""} need${atRisk === 1 ? "s" : ""} attention.` : "No critical signals found right now."}`,
      body: `Completed in ${(durationMs / 1000).toFixed(1)}s. Found ${countStr}. The full breakdown is in the artifact below, ranked by severity.`,
      format: "artifact",
      tone: atRisk && atRisk > 0 ? "advisory" : "analytical",
    };
  },
  "pod-match": (result, durationMs) => {
    const r = result as Record<string, unknown>;
    const podName = (r?.data as Record<string, unknown>)?.recommended_pod_name as string | undefined
      ?? (r as Record<string, unknown>)?.recommended_pod_name as string | undefined;
    const confidence = (r?.data as Record<string, unknown>)?.confidence as number | undefined
      ?? (r as Record<string, unknown>)?.confidence as number | undefined;
    return {
      headline: podName
        ? `Best match: ${podName}${confidence !== undefined ? ` (${Math.round(confidence * 100)}% confidence)` : ""}.`
        : "Pod recommendation ready.",
      body: `Completed in ${(durationMs / 1000).toFixed(1)}s. I've scored available pods against your requirements and surfaced the strongest match with supporting evidence.`,
      format: "artifact",
      tone: "advisory",
    };
  },
  "scope-creep": (result, durationMs) => {
    const r = result as Record<string, unknown>;
    const alerts = Array.isArray((r?.data as Record<string, unknown>)?.alerts)
      ? ((r?.data as Record<string, unknown>)?.alerts as unknown[]).length
      : 0;
    return {
      headline: alerts > 0
        ? `Found ${alerts} scope creep alert${alerts !== 1 ? "s" : ""} across your engagements.`
        : "No scope creep alerts detected right now.",
      body: `Completed in ${(durationMs / 1000).toFixed(1)}s. ${alerts > 0 ? "I've ranked the alerts by severity and included the story point delta context for each." : "Your scope baselines look stable."}`,
      format: "artifact",
      tone: alerts > 0 ? "urgent" : "analytical",
    };
  },
  "delivery-intelligence": (result, durationMs) => {
    const r = result as Record<string, unknown>;
    const healthScores = Array.isArray((r?.data as Record<string, unknown>)?.health_scores)
      ? ((r?.data as Record<string, unknown>)?.health_scores as unknown[]).length
      : 0;
    return {
      headline: `Delivery health snapshot ready across ${healthScores} engagement${healthScores !== 1 ? "s" : ""}.`,
      body: `Completed in ${(durationMs / 1000).toFixed(1)}s. I've assembled health scores, scope drift, pod performance, and engineer velocity into a single view.`,
      format: "artifact",
      tone: "advisory",
    };
  },
  "incident-diagnosis": (result, durationMs) => {
    const r = result as Record<string, unknown>;
    const rootCause = (r as Record<string, unknown>)?.rootCause as string | undefined;
    return {
      headline: rootCause
        ? `Root cause identified: ${rootCause.slice(0, 80)}${rootCause.length > 80 ? "..." : ""}`
        : "Incident diagnosis complete.",
      body: `Completed in ${(durationMs / 1000).toFixed(1)}s. I've traced the failure chain and ranked the probable causes by confidence. Recommended remediation steps are in the artifact.`,
      format: "artifact",
      tone: "urgent",
    };
  },
  "pr-review": (result, durationMs) => {
    const r = result as Record<string, unknown>;
    const findings = Array.isArray((r?.data as Record<string, unknown>)?.findings)
      ? ((r?.data as Record<string, unknown>)?.findings as unknown[]).length
      : 0;
    return {
      headline: findings > 0
        ? `Review complete. Found ${findings} item${findings !== 1 ? "s" : ""} worth discussing.`
        : "Review complete. Code looks solid.",
      body: `Completed in ${(durationMs / 1000).toFixed(1)}s. ${findings > 0 ? "I've annotated the diff with my observations and ranked them by priority." : "No blocking issues found — a few minor suggestions are noted."}`,
      format: "report",
      tone: "advisory",
    };
  },
  "bookkeep": (_result, durationMs) => ({
    headline: "Bookkeeping complete. Transactions classified and posted.",
    body: `Completed in ${(durationMs / 1000).toFixed(1)}s. All transactions have been classified, double-entry rules applied, and unusual entries flagged for your review.`,
    format: "artifact",
    tone: "analytical",
  }),
  "statements": (_result, durationMs) => ({
    headline: "Financial statements generated.",
    body: `Completed in ${(durationMs / 1000).toFixed(1)}s. P&L, balance sheet, and cash flow statement are ready. Material movements are called out in the narrative section.`,
    format: "artifact",
    tone: "analytical",
  }),
};

export function buildCompletionSpeech(
  agentType: string,
  result: unknown,
  artifactIds: string[],
  durationMs: number,
): AgentSpeech {
  const domainKey = agentType.includes(":") ? agentType.split(":").pop()! : agentType;

  const template = COMPLETION_TEMPLATES[domainKey];
  if (template) {
    const { headline, body, format, tone } = template(result, durationMs);
    return {
      format,
      headline,
      body,
      tone,
      artifacts: artifactIds.length > 0 ? artifactIds : undefined,
    };
  }

  // Generic fallback — still human voice, never "Task completed successfully."
  const r = result as Record<string, unknown>;
  const summary = r?.summary as string | undefined
    ?? r?.narrative as string | undefined
    ?? (r?.data as Record<string, unknown>)?.summary as string | undefined;

  const headline = summary
    ? summary.slice(0, 100) + (summary.length > 100 ? "..." : "")
    : `${domainKey.replace(/-/g, " ")} analysis complete.`;

  return {
    format: "artifact",
    headline,
    body: `Completed in ${(durationMs / 1000).toFixed(1)}s. The full result is in the artifact panel.`,
    tone: "analytical",
    artifacts: artifactIds.length > 0 ? artifactIds : undefined,
  };
}

// ============================================================================
// HELPER: buildErrorSpeech
// ============================================================================

export function buildErrorSpeech(
  agentType: string,
  error: string,
  attemptedSteps: string[],
): AgentSpeech {
  const domainKey = agentType.includes(":") ? agentType.split(":").pop()! : agentType;
  const lastStep = attemptedSteps.length > 0 ? attemptedSteps[attemptedSteps.length - 1] : null;

  return {
    format: "error",
    headline: `I hit a wall running ${domainKey.replace(/-/g, " ")}.`,
    body:
      `${lastStep ? `I got through "${lastStep}" before running into trouble. ` : ""}` +
      `Error: ${error.slice(0, 200)}${error.length > 200 ? "..." : ""}. ` +
      `The brain will try to answer from general context instead.`,
    tone: "empathetic",
  };
}

// ============================================================================
// HELPER: buildAgentCommsPayload
// Factory that assembles a full payload for a given moment in execution
// ============================================================================

export function buildAgentCommsPayload(params: {
  agentId: string;
  agentType: string;
  orgId: string;
  completedSteps: number;
  totalSteps: number;
  currentStepName: string;
  completedStepNames: string[];
  planSteps: string[];
  progress: number;
  hasError: boolean;
  elapsedMs: number;
  speech: AgentSpeech;
}): AgentCommsPayload {
  const heart = computeAgentHeart(
    params.completedSteps,
    params.totalSteps,
    params.hasError,
    params.elapsedMs,
  );

  const domainKey = params.agentType.includes(":")
    ? params.agentType.split(":").pop()!
    : params.agentType;

  const mind: AgentMind = {
    currentStep: params.currentStepName,
    progress: params.progress,
    reasoning: getDomainReasoning(domainKey, params.progress),
    planSteps: params.planSteps,
    completedSteps: params.completedStepNames,
  };

  return {
    agentId: params.agentId,
    agentType: params.agentType,
    orgId: params.orgId,
    heart,
    mind,
    speech: params.speech,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// INPUT DISCOVERY — getRequiredInputs
// ============================================================================

const INPUT_SPECS: Record<string, AgentInputSpec[]> = {
  "se-aas:early-warning": [
    { key: "engagementId", label: "engagement ID", type: "text", required: true, hint: "The engagement to analyze (e.g. eng_abc123)" },
    { key: "lookbackDays", label: "lookback period (days)", type: "number", required: false, hint: "How many days back to analyze (default: 30)" },
  ],
  "early-warning": [
    { key: "engagementId", label: "engagement ID", type: "text", required: true, hint: "The engagement to analyze" },
    { key: "lookbackDays", label: "lookback period (days)", type: "number", required: false, hint: "How many days back to analyze (default: 30)" },
  ],
  "se-aas:pod-match": [
    { key: "requirementDescription", label: "requirement description", type: "text", required: true, hint: "Describe the technical needs, skills, or project context" },
    { key: "teamSize", label: "team size", type: "number", required: false, hint: "Preferred pod size" },
  ],
  "pod-match": [
    { key: "requirementDescription", label: "requirement description", type: "text", required: true },
    { key: "teamSize", label: "team size", type: "number", required: false },
  ],
  "se-aas:scope-creep": [
    { key: "engagementId", label: "engagement ID", type: "text", required: true },
  ],
  "scope-creep": [
    { key: "engagementId", label: "engagement ID", type: "text", required: true },
  ],
  "se-aas:delivery-intelligence": [
    { key: "engagementId", label: "engagement ID", type: "text", required: true },
  ],
  "delivery-intelligence": [
    { key: "engagementId", label: "engagement ID", type: "text", required: true },
  ],
  "aas:journal-entry": [
    { key: "period", label: "accounting period", type: "text", required: true, hint: "e.g. Q1 2025 or Jan 2025" },
    { key: "description", label: "entry description", type: "text", required: false },
  ],
  "journal-entry": [
    { key: "period", label: "accounting period", type: "text", required: true },
    { key: "description", label: "entry description", type: "text", required: false },
  ],
  "aas:invoice": [
    { key: "clientId", label: "client ID", type: "text", required: true },
    { key: "amount", label: "invoice amount", type: "number", required: true },
  ],
  "invoice": [
    { key: "clientId", label: "client ID", type: "text", required: true },
    { key: "amount", label: "invoice amount", type: "number", required: true },
  ],
};

/**
 * Returns the list of required inputs that are missing from the provided payload
 * for the given agent type.
 */
export function getRequiredInputs(
  agentType: string,
  payload: Record<string, unknown>,
): AgentInputSpec[] {
  const specs = INPUT_SPECS[agentType] ?? [];
  return specs.filter((spec) => spec.required && !payload[spec.key]);
}
