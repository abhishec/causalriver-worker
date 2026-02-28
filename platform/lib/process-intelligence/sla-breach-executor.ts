/**
 * SLA Breach Escalation Executor
 * Task 6: SLA Breach Detection → Quiet-Hours-Aware Escalation → Customer Notification
 *
 * Called from domain-executor.ts when:
 *   - processType === "sla_breach_escalation" AND currentState === "ESCALATE" (breach_confirmed)
 *   - processType === "sla_breach_escalation" AND currentState === "SCHEDULE_NOTIFY" (pre_breach_warning)
 *
 * Features:
 * - Quiet-hours detection respects customer timezone (handles overnight windows e.g. 22:00–08:00)
 * - Critical breaches bypass quiet hours — always immediate
 * - Multi-level escalation (L1 → L2 → L3) with time-gates between levels
 * - Internal Slack alert is always immediate (ops channel)
 * - Customer email is scheduled post-quiet-hours for non-critical breaches
 * - Jira SLA breach ticket auto-created with credit calculation
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const _ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY ?? process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? "";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SLABreachInput {
  breachType: "response_time" | "uptime" | "resolution_time" | "first_contact";
  customerName: string;
  customerId: string;
  /** e.g. "99.9% uptime" or "< 4hr response time" */
  contractedSLA: string;
  /** e.g. "98.2% uptime last 30 days" or "6.2hr avg response" */
  actualValue: string;
  breachSeverity: "minor" | "major" | "critical";
  /** IANA timezone string, e.g. "America/New_York". Defaults to "UTC". */
  customerTimezone?: string;
  escalationContacts: Array<{
    name: string;
    email?: string;
    slackUserId?: string;
    role: "account_manager" | "support_manager" | "vp_customer_success" | "cto";
    escalationLevel: 1 | 2 | 3;
  }>;
  /** 0–23 hour in customer timezone (e.g. 22 = 10PM). Defaults to 22. */
  quietHoursStart?: number;
  /** 0–23 hour in customer timezone (e.g. 8 = 8AM). Defaults to 8. */
  quietHoursEnd?: number;
  /** Internal ops Slack channel for immediate breach alerts */
  slackChannel?: string;
  /** Jira project key for SLA breach ticket */
  jiraProjectKey?: string;
  slaContractId?: string;
}

export interface SLABreachResult {
  breachAnalysis: string;
  creditCalculation: {
    creditDue: boolean;
    estimatedCredit: string;
    basis: string;
  };
  escalationPlan: Array<{
    level: number;
    contacts: string[];
    channel: "slack" | "email" | "both";
    immediateOrDelayed: "immediate" | "delayed";
    delayReason?: string;
    message: string;
  }>;
  customerNotification: {
    subject: string;
    body: string;
    sendImmediately: boolean;
    /** ISO timestamp — only set when delayed due to quiet hours */
    scheduledFor?: string;
  };
  internalActions: string[];
  quietHoursActive: boolean;
  quietHoursWindow?: string;
}

// ── Quiet-hours detection ────────────────────────────────────────────────────

interface QuietHoursCheck {
  isQuietHours: boolean;
  currentHour: number;
  nextAllowedTime: Date;
}

/**
 * Determine whether the current moment falls within the customer's quiet-hours window.
 * Handles both same-day windows (e.g. 14:00–18:00) and overnight windows (e.g. 22:00–08:00).
 */
function checkQuietHours(
  customerTimezone: string,
  quietStart: number,
  quietEnd: number
): QuietHoursCheck {
  const now = new Date();

  // Resolve current hour in customer timezone using Intl.DateTimeFormat
  let currentHour = now.getUTCHours(); // safe fallback
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: customerTimezone,
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hourPart = parts.find((p) => p.type === "hour");
    if (hourPart) {
      const parsed = parseInt(hourPart.value, 10);
      // Intl returns "24" for midnight in some locales — normalise to 0
      if (!isNaN(parsed)) currentHour = parsed === 24 ? 0 : parsed;
    }
  } catch {
    logger.warn("[SLABreach] Timezone resolution failed, falling back to UTC", {
      customerTimezone,
    });
  }

  // Determine whether we are inside the quiet window
  let isQuiet = false;
  if (quietStart < quietEnd) {
    // Same-day window: e.g. 14 ≤ hour < 18
    isQuiet = currentHour >= quietStart && currentHour < quietEnd;
  } else {
    // Overnight window: e.g. hour ≥ 22 OR hour < 8
    isQuiet = currentHour >= quietStart || currentHour < quietEnd;
  }

  // Calculate approximate wall-clock time when the quiet window ends
  const nextAllowed = new Date(now);
  if (isQuiet) {
    const hoursUntilEnd =
      quietEnd > currentHour ? quietEnd - currentHour : 24 - currentHour + quietEnd;
    nextAllowed.setHours(nextAllowed.getHours() + hoursUntilEnd, 0, 0, 0);
  }

  return { isQuietHours: isQuiet, currentHour, nextAllowedTime: nextAllowed };
}

