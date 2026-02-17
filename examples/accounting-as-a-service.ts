/**
 * Accounting as a Service (AaaS) — Integration Examples
 * ======================================================
 *
 * Shows how to use the 6 AaaS agents with real Xero GL data:
 *
 *   Example 1: Daily Bookkeeping Pipeline
 *   Example 2: Month-End Close Workflow
 *   Example 3: Financial Statement Generation
 *   Example 4: Tax Compliance Check
 *   Example 5: Audit Preparation
 *   Example 6: Full AaaS Workflow (all 5 above, chained)
 *
 * The 6 agents compose the 7 V7 accounting cognitive primitives:
 *   - document-comprehend    → Parse invoices, receipts, bank statements
 *   - completeness-check     → Verify filing/audit readiness
 *   - rule-apply             → Apply GAAP/IFRS/SFRS jurisdiction rules
 *   - cross-validate         → Reconcile accounting equation
 *   - statement-synthesize   → Generate P&L, BS, CF
 *   - jurisdiction-comply    → Multi-jurisdiction tax compliance
 *   - confidence-triage      → Auto-post vs flag vs escalate
 *
 * @packageDocumentation
 */

import {
  brainBookkeeperAgent,
  brainReconcilerAgent,
  brainStatementGeneratorAgent,
  brainTaxComplianceAgent,
  brainAuditPreparerAgent,
  brainAnomalyDetectiveAgent,
  registerAccountingAgents,
  type GLTransaction,
} from '@nexus-ai/memory-stack';

// ============================================================================
// EXAMPLE 1: DAILY BOOKKEEPING PIPELINE
// ============================================================================

/**
 * Process daily bank transactions through the brain-bookkeeper agent.
 *
 * Steps:
 * 1. Parse uploaded GL transactions
 * 2. Classify accounts (revenue/expense/asset/liability/equity/bank)
 * 3. Create double-entry journal entries
 * 4. Triage: auto-post high-confidence, flag medium, escalate low
 * 5. Detect anomalies (large amounts, weekend transactions, unclassified)
 */
