/**
 * Agent Session Manager
 * =====================
 * Manages the lifecycle of interactive agent sessions.
 *
 * Sessions group related turns (user inputs + agent outputs) together,
 * enabling multi-turn interactions with persistent context, knowledge scoping,
 * and corpus-backed few-shot examples.
 *
 * Schema:
 *   agent_sessions  — one per interaction series (has knowledge_scope, status)
 *   agent_session_turns — each user/agent exchange within a session
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreateSessionParams {
  organizationId: string;
  aiWorkerId?: string;
  agentType: string;
  sessionName: string;
  knowledgeScope?: {
    documentIds?: string[];
    ingestionJobIds?: string[];
  };
}

export interface SessionContext {
  sessionId: string;
  agentType: string;
  sessionName: string | null;
  turnCount: number;
  knowledgeScope: { documentIds?: string[]; ingestionJobIds?: string[] };
  sessionContext: Record<string, unknown>;
  recentTurns: Array<{
    turnNumber: number;
    userInput: string | null;
    agentOutput: string | null;
    userFeedback: string | null;
    revisionNotes: string | null;
  }>;
}

// ── Session lifecycle ──────────────────────────────────────────────────────────

/**
 * Create a new agent session.
 * Returns the session ID on success, null on error.
 */
export async function createAgentSession(
  supabase: SupabaseClient,
  params: CreateSessionParams
): Promise<{ sessionId: string } | null> {
  const { organizationId, aiWorkerId, agentType, sessionName, knowledgeScope } = params;

  const { data, error } = await supabase
    .from("agent_sessions")
    .insert({
      organization_id: organizationId,
      ai_worker_id: aiWorkerId ?? null,
      agent_type: agentType,
      session_name: sessionName,
      status: "active",
      knowledge_scope: knowledgeScope ?? {},
      session_context: {},
      turn_count: 0,
    })
    .select("id")
    .single();

  if (error || !data) {
    logger.error("[session-manager] createAgentSession failed", {
      error: error?.message ?? "no data returned",
      organizationId,
      agentType,
    });
    return null;
  }

  logger.warn("[session-manager] Session created", {
    sessionId: data.id,
    agentType,
    organizationId,
  });

  return { sessionId: data.id as string };
}

/**
 * Record a single user/agent exchange as a turn on the session.
 * Also increments the turn_count on the parent session atomically.
 * Returns the turn ID and turn number on success, null on error.
 */
export async function recordSessionTurn(
  supabase: SupabaseClient,
  sessionId: string,
  turn: {
    userInput: string;
    agentOutput: string;
    taskId?: string;
  }
): Promise<{ turnId: string; turnNumber: number } | null> {
  // Fetch current turn count to compute next turn number
  const { data: session, error: fetchError } = await supabase
    .from("agent_sessions")
    .select("turn_count")
    .eq("id", sessionId)
    .single();

  if (fetchError || !session) {
    logger.error("[session-manager] recordSessionTurn — failed to fetch session", {
      sessionId,
      error: fetchError?.message ?? "no session found",
    });
    return null;
  }

  const nextTurnNumber = ((session.turn_count as number) ?? 0) + 1;

  // Insert the turn record
  const { data: turnData, error: insertError } = await supabase
    .from("agent_session_turns")
    .insert({
      session_id: sessionId,
      turn_number: nextTurnNumber,
      user_input: turn.userInput,
      agent_output: turn.agentOutput,
      task_id: turn.taskId ?? null,
      user_feedback: null,
      revision_notes: null,
    })
    .select("id")
    .single();

  if (insertError || !turnData) {
    logger.error("[session-manager] recordSessionTurn — insert failed", {
      sessionId,
      turnNumber: nextTurnNumber,
      error: insertError?.message ?? "no data returned",
    });
    return null;
  }

  // Increment turn_count on the session
  const { error: updateError } = await supabase
    .from("agent_sessions")
    .update({ turn_count: nextTurnNumber })
    .eq("id", sessionId);

  if (updateError) {
    // Non-fatal: turn is recorded, counter is just off by one
    logger.warn("[session-manager] recordSessionTurn — failed to increment turn_count", {
      sessionId,
      error: updateError.message,
    });
  }

  return { turnId: turnData.id as string, turnNumber: nextTurnNumber };
}

/**
 * Retrieve full session context including the last 10 turns.
 * Used by executeInteractiveAgent() to build prompt context.
 */