// ── Prompt builder ───────────────────────────────────────────────────────────

function buildAnalysisPrompt(
  input: SLABreachInput,
  isQuietHours: boolean,
  currentHour: number,
  nextAllowed: Date
): string {
  const byLevel = [...input.escalationContacts]
    .sort((a, b) => a.escalationLevel - b.escalationLevel)
    .map(
      (c) =>
        `L${c.escalationLevel}: ${c.name} (${c.role})` +
        (c.email ? ` <${c.email}>` : "") +
        (c.slackUserId ? ` [Slack: ${c.slackUserId}]` : "")
    )
    .join("\n");

  const isCritical = input.breachSeverity === "critical";

  return `You are a Customer Success Operations AI analysing an SLA breach.

**SLA Breach Details**
Customer: ${input.customerName} (ID: ${input.customerId})
Breach Type: ${input.breachType.replace(/_/g, " ")}
Contracted SLA: ${input.contractedSLA}
Actual Performance: ${input.actualValue}
Severity: ${input.breachSeverity.toUpperCase()}
Customer Timezone: ${input.customerTimezone ?? "UTC"} (Current hour: ${currentHour}:00)
Quiet Hours Window: ${input.quietHoursStart ?? 22}:00 – ${input.quietHoursEnd ?? 8}:00
Currently in Quiet Hours: ${isQuietHours ? "YES" : "NO"}
${isQuietHours ? `Next notification window opens: ${nextAllowed.toISOString()}` : ""}

**Escalation Contacts**
${byLevel}

Generate a complete SLA breach response plan.
${isCritical ? "⚠️  CRITICAL SEVERITY — bypass quiet hours for ALL escalations (internal AND customer)." : "Respect quiet hours for customer-facing notifications. Internal ops alerts are always immediate."}

Respond in EXACT JSON wrapped in \`\`\`json ... \`\`\`:
\`\`\`json
{
  "breachAnalysis": "Detailed analysis of the breach, its business impact, and urgency",
  "creditCalculation": {
    "creditDue": true,
    "estimatedCredit": "5% of monthly invoice (~$2,500)",
    "basis": "Contractual uptime SLA of 99.9% exceeded by 1.7% over 30 days"
  },
  "escalationPlan": [
    {
      "level": 1,
      "contacts": ["John Smith (Account Manager)"],
      "channel": "slack",
      "immediateOrDelayed": "${isQuietHours && !isCritical ? "delayed" : "immediate"}",
      "delayReason": "${isQuietHours && !isCritical ? `Quiet hours active until ${nextAllowed.toLocaleTimeString()}` : ""}",
      "message": "Specific Slack message to send to L1 contact"
    },
    {
      "level": 2,
      "contacts": ["Support Manager"],
      "channel": "both",
      "immediateOrDelayed": "${isCritical ? "immediate" : "delayed"}",
      "delayReason": "${!isCritical ? "L2 only if L1 does not acknowledge within 2 hours" : ""}",
      "message": "L2 escalation message with urgency context"
    }
  ],
  "customerNotification": {
    "subject": "Service Level Update — ${input.customerName}",
    "body": "Professional multi-paragraph email: acknowledge the breach, state the impact, explain root cause (brief), describe remediation steps, and specify the credit being applied. Tone: accountable and solution-focused, not defensive.",
    "sendImmediately": ${!isQuietHours || isCritical},
    "scheduledFor": ${isQuietHours && !isCritical ? `"${nextAllowed.toISOString()}"` : "null"}
  },
  "internalActions": [
    "Create Jira P${isCritical ? "0" : input.breachSeverity === "major" ? "1" : "2"} SLA breach ticket",
    "Schedule customer call within 24 hours",
    "Prepare credit memo for ${input.customerName}",
    "Notify finance team of credit obligation"
  ]
}
\`\`\``;
}