async function dailyBookkeepingPipeline(transactions: GLTransaction[]) {
  console.log('=== DAILY BOOKKEEPING PIPELINE ===');
  console.log(`Processing ${transactions.length} transactions...\n`);

  const result = await brainBookkeeperAgent.execute(
    { transactions, jurisdiction: 'SG' },
    {} as any, // In production, use real AgentExecutionContext
  );

  // Report triage
  console.log('TRIAGE REPORT:');
  console.log(`  Auto-posted:  ${result.triageReport.autoPosted} entries (confidence >= 80%)`);
  console.log(`  Flagged:      ${result.triageReport.flagged} entries (confidence 50-80%)`);
  console.log(`  Escalated:    ${result.triageReport.escalated} entries (confidence < 50%)`);

  // Double-entry verification
  console.log('\nDOUBLE-ENTRY CHECK:');
  console.log(`  Total Debits:  $${result.doubleEntryCheck.totalDebits.toFixed(2)}`);
  console.log(`  Total Credits: $${result.doubleEntryCheck.totalCredits.toFixed(2)}`);
  console.log(`  Balanced: ${result.doubleEntryCheck.balanced ? 'YES' : 'NO — VARIANCE: $' + result.doubleEntryCheck.variance.toFixed(2)}`);

  // Account classification summary
  const byType = result.categorizedAccounts.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('\nACCOUNT CLASSIFICATION:');
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count} accounts`);
  }

  // Anomalies
  if (result.anomalies.length > 0) {
    console.log(`\nANOMALIES DETECTED: ${result.anomalies.length}`);
    for (const anomaly of result.anomalies.slice(0, 5)) {
      console.log(`  [${anomaly.severity.toUpperCase()}] ${anomaly.reason}`);
    }
  }

  return result;
}

// ============================================================================
// EXAMPLE 2: MONTH-END CLOSE WORKFLOW
// ============================================================================

/**
 * Run month-end reconciliation across all accounts.
 *
 * Steps:
 * 1. Filter transactions for the period
 * 2. Reconcile each account (opening → transactions → closing)
 * 3. Build trial balance (total debits = total credits)
 * 4. Check completeness (all required categories present)
 * 5. Generate adjusting entries for critical variances
 */
async function monthEndCloseWorkflow(transactions: GLTransaction[], period: { from: string; to: string }) {
  console.log('=== MONTH-END CLOSE WORKFLOW ===');
  console.log(`Period: ${period.from} to ${period.to}\n`);

  const result = await brainReconcilerAgent.execute(
    { transactions, period, jurisdiction: 'SG' },
    {} as any,
  );

  // Status
  console.log(`STATUS: ${result.monthEndStatus.toUpperCase()}`);

  // Reconciliation summary
  const reconciled = result.reconciliations.filter(r => r.status === 'reconciled').length;
  const variance = result.reconciliations.filter(r => r.status === 'variance').length;
  const critical = result.reconciliations.filter(r => r.status === 'critical').length;
  console.log(`\nRECONCILIATION: ${result.reconciliations.length} accounts`);
  console.log(`  Reconciled: ${reconciled}`);
  console.log(`  Variance:   ${variance}`);
  console.log(`  Critical:   ${critical}`);

  // Trial balance
  console.log(`\nTRIAL BALANCE:`);
  console.log(`  Total Debits:  $${result.trialBalance.totalDebits.toFixed(2)}`);
  console.log(`  Total Credits: $${result.trialBalance.totalCredits.toFixed(2)}`);
  console.log(`  Balanced: ${result.trialBalance.balanced ? 'YES' : 'NO'}`);

  // Completeness
  console.log(`\nCOMPLETENESS: ${(result.completeness.score * 100).toFixed(0)}%`);
  if (result.completeness.missingCategories.length > 0) {
    console.log(`  Missing: ${result.completeness.missingCategories.join(', ')}`);
  }

  // Adjusting entries
  if (result.adjustingEntries.length > 0) {
    console.log(`\nADJUSTING ENTRIES NEEDED: ${result.adjustingEntries.length}`);
    for (const entry of result.adjustingEntries) {
      console.log(`  ${entry.description}`);
    }
  }

  return result;
}

// ============================================================================
// EXAMPLE 3: FINANCIAL STATEMENT GENERATION
// ============================================================================

/**
 * Generate P&L, Balance Sheet, and Cash Flow from GL data.
 *
 * Steps:
 * 1. Check completeness
 * 2. Apply jurisdiction-specific accounting rules
 * 3. Aggregate by account type (revenue, COGS, OpEx, etc.)
 * 4. Build P&L (revenue → gross profit → operating profit → net profit)
 * 5. Build Balance Sheet (assets = liabilities + equity)
 * 6. Build Cash Flow summary
 * 7. Compute key financial ratios
 */
async function financialStatementGeneration(transactions: GLTransaction[], period: { from: string; to: string }) {
  console.log('=== FINANCIAL STATEMENT GENERATION ===');
  console.log(`Period: ${period.from} to ${period.to}\n`);

  const result = await brainStatementGeneratorAgent.execute(
    { transactions, period, jurisdiction: 'SG' },
    {} as any,
  );

  // P&L Summary
  const pnl = result.profitAndLoss;
  console.log('PROFIT & LOSS:');
  console.log(`  Revenue:          $${pnl.totalRevenue.toFixed(2)}`);
  console.log(`  Cost of Sales:    $${pnl.totalCostOfSales.toFixed(2)}`);
  console.log(`  Gross Profit:     $${pnl.grossProfit.toFixed(2)} (${pnl.grossMarginPercent.toFixed(1)}%)`);
  console.log(`  Operating Exp:    $${pnl.totalOperatingExpenses.toFixed(2)}`);
  console.log(`  Operating Profit: $${pnl.operatingProfit.toFixed(2)}`);
  console.log(`  Net Profit:       $${pnl.netProfit.toFixed(2)} (${pnl.netMarginPercent.toFixed(1)}%)`);

  // Balance Sheet
  const bs = result.balanceSheet;
  console.log('\nBALANCE SHEET:');
  console.log(`  Total Assets:      $${bs.totalAssets.toFixed(2)}`);
  console.log(`  Total Liabilities: $${bs.totalLiabilities.toFixed(2)}`);
  console.log(`  Total Equity:      $${bs.totalEquity.toFixed(2)}`);
  console.log(`  Balanced: ${bs.balanced ? 'YES' : 'NO'}`);

  // Key Ratios
  const ratios = result.keyRatios;
  console.log('\nKEY RATIOS:');
  console.log(`  Current Ratio:   ${ratios.currentRatio.toFixed(2)}`);
  console.log(`  Debt/Equity:     ${ratios.debtToEquity.toFixed(2)}`);
  console.log(`  Gross Margin:    ${ratios.grossMargin.toFixed(1)}%`);
  console.log(`  Net Margin:      ${ratios.netMargin.toFixed(1)}%`);
  console.log(`  Monthly Burn:    $${ratios.burnRate.toFixed(2)}`);
  console.log(`  Runway:          ${ratios.runwayMonths.toFixed(1)} months`);

  return result;
}

// ============================================================================
// EXAMPLE 4: TAX COMPLIANCE CHECK
// ============================================================================

/**
 * Run tax compliance for a specific jurisdiction.
 */
async function taxComplianceCheck(transactions: GLTransaction[], period: { from: string; to: string }, jurisdiction: string) {
  console.log(`=== TAX COMPLIANCE CHECK (${jurisdiction}) ===`);
  console.log(`Period: ${period.from} to ${period.to}\n`);

  const result = await brainTaxComplianceAgent.execute(
    { transactions, period, jurisdiction },
    {} as any,
  );

  // Tax computation
  const tax = result.taxComputation;
  console.log('TAX COMPUTATION:');
  console.log(`  Jurisdiction:    ${tax.jurisdiction} (${tax.accountingStandard})`);
  console.log(`  Taxable Income:  $${tax.taxableIncome.toFixed(2)}`);
  console.log(`  Tax Rate:        ${(tax.corporateTaxRate * 100).toFixed(1)}%`);
  console.log(`  Estimated Tax:   $${tax.estimatedTax.toFixed(2)}`);

  // GST
  const gst = result.gstReturn;
  console.log('\nGST RETURN:');
  console.log(`  Output Tax:      $${gst.outputTax.toFixed(2)}`);
  console.log(`  Input Tax:       $${gst.inputTax.toFixed(2)}`);
  console.log(`  Net GST:         $${gst.netGST.toFixed(2)}`);

  // Filing checklist
  console.log('\nFILING CHECKLIST:');
  for (const form of result.filingChecklist) {
    console.log(`  [${form.status === 'ready' ? 'READY' : 'INCOMPLETE'}] ${form.form}`);
  }

  console.log(`\nCOMPLIANCE SCORE: ${(result.complianceScore * 100).toFixed(0)}%`);

  return result;
}

// ============================================================================
// EXAMPLE 5: AUDIT PREPARATION
// ============================================================================

/**
 * Prepare for external audit with workpapers and risk assessment.
 */
async function auditPreparation(transactions: GLTransaction[], period: { from: string; to: string }) {
  console.log('=== AUDIT PREPARATION ===');
  console.log(`Period: ${period.from} to ${period.to}\n`);

  const result = await brainAuditPreparerAgent.execute(
    { transactions, period, jurisdiction: 'SG' },
    {} as any,
  );

  // Readiness
  console.log(`AUDIT READINESS: ${result.auditReadiness.rating.toUpperCase()} (${(result.auditReadiness.overallScore * 100).toFixed(0)}%)`);

  // Materiality
  const mat = result.materialityAnalysis;
  console.log('\nMATERIALITY:');
  console.log(`  Overall:     $${mat.overallMateriality.toFixed(2)}`);
  console.log(`  Performance: $${mat.performanceMateriality.toFixed(2)}`);
  console.log(`  Trivial:     $${mat.trivialThreshold.toFixed(2)}`);
  console.log(`  Items above: ${mat.itemsAboveMateriality}`);

  // Workpapers
  console.log(`\nWORKPAPERS: ${result.workpapers.length}`);
  for (const wp of result.workpapers) {
    console.log(`  ${wp.area}: ${wp.summary} — ${wp.conclusion}`);
  }

  // Risk areas
  if (result.riskAreas.length > 0) {
    console.log(`\nRISK AREAS: ${result.riskAreas.length}`);
    for (const risk of result.riskAreas) {
      console.log(`  [${risk.riskLevel.toUpperCase()}] ${risk.area}: ${risk.description}`);
    }
  }

  return result;
}

// ============================================================================
// EXAMPLE 6: FULL AaaS WORKFLOW
// ============================================================================

/**
 * End-to-end Accounting as a Service workflow.
 *
 * Pipeline: bookkeeping → reconciliation → statements → tax → audit → anomaly detection
 */
async function fullAaaSWorkflow(transactions: GLTransaction[]) {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  ACCOUNTING AS A SERVICE — FULL WORKFLOW     ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const period = { from: '2024-01-01', to: '2024-03-31' };
  const jurisdiction = 'SG';

  // Phase 1: Bookkeeping
  console.log('▸ Phase 1: Daily Bookkeeping...');
  const bookkeeping = await dailyBookkeepingPipeline(transactions);

  // Phase 2: Reconciliation
  console.log('\n▸ Phase 2: Month-End Close...');
  const reconciliation = await monthEndCloseWorkflow(transactions, period);

  // Phase 3: Financial Statements
  console.log('\n▸ Phase 3: Financial Statements...');
  const statements = await financialStatementGeneration(transactions, period);

  // Phase 4: Tax Compliance
  console.log('\n▸ Phase 4: Tax Compliance...');
  const tax = await taxComplianceCheck(transactions, period, jurisdiction);

  // Phase 5: Audit Preparation
  console.log('\n▸ Phase 5: Audit Preparation...');
  const audit = await auditPreparation(transactions, period);

  // Phase 6: Anomaly Detection
  console.log('\n▸ Phase 6: Anomaly Detection...');
  const anomaly = await brainAnomalyDetectiveAgent.execute(
    { transactions, sensitivityLevel: 'medium' },
    {} as any,
  );

  // Summary
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  EXECUTIVE SUMMARY                           ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  Transactions:    ${transactions.length}`);
  console.log(`  Journal Entries: ${bookkeeping.journalEntries.length}`);
  console.log(`  Accounts:        ${bookkeeping.categorizedAccounts.length}`);
  console.log(`  Double-Entry:    ${bookkeeping.doubleEntryCheck.balanced ? 'BALANCED' : 'UNBALANCED'}`);
  console.log(`  Month-End:       ${reconciliation.monthEndStatus}`);
  console.log(`  Revenue:         $${statements.profitAndLoss.totalRevenue.toFixed(2)}`);
  console.log(`  Net Profit:      $${statements.profitAndLoss.netProfit.toFixed(2)}`);
  console.log(`  Runway:          ${statements.keyRatios.runwayMonths.toFixed(1)} months`);
  console.log(`  Tax Due:         $${tax.taxComputation.estimatedTax.toFixed(2)}`);
  console.log(`  Compliance:      ${(tax.complianceScore * 100).toFixed(0)}%`);
  console.log(`  Audit Ready:     ${audit.auditReadiness.rating}`);
  console.log(`  Anomalies:       ${anomaly.anomalies.length}`);
  console.log(`  Risk Score:      ${(anomaly.overallRiskScore * 100).toFixed(0)}%`);

  return {
    bookkeeping,
    reconciliation,
    statements,
    tax,
    audit,
    anomaly,
  };
}

// ============================================================================
// USAGE
// ============================================================================

/*
// To use with real Xero GL data:

import { parseXeroGL } from './gl-data-parser';

const transactions = await parseXeroGL('/path/to/General Ledger Detail.xlsx');
const result = await fullAaaSWorkflow(transactions);
*/

export {
  dailyBookkeepingPipeline,
  monthEndCloseWorkflow,
  financialStatementGeneration,
  taxComplianceCheck,
  auditPreparation,
  fullAaaSWorkflow,
};
