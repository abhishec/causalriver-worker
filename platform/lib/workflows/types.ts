/**
 * Workflow Types — Definitions, Runs, and Steps
 * ===============================================
 */

// ── Workflow Step Definition ────────────────────────────────────────────────

export interface WorkflowStep {
  id: string;
  order: number;
  /** Steps with same parallel_group run simultaneously */
  parallel_group?: string;
  /** Reference to agent_templates.id */
  agent_template_id: string;
  /** Display label for this step */
  label: string;
  /** How input is sourced for this step */
  input_mapping: "previous_output" | "original_input" | "custom" | "merge_parallel";
  /** Custom prompt template (used when input_mapping = "custom") */
  custom_prompt?: string;
  /** What happens when this step fails */
  failure_behavior: "stop" | "skip" | "retry_once";
  /** Whether this step requires human approval regardless of confidence */
  approval_required: boolean;
  /** Max time in seconds before this step is killed */
  timeout_seconds?: number;
}

// ── Workflow Definition (DB Row) ────────────────────────────────────────────

export interface WorkflowDefinition {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  description: string | null;
  service_vertical: "seaas" | "aas" | "general" | "cross-service";
  steps: WorkflowStep[];
  trigger_config: Record<string, unknown> | null;
  gathering_schema: Record<string, unknown> | null;
  is_template: boolean;
  template_source: string | null;
  status: "draft" | "active" | "archived";
  total_runs: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Workflow Run (Execution Record) ─────────────────────────────────────────

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  organization_id: string;
  triggered_by: string;
  trigger_source: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "paused";
  current_step: number;
  total_steps: number;
  input_payload: Record<string, unknown> | null;
  final_output: Record<string, unknown> | null;
  error_message: string | null;
  conversation_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

// ── Workflow Run Step (Per-Step Tracking) ────────────────────────────────────

export interface WorkflowRunStep {
  id: string;
  workflow_run_id: string;
  step_order: number;
  parallel_group: string | null;
  agent_template_id: string | null;
  brain_task_id: string | null;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  input_payload: Record<string, unknown> | null;
  output_payload: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

// ── Workflow Template (pre-built) ───────────────────────────────────────────

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  service_vertical: "seaas" | "aas" | "general" | "cross-service";
  steps: Omit<WorkflowStep, "id">[];
  icon: string;
}
