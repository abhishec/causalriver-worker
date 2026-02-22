/**
 * Pre-built Workflow Templates
 * =============================
 *
 * 5 SE-aaS + 5 AAAS + 1 Cross-Service = 11 templates.
 * Users can create workflows from these templates.
 */

import type { WorkflowTemplate } from "./types";

function makeStep(
  order: number,
  agent_template_id: string,
  label: string,
  opts?: {
    parallel_group?: string;
    input_mapping?: "previous_output" | "original_input" | "custom" | "merge_parallel";
    failure_behavior?: "stop" | "skip" | "retry_once";
    approval_required?: boolean;
  }
) {
  return {
    order,
    agent_template_id,
    label,
    input_mapping: opts?.input_mapping || (order === 1 ? "original_input" : "previous_output"),
    parallel_group: opts?.parallel_group,
    failure_behavior: opts?.failure_behavior || "stop",
    approval_required: opts?.approval_required || false,
  };
}

// ── SE-aaS (Engineering) Templates ──────────────────────────────────────────

export const SEAAS_WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "tpl-jira-to-pr",
    name: "Jira to PR",
    description: "Analyze a Jira ticket and create a PR with implementation",
    service_vertical: "seaas",
    icon: "📋",
    steps: [
      makeStep(1, "jira-analyst", "Analyze Jira Ticket"),
      makeStep(2, "pr-creator", "Create PR"),
    ],
  },
  {
    id: "tpl-code-review-pipeline",
    name: "Code Review Pipeline",
    description: "Review code, then generate tests and docs in parallel",
    service_vertical: "seaas",
    icon: "👁️",
    steps: [
      makeStep(1, "code-reviewer", "Code Review"),
      makeStep(2, "test-generator", "Generate Tests", { parallel_group: "review-outputs" }),
      makeStep(3, "doc-writer", "Write Docs", { parallel_group: "review-outputs" }),
    ],
  },
  {
    id: "tpl-bug-fix-flow",
    name: "Bug Fix Flow",
    description: "Diagnose an incident, apply fix, then review the fix",
    service_vertical: "seaas",
    icon: "🔧",
    steps: [
      makeStep(1, "incident-diagnoser", "Diagnose Issue"),
      makeStep(2, "feature-builder", "Apply Fix"),
      makeStep(3, "code-reviewer", "Review Fix", { approval_required: true }),
    ],
  },
  {
    id: "tpl-tech-debt-sprint",
    name: "Tech Debt Sprint",
    description: "Audit tech debt, map codebase and find dead code in parallel, then build fixes",
    service_vertical: "seaas",
    icon: "📊",
    steps: [
      makeStep(1, "tech-debt-auditor", "Audit Tech Debt"),
      makeStep(2, "codebase-mapper", "Map Codebase", { parallel_group: "analysis" }),
      makeStep(3, "dead-code-detector", "Find Dead Code", { parallel_group: "analysis" }),
      makeStep(4, "feature-builder", "Build Fixes", { input_mapping: "merge_parallel" }),
    ],
  },
  {
    id: "tpl-release-readiness",
    name: "Release Readiness",
    description: "Review code, generate tests and profile performance in parallel, then write docs",
    service_vertical: "seaas",
    icon: "🚀",
    steps: [
      makeStep(1, "code-reviewer", "Final Review"),
      makeStep(2, "test-generator", "Run Tests", { parallel_group: "validation" }),
      makeStep(3, "performance-profiler", "Profile Performance", { parallel_group: "validation" }),
      makeStep(4, "doc-writer", "Release Notes", { input_mapping: "merge_parallel" }),
    ],
  },
];

// ── AAAS (Accounting/Finance) Templates ─────────────────────────────────────