// ── Response parser ──────────────────────────────────────────────────────────

function parseAnalysisResponse(
  text: string,
  input: SLABreachInput,
  isQuietHours: boolean,
  nextAllowed: Date
): SLABreachResult {
  try {
    const match = text.match(/```json\n([\s\S]*?)\n```/);
    if (match) {
      const parsed = JSON.parse(match[1]) as Omit<SLABreachResult, "quietHoursActive" | "quietHoursWindow">;
      return {
        ...parsed,
        quietHoursActive: isQuietHours,
        quietHoursWindow: isQuietHours
          ? `${input.quietHoursStart ?? 22}:00–${input.quietHoursEnd ?? 8}:00 ${input.customerTimezone ?? "UTC"} (next window: ${nextAllowed.toLocaleTimeString()})`
          : undefined,
      };
    }
  } catch (err) {
    logger.warn("[SLABreach] JSON parse failed — using minimal fallback", { err });
  }

  // Minimal fallback (should not normally be reached)
  return {
    breachAnalysis: `SLA breach detected: contracted ${input.contractedSLA} vs actual ${input.actualValue}`,
    creditCalculation: { creditDue: true, estimatedCredit: "TBD", basis: input.contractedSLA },
    escalationPlan: [],
    customerNotification: {
      subject: `Service Level Update — ${input.customerName}`,
      body: `Dear ${input.customerName} team,\n\nWe have identified a service level issue affecting your account. Our team is actively investigating and will provide a full update shortly.\n\nSincerely,\nCustomer Success Team`,
      sendImmediately: !isQuietHours,
      scheduledFor: isQuietHours ? nextAllowed.toISOString() : undefined,
    },
    internalActions: ["Review SLA breach details", "Contact customer within 24 hours"],
    quietHoursActive: isQuietHours,
  };
}

// ── Write-back enqueuer ──────────────────────────────────────────────────────

