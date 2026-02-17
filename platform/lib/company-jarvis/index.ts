/**
 * Company Jarvis — Entry Point
 *
 * Generates all synthetic data, feeds it through the brain analyzer,
 * and caches the result. Used by the seed script to populate the brain DB.
 */

import { generateSlackData } from './synthetic-slack';
import { generateHubSpotData } from './synthetic-hubspot';
import { generateGoogleDocsData } from './synthetic-google-docs';
import { generateCustomerData } from './synthetic-customers';
import { analyzeCompanyData, buildTrainingPacks, buildSignals } from './brain-analyzer';
import type { SlackData } from './types';
import type { HubSpotData } from './types';
import type { GoogleDocsData } from './types';
import type { CustomerData } from './types';
import type { CompanyJarvisAnalysis } from './types';

export type { SlackData, HubSpotData, GoogleDocsData, CustomerData, CompanyJarvisAnalysis } from './types';
export type { CompanyJarvisTrainingPack, CompanyJarvisSignal } from './brain-analyzer';
export { buildTrainingPacks, buildSignals } from './brain-analyzer';

// ─── Org ID — canonical value matches platform/lib/constants.ts ─────────────
// NOTE: This is duplicated here because seed scripts (scripts/) import from
// this file via relative paths and cannot resolve the @/lib/constants alias.
// Both values MUST stay in sync: platform/lib/constants.ts is the source of truth.

export const COMPANY_JARVIS_ORG_ID = '22222222-2222-4000-a000-222222222222';

// ─── Singleton Cache (survives across requests in dev/prod) ─────────────

let cachedSlack: SlackData | null = null;
let cachedHubspot: HubSpotData | null = null;
let cachedDocs: GoogleDocsData | null = null;
let cachedCustomers: CustomerData | null = null;
let cachedAnalysis: CompanyJarvisAnalysis | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export function getCompanyJarvisData(): {
  slack: SlackData;
  hubspot: HubSpotData;
  docs: GoogleDocsData;
  customers: CustomerData;
  analysis: CompanyJarvisAnalysis;
} {
  const now = Date.now();
  if (cachedSlack && cachedHubspot && cachedDocs && cachedCustomers && cachedAnalysis && (now - cacheTimestamp) < CACHE_TTL) {
    return { slack: cachedSlack, hubspot: cachedHubspot, docs: cachedDocs, customers: cachedCustomers, analysis: cachedAnalysis };
  }

  // Generate fresh data
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);

  console.log('[Company Jarvis] Generating synthetic data...');
  const t0 = Date.now();

  cachedSlack = generateSlackData(startDate);
  cachedHubspot = generateHubSpotData(startDate);
  cachedDocs = generateGoogleDocsData();
  cachedCustomers = generateCustomerData(cachedHubspot, startDate);
  cachedAnalysis = analyzeCompanyData(cachedSlack, cachedHubspot, cachedDocs, cachedCustomers, startDate);
  cacheTimestamp = now;

  const elapsed = Date.now() - t0;
  console.log(`[Company Jarvis] Data generated in ${elapsed}ms:`);
  console.log(`  Slack: ${cachedSlack.messages.length} messages across ${cachedSlack.channels.length} channels`);
  console.log(`  HubSpot: ${cachedHubspot.deals.length} deals, ${cachedHubspot.contacts.length} contacts, ${cachedHubspot.companies.length} companies`);
  console.log(`  Docs: ${cachedDocs.documents.length} documents`);
  console.log(`  Customers: ${cachedCustomers.accounts.length} accounts, ${cachedCustomers.tickets.length} tickets`);
  console.log(`  Insights: ${cachedAnalysis.insights.length} insights (${cachedAnalysis.insights.filter(i => i.severity === 'critical').length} critical)`);
  console.log(`  Reverse prompts: ${cachedAnalysis.reversePrompts.length}`);

  return { slack: cachedSlack, hubspot: cachedHubspot, docs: cachedDocs, customers: cachedCustomers, analysis: cachedAnalysis };
}

export function refreshCompanyJarvisData() {
  cacheTimestamp = 0;
  return getCompanyJarvisData();
}
