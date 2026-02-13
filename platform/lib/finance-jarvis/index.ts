/**
 * Finance Jarvis — Entry Point
 *
 * Generates all synthetic data, feeds it through the brain analyzer,
 * and caches the result for the dashboard to consume.
 */

import { generateXeroData, type XeroData } from "./synthetic-xero";
import { generateVolopayData, type VolopayData } from "./synthetic-volopay";
import { analyzeFinanceData, type FinanceJarvisAnalysis } from "./brain-analyzer";

export type { XeroData } from "./synthetic-xero";
export type { VolopayData } from "./synthetic-volopay";
export type { FinanceJarvisAnalysis, FinanceInsight, CashFlowForecast, SpendBreakdown, DepartmentRiskScore, RunwayProjection, CausalRelationship, InsightSeverity, InsightCategory, ReportSections, OverspendingItem, AnomalyItem, ActionItem, RiskItem, CausalChain, UnitEconomics, BurnRateAnalysis, EfficiencyMetrics, HealthScorecard, HealthRating } from "./brain-analyzer";

// ─── Singleton Cache (survives across requests in dev/prod) ─────────────

let cachedXero: XeroData | null = null;
let cachedVolopay: VolopayData | null = null;
let cachedAnalysis: FinanceJarvisAnalysis | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export function getFinanceData(): { xero: XeroData; volopay: VolopayData; analysis: FinanceJarvisAnalysis } {
  const now = Date.now();
  if (cachedXero && cachedVolopay && cachedAnalysis && (now - cacheTimestamp) < CACHE_TTL) {
    return { xero: cachedXero, volopay: cachedVolopay, analysis: cachedAnalysis };
  }

  // Generate fresh data
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);

  cachedXero = generateXeroData(startDate);
  cachedVolopay = generateVolopayData(startDate);
  cachedAnalysis = analyzeFinanceData(cachedXero, cachedVolopay);
  cacheTimestamp = now;

  return { xero: cachedXero, volopay: cachedVolopay, analysis: cachedAnalysis };
}

export function refreshFinanceData(): { xero: XeroData; volopay: VolopayData; analysis: FinanceJarvisAnalysis } {
  cacheTimestamp = 0; // Force regeneration
  return getFinanceData();
}
