/**
 * API Input Validation Schemas — Zod-based security hardening.
 *
 * Every API endpoint MUST validate input through these schemas.
 * Defense against injection, oversized payloads, type confusion.
 */

import { z } from "zod";

// ── Shared validators ─────────────────────────────────────────────────

const uuidSchema = z.string().uuid("Invalid UUID format");
const domainSchema = z.string().min(1).max(50).regex(/^[a-z_]+$/, "Domain must be lowercase alphanumeric with underscores");
const safeString = (maxLen: number) => z.string().min(1).max(maxLen).trim();

// ── Brain Query ───────────────────────────────────────────────────────

export const brainQuerySchema = z.object({
  question: safeString(2000),
  action: z.enum(["forecast", "simulate", "explain", "diagnose", "query"]).optional(),
  organizationId: uuidSchema.optional(),
  entityState: z.record(z.unknown()).optional(),
  domains: z.array(domainSchema).max(20).optional(),
  format: z.enum(["full", "compact"]).optional(),
}).strict();

export type BrainQueryInput = z.infer<typeof brainQuerySchema>;

// ── Brain Execute ─────────────────────────────────────────────────────

const slackAlertPayload = z.object({
  webhookUrl: z.string().url().optional(),
  channel: safeString(100).optional(),
  message: safeString(4000).optional(),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  domain: domainSchema.optional(),
  insight: safeString(4000).optional(),
});

const emailDigestPayload = z.object({
  recipientEmail: z.string().email().optional(),
  domains: z.array(domainSchema).max(20).optional(),
  period: z.enum(["daily", "weekly", "monthly"]).optional(),
});

const createTaskPayload = z.object({
  title: safeString(200),
  description: safeString(4000).optional(),
  domain: domainSchema.optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  assignee: safeString(200).optional(),
  dueInDays: z.number().int().min(1).max(365).optional(),
  fromPlaybook: safeString(200).optional(),
});

const logDecisionPayload = z.object({
  decision: safeString(2000),
  context: safeString(4000).optional(),
  expectedOutcome: safeString(2000).optional(),
  domain: domainSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  alternatives: z.array(safeString(500)).max(10).optional(),
});

export const brainExecuteSchema = z.object({
  action: z.enum(["slack_alert", "email_digest", "create_task", "log_decision"]),
  organizationId: uuidSchema.optional(),
  payload: z.union([slackAlertPayload, emailDigestPayload, createTaskPayload, logDecisionPayload]),
}).strict();

export type BrainExecuteInput = z.infer<typeof brainExecuteSchema>;

// ── Copilot Chat ──────────────────────────────────────────────────────

export const copilotChatSchema = z.object({
  message: safeString(8000),
  conversationId: uuidSchema.optional(),
  organizationId: uuidSchema.optional(),
  context: z.record(z.unknown()).optional(),
}).strict();

// ── Org Members ───────────────────────────────────────────────────────

export const inviteMemberSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(["admin", "member", "viewer"]).optional(),
  organizationId: uuidSchema,
});

export const acceptInviteSchema = z.object({
  token: safeString(200),
});

// ── Connectors ────────────────────────────────────────────────────────

export const githubSetupSchema = z.object({
  organizationId: uuidSchema,
  installationId: z.number().int().positive().optional(),
  repositories: z.array(safeString(200)).max(100).optional(),
  accessToken: safeString(500).optional(),
});

export const githubSyncSchema = z.object({
  organizationId: uuidSchema,
  repositories: z.array(safeString(200)).max(100).optional(),
  syncType: z.enum(["full", "incremental"]).optional(),
});

// ── Generic validation helper ─────────────────────────────────────────

export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    ).join("; ");
    return { success: false, error: `Validation failed: ${errors}` };
  }
  return { success: true, data: result.data };
}
