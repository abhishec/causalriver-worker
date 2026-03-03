/**
 * time-scheduler.ts — deterministic scheduling helpers for Process Engine FSM SCHEDULE_NOTIFY state.
 *
 * Rules:
 * - No LLM calls, no approximations, no randomness.
 * - Timezone-aware operations use Intl.DateTimeFormat (built-in, no dependencies).
 * - All functions accept an optional `now` parameter for deterministic testing.
 */

/**
 * Returns the current hour (0–23) in the given IANA timezone.
 */
export function getLocalHour(timezone: string, now?: Date): number {
  const d = now ?? new Date();
  return parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(d),
    10
  );
}

/**
 * Checks if a notification can be sent now given quiet hours in recipient's timezone.
 * Supports wrap-midnight ranges (e.g., quietHoursStart=22, quietHoursEnd=6).
 *
 * @example canSendNow('America/New_York', 22, 6) at 9:45 PM ET
 *          → { allowed: false, scheduleAt: 6 AM tomorrow ET }
 * @example canSendNow('America/New_York', 22, 6) at 10 AM ET
 *          → { allowed: true }
 */
export function canSendNow(
  timezone: string,
  quietHoursStart: number,
  quietHoursEnd: number,
  now?: Date
): { allowed: boolean; scheduleAt?: Date } {
  const currentHour = getLocalHour(timezone, now);

  const inQuietHours =
    quietHoursStart < quietHoursEnd
      ? currentHour >= quietHoursStart && currentHour < quietHoursEnd
      : currentHour >= quietHoursStart || currentHour < quietHoursEnd; // wraps midnight

  if (!inQuietHours) return { allowed: true };

  // Advance hour-by-hour until local hour matches quietHoursEnd in target timezone.
  const scheduleAt = new Date(now ?? new Date());
  scheduleAt.setHours(scheduleAt.getHours() + 1);
  scheduleAt.setMinutes(0, 0, 0);

  let attempts = 0;
  while (getLocalHour(timezone, scheduleAt) !== quietHoursEnd && attempts < 24) {
    scheduleAt.setHours(scheduleAt.getHours() + 1);
    scheduleAt.setMinutes(0, 0, 0);
    attempts++;
  }
  scheduleAt.setMinutes(0, 0, 0);

  return { allowed: false, scheduleAt };
}

/**
 * Returns true if the deadline (plus optional grace period) has passed.
 * @example isDeadlinePassed(yesterday, 0) === true
 * @example isDeadlinePassed(yesterday, 2) === false  (still within 2-day grace)
 */
export function isDeadlinePassed(
  deadline: Date,
  gracePeriodDays: number = 0,
  now?: Date
): boolean {
  const effective = new Date(deadline.getTime() + gracePeriodDays * 86400000);
  return (now ?? new Date()) > effective;
}

/**
 * Returns true if eventDate occurred within the last windowDays days.
 * @example isWithinWindow(threeDaysAgo, 7) === true
 * @example isWithinWindow(tenDaysAgo, 7) === false
 */
export function isWithinWindow(
  eventDate: Date,
  windowDays: number,
  now?: Date
): boolean {
  const elapsed = (now ?? new Date()).getTime() - eventDate.getTime();
  return elapsed <= windowDays * 86400000;
}

export type RemediationType = 'kyc' | 'pep' | 'compliance';

const REMEDIATION_DAYS: Record<RemediationType, number> = {
  kyc: 30,
  pep: 14,
  compliance: 30,
};

/**
 * Computes the remediation deadline for a given gap type.
 * kyc/compliance → 30 days, pep → 14 days.
 */
export function computeRemediationDeadline(
  gapType: RemediationType,
  fromDate?: Date
): Date {
  const base = fromDate ?? new Date();
  return new Date(base.getTime() + REMEDIATION_DAYS[gapType] * 86400000);
}

/**
 * High-level helper: decide whether to send a notification now or schedule it.
 * Uses canSendNow() internally and returns a human-readable reason.
 */
export function scheduleIfQuietHours(
  notificationType: string,
  recipientTimezone: string,
  quietPrefs: { start: number; end: number },
  now?: Date
): { sendNow: boolean; scheduledFor?: Date; reason: string } {
  const result = canSendNow(
    recipientTimezone,
    quietPrefs.start,
    quietPrefs.end,
    now
  );

  if (result.allowed) {
    return {
      sendNow: true,
      reason: `${notificationType}: outside quiet hours, sending immediately`,
    };
  }

  return {
    sendNow: false,
    scheduledFor: result.scheduleAt,
    reason: `${notificationType}: in quiet hours (${quietPrefs.start}:00-${quietPrefs.end}:00 ${recipientTimezone}), scheduled for ${result.scheduleAt?.toISOString()}`,
  };
}
