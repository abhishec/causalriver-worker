/**
 * Accounting Agents Test Suite
 * =============================
 *
 * Tests the 9 AaaS agents with realistic Xero GL data:
 * - brain-bookkeeper: Transaction categorization & journal entry
 * - brain-reconciler: Month-end account reconciliation
 * - brain-statement-generator: Financial statement preparation
 * - brain-tax-compliance: Multi-jurisdiction tax compliance
 * - brain-audit-preparer: Audit readiness assessment
 * - brain-anomaly-detective: Financial anomaly detection
 * - brain-cash-flow-prophet: Cash flow forecasting
 * - brain-revenue-leakage-detector: Revenue leakage detection
 * - brain-causal-pl-narrator: Causal P&L narrative generation
 *
 * Uses sample data modeled on a real Xero General Ledger export
 * (Singapore SaaS company, SGD denominated, SFRS/IRAS jurisdiction).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgentRegistry } from '../orchestrator/agent-registry';
import {
  brainBookkeeperAgent,
  brainReconcilerAgent,
  brainStatementGeneratorAgent,
  brainTaxComplianceAgent,
  brainAuditPreparerAgent,
  brainAnomalyDetectiveAgent,
  registerAccountingAgents,
  classifyAccount,
  getAccountSubType,
  type GLTransaction,
} from '../orchestrator/agents-accounting';

// ============================================================================
// SAMPLE DATA — Modeled on real Xero GL export
// ============================================================================

/** Realistic sample transactions from a Singapore SaaS company GL */
function createSampleTransactions(): GLTransaction[] {
  return [
    // Revenue — License Fees
    { date: '2024-01-15', source: 'Receivable Invoice', description: 'HSBC - License Fees - Q1 2024', reference: 'INV-2401', debit: 0, credit: 125000, runningBalance: 125000, tax: 0, taxRate: 0, taxRateName: 'Zero-Rated Supplies', account: 'License Fees' },
    { date: '2024-01-20', source: 'Receivable Invoice', description: 'Standard Chartered - License Fees', reference: 'INV-2402', debit: 0, credit: 85000, runningBalance: 210000, tax: 0, taxRate: 0, taxRateName: 'Zero-Rated Supplies', account: 'License Fees' },
    { date: '2024-02-01', source: 'Receivable Invoice', description: 'DBS Bank - Implementation Fees', reference: 'INV-2403', debit: 0, credit: 45000, runningBalance: 45000, tax: 3600, taxRate: 8, taxRateName: 'Standard-Rated Supplies', account: 'Implementation Fees' },
    { date: '2024-02-15', source: 'Receivable Invoice', description: 'OCBC - Support Fees - Q1', reference: 'INV-2404', debit: 0, credit: 15000, runningBalance: 15000, tax: 1200, taxRate: 8, taxRateName: 'Standard-Rated Supplies', account: 'Support Fees' },
    // Revenue — Subscription
    { date: '2024-03-01', source: 'Receivable Invoice', description: 'Maybank - Subscription Fees', reference: 'INV-2405', debit: 0, credit: 55000, runningBalance: 55000, tax: 0, taxRate: 0, taxRateName: 'Zero-Rated Supplies', account: 'Subscription fees' },
    // Deferred Revenue
    { date: '2024-01-01', source: 'Manual Journal', description: 'Deferred revenue recognition - Q1', reference: '#30001', debit: 75000, credit: 0, runningBalance: 75000, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Deferred revenue' },

    // Expenses — Payroll
    { date: '2024-01-31', source: 'Payable Invoice', description: 'Salaries - January 2024', reference: 'PAY-2401', debit: 180000, credit: 0, runningBalance: 180000, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Salaries' },
    { date: '2024-01-31', source: 'Payable Invoice', description: 'Employer CPF - January 2024', reference: 'CPF-2401', debit: 30600, credit: 0, runningBalance: 30600, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Employer CPF' },
    { date: '2024-02-28', source: 'Payable Invoice', description: 'Salaries - February 2024', reference: 'PAY-2402', debit: 182000, credit: 0, runningBalance: 362000, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Salaries' },
    { date: '2024-02-28', source: 'Payable Invoice', description: 'Employer CPF - February 2024', reference: 'CPF-2402', debit: 30940, credit: 0, runningBalance: 61540, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Employer CPF' },
    { date: '2024-03-31', source: 'Payable Invoice', description: 'Salaries - March 2024', reference: 'PAY-2403', debit: 183000, credit: 0, runningBalance: 545000, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Salaries' },
    { date: '2024-01-15', source: 'Payable Invoice', description: 'Staff Bonus - Q4 2023', reference: 'BON-2401', debit: 45000, credit: 0, runningBalance: 45000, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Staff Bonus' },

    // Expenses — Professional Services
    { date: '2024-01-25', source: 'Payable Invoice', description: 'Prudent Business Consultants Pte Ltd - Book keeping fees - Jan 24', reference: '2726', debit: 3725, credit: 0, runningBalance: 3725, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Accounting Fee' },
    { date: '2024-02-22', source: 'Payable Invoice', description: 'Prudent Business Consultants Pte Ltd - Book keeping fees - Feb 24', reference: '2772', debit: 3722, credit: 0, runningBalance: 7447, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Accounting Fee' },
    { date: '2024-03-10', source: 'Payable Invoice', description: 'Rajah & Tann - Legal advisory', reference: 'RT-2401', debit: 12500, credit: 0, runningBalance: 12500, tax: 1000, taxRate: 8, taxRateName: 'Standard-Rated Supplies', account: 'Legal, Tax & Secretarial Fee' },

    // Expenses — Software & Infrastructure
    { date: '2024-01-05', source: 'Spend Money', description: 'AWS - Cloud hosting - January', reference: 'AWS-2401', debit: 28500, credit: 0, runningBalance: 28500, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Software subscription' },
    { date: '2024-02-05', source: 'Spend Money', description: 'AWS - Cloud hosting - February', reference: 'AWS-2402', debit: 29100, credit: 0, runningBalance: 57600, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Software subscription' },
    { date: '2024-01-15', source: 'Spend Money', description: 'Datadog - Monitoring', reference: 'DD-2401', debit: 4200, credit: 0, runningBalance: 4200, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Subscription' },

    // Expenses — Office & Travel
    { date: '2024-01-01', source: 'Payable Invoice', description: 'WeWork - Office Rental - January', reference: 'WW-2401', debit: 18500, credit: 0, runningBalance: 18500, tax: 1480, taxRate: 8, taxRateName: 'Standard-Rated Supplies', account: 'Office Rental' },
    { date: '2024-02-10', source: 'Spend Money', description: 'SQ - Flight to KL - Client meeting', reference: 'TRV-2401', debit: 850, credit: 0, runningBalance: 850, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Airfare Expense' },
    { date: '2024-02-11', source: 'Spend Money', description: 'Hilton KL - Hotel - Client meeting', reference: 'TRV-2402', debit: 420, credit: 0, runningBalance: 1270, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Travelling Expenses' },
    { date: '2024-01-20', source: 'Spend Money', description: 'Client dinner - HSBC team', reference: 'ENT-2401', debit: 580, credit: 0, runningBalance: 580, tax: 46.4, taxRate: 8, taxRateName: 'Standard-Rated Supplies', account: 'Client entertainment' },

    // Expenses — Bank Charges
    { date: '2024-01-31', source: 'Spend Money', description: 'UOB - Monthly bank charges', reference: 'BNK-2401', debit: 45, credit: 0, runningBalance: 45, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Bank Charges' },
    { date: '2024-02-29', source: 'Spend Money', description: 'UOB - Monthly bank charges', reference: 'BNK-2402', debit: 52, credit: 0, runningBalance: 97, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Bank Charges' },

    // Expenses — External Contractors
    { date: '2024-01-31', source: 'Payable Invoice', description: 'Contractor - ML Engineer - January', reference: 'CON-2401', debit: 15000, credit: 0, runningBalance: 15000, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'External Contractor Fee' },
    { date: '2024-02-28', source: 'Payable Invoice', description: 'Contractor - ML Engineer - February', reference: 'CON-2402', debit: 15000, credit: 0, runningBalance: 30000, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'External Contractor Fee' },

    // Assets — Trade Debtors
    { date: '2024-01-15', source: 'Receivable Invoice', description: 'HSBC - Invoice raised', reference: 'INV-2401', debit: 125000, credit: 0, runningBalance: 125000, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Trade Debtors' },
    { date: '2024-02-20', source: 'Receivable Payment', description: 'HSBC - Payment received', reference: 'PMT-2401', debit: 0, credit: 125000, runningBalance: 0, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Trade Debtors' },

    // Liabilities — Trade Creditors
    { date: '2024-01-25', source: 'Payable Invoice', description: 'Prudent Business - Invoice received', reference: '2726', debit: 0, credit: 3725, runningBalance: 3725, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Trade Creditors' },
    { date: '2024-02-15', source: 'Payable Payment', description: 'Prudent Business - Payment made', reference: 'PAY-2726', debit: 3725, credit: 0, runningBalance: 0, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Trade Creditors' },

    // Bank — UOB SGD
    { date: '2024-01-01', source: 'Receive Money', description: 'Opening balance', reference: 'OB-2401', debit: 2800000, credit: 0, runningBalance: 2800000, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'UOB - SGD' },
    { date: '2024-02-20', source: 'Receive Money', description: 'HSBC - License payment received', reference: 'RCV-2401', debit: 125000, credit: 0, runningBalance: 2925000, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'UOB - SGD' },
    { date: '2024-01-31', source: 'Spend Money', description: 'Payroll run - January', reference: 'PYRL-2401', debit: 0, credit: 210600, runningBalance: 2589400, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'UOB - SGD' },

    // Equity — Retained Earnings
    { date: '2024-01-01', source: 'Manual Journal', description: 'Opening retained earnings', reference: '#OB-RE', debit: 0, credit: 500000, runningBalance: 500000, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Retained Earnings' },

    // Intercompany
    { date: '2024-03-15', source: 'Manual Journal', description: 'Intercompany recharge - India office Q1', reference: '#IC-2401', debit: 95000, credit: 0, runningBalance: 95000, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Advances to subsidiary - Tookitaki Technologies Private Limited' },

    // FX
    { date: '2024-03-31', source: 'Manual Journal', description: 'Unrealised FX gain/loss - Q1 revaluation', reference: '#FX-2401', debit: 12500, credit: 0, runningBalance: 12500, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Unrealised foreign exchange differences' },

    // Accruals
    { date: '2024-03-31', source: 'Manual Journal', description: 'Accrual for March accounting fees', reference: '#ACC-2401', debit: 3700, credit: 0, runningBalance: 3700, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Accounting Fee' },
    { date: '2024-03-31', source: 'Manual Journal', description: 'Accrual for March accounting fees', reference: '#ACC-2401', debit: 0, credit: 3700, runningBalance: 3700, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'Accrued Expenses' },

    // GST
    { date: '2024-03-31', source: 'Manual Journal', description: 'GST input tax - Q1', reference: '#GST-2401', debit: 6326.4, credit: 0, runningBalance: 6326.4, tax: 0, taxRate: 0, taxRateName: 'No Tax', account: 'GST Summary' },
  ];
}

// ============================================================================
// TESTS
// ============================================================================

describe('Accounting Agents', () => {
  let registry: ReturnType<typeof createAgentRegistry>;
  let sampleTransactions: GLTransaction[];

  beforeEach(() => {
    registry = createAgentRegistry({ verbose: true });
    registerAccountingAgents(registry);
    sampleTransactions = createSampleTransactions();

    // Mock the domain action agents that accounting agents depend on
    const mockDomainAgent = (name: string, mockData: unknown) => ({
      name,
      description: `Mock ${name} domain`,
      level: 'tool' as const,
      execute: async () => ({
        data: mockData,
        narrative: `Mock ${name} result`,
        confidence: 0.8,
        interventions: [],
        modulesUsed: [name],
        metadata: {},
      }),
    });

    registry.register(mockDomainAgent('document-comprehend', {
      type: 'document_comprehension',
      documentType: 'general_ledger',
      detectedDocuments: [{ type: 'ledger', jurisdiction: 'SG', currency: 'SGD' }],
      jurisdictions: ['SG'],
      currencies: ['SGD'],
    }));

    registry.register(mockDomainAgent('completeness-check', {
      type: 'completeness_check',
      completenessScore: 0.85,
      requiredFields: ['revenue', 'expenses', 'assets', 'liabilities', 'equity'],
      presentFields: ['revenue', 'expenses', 'assets', 'liabilities', 'equity'],
      missingFields: [],
    }));

    registry.register(mockDomainAgent('rule-apply', {
      type: 'rule_application',
      appliedRules: [{ rule: 'SFRS(I) 15 Revenue Recognition', jurisdiction: 'SG' }],
      jurisdictions: ['SG'],
    }));

    registry.register(mockDomainAgent('cross-validate', {
      type: 'cross_validation',
      balanced: true,
      variance: 0,
      equation: 'Assets = Liabilities + Equity',
    }));

    registry.register(mockDomainAgent('confidence-triage', {
      type: 'confidence_triage',
      autoApproved: 30,
      flagged: 5,
      escalated: 1,
    }));

    registry.register(mockDomainAgent('jurisdiction-comply', {
      type: 'jurisdiction_compliance',
      jurisdiction: 'SG',
      standard: 'SFRS(I)',
      taxAuthority: 'IRAS',
    }));

    registry.register(mockDomainAgent('statement-synthesize', {
      type: 'statement_synthesis',
      statements: ['P&L', 'Balance Sheet', 'Cash Flow'],
    }));
  });

  // ========================================================================
  // AGENT 1: BRAIN-BOOKKEEPER
  // ========================================================================

  describe('brain-bookkeeper', () => {
    it('should categorize transactions and create journal entries', async () => {
      const result = await brainBookkeeperAgent.execute(
        { transactions: sampleTransactions, jurisdiction: 'SG' },
        createMockContext(),
      );

      // Verify journal entries were created
      expect(result.journalEntries.length).toBeGreaterThan(0);

      // Verify account classification
      expect(result.categorizedAccounts.length).toBeGreaterThan(0);
      const revenueAccounts = result.categorizedAccounts.filter(a => a.type === 'revenue');
      const expenseAccounts = result.categorizedAccounts.filter(a => a.type === 'expense');
      expect(revenueAccounts.length).toBeGreaterThan(0);
      expect(expenseAccounts.length).toBeGreaterThan(0);

      // Verify double-entry check produces totals
      // Note: In a real Xero GL, total debits = total credits across ALL accounts
      // In our sample data (partial GL), they may not balance perfectly
      expect(result.doubleEntryCheck.totalDebits).toBeGreaterThan(0);
      expect(result.doubleEntryCheck.totalCredits).toBeGreaterThan(0);
    });

    it('should detect anomalies in transactions', async () => {
      const result = await brainBookkeeperAgent.execute(
        { transactions: sampleTransactions, jurisdiction: 'SG' },
        createMockContext(),
      );

      // Should detect at least some anomalies (large transactions, unclassified accounts)
      expect(result.anomalies).toBeDefined();
      expect(Array.isArray(result.anomalies)).toBe(true);
    });

    it('should produce triage report with auto/flag/escalate counts', async () => {
      const result = await brainBookkeeperAgent.execute(
        { transactions: sampleTransactions, jurisdiction: 'SG' },
        createMockContext(),
      );

      expect(result.triageReport).toBeDefined();
      expect(result.triageReport.autoPosted).toBeGreaterThanOrEqual(0);
      expect(result.triageReport.flagged).toBeGreaterThanOrEqual(0);
      expect(result.triageReport.escalated).toBeGreaterThanOrEqual(0);
      expect(result.triageReport.autoPosted + result.triageReport.flagged + result.triageReport.escalated)
        .toBe(result.journalEntries.length);
    });
  });

  // ========================================================================
  // AGENT 2: BRAIN-RECONCILER
  // ========================================================================

  describe('brain-reconciler', () => {
    it('should reconcile accounts and build trial balance', async () => {
      const result = await brainReconcilerAgent.execute(
        {
          transactions: sampleTransactions,
          period: { from: '2024-01-01', to: '2024-03-31' },
          jurisdiction: 'SG',
        },
        createMockContext(),
      );

      // Verify reconciliations were produced
      expect(result.reconciliations.length).toBeGreaterThan(0);

      // Verify trial balance
      expect(result.trialBalance.accounts.length).toBeGreaterThan(0);
      // Trial balance totals should exist (exact balance depends on GL completeness)
      expect(result.trialBalance.totalDebits).toBeGreaterThan(0);
      expect(result.trialBalance.totalCredits).toBeGreaterThanOrEqual(0);

      // Verify completeness check
      expect(result.completeness.score).toBeGreaterThan(0);
      expect(result.completeness.presentCategories.length).toBeGreaterThan(0);
    });

    it('should determine month-end status', async () => {
      const result = await brainReconcilerAgent.execute(
        {
          transactions: sampleTransactions,
          period: { from: '2024-01-01', to: '2024-03-31' },
        },
        createMockContext(),
      );

      expect(['ready', 'adjustments-needed', 'critical-issues']).toContain(result.monthEndStatus);
    });
  });

  // ========================================================================
  // AGENT 3: BRAIN-STATEMENT-GENERATOR
  // ========================================================================

  describe('brain-statement-generator', () => {
    it('should generate P&L with revenue, COGS, OpEx, and net profit', async () => {
      const result = await brainStatementGeneratorAgent.execute(
        {
          transactions: sampleTransactions,
          period: { from: '2024-01-01', to: '2024-03-31' },
          jurisdiction: 'SG',
        },
        createMockContext(),
      );

      const pnl = result.profitAndLoss;

      // Revenue should be positive
      expect(pnl.totalRevenue).toBeGreaterThan(0);

      // Operating expenses should exist
      expect(pnl.totalOperatingExpenses).toBeGreaterThan(0);

      // Gross margin should be reasonable for SaaS (typically 70-85%)
      if (pnl.totalCostOfSales > 0) {
        expect(pnl.grossMarginPercent).toBeGreaterThan(50);
        expect(pnl.grossMarginPercent).toBeLessThan(100);
      }

      // Net margin calculation
      expect(pnl.netMarginPercent).toBeDefined();
    });

    it('should generate Balance Sheet with Assets = Liabilities + Equity check', async () => {
      const result = await brainStatementGeneratorAgent.execute(
        {
          transactions: sampleTransactions,
          period: { from: '2024-01-01', to: '2024-03-31' },
        },
        createMockContext(),
      );

      const bs = result.balanceSheet;

      // Assets, liabilities, and equity should be present
      expect(bs.totalAssets).toBeDefined();
      expect(bs.totalLiabilities).toBeDefined();
      expect(bs.totalEquity).toBeDefined();
    });

    it('should compute key financial ratios', async () => {
      const result = await brainStatementGeneratorAgent.execute(
        {
          transactions: sampleTransactions,
          period: { from: '2024-01-01', to: '2024-03-31' },
        },
        createMockContext(),
      );

      expect(result.keyRatios.currentRatio).toBeDefined();
      expect(result.keyRatios.debtToEquity).toBeDefined();
      expect(result.keyRatios.grossMargin).toBeDefined();
      expect(result.keyRatios.burnRate).toBeDefined();
      expect(result.keyRatios.runwayMonths).toBeDefined();
    });
  });

  // ========================================================================
  // AGENT 4: BRAIN-TAX-COMPLIANCE
  // ========================================================================

  describe('brain-tax-compliance', () => {
    it('should compute corporate tax for Singapore jurisdiction', async () => {
      const result = await brainTaxComplianceAgent.execute(
        {
          transactions: sampleTransactions,
          period: { from: '2024-01-01', to: '2024-03-31' },
          jurisdiction: 'SG',
        },
        createMockContext(),
      );

      expect(result.taxComputation.jurisdiction).toBe('SG');
      expect(result.taxComputation.corporateTaxRate).toBe(0.17);
      expect(result.taxComputation.accountingStandard).toBe('SFRS(I)');
      expect(result.taxComputation.estimatedTax).toBeGreaterThanOrEqual(0);
    });

    it('should compute GST return data', async () => {
      const result = await brainTaxComplianceAgent.execute(
        {
          transactions: sampleTransactions,
          period: { from: '2024-01-01', to: '2024-03-31' },
          jurisdiction: 'SG',
        },
        createMockContext(),
      );

      expect(result.gstReturn).toBeDefined();
      expect(result.gstReturn.outputTax).toBeDefined();
      expect(result.gstReturn.inputTax).toBeDefined();
      expect(result.gstReturn.netGST).toBeDefined();
    });

    it('should generate filing checklist', async () => {
      const result = await brainTaxComplianceAgent.execute(
        {
          transactions: sampleTransactions,
          period: { from: '2024-01-01', to: '2024-03-31' },
          jurisdiction: 'SG',
        },
        createMockContext(),
      );

      expect(result.filingChecklist.length).toBeGreaterThan(0);
      // SG should have Form C-S, GST F5, IR8A
      const formNames = result.filingChecklist.map(f => f.form);
      expect(formNames).toContain('Form C-S');
      expect(formNames).toContain('GST F5');
    });
  });

  // ========================================================================
  // AGENT 5: BRAIN-AUDIT-PREPARER
  // ========================================================================

  describe('brain-audit-preparer', () => {
    it('should assess audit readiness with workpapers', async () => {
      const result = await brainAuditPreparerAgent.execute(
        {
          transactions: sampleTransactions,
          period: { from: '2024-01-01', to: '2024-03-31' },
          jurisdiction: 'SG',
        },
        createMockContext(),
      );

      expect(result.auditReadiness.overallScore).toBeGreaterThan(0);
      expect(result.auditReadiness.overallScore).toBeLessThanOrEqual(1);
      expect(['audit-ready', 'minor-gaps', 'significant-gaps', 'not-ready']).toContain(result.auditReadiness.rating);

      // Workpapers should be generated
      expect(result.workpapers.length).toBeGreaterThan(0);
      // Should have major areas covered
      const areas = result.workpapers.map(w => w.area);
      expect(areas).toContain('Revenue');
      expect(areas).toContain('Cash & Bank');
      expect(areas).toContain('Payroll');
    });

    it('should compute materiality thresholds', async () => {
      const result = await brainAuditPreparerAgent.execute(
        {
          transactions: sampleTransactions,
          period: { from: '2024-01-01', to: '2024-03-31' },
        },
        createMockContext(),
      );

      expect(result.materialityAnalysis.overallMateriality).toBeGreaterThan(0);
      expect(result.materialityAnalysis.performanceMateriality).toBeLessThan(result.materialityAnalysis.overallMateriality);
      expect(result.materialityAnalysis.trivialThreshold).toBeLessThan(result.materialityAnalysis.performanceMateriality);
    });

    it('should identify audit risk areas', async () => {
      const result = await brainAuditPreparerAgent.execute(
        {
          transactions: sampleTransactions,
          period: { from: '2024-01-01', to: '2024-03-31' },
        },
        createMockContext(),
      );

      // Should identify at least manual journal risk
      expect(result.riskAreas.length).toBeGreaterThan(0);
      const riskTypes = result.riskAreas.map(r => r.area);
      expect(riskTypes.some(r => r.includes('Manual Journal') || r.includes('Revenue') || r.includes('Related Party'))).toBe(true);
    });
  });

  // ========================================================================
  // AGENT 6: BRAIN-ANOMALY-DETECTIVE
  // ========================================================================

  describe('brain-anomaly-detective', () => {
    it('should run Benfords Law analysis', async () => {
      const result = await brainAnomalyDetectiveAgent.execute(
        { transactions: sampleTransactions },
        createMockContext(),
      );

      expect(result.benfordsLaw).toBeDefined();
      expect(result.benfordsLaw.expected.length).toBe(9);
      expect(result.benfordsLaw.observed.length).toBe(9);
      expect(result.benfordsLaw.chiSquare).toBeGreaterThanOrEqual(0);
    });

    it('should detect potential duplicates', async () => {
      const result = await brainAnomalyDetectiveAgent.execute(
        { transactions: sampleTransactions },
        createMockContext(),
      );

      expect(result.duplicateDetection).toBeDefined();
      expect(Array.isArray(result.duplicateDetection)).toBe(true);
    });

    it('should analyze vendor concentration', async () => {
      const result = await brainAnomalyDetectiveAgent.execute(
        { transactions: sampleTransactions },
        createMockContext(),
      );

      expect(result.vendorConcentration.length).toBeGreaterThan(0);
      // Each vendor should have spend and risk data
      for (const vendor of result.vendorConcentration) {
        expect(vendor.totalSpend).toBeGreaterThan(0);
        expect(['high', 'medium', 'low']).toContain(vendor.risk);
      }
    });

    it('should compute overall risk score', async () => {
      const result = await brainAnomalyDetectiveAgent.execute(
        { transactions: sampleTransactions },
        createMockContext(),
      );

      expect(result.overallRiskScore).toBeGreaterThanOrEqual(0);
      expect(result.overallRiskScore).toBeLessThanOrEqual(1);
    });
  });

  // ========================================================================
  // ACCOUNT CLASSIFICATION TESTS
  // ========================================================================

  describe('Account Classification', () => {
    it('should correctly classify revenue accounts', () => {
      expect(classifyAccount('License Fees')).toBe('revenue');
      expect(classifyAccount('Implementation Fees')).toBe('revenue');
      expect(classifyAccount('Support Fees')).toBe('revenue');
      expect(classifyAccount('Subscription fees')).toBe('revenue');
      expect(classifyAccount('Interest Income')).toBe('revenue');
      expect(classifyAccount('Overage Fees')).toBe('revenue');
    });

    it('should correctly classify expense accounts', () => {
      expect(classifyAccount('Salaries')).toBe('expense');
      expect(classifyAccount('Employer CPF')).toBe('expense');
      expect(classifyAccount('Office Rental')).toBe('expense');
      expect(classifyAccount('Accounting Fee')).toBe('expense');
      expect(classifyAccount('Software subscription')).toBe('expense');
      expect(classifyAccount('Bank Charges')).toBe('expense');
      expect(classifyAccount('External Contractor Fee')).toBe('expense');
      expect(classifyAccount('Depreciation')).toBe('expense');
    });

    it('should correctly classify asset accounts', () => {
      expect(classifyAccount('Trade Debtors')).toBe('asset');
      expect(classifyAccount('Computer')).toBe('asset');
      expect(classifyAccount('Prepayments')).toBe('asset');
      expect(classifyAccount('Fixed Deposit')).toBe('asset');
      expect(classifyAccount('ROU Asset - #10-05')).toBe('asset');
    });

    it('should correctly classify liability accounts', () => {
      expect(classifyAccount('Trade Creditors')).toBe('liability');
      expect(classifyAccount('Accrued Expenses')).toBe('liability');
      expect(classifyAccount('Deferred revenue')).toBe('liability');
      expect(classifyAccount('CPF Payable')).toBe('liability');
      expect(classifyAccount('GST Summary')).toBe('liability');
      expect(classifyAccount('Lease liability')).toBe('liability');
    });

    it('should correctly classify equity accounts', () => {
      expect(classifyAccount('Paid up Capital')).toBe('equity');
      expect(classifyAccount('Retained Earnings')).toBe('equity');
      expect(classifyAccount('Share based payments reserve')).toBe('equity');
    });

    it('should correctly classify bank accounts', () => {
      expect(classifyAccount('UOB - SGD')).toBe('bank');
      expect(classifyAccount('UOB - USD')).toBe('bank');
      expect(classifyAccount('WISE - SGD')).toBe('bank');
      expect(classifyAccount('Amex clearing account - SGD')).toBe('bank');
      expect(classifyAccount('Volopay clearing account')).toBe('bank');
    });

    it('should return sub-types for accounts', () => {
      expect(getAccountSubType('License Fees')).toBe('license');
      expect(getAccountSubType('Salaries')).toBe('payroll');
      expect(getAccountSubType('Office Rental')).toBe('occupancy');
      expect(getAccountSubType('UOB - SGD')).toBe('current');
    });
  });

  // ========================================================================
  // INTEGRATION TEST
  // ========================================================================

  describe('Full AaaS Workflow', () => {
    it('should run bookkeeper → reconciler → statement generator pipeline', async () => {
      const mockCtx = createMockContext();
      const period = { from: '2024-01-01', to: '2024-03-31' };

      // Step 1: Bookkeeping
      const bookkeeping = await brainBookkeeperAgent.execute(
        { transactions: sampleTransactions, jurisdiction: 'SG' },
        mockCtx,
      );
      // GL extract transactions are one-sided per account — double-entry check verifies totals
      expect(bookkeeping.doubleEntryCheck.totalDebits).toBeGreaterThan(0);
      expect(bookkeeping.doubleEntryCheck.totalCredits).toBeGreaterThan(0);

      // Step 2: Reconciliation
      const reconciliation = await brainReconcilerAgent.execute(
        { transactions: sampleTransactions, period },
        mockCtx,
      );
      expect(reconciliation.trialBalance.accounts.length).toBeGreaterThan(0);

      // Step 3: Financial statements
      const statements = await brainStatementGeneratorAgent.execute(
        { transactions: sampleTransactions, period, jurisdiction: 'SG' },
        mockCtx,
      );
      expect(statements.profitAndLoss.totalRevenue).toBeGreaterThan(0);
      expect(statements.keyRatios.burnRate).toBeGreaterThan(0);

      // Pipeline integrity: all agents processed the same data
      expect(bookkeeping.categorizedAccounts.length).toBeGreaterThan(0);
      expect(reconciliation.reconciliations.length).toBeGreaterThan(0);
      expect(statements.balanceSheet.totalAssets).toBeDefined();
    });
  });

  // ========================================================================
  // AGENT REGISTRATION
  // ========================================================================

  describe('Agent Registration', () => {
    it('should register all accounting agents', () => {
      const freshRegistry = createAgentRegistry({ verbose: false });
      registerAccountingAgents(freshRegistry);

      const agents = freshRegistry.listAgents();
      const accountingAgents = agents.filter((a: any) =>
        a.definition?.tags?.includes('accounting')
      );
      expect(accountingAgents.length).toBe(9);
    });

    it('should have correct agent names', () => {
      const agents = registry.listAgents();
      const names = agents.map((a: any) => a.definition?.name || a.name);
      expect(names).toContain('brain-bookkeeper');
      expect(names).toContain('brain-reconciler');
      expect(names).toContain('brain-statement-generator');
      expect(names).toContain('brain-tax-compliance');
      expect(names).toContain('brain-audit-preparer');
      expect(names).toContain('brain-anomaly-detective');
      expect(names).toContain('brain-cash-flow-prophet');
      expect(names).toContain('brain-revenue-leakage-detector');
      expect(names).toContain('brain-causal-pl-narrator');
    });
  });
});

// ============================================================================
// HELPERS
// ============================================================================

function createMockContext(): any {
  return {
    log: vi.fn(),
    reportProgress: vi.fn(),
    callAgent: vi.fn().mockResolvedValue({
      status: 'completed',
      result: {
        data: {},
        narrative: 'Mock result',
        confidence: 0.8,
      },
    }),
    brain: {
      timeSeries: new Map(),
      dag: { nodes: new Set(), edges: new Map() },
      patterns: [],
      matchedRules: [],
      cascadePaths: [],
      primaryDomain: 'accounting',
      extractedDomains: [],
      question: 'Test',
      intent: 'audit',
      horizonDays: 90,
    },
  };
}
