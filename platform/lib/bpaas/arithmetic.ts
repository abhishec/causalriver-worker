/**
 * arithmetic.ts — deterministic monetary arithmetic for BPaaS FSM COMPUTE state.
 *
 * Rules:
 * - All intermediate values computed in integer cents to avoid floating-point drift.
 * - Math.round() is used ONLY for final dollar output conversion.
 * - No LLM calls, no approximations, no async.
 */

/**
 * Computes prorated refund amount.
 * @example proratedAmount(1200, 7*30, 12*30) // ≈ 500 (7 months used of 12-month plan)
 */
export function proratedAmount(
  totalPaidDollars: number,
  daysUsed: number,
  totalDays: number
): number {
  const totalPaidCents = Math.round(totalPaidDollars * 100);
  const remainingCents = Math.round(totalPaidCents * (totalDays - daysUsed) / totalDays);
  return Math.round(remainingCents) / 100;
}

/**
 * Applies early termination fee.
 * @example applyEarlyTerminationFee(500, 10) === 450
 */
export function applyEarlyTerminationFee(
  remainingValue: number,
  feePct: number
): number {
  const cents = Math.round(remainingValue * 100);
  const feeCents = Math.round(cents * feePct / 100);
  return Math.round(cents - feeCents) / 100;
}

/**
 * Checks if invoice variance exceeds threshold.
 * IMPORTANT: 2.04% with threshold 2.0% → exceeds = true (boundary is strict >)
 * @example applyVarianceCheck(1000, 980, 2.0) → { exceeds: true, variance: 20, pct: 2.0408 }
 */
export function applyVarianceCheck(
  invoicedAmount: number,
  poAmount: number,
  thresholdPct: number
): { exceeds: boolean; variance: number; pct: number } {
  const varianceCents = Math.round(Math.abs(invoicedAmount - poAmount) * 100);
  const poCents = Math.round(poAmount * 100);
  const pct = (varianceCents / poCents) * 100;
  return {
    exceeds: pct > thresholdPct,
    variance: varianceCents / 100,
    pct: Math.round(pct * 10000) / 10000,
  };
}

/**
 * Applies sub-limit (rider or base) to claimed amount.
 * If riderLimit is provided it takes precedence over subLimit.
 */
export function applySubLimit(
  claimedAmount: number,
  subLimit: number,
  riderLimit?: number
): number {
  const effectiveLimitCents = Math.round((riderLimit ?? subLimit) * 100);
  const claimedCents = Math.round(claimedAmount * 100);
  return Math.min(claimedCents, effectiveLimitCents) / 100;
}

/**
 * Computes SLA credit (capped at capPct of invoice).
 * Credit = breaches × creditPctPerBreach% of invoice, capped at capPct% of invoice.
 */
export function computeSlaCredit(
  downtimeMins: number,
  slaMaxMins: number,
  invoiceAmount: number,
  creditPctPerBreach: number,
  capPct: number
): number {
  const breaches = Math.floor(downtimeMins / slaMaxMins);
  const invoiceCents = Math.round(invoiceAmount * 100);
  const rawCreditCents = Math.round(breaches * creditPctPerBreach / 100 * invoiceCents);
  const capCents = Math.round(capPct / 100 * invoiceCents);
  return Math.min(rawCreditCents, capCents) / 100;
}

/**
 * Computes gift card capacity check.
 * Returns whether incomingAmount fits within capacityLimit given currentBalance,
 * and how much overflows if it does not.
 */
export function computeGiftCardCapacity(
  currentBalance: number,
  incomingAmount: number,
  capacityLimit: number
): { fits: boolean; overflow: number } {
  const currentCents = Math.round(currentBalance * 100);
  const incomingCents = Math.round(incomingAmount * 100);
  const limitCents = Math.round(capacityLimit * 100);
  const totalCents = currentCents + incomingCents;
  return {
    fits: totalCents <= limitCents,
    overflow: Math.max(0, totalCents - limitCents) / 100,
  };
}

/**
 * Rounds tenure months up if within grace days of next full year.
 * @example roundTenureMonths(11, 30) === 12  (11 months within 30-day grace of 12-month year)
 * @example roundTenureMonths(10, 30) === 10  (10 months, 60 days away — outside grace)
 */
export function roundTenureMonths(months: number, graceDays: number = 30): number {
  const totalDays = Math.round(months * 30);
  const nextYearDays = Math.ceil(months / 12) * 12 * 30;
  if (nextYearDays - totalDays <= graceDays) {
    return Math.ceil(months / 12) * 12;
  }
  return months;
}

/**
 * Applies early payment discount if payment is within the discount window.
 * @example applyEarlyPaymentDiscount(1000, 2, 5, 10) === 980  (5 days before due, window=10)
 * @example applyEarlyPaymentDiscount(1000, 2, 15, 10) === 1000 (15 days before due, outside window)
 */
export function applyEarlyPaymentDiscount(
  amount: number,
  discountPct: number,
  daysUntilDue: number,
  windowDays: number
): number {
  if (daysUntilDue <= windowDays) {
    return Math.round(amount * 100 * (1 - discountPct / 100)) / 100;
  }
  return amount;
}

/**
 * Computes net price delta across item array (positive = charge, negative = refund).
 * @example netPriceDelta([{ originalPrice: 100, newPrice: 120 }, { originalPrice: 50, newPrice: 40 }]) === 10
 */
export function netPriceDelta(
  items: Array<{ originalPrice: number; newPrice: number }>
): number {
  const deltaCents = items.reduce((sum, item) => {
    return sum + Math.round((item.newPrice - item.originalPrice) * 100);
  }, 0);
  return deltaCents / 100;
}