async function enqueueSLAWritebacks(
  supabase: SupabaseClient,
  organizationId: string,
  jobId: string,
  result: SLABreachResult,
  input: SLABreachInput,
  isQuietHours: boolean,
  nextAllowed: Date
): Promise<void> {
  const isCritical = input.breachSeverity === "critical";
  const writebacks: Array<PromiseLike<unknown>> = [];

  // ── 1. Internal Slack alert (always immediate — ops channel never waits for quiet hours) ──
  if (input.slackChannel) {
    const quietNote =
      isQuietHours && !isCritical
        ? `\n⏸️ _Customer notifications scheduled for ${nextAllowed.toLocaleTimeString()} (${input.customerTimezone ?? "UTC"}) — quiet hours active_`
        : "";

    const creditLine = result.creditCalculation.creditDue
      ? `✅ ${result.creditCalculation.estimatedCredit}`
      : "❌ None applicable";

    writebacks.push(
      supabase.from("writeback_queue").insert({
        organization_id: organizationId,
        job_id: jobId,
        connector_type: "slack",
        action_type: "slack_post_message",
        action_payload: {
          channel: input.slackChannel,
          text: [
            `🚨 *SLA Breach Alert: ${input.customerName}*`,
            "",
            `*Breach:* ${input.breachType.replace(/_/g, " ").toUpperCase()}`,
            `*Contracted:* ${input.contractedSLA}`,
            `*Actual:* ${input.actualValue}`,
            `*Severity:* ${input.breachSeverity.toUpperCase()}`,
            "",
            `*Credit Due:* ${creditLine}`,
            "",
            ...result.internalActions.slice(0, 3).map((a) => `• ${a}`),
            quietNote,
          ]
            .filter((l) => l !== "")
            .join("\n"),
        },
        status: "pending",
      })
    );
  }

  // ── 2. Per-contact Slack DMs (L1 immediate; L2/L3 per escalation plan) ──
  for (const plan of result.escalationPlan) {
    if (plan.channel !== "email") {
      for (const contactName of plan.contacts) {
        const contact = input.escalationContacts.find((c) => contactName.includes(c.name));
        if (!contact?.slackUserId) continue;

        const shouldDelay = plan.immediateOrDelayed === "delayed";
        writebacks.push(
          supabase.from("writeback_queue").insert({
            organization_id: organizationId,
            job_id: jobId,
            connector_type: "slack",
            action_type: "slack_post_message",
            action_payload: {
              channel: contact.slackUserId, // DM via user ID
              text: plan.message,
              scheduledFor: shouldDelay ? nextAllowed.toISOString() : null,
              metadata: {
                escalationLevel: plan.level,
                customerId: input.customerId,
                breachType: input.breachType,
                quietHoursRespected: shouldDelay,
              },
            },
            status: shouldDelay ? "scheduled" : "pending",
          })
        );
      }
    }
  }

  // ── 3. Customer email notification (respects quiet hours for non-critical) ──
  const emailDelay = isQuietHours && !isCritical;
  writebacks.push(
    supabase.from("writeback_queue").insert({
      organization_id: organizationId,
      job_id: jobId,
      connector_type: "email",
      action_type: "email_send",
      action_payload: {
        to: `customer-ops@notification`, // resolved by email connector via customerId
        subject: result.customerNotification.subject,
        body: result.customerNotification.body,
        scheduledFor: emailDelay ? nextAllowed.toISOString() : null,
        metadata: {
          customerId: input.customerId,
          customerName: input.customerName,
          breachType: input.breachType,
          slaContractId: input.slaContractId ?? null,
          quietHoursRespected: emailDelay,
        },
      },
      status: emailDelay ? "scheduled" : "pending",
    })
  );

  // ── 4. Jira SLA breach ticket ──
  if (input.jiraProjectKey) {
    const isCrit = input.breachSeverity === "critical";
    const priority = isCrit ? "P0" : input.breachSeverity === "major" ? "P1" : "P2";
    writebacks.push(
      supabase.from("writeback_queue").insert({
        organization_id: organizationId,
        job_id: jobId,
        connector_type: "jira",
        action_type: "jira_create_issue",
        action_payload: {
          project: input.jiraProjectKey,
          issuetype: "Bug",
          summary: `SLA Breach [${input.breachSeverity.toUpperCase()}]: ${input.customerName} — ${input.breachType.replace(/_/g, " ")}`,
          description: [
            `**Customer:** ${input.customerName} (ID: ${input.customerId})`,
            `**Contracted SLA:** ${input.contractedSLA}`,
            `**Actual Performance:** ${input.actualValue}`,
            `**Severity:** ${input.breachSeverity.toUpperCase()}`,
            "",
            `**Breach Analysis:**`,
            result.breachAnalysis,
            "",
            `**Credit Obligation:** ${result.creditCalculation.creditDue ? result.creditCalculation.estimatedCredit : "None"}`,
            `**Credit Basis:** ${result.creditCalculation.basis}`,
            "",
            `**Internal Actions:**`,
            ...result.internalActions.map((a) => `- ${a}`),
          ].join("\n"),
          priority,
          labels: ["sla-breach", input.breachSeverity, "customer-impact"],
        },
        status: "pending",
      })
    );
  }

  try {
    await Promise.all(writebacks.map((p) => Promise.resolve(p).catch((e: unknown) => e)));
    logger.warn("[SLABreach] All write-backs enqueued", {
      jobId,
      count: writebacks.length,
      quietHoursActive: isQuietHours,
    });
  } catch (err) {
    logger.warn("[SLABreach] Write-back enqueue error (non-fatal)", { err });
  }
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function executeSLABreach(
  supabase: SupabaseClient,
  organizationId: string,
  input: SLABreachInput,
  jobId: string
): Promise<SLABreachResult> {
  const timezone = input.customerTimezone ?? "UTC";
  const quietStart = input.quietHoursStart ?? 22;
  const quietEnd = input.quietHoursEnd ?? 8;

  // Step 1: Determine quiet-hours status
  const { isQuietHours, currentHour, nextAllowedTime } = checkQuietHours(
    timezone,
    quietStart,
    quietEnd
  );

  logger.warn("[SLABreach] Starting analysis", {
    jobId,
    customer: input.customerName,
    severity: input.breachSeverity,
    isQuietHours,
    currentHour,
  });

  // Step 2: AI analysis + escalation plan
  const client = new Anthropic({ apiKey: _ANTHROPIC_API_KEY });
  const prompt = buildAnalysisPrompt(input, isQuietHours, currentHour, nextAllowedTime);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2500,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText =
    response.content[0].type === "text" ? response.content[0].text : "";

  const result = parseAnalysisResponse(responseText, input, isQuietHours, nextAllowedTime);

  // Step 3: Enqueue write-backs
  await enqueueSLAWritebacks(
    supabase,
    organizationId,
    jobId,
    result,
    input,
    isQuietHours,
    nextAllowedTime
  );

  return result;
}