export async function getSessionContext(
  supabase: SupabaseClient,
  sessionId: string
): Promise<SessionContext | null> {
  // Fetch session row
  const { data: session, error: sessionError } = await supabase
    .from("agent_sessions")
    .select(
      "id, agent_type, session_name, turn_count, knowledge_scope, session_context, status"
    )
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    logger.warn("[session-manager] getSessionContext — session not found", {
      sessionId,
      error: sessionError?.message ?? "no session",
    });
    return null;
  }

  // Fetch last 10 turns ordered by turn_number ascending
  const { data: turns, error: turnsError } = await supabase
    .from("agent_session_turns")
    .select(
      "turn_number, user_input, agent_output, user_feedback, revision_notes"
    )
    .eq("session_id", sessionId)
    .order("turn_number", { ascending: false })
    .limit(10);

  if (turnsError) {
    logger.warn("[session-manager] getSessionContext — turns fetch failed", {
      sessionId,
      error: turnsError.message,
    });
    // Still return session context even without turns
  }

  // Sort ascending for conversation flow
  const recentTurns = (turns ?? [])
    .sort((a, b) => (a.turn_number as number) - (b.turn_number as number))
    .map((t) => ({
      turnNumber: t.turn_number as number,
      userInput: t.user_input as string | null,
      agentOutput: t.agent_output as string | null,
      userFeedback: t.user_feedback as string | null,
      revisionNotes: t.revision_notes as string | null,
    }));

  const rawScope = (session.knowledge_scope ?? {}) as Record<string, unknown>;
  const knowledgeScope: { documentIds?: string[]; ingestionJobIds?: string[] } = {
    documentIds: Array.isArray(rawScope["documentIds"])
      ? (rawScope["documentIds"] as string[])
      : undefined,
    ingestionJobIds: Array.isArray(rawScope["ingestionJobIds"])
      ? (rawScope["ingestionJobIds"] as string[])
      : undefined,
  };

  return {
    sessionId: session.id as string,
    agentType: session.agent_type as string,
    sessionName: session.session_name as string | null,
    turnCount: session.turn_count as number,
    knowledgeScope,
    sessionContext: (session.session_context as Record<string, unknown>) ?? {},
    recentTurns,
  };
}

/**
 * Update user feedback and revision notes on a specific turn.
 * Called when the user approves, rejects, or requests revision of agent output.
 */
export async function updateSessionFeedback(
  supabase: SupabaseClient,
  turnId: string,
  feedback: { type: "approved" | "rejected" | "revised"; notes?: string }
): Promise<boolean> {
  const { error } = await supabase
    .from("agent_session_turns")
    .update({
      user_feedback: feedback.type,
      revision_notes: feedback.notes ?? null,
    })
    .eq("id", turnId);

  if (error) {
    logger.error("[session-manager] updateSessionFeedback failed", {
      turnId,
      feedbackType: feedback.type,
      error: error.message,
    });
    return false;
  }

  logger.warn("[session-manager] Turn feedback recorded", {
    turnId,
    type: feedback.type,
  });

  return true;
}

/**
 * Mark a session as completed.
 * Sets status to 'completed' and records the completion timestamp in session_context.
 */
export async function completeSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<boolean> {
  const completedAt = new Date().toISOString();

  const { error } = await supabase
    .from("agent_sessions")
    .update({
      status: "completed",
      session_context: { completed_at: completedAt },
    })
    .eq("id", sessionId);

  if (error) {
    logger.error("[session-manager] completeSession failed", {
      sessionId,
      error: error.message,
    });
    return false;
  }

  logger.warn("[session-manager] Session completed", { sessionId });
  return true;
}

/**
 * List active (and recently completed) sessions for an organization.
 * Optionally filter by AI worker ID.
 */
export async function listActiveSessions(
  supabase: SupabaseClient,
  organizationId: string,
  aiWorkerId?: string
): Promise<
  Array<{
    id: string;
    agentType: string;
    sessionName: string | null;
    turnCount: number;
    status: string;
    createdAt: string;
  }>
> {
  let query = supabase
    .from("agent_sessions")
    .select("id, agent_type, session_name, turn_count, status, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (aiWorkerId) {
    query = query.eq("ai_worker_id", aiWorkerId);
  }

  const { data, error } = await query;

  if (error) {
    logger.warn("[session-manager] listActiveSessions failed", {
      organizationId,
      aiWorkerId,
      error: error.message,
    });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    agentType: row.agent_type as string,
    sessionName: row.session_name as string | null,
    turnCount: (row.turn_count as number) ?? 0,
    status: row.status as string,
    createdAt: row.created_at as string,
  }));
}
