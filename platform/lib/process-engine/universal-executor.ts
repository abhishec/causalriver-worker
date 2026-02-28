/**
 * Universal FSM Executor
 * ======================
 *
 * Allows ANY agent_queue job (regardless of agent_type) to opt into FSM
 * execution by declaring `process_definition` in its payload.
 *
 * This is NOT a new agent_type. It's a payload capability flag.
 * Any SE-aaS, AaaS, or custom job can embed a process_definition to
 * get full BPaaS FSM execution: DECOMPOSE→ASSESS→COMPUTE→POLICY_CHECK→
 * APPROVAL_GATE→MUTATE→COMPLETE.
 *
 * Usage:
 *   - job.payload.process_definition = { processType: 'hr_offboarding', ... }
 *   - job-worker.ts checks hasProcessDefinition(job.payload) BEFORE executeDomain()
 *   - If true: routes to executeWithFSM() instead
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeBPaaSProcess, type BPaaSExecutionResult } from "@/lib/process-intelligence/domain-executor";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UniversalProcessPayload {
  process_definition: {
    processType: string;
    [key: string]: unknown;
  };
  input_context: Record<string, unknown>;
  source_service: string;
}

// ── Capability check ──────────────────────────────────────────────────────────

/**
 * Returns true if this job payload opts into FSM execution.
 * Safe to call with any unknown payload — never throws.
 */
export function hasProcessDefinition(payload: unknown): payload is UniversalProcessPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (!p.process_definition || typeof p.process_definition !== "object") return false;
  const pd = p.process_definition as Record<string, unknown>;
  return typeof pd.processType === "string" && pd.processType.length > 0;
}

// ── FSM executor ──────────────────────────────────────────────────────────────

/**
 * Execute a job through the BPaaS FSM.
 *
 * Maps UniversalProcessPayload fields to BPaaSExecutionParams:
 *   processType   ← payload.process_definition.processType (fallback: 'custom')
 *   inputPayload  ← { ...payload.input_context, process_definition: payload.process_definition }
 *   organizationId ← orgId
 *   userId        ← userId (optional)
 *
 * Delegates entirely to executeBPaaSProcess() — no FSM logic lives here.
 */
export async function executeWithFSM(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string,
  payload: UniversalProcessPayload,
  userId?: string
): Promise<BPaaSExecutionResult> {
  const processType = payload.process_definition?.processType ?? "custom";

  return executeBPaaSProcess(
    {
      processType,
      jobId,
      organizationId: orgId,
      inputPayload: {
        ...payload.input_context,
        process_definition: payload.process_definition,
      },
      userId,
    },
    supabase
  );
}