export const AAAS_WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "tpl-monthly-close",
    name: "Monthly Close",
    description: "Bookkeep, reconcile, then generate statements and check tax compliance in parallel, then prepare for audit",
    service_vertical: "aas",
    icon: "📒",
    steps: [
      makeStep(1, "bookkeeper", "Book Transactions"),
      makeStep(2, "reconciler", "Reconcile Accounts"),
      makeStep(3, "statement-generator", "Generate Statements", { parallel_group: "reports" }),
      makeStep(4, "tax-compliance", "Check Tax Compliance", { parallel_group: "reports", approval_required: true }),
      makeStep(5, "audit-preparer", "Prepare Audit Files", { input_mapping: "merge_parallel" }),
    ],
  },
  {
    id: "tpl-financial-health",
    name: "Financial Health Check",
    description: "Detect anomalies, then run causal P&L and cash forecast in parallel, then check revenue leakage",
    service_vertical: "aas",
    icon: "🏥",
    steps: [
      makeStep(1, "anomaly-detective", "Detect Anomalies"),
      makeStep(2, "causal-pl-narrator", "Causal P&L", { parallel_group: "insights" }),
      makeStep(3, "cash-flow-prophet", "Cash Forecast", { parallel_group: "insights" }),
      makeStep(4, "revenue-leakage-detector", "Revenue Leakage", { input_mapping: "merge_parallel" }),
    ],
  },
  {
    id: "tpl-tax-filing-prep",
    name: "Tax Filing Prep",
    description: "Bookkeep, check compliance, then prepare audit documentation",
    service_vertical: "aas",
    icon: "🏛️",
    steps: [
      makeStep(1, "bookkeeper", "Book Transactions"),
      makeStep(2, "tax-compliance", "Tax Compliance Check", { approval_required: true }),
      makeStep(3, "audit-preparer", "Prepare Filing"),
    ],
  },
  {
    id: "tpl-quarterly-review",
    name: "Quarterly Review",
    description: "Generate statements, then run causal narrative and anomaly detection in parallel, then forecast cash flow",
    service_vertical: "aas",
    icon: "📊",
    steps: [
      makeStep(1, "statement-generator", "Generate Statements"),
      makeStep(2, "causal-pl-narrator", "P&L Narrative", { parallel_group: "analysis" }),
      makeStep(3, "anomaly-detective", "Anomaly Check", { parallel_group: "analysis" }),
      makeStep(4, "cash-flow-prophet", "Cash Forecast", { input_mapping: "merge_parallel" }),
    ],
  },
  {
    id: "tpl-revenue-assurance",
    name: "Revenue Assurance",
    description: "Detect revenue leakage, reconcile accounts, then run causal analysis",
    service_vertical: "aas",
    icon: "💰",
    steps: [
      makeStep(1, "revenue-leakage-detector", "Revenue Leakage Scan"),
      makeStep(2, "reconciler", "Reconcile Findings"),
      makeStep(3, "causal-accountant", "Causal Analysis"),
    ],
  },
];

// ── Cross-Service Templates ─────────────────────────────────────────────────

export const CROSS_SERVICE_WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "tpl-deployment-impact",
    name: "Deployment Impact on Revenue",
    description: "Analyze code changes with engineering lens, then assess financial impact",
    service_vertical: "cross-service",
    icon: "🔗",
    steps: [
      makeStep(1, "code-reviewer", "Code Change Analysis"),
      makeStep(2, "causal-accountant", "Financial Impact Assessment"),
    ],
  },
];

// ── All Templates ───────────────────────────────────────────────────────────

export const ALL_WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  ...SEAAS_WORKFLOW_TEMPLATES,
  ...AAAS_WORKFLOW_TEMPLATES,
  ...CROSS_SERVICE_WORKFLOW_TEMPLATES,
];

export function getWorkflowTemplates(serviceVertical?: string): WorkflowTemplate[] {
  if (!serviceVertical || serviceVertical === "all") return ALL_WORKFLOW_TEMPLATES;
  return ALL_WORKFLOW_TEMPLATES.filter(t => t.service_vertical === serviceVertical);
}
