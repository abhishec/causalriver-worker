/**
 * AAS Trainer Fetcher — Account as a Service Data Sources
 *
 * Fetches public accounting intelligence from 6 sources to seed the CORE brain
 * so NexusBrain can produce Trial Balance, P&L, Balance Sheet, GST computation,
 * and transaction interpretations that beat raw Claude on Phase 1 validation.
 *
 * Sources:
 *   1. SEC EDGAR XBRL — 50 SaaS company P&L + BS line items (no auth, public)
 *   2. FASB GAAP Taxonomy — 450-account CoA classification ground truth (hardcoded)
 *   3. Damodaran Industry Benchmarks — SaaS/tech gross margin + ratio norms (annual XLS)
 *   4. ATO SMB Benchmarks — SG/AU-specific cost ratios (hardcoded with ATO source)
 *   5. ERPNext CoA — SG + AU chart of accounts with GST account structures (GitHub raw)
 *   6. Synthetic Scenarios — 200 mathematically-correct SaaS accounting scenarios (computed)
 *
 * No auth required for any source.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface EDGARCompanyFinancials {
  cik: string;
  name: string;
  ticker: string;
  sic: string;
  periods: EDGARPeriod[];
}

export interface EDGARPeriod {
  period: string; // e.g. "2024-Q3"
  end: string;    // e.g. "2024-09-30"
  revenues: number | null;
  grossProfit: number | null;
  operatingExpenses: number | null;
  netIncome: number | null;
  cashAndEquivalents: number | null;
  accountsReceivable: number | null;
  accountsPayable: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  stockholdersEquity: number | null;
}

export interface CoAAccount {
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'contra_asset' | 'contra_equity';
  normalBalance: 'debit' | 'credit';
  statement: 'balance_sheet' | 'income_statement' | 'cash_flow' | 'equity';
  subtype: string; // e.g. 'current_asset', 'fixed_asset', 'current_liability', 'cogs', 'operating_expense', 'other_income'
  isGST?: boolean;
  gstType?: 'output' | 'input';
  jurisdiction?: 'sg' | 'au' | 'us' | 'global';
}

export interface IndustryBenchmark {
  industry: string;
  sic?: string;
  anzsic?: string;
  grossMarginMedian: number;
  grossMarginP25: number;
  grossMarginP75: number;
  operatingMarginMedian: number;
  netMarginMedian: number;
  revenueGrowthMedian: number;
  rdToRevenueMedian: number;
  payrollToRevenueMedian: number;
  cogsToRevenueMedian: number;
  currentRatioMedian: number;
  arTurnoverMedian: number;
}

export interface SyntheticAccountingScenario {
  id: string;
  companyType: string; // e.g. 'saas_sg', 'saas_au', 'ecommerce_sg'
  period: string;      // e.g. '2025-01'
  transactions: SyntheticTransaction[];
  trialBalance: TrialBalanceLine[];
  pl: PLStatement;
  balanceSheet: BalanceSheetStatement;
  gst: GSTComputation;
  interpretations: TransactionInterpretation[];
}

export interface SyntheticTransaction {
  date: string;
  description: string;
  reference: string;
  account: string;
  debit: number;
  credit: number;
  taxRateName: string;
  taxAmount: number;
}

export interface TrialBalanceLine {
  account: string;
  accountType: string;
  debitBalance: number;
  creditBalance: number;
}

export interface PLStatement {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: { name: string; amount: number }[];
  totalOpEx: number;
  operatingIncome: number;
  otherIncome: number;
  netIncomeBeforeTax: number;
  incomeTax: number;
  netIncome: number;
}

export interface BalanceSheetStatement {
  assets: { currentAssets: { name: string; amount: number }[]; fixedAssets: { name: string; amount: number }[] };
  liabilities: { currentLiabilities: { name: string; amount: number }[]; longTermLiabilities: { name: string; amount: number }[] };
  equity: { name: string; amount: number }[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  isBalanced: boolean;
}

export interface GSTComputation {
  jurisdiction: 'sg' | 'au';
  gstRate: number;
  totalSales: number;
  gstOnSales: number;         // Output tax (payable)
  totalPurchases: number;
  gstOnPurchases: number;     // Input tax (claimable)
  netGSTPayable: number;
  gstOutputTaxAccount: string;
  gstInputTaxAccount: string;
  gstPayableAccount: string;
}

export interface TransactionInterpretation {
  transactionRef: string;
  account: string;
  drCr: 'DR' | 'CR';
  amount: number;
  interpretation: string; // Natural language business event
  impactOnFinancials: string; // "Increases Revenue in P&L", "Increases AR on Balance Sheet", etc.
}

export interface AASRawData {
  edgarCompanies: EDGARCompanyFinancials[];
  coaMap: Map<string, CoAAccount>;
  benchmarks: IndustryBenchmark[];
  scenarios: SyntheticAccountingScenario[];
  sources: string[];
  recordCount: number;
}

// ============================================================================
// HARDCODED CoA CLASSIFICATION MAP (FASB GAAP + SFRS + SG/AU extensions)
// Source: FASB US-GAAP 2024 taxonomy + SFRS (Singapore Financial Reporting Standards)
//         + ERPNext SG/AU CoA templates
// This is the ground truth that makes Trial Balance correct every time.
// ============================================================================

export const GAAP_COA_MAP: Map<string, CoAAccount> = new Map([
  // ── ASSETS (debit-normal, balance sheet) ──
  // Current Assets
  ['Cash', { name: 'Cash', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Cash and Cash Equivalents', { name: 'Cash and Cash Equivalents', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Bank', { name: 'Bank', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Petty Cash', { name: 'Petty Cash', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Accounts Receivable', { name: 'Accounts Receivable', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Trade Receivables', { name: 'Trade Receivables', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Debtors', { name: 'Debtors', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Notes Receivable', { name: 'Notes Receivable', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Inventory', { name: 'Inventory', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Stock', { name: 'Stock', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Prepaid Expenses', { name: 'Prepaid Expenses', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Prepayments', { name: 'Prepayments', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Other Current Assets', { name: 'Other Current Assets', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Short-Term Investments', { name: 'Short-Term Investments', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['GST Input Tax', { name: 'GST Input Tax', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset', isGST: true, gstType: 'input', jurisdiction: 'sg' }],
  ['GST Claimable', { name: 'GST Claimable', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset', isGST: true, gstType: 'input', jurisdiction: 'au' }],
  ['Input Tax Credit', { name: 'Input Tax Credit', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset', isGST: true, gstType: 'input', jurisdiction: 'au' }],
  ['Tax Recoverable', { name: 'Tax Recoverable', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Deposits', { name: 'Deposits', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Staff Advances', { name: 'Staff Advances', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  // Fixed Assets
  ['Property Plant and Equipment', { name: 'Property Plant and Equipment', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'fixed_asset' }],
  ['Equipment', { name: 'Equipment', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'fixed_asset' }],
  ['Furniture and Fixtures', { name: 'Furniture and Fixtures', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'fixed_asset' }],
  ['Computers', { name: 'Computers', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'fixed_asset' }],
  ['Leasehold Improvements', { name: 'Leasehold Improvements', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'fixed_asset' }],
  ['Intangible Assets', { name: 'Intangible Assets', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'fixed_asset' }],
  ['Goodwill', { name: 'Goodwill', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'fixed_asset' }],
  ['Software', { name: 'Software', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'fixed_asset' }],
  ['Right-of-Use Assets', { name: 'Right-of-Use Assets', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'fixed_asset' }],
  ['Long-Term Investments', { name: 'Long-Term Investments', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'fixed_asset' }],
  // Contra Assets (credit-normal — this trips Claude up)
  ['Accumulated Depreciation', { name: 'Accumulated Depreciation', type: 'contra_asset', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'contra_asset' }],
  ['Allowance for Doubtful Accounts', { name: 'Allowance for Doubtful Accounts', type: 'contra_asset', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'contra_asset' }],
  ['Provision for Bad Debts', { name: 'Provision for Bad Debts', type: 'contra_asset', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'contra_asset' }],

  // ── LIABILITIES (credit-normal, balance sheet) ──
  // Current Liabilities
  ['Accounts Payable', { name: 'Accounts Payable', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability' }],
  ['Trade Payables', { name: 'Trade Payables', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability' }],
  ['Creditors', { name: 'Creditors', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability' }],
  ['Accrued Expenses', { name: 'Accrued Expenses', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability' }],
  ['Accruals', { name: 'Accruals', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability' }],
  ['Deferred Revenue', { name: 'Deferred Revenue', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability' }],
  ['Unearned Revenue', { name: 'Unearned Revenue', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability' }],
  ['Contract Liabilities', { name: 'Contract Liabilities', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability' }],
  ['Income Tax Payable', { name: 'Income Tax Payable', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability' }],
  ['GST Payable', { name: 'GST Payable', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability', isGST: true, jurisdiction: 'sg' }],
  ['GST Output Tax', { name: 'GST Output Tax', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability', isGST: true, gstType: 'output', jurisdiction: 'sg' }],
  ['GST Collected', { name: 'GST Collected', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability', isGST: true, gstType: 'output', jurisdiction: 'au' }],
  ['BAS Liability', { name: 'BAS Liability', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability', isGST: true, jurisdiction: 'au' }],
  ['IRAS Payable', { name: 'IRAS Payable', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability', jurisdiction: 'sg' }],
  ['CPF Payable', { name: 'CPF Payable', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability', jurisdiction: 'sg' }],
  ['Salaries Payable', { name: 'Salaries Payable', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability' }],
  ['Wages Payable', { name: 'Wages Payable', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability' }],
  ['Superannuation Payable', { name: 'Superannuation Payable', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability', jurisdiction: 'au' }],
  ['Notes Payable', { name: 'Notes Payable', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability' }],
  ['Short-Term Debt', { name: 'Short-Term Debt', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability' }],
  ['Customer Deposits', { name: 'Customer Deposits', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability' }],
  ['Lease Liability - Current', { name: 'Lease Liability - Current', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability' }],
  // Long-Term Liabilities
  ['Long-Term Debt', { name: 'Long-Term Debt', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'long_term_liability' }],
  ['Bank Loan', { name: 'Bank Loan', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'long_term_liability' }],
  ['Deferred Tax Liability', { name: 'Deferred Tax Liability', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'long_term_liability' }],
  ['Lease Liability - Non-Current', { name: 'Lease Liability - Non-Current', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'long_term_liability' }],

  // ── EQUITY (credit-normal, balance sheet) ──
  ['Common Stock', { name: 'Common Stock', type: 'equity', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'paid_in_capital' }],
  ['Share Capital', { name: 'Share Capital', type: 'equity', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'paid_in_capital' }],
  ['Ordinary Shares', { name: 'Ordinary Shares', type: 'equity', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'paid_in_capital' }],
  ['Additional Paid-In Capital', { name: 'Additional Paid-In Capital', type: 'equity', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'paid_in_capital' }],
  ['Share Premium', { name: 'Share Premium', type: 'equity', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'paid_in_capital' }],
  ['Retained Earnings', { name: 'Retained Earnings', type: 'equity', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'retained_earnings' }],
  ['Accumulated Losses', { name: 'Accumulated Losses', type: 'contra_equity', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'retained_earnings' }],
  ['Treasury Stock', { name: 'Treasury Stock', type: 'contra_equity', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'treasury_stock' }],
  ["Owner's Equity", { name: "Owner's Equity", type: 'equity', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'paid_in_capital' }],
  ["Owner's Drawing", { name: "Owner's Drawing", type: 'contra_equity', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'drawings' }],

  // ── REVENUE (credit-normal, income statement) ──
  ['Revenue', { name: 'Revenue', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['Sales', { name: 'Sales', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['Service Revenue', { name: 'Service Revenue', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['Subscription Revenue', { name: 'Subscription Revenue', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['SaaS Revenue', { name: 'SaaS Revenue', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['Consulting Revenue', { name: 'Consulting Revenue', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['Professional Fees Income', { name: 'Professional Fees Income', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['Licence Revenue', { name: 'Licence Revenue', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['Interest Income', { name: 'Interest Income', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'other_income' }],
  ['Other Income', { name: 'Other Income', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'other_income' }],
  ['Gain on Disposal', { name: 'Gain on Disposal', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'other_income' }],
  ['Grant Income', { name: 'Grant Income', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'other_income' }],
  ['Foreign Exchange Gain', { name: 'Foreign Exchange Gain', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'other_income' }],
  // Sales Returns (contra revenue — debit-normal, trips Claude)
  ['Sales Returns', { name: 'Sales Returns', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'contra_revenue' }],
  ['Sales Discounts', { name: 'Sales Discounts', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'contra_revenue' }],

  // ── COST OF GOODS SOLD / COST OF REVENUE (debit-normal, income statement) ──
  ['Cost of Goods Sold', { name: 'Cost of Goods Sold', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'cogs' }],
  ['Cost of Revenue', { name: 'Cost of Revenue', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'cogs' }],
  ['Cost of Sales', { name: 'Cost of Sales', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'cogs' }],
  ['Direct Costs', { name: 'Direct Costs', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'cogs' }],
  ['Cloud Infrastructure', { name: 'Cloud Infrastructure', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'cogs' }],
  ['Hosting Costs', { name: 'Hosting Costs', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'cogs' }],
  ['Third Party Software', { name: 'Third Party Software', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'cogs' }],
  ['Support Staff Costs', { name: 'Support Staff Costs', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'cogs' }],

  // ── OPERATING EXPENSES (debit-normal, income statement) ──
  ['Salaries and Wages', { name: 'Salaries and Wages', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Staff Costs', { name: 'Staff Costs', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Payroll Expense', { name: 'Payroll Expense', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['CPF Expense', { name: 'CPF Expense', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense', jurisdiction: 'sg' }],
  ['Superannuation Expense', { name: 'Superannuation Expense', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense', jurisdiction: 'au' }],
  ['Rent', { name: 'Rent', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Office Rent', { name: 'Office Rent', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Utilities', { name: 'Utilities', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Marketing', { name: 'Marketing', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Advertising', { name: 'Advertising', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Sales and Marketing', { name: 'Sales and Marketing', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Research and Development', { name: 'Research and Development', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['R&D Expense', { name: 'R&D Expense', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['General and Administrative', { name: 'General and Administrative', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Professional Fees', { name: 'Professional Fees', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Accounting Fees', { name: 'Accounting Fees', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Legal Fees', { name: 'Legal Fees', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Depreciation', { name: 'Depreciation', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Amortisation', { name: 'Amortisation', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Insurance', { name: 'Insurance', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Travel', { name: 'Travel', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Travel and Entertainment', { name: 'Travel and Entertainment', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Meals and Entertainment', { name: 'Meals and Entertainment', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Subscriptions', { name: 'Subscriptions', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Software Subscriptions', { name: 'Software Subscriptions', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Office Supplies', { name: 'Office Supplies', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Training', { name: 'Training', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Recruitment', { name: 'Recruitment', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Bank Charges', { name: 'Bank Charges', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Transaction Fees', { name: 'Transaction Fees', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Interest Expense', { name: 'Interest Expense', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'other_expense' }],
  ['Foreign Exchange Loss', { name: 'Foreign Exchange Loss', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'other_expense' }],
  ['Income Tax Expense', { name: 'Income Tax Expense', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'income_tax' }],
  ['Bad Debt Expense', { name: 'Bad Debt Expense', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Loss on Disposal', { name: 'Loss on Disposal', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'other_expense' }],

  // ── XERO-SPECIFIC ACCOUNT NAMES (from real ph-accounting Xero GL, 49,684 txns) ──
  // These are the ACTUAL account names that appear in the design partner's Xero export.
  // Without these, brain-bookkeeper keyword rules fail on unmatched names.
  // Revenue accounts (Xero Xero naming: specific fee types, not generic "Revenue")
  ['License Fee', { name: 'License Fee', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['License Fees', { name: 'License Fees', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['Subscription Fee', { name: 'Subscription Fee', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['Subscription Fees', { name: 'Subscription Fees', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['Implementation Fee', { name: 'Implementation Fee', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['Implementation Fees', { name: 'Implementation Fees', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['Support Fee', { name: 'Support Fee', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['Support Fees', { name: 'Support Fees', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['Overage Fee', { name: 'Overage Fee', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['Overage Fees', { name: 'Overage Fees', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  ['Grant', { name: 'Grant', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'other_income' }],
  ['Grant Income', { name: 'Grant Income', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'other_income' }],
  ['Government Grant', { name: 'Government Grant', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'other_income' }],
  // Zero-rated revenue — export of services to overseas clients (GST F5 Box 1, NOT Box 6)
  ['Zero-Rated Revenue', { name: 'Zero-Rated Revenue', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'zero_rated_revenue' }],
  ['Export Revenue', { name: 'Export Revenue', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'zero_rated_revenue' }],
  ['Overseas Revenue', { name: 'Overseas Revenue', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'zero_rated_revenue' }],
  // Bank accounts (Xero tracks separately per bank/account)
  ['Bank - DBS SGD', { name: 'Bank - DBS SGD', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset', jurisdiction: 'sg' }],
  ['Bank - DBS Current Account', { name: 'Bank - DBS Current Account', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset', jurisdiction: 'sg' }],
  ['Bank - UOB SGD', { name: 'Bank - UOB SGD', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset', jurisdiction: 'sg' }],
  ['Bank - Citibank', { name: 'Bank - Citibank', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Bank - Wise SGD', { name: 'Bank - Wise SGD', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['AMEX Clearing', { name: 'AMEX Clearing', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Volopay Clearing', { name: 'Volopay Clearing', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  // Expense accounts (Xero naming conventions used in ph-accounting GL)
  ['Salary', { name: 'Salary', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Salaries', { name: 'Salaries', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Bonus', { name: 'Bonus', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['CPF', { name: 'CPF', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense', jurisdiction: 'sg' }],
  ['Accounting Fee', { name: 'Accounting Fee', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Accounting Fees', { name: 'Accounting Fees', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Audit Fee', { name: 'Audit Fee', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Audit Fees', { name: 'Audit Fees', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['External Contractor Fee', { name: 'External Contractor Fee', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Contractor Fee', { name: 'Contractor Fee', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Airfare Expense', { name: 'Airfare Expense', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Airfare', { name: 'Airfare', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Software Subscription', { name: 'Software Subscription', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Software Subscriptions', { name: 'Software Subscriptions', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  ['Rental', { name: 'Rental', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'operating_expense' }],
  // FX — unrealised and realised (very common in SG multi-currency GL)
  ['Unrealised Foreign Exchange Gain', { name: 'Unrealised Foreign Exchange Gain', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'other_income' }],
  ['Unrealised Foreign Exchange Loss', { name: 'Unrealised Foreign Exchange Loss', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'other_expense' }],
  ['Realised Foreign Exchange Gain', { name: 'Realised Foreign Exchange Gain', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'other_income' }],
  ['Realised Foreign Exchange Loss', { name: 'Realised Foreign Exchange Loss', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'other_expense' }],
  ['Unrealised foreign exchange differences', { name: 'Unrealised foreign exchange differences', type: 'expense', normalBalance: 'debit', statement: 'income_statement', subtype: 'other_expense' }],
  // Intercompany — Tookitaki-specific (from real GL)
  ['Advances to Subsidiary', { name: 'Advances to Subsidiary', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'non_current_asset' }],
  ['Advances to subsidiary - Tookitaki Technologies Private Limited', { name: 'Advances to subsidiary - Tookitaki Technologies Private Limited', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'non_current_asset' }],
  ['Intercompany Receivable', { name: 'Intercompany Receivable', type: 'asset', normalBalance: 'debit', statement: 'balance_sheet', subtype: 'current_asset' }],
  ['Management Fee Income', { name: 'Management Fee Income', type: 'revenue', normalBalance: 'credit', statement: 'income_statement', subtype: 'operating_revenue' }],
  // Convertible notes (common in SaaS funding rounds)
  ['Convertible Notes', { name: 'Convertible Notes', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'long_term_liability' }],
  ['Convertible notes', { name: 'Convertible notes', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'long_term_liability' }],
  // WHT / Withholding Tax (SG — on payments to non-residents)
  ['WHT Payable', { name: 'WHT Payable', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability', jurisdiction: 'sg' }],
  ['Withholding Tax Payable', { name: 'Withholding Tax Payable', type: 'liability', normalBalance: 'credit', statement: 'balance_sheet', subtype: 'current_liability' }],
]);

// ============================================================================
// HARDCODED BENCHMARKS
// Source: Damodaran 2024 (SaaS/Technology Services) + ATO 2023-24 Benchmarks
// ============================================================================

export const INDUSTRY_BENCHMARKS: IndustryBenchmark[] = [
  {
    industry: 'SaaS / Software as a Service',
    sic: '7372',
    grossMarginMedian: 0.70, grossMarginP25: 0.62, grossMarginP75: 0.78,
    operatingMarginMedian: 0.08, netMarginMedian: 0.05,
    revenueGrowthMedian: 0.22, rdToRevenueMedian: 0.18,
    payrollToRevenueMedian: 0.55, cogsToRevenueMedian: 0.30,
    currentRatioMedian: 1.8, arTurnoverMedian: 5.2,
  },
  {
    industry: 'Technology Services / IT Consulting',
    sic: '7374', anzsic: '7000',
    grossMarginMedian: 0.38, grossMarginP25: 0.28, grossMarginP75: 0.52,
    operatingMarginMedian: 0.10, netMarginMedian: 0.07,
    revenueGrowthMedian: 0.12, rdToRevenueMedian: 0.05,
    payrollToRevenueMedian: 0.62, cogsToRevenueMedian: 0.62,
    currentRatioMedian: 1.6, arTurnoverMedian: 6.1,
  },
  {
    industry: 'E-Commerce / Online Retail',
    sic: '5961', anzsic: '4251',
    grossMarginMedian: 0.38, grossMarginP25: 0.28, grossMarginP75: 0.48,
    operatingMarginMedian: 0.06, netMarginMedian: 0.03,
    revenueGrowthMedian: 0.18, rdToRevenueMedian: 0.02,
    payrollToRevenueMedian: 0.20, cogsToRevenueMedian: 0.62,
    currentRatioMedian: 1.4, arTurnoverMedian: 12.0,
  },
  {
    industry: 'Professional Services',
    sic: '8742', anzsic: '6920',
    grossMarginMedian: 0.55, grossMarginP25: 0.42, grossMarginP75: 0.68,
    operatingMarginMedian: 0.14, netMarginMedian: 0.10,
    revenueGrowthMedian: 0.10, rdToRevenueMedian: 0.02,
    payrollToRevenueMedian: 0.65, cogsToRevenueMedian: 0.45,
    currentRatioMedian: 1.5, arTurnoverMedian: 7.5,
  },
];

// ============================================================================
// SEC EDGAR SAAS COMPANIES — CIK list for Tier 1 SaaS companies
// Source: SEC EDGAR public filings, no auth required
// ============================================================================

// Pure-play SaaS only — gross margins 65-80%, subscription-first revenue models.
// REMOVED: Oracle (ORCL CIK 0000796343) — enterprise hardware+software mix, not SaaS
// REMOVED: Microsoft (MSFT CIK 0000789019) — diversified cloud+enterprise, skews margins
// FIXED: HubSpot CIK was wrong (0001045810 = NVIDIA). HubSpot correct CIK = 0001404655
// ADDED: Amplitude, Braze, Zuora, Freshworks, HashiCorp — closer to SMB SaaS profile
export const SAAS_CIKS = [
  { cik: '0001108524', name: 'Salesforce', ticker: 'CRM', sic: '7372' },
  { cik: '0001404655', name: 'HubSpot', ticker: 'HUBS', sic: '7372' },        // FIXED (was NVIDIA CIK)
  { cik: '0001707925', name: 'Atlassian', ticker: 'TEAM', sic: '7372' },
  { cik: '0001388430', name: 'Workday', ticker: 'WDAY', sic: '7372' },
  { cik: '0001574085', name: 'Veeva Systems', ticker: 'VEEV', sic: '7372' },
  { cik: '0001418819', name: 'ServiceNow', ticker: 'NOW', sic: '7372' },
  { cik: '0001467623', name: 'Twilio', ticker: 'TWLO', sic: '7372' },
  { cik: '0001516673', name: 'Okta', ticker: 'OKTA', sic: '7372' },
  { cik: '0001341439', name: 'Splunk', ticker: 'SPLK', sic: '7372' },
  { cik: '0001439404', name: 'Zoom', ticker: 'ZM', sic: '7372' },
  { cik: '0001327567', name: 'Shopify', ticker: 'SHOP', sic: '7372' },
  { cik: '0001660134', name: 'Cloudflare', ticker: 'NET', sic: '7372' },
  { cik: '0001601712', name: 'MongoDB', ticker: 'MDB', sic: '7372' },
  { cik: '0001418091', name: 'Snowflake', ticker: 'SNOW', sic: '7372' },
  { cik: '0001679273', name: 'Datadog', ticker: 'DDOG', sic: '7372' },
  { cik: '0001816817', name: 'Amplitude', ticker: 'AMPL', sic: '7372' },      // SMB SaaS analytics ~65% GM
  { cik: '0001835016', name: 'Braze', ticker: 'BRZE', sic: '7372' },           // Customer engagement SaaS ~67% GM
  { cik: '0001423689', name: 'Zuora', ticker: 'ZUO', sic: '7372' },            // Subscription billing SaaS ~62% GM
  { cik: '0001868778', name: 'Freshworks', ticker: 'FRSH', sic: '7372' },      // India-originated SaaS ~83% GM
  { cik: '0001694426', name: 'HashiCorp', ticker: 'HCP', sic: '7372' },        // DevOps SaaS ~78% GM
];

// GAAP tags to extract from EDGAR
const EDGAR_GAAP_TAGS: Record<string, string> = {
  revenues: 'us-gaap:Revenues',
  revenueFromContractWithCustomer: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
  grossProfit: 'us-gaap:GrossProfit',
  operatingExpenses: 'us-gaap:OperatingExpenses',
  operatingIncomeLoss: 'us-gaap:OperatingIncomeLoss',
  netIncomeLoss: 'us-gaap:NetIncomeLoss',
  cash: 'us-gaap:CashAndCashEquivalentsAtCarryingValue',
  accountsReceivable: 'us-gaap:AccountsReceivableNetCurrent',
  accountsPayable: 'us-gaap:AccountsPayableCurrent',
  totalAssets: 'us-gaap:Assets',
  totalLiabilities: 'us-gaap:Liabilities',
  stockholdersEquity: 'us-gaap:StockholdersEquity',
};

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

const EDGAR_BASE = 'https://data.sec.gov';
const FETCH_TIMEOUT_MS = 15_000;
const SLEEP_MS = 150; // ~6 req/sec — stay under EDGAR's 10 req/sec limit

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function edgarFetch(path: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${EDGAR_BASE}${path}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'NexusBrain-AASTrainer/1.0 contact@nexusbrain.ai',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`EDGAR ${response.status}: ${path}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function githubRawFetch(url: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`GitHub raw ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch financial facts for a single company from SEC EDGAR.
 * Extracts quarterly P&L + Balance Sheet metrics.
 */
async function fetchEDGARCompany(
  cik: string,
  name: string,
  ticker: string,
  sic: string,
): Promise<EDGARCompanyFinancials | null> {
  try {
    const paddedCik = cik.replace(/^0+/, '').padStart(10, '0');
    const data = await edgarFetch(`/api/xbrl/companyfacts/CIK${paddedCik}.json`);
    const facts = data?.facts?.['us-gaap'] || {};

    // Helper: extract most recent N annual/quarterly values for a GAAP tag
    const extractValues = (tagWithPrefix: string): Map<string, number> => {
      const tag = tagWithPrefix.replace('us-gaap:', '');
      const entity = facts[tag];
      if (!entity?.units) return new Map();
      const units = entity.units['USD'] || entity.units['shares'] || [];
      const result = new Map<string, number>();
      for (const entry of units) {
        if (entry.form === '10-K' || entry.form === '10-Q') {
          const key = `${entry.end}:${entry.form}`;
          result.set(key, entry.val);
        }
      }
      return result;
    };

    // Get revenue (try multiple GAAP tags — different companies use different tags)
    const revenueMap = extractValues('us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax');
    const revenueAlt = extractValues('us-gaap:Revenues');
    if (revenueAlt.size > 0 && revenueMap.size === 0) {
      revenueAlt.forEach((v, k) => revenueMap.set(k, v));
    }

    const grossProfitMap = extractValues('us-gaap:GrossProfit');
    const netIncomeMap = extractValues('us-gaap:NetIncomeLoss');
    const cashMap = extractValues('us-gaap:CashAndCashEquivalentsAtCarryingValue');
    const arMap = extractValues('us-gaap:AccountsReceivableNetCurrent');
    const apMap = extractValues('us-gaap:AccountsPayableCurrent');
    const assetsMap = extractValues('us-gaap:Assets');
    const liabilitiesMap = extractValues('us-gaap:Liabilities');
    const equityMap = extractValues('us-gaap:StockholdersEquity');

    // Build periods from revenue keys
    const allKeys = new Set([...revenueMap.keys()]);
    const periods: EDGARPeriod[] = [];

    for (const key of allKeys) {
      const [end] = key.split(':');
      if (!end) continue;
      const d = new Date(end);
      if (isNaN(d.getTime()) || d.getFullYear() < 2021) continue; // Only 2021+

      const quarter = `Q${Math.ceil((d.getMonth() + 1) / 3)}`;
      const period = `${d.getFullYear()}-${quarter}`;

      periods.push({
        period,
        end,
        revenues: revenueMap.get(key) ?? null,
        grossProfit: grossProfitMap.get(key) ?? null,
        operatingExpenses: null, // Derived
        netIncome: netIncomeMap.get(key) ?? null,
        cashAndEquivalents: cashMap.get(key) ?? null,
        accountsReceivable: arMap.get(key) ?? null,
        accountsPayable: apMap.get(key) ?? null,
        totalAssets: assetsMap.get(key) ?? null,
        totalLiabilities: liabilitiesMap.get(key) ?? null,
        stockholdersEquity: equityMap.get(key) ?? null,
      });
    }

    // Deduplicate by period (keep most recent)
    const periodMap = new Map<string, EDGARPeriod>();
    for (const p of periods) {
      const existing = periodMap.get(p.period);
      if (!existing || p.end > existing.end) periodMap.set(p.period, p);
    }

    const finalPeriods = [...periodMap.values()]
      .sort((a, b) => b.end.localeCompare(a.end))
      .slice(0, 16); // Max 16 quarters (~4 years)

    return { cik, name, ticker, sic, periods: finalPeriods };
  } catch (err) {
    console.log(`[AASFetcher] EDGAR ${name}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Fetch SEC EDGAR data for all SaaS companies.
 */
export async function fetchEDGARSaaSCompanies(
  dryRun: boolean = false,
): Promise<EDGARCompanyFinancials[]> {
  const targetList = dryRun ? SAAS_CIKS.slice(0, 3) : SAAS_CIKS;
  const results: EDGARCompanyFinancials[] = [];

  console.log(`[AASFetcher] Fetching EDGAR data for ${targetList.length} SaaS companies...`);

  for (let i = 0; i < targetList.length; i++) {
    const { cik, name, ticker, sic } = targetList[i];
    console.log(`[AASFetcher] [${i + 1}/${targetList.length}] ${name} (${ticker})`);
    const company = await fetchEDGARCompany(cik, name, ticker, sic);
    if (company && company.periods.length > 0) {
      results.push(company);
      console.log(`[AASFetcher]   ✓ ${company.periods.length} periods fetched`);
    }
    if (i < targetList.length - 1) await sleep(SLEEP_MS);
  }

  console.log(`[AASFetcher] EDGAR complete: ${results.length} companies, ${results.reduce((s, c) => s + c.periods.length, 0)} periods`);
  return results;
}

/**
 * Fetch ERPNext Singapore + Australia Chart of Accounts from GitHub.
 * Enriches the hardcoded CoA with SG/AU-specific account names.
 */
export async function fetchERPNextCoA(): Promise<Map<string, CoAAccount>> {
  const enriched = new Map(GAAP_COA_MAP);

  const urls = [
    { url: 'https://raw.githubusercontent.com/frappe/erpnext/develop/erpnext/accounts/chart_of_accounts/verified/sg_chart_of_accounts.json', jurisdiction: 'sg' as const },
    { url: 'https://raw.githubusercontent.com/frappe/erpnext/develop/erpnext/accounts/chart_of_accounts/verified/au_chart_of_accounts.json', jurisdiction: 'au' as const },
  ];

  for (const { url, jurisdiction } of urls) {
    try {
      const data = await githubRawFetch(url);
      const accounts = extractERPNextAccounts(data, jurisdiction);
      for (const [name, account] of accounts) {
        if (!enriched.has(name)) enriched.set(name, account);
      }
      console.log(`[AASFetcher] ERPNext ${jurisdiction.toUpperCase()} CoA: ${accounts.size} accounts loaded`);
    } catch {
      console.log(`[AASFetcher] ERPNext ${jurisdiction} CoA fetch failed — using hardcoded fallback`);
    }
  }

  return enriched;
}

function extractERPNextAccounts(data: any, jurisdiction: 'sg' | 'au'): Map<string, CoAAccount> {
  const result = new Map<string, CoAAccount>();
  if (!data) return result;

  // ERPNext CoA is a nested tree — flatten it
  function traverse(node: any, parentType?: string) {
    if (!node) return;
    const name = node.account_name || node.name;
    const rootType = node.root_type || parentType;

    if (name && rootType) {
      const typeMap: Record<string, CoAAccount['type']> = {
        'Asset': 'asset', 'Liability': 'liability', 'Equity': 'equity',
        'Income': 'revenue', 'Expense': 'expense',
      };
      const normalBalanceMap: Record<string, 'debit' | 'credit'> = {
        'Asset': 'debit', 'Liability': 'credit', 'Equity': 'credit',
        'Income': 'credit', 'Expense': 'debit',
      };
      const statementMap: Record<string, CoAAccount['statement']> = {
        'Asset': 'balance_sheet', 'Liability': 'balance_sheet', 'Equity': 'balance_sheet',
        'Income': 'income_statement', 'Expense': 'income_statement',
      };

      const type = typeMap[rootType] || 'asset';
      const isGSTAccount = name.toLowerCase().includes('gst') || name.toLowerCase().includes('bas') || name.toLowerCase().includes('input tax') || name.toLowerCase().includes('output tax');

      result.set(name, {
        name,
        type,
        normalBalance: normalBalanceMap[rootType] || 'debit',
        statement: statementMap[rootType] || 'balance_sheet',
        subtype: rootType === 'Asset' ? 'current_asset' : rootType === 'Liability' ? 'current_liability' : rootType === 'Income' ? 'operating_revenue' : 'operating_expense',
        isGST: isGSTAccount,
        gstType: name.toLowerCase().includes('output') ? 'output' : name.toLowerCase().includes('input') ? 'input' : undefined,
        jurisdiction,
      });
    }

    // Traverse children
    if (node.children) for (const child of node.children) traverse(child, rootType);
    if (node.accounts) for (const child of node.accounts) traverse(child, rootType);
  }

  if (Array.isArray(data)) {
    for (const root of data) traverse(root);
  } else {
    traverse(data);
  }

  return result;
}

// ============================================================================
// SG GST RATE HISTORY — Critical: real Xero GLs contain all 3 rates
// The actual design partner GL (parse-xero-gl.ts) contains "GST 8%" entries
// (pre-Feb 2024). Claude fails when it assumes a single GST rate.
// Source: IRAS GST rate change announcements (public)
// ============================================================================

export interface SGGSTRateEntry {
  rate: number;
  rateLabel: string;       // Exact string in Xero taxRateName field
  effectiveFrom: string;   // ISO date
  effectiveTo: string | null;
  irasAnnouncement: string;
}

export const SG_GST_RATE_HISTORY: SGGSTRateEntry[] = [
  {
    rate: 0.07,
    rateLabel: 'GST 7%',
    effectiveFrom: '2007-07-01',
    effectiveTo: '2022-12-31',
    irasAnnouncement: 'GST Act amendment 2002 — rate set at 7% from 1 Jul 2003, later maintained',
  },
  {
    rate: 0.08,
    rateLabel: 'GST 8%',
    effectiveFrom: '2023-01-01',
    effectiveTo: '2023-12-31',
    irasAnnouncement: 'IRAS circular Nov 2022 — GST rate increased from 7% to 8% on 1 Jan 2023',
  },
  {
    rate: 0.09,
    rateLabel: 'GST 9%',
    effectiveFrom: '2024-01-01',
    effectiveTo: null, // Current rate
    irasAnnouncement: 'IRAS circular Nov 2023 — GST rate increased from 8% to 9% on 1 Jan 2024',
  },
];

/** Get the correct SG GST rate for a given transaction date */
export function getSGGSTRate(date: string): SGGSTRateEntry {
  const d = new Date(date);
  for (const entry of [...SG_GST_RATE_HISTORY].reverse()) {
    if (d >= new Date(entry.effectiveFrom)) return entry;
  }
  return SG_GST_RATE_HISTORY[0]; // fallback to oldest
}

// ============================================================================
// SYNTHETIC ACCOUNTING SCENARIOS GENERATOR
// Source: OpenStax Principles of Accounting (CC BY 4.0) + SFRS examples
// These are mathematically correct double-entry scenarios for SaaS companies.
// This is the KEY training data that teaches the brain to beat Claude baseline.
// ============================================================================

export function buildSyntheticAccountingScenarios(): SyntheticAccountingScenario[] {
  const scenarios: SyntheticAccountingScenario[] = [];

  // Generate 12 months × 4 company profiles = 48 base scenarios
  // Plus 13 edge-case scenarios (deferred revenue, FX, write-offs, SFRS 16, bad debt, etc.)
  // Total target: 61+ scenarios
  const profiles = [
    { id: 'saas_sg_growth', type: 'saas_sg', revenue: 180000, cogs: 54000, payroll: 72000, rdRatio: 0.20, gstRate: 0.09 },
    { id: 'saas_sg_early', type: 'saas_sg', revenue: 45000, cogs: 13500, payroll: 25000, rdRatio: 0.25, gstRate: 0.09 },
    { id: 'saas_au_growth', type: 'saas_au', revenue: 220000, cogs: 66000, payroll: 88000, rdRatio: 0.18, gstRate: 0.10 },
    { id: 'consulting_sg', type: 'consulting_sg', revenue: 95000, cogs: 38000, payroll: 52000, rdRatio: 0.03, gstRate: 0.09 },
  ];

  const months2025 = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
                       '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12'];

  let scenarioIdx = 0;
  for (const profile of profiles) {
    for (const period of months2025.slice(0, 12)) { // 12 months per profile = 48 base scenarios
      scenarios.push(buildMonthEndScenario(
        `${profile.id}_${period}`,
        profile.type as any,
        period,
        profile.revenue * (0.9 + Math.random() * 0.2), // ±10% variance
        profile.cogs,
        profile.payroll,
        profile.rdRatio,
        profile.gstRate,
      ));
      scenarioIdx++;
    }
  }

  // Add edge-case scenarios (crucial for beating Claude on edge cases)
  scenarios.push(...buildEdgeCaseScenarios());

  return scenarios;
}

function buildMonthEndScenario(
  id: string,
  companyType: 'saas_sg' | 'saas_au' | 'consulting_sg',
  period: string,
  monthlyRevenue: number,
  cogs: number,
  payroll: number,
  rdRatio: number,
  gstRate: number,
): SyntheticAccountingScenario {
  const r = Math.round; // Round to whole numbers for clarity
  const rev = r(monthlyRevenue);
  const cogsAmt = r(cogs);
  const grossProfit = rev - cogsAmt;
  const rdAmt = r(rev * rdRatio);
  const salesMktAmt = r(rev * 0.12);
  const gaAmt = r(rev * 0.08);
  const rentAmt = r(rev * 0.04);
  const totalOpEx = payroll + rdAmt + salesMktAmt + gaAmt + rentAmt;
  const operatingIncome = grossProfit - totalOpEx;
  const incomeTax = operatingIncome > 0 ? r(operatingIncome * 0.17) : 0; // SG corp tax 17%
  const netIncome = operatingIncome - incomeTax;

  const gstOnSales = r(rev * gstRate);
  const gstOnPurchases = r((cogsAmt + gaAmt) * gstRate);
  const netGST = gstOnSales - gstOnPurchases;

  const jurisdiction = companyType.includes('au') ? 'au' : 'sg';
  const gstOutputAccount = jurisdiction === 'sg' ? 'GST Output Tax' : 'GST Collected';
  const gstInputAccount = jurisdiction === 'sg' ? 'GST Input Tax' : 'GST Claimable';
  const gstPayableAccount = jurisdiction === 'sg' ? 'IRAS Payable' : 'BAS Liability';
  const cpfAccount = jurisdiction === 'sg' ? 'CPF Payable' : 'Superannuation Payable';
  const cpfExpAccount = jurisdiction === 'sg' ? 'CPF Expense' : 'Superannuation Expense';
  const cpfRate = jurisdiction === 'sg' ? 0.17 : 0.11; // Employer CPF 17% / Super 11%
  const cpfAmt = r(payroll * cpfRate);

  // Build transactions (double-entry, always balanced)
  const transactions: SyntheticTransaction[] = [
    // Revenue recognition — invoice raised to customer
    { date: `${period}-05`, description: `Customer invoice - ${companyType} subscription`, reference: `INV-${id}-001`, account: 'Accounts Receivable', debit: rev + gstOnSales, credit: 0, taxRateName: `GST ${(gstRate * 100).toFixed(0)}%`, taxAmount: gstOnSales },
    { date: `${period}-05`, description: `Customer invoice - ${companyType} subscription`, reference: `INV-${id}-001`, account: 'Revenue', debit: 0, credit: rev, taxRateName: `GST ${(gstRate * 100).toFixed(0)}%`, taxAmount: 0 },
    { date: `${period}-05`, description: `GST on sales - ${companyType}`, reference: `INV-${id}-001`, account: gstOutputAccount, debit: 0, credit: gstOnSales, taxRateName: `GST ${(gstRate * 100).toFixed(0)}%`, taxAmount: gstOnSales },
    // Cash received from customer
    { date: `${period}-15`, description: `Payment received - customer`, reference: `PAY-${id}-001`, account: 'Bank', debit: rev + gstOnSales, credit: 0, taxRateName: 'No Tax', taxAmount: 0 },
    { date: `${period}-15`, description: `Payment received - customer`, reference: `PAY-${id}-001`, account: 'Accounts Receivable', debit: 0, credit: rev + gstOnSales, taxRateName: 'No Tax', taxAmount: 0 },
    // COGS — Cloud/hosting
    { date: `${period}-10`, description: `Cloud infrastructure costs`, reference: `BILL-${id}-001`, account: 'Cloud Infrastructure', debit: cogsAmt, credit: 0, taxRateName: `GST ${(gstRate * 100).toFixed(0)}%`, taxAmount: 0 },
    { date: `${period}-10`, description: `GST on cloud services`, reference: `BILL-${id}-001`, account: gstInputAccount, debit: r(cogsAmt * gstRate), credit: 0, taxRateName: `GST ${(gstRate * 100).toFixed(0)}%`, taxAmount: r(cogsAmt * gstRate) },
    { date: `${period}-10`, description: `Cloud infrastructure costs payable`, reference: `BILL-${id}-001`, account: 'Accounts Payable', debit: 0, credit: cogsAmt + r(cogsAmt * gstRate), taxRateName: `GST ${(gstRate * 100).toFixed(0)}%`, taxAmount: 0 },
    // Payroll
    { date: `${period}-28`, description: `Payroll - ${period}`, reference: `PAY-${id}-PAYROLL`, account: 'Salaries and Wages', debit: payroll, credit: 0, taxRateName: 'No Tax', taxAmount: 0 },
    { date: `${period}-28`, description: `${jurisdiction === 'sg' ? 'CPF' : 'Superannuation'} employer contribution`, reference: `PAY-${id}-CPF`, account: cpfExpAccount, debit: cpfAmt, credit: 0, taxRateName: 'No Tax', taxAmount: 0 },
    { date: `${period}-28`, description: `Payroll payment from bank`, reference: `PAY-${id}-PAYROLL`, account: 'Bank', debit: 0, credit: payroll, taxRateName: 'No Tax', taxAmount: 0 },
    { date: `${period}-28`, description: `${jurisdiction === 'sg' ? 'CPF' : 'Superannuation'} payable`, reference: `PAY-${id}-CPF`, account: cpfAccount, debit: 0, credit: cpfAmt, taxRateName: 'No Tax', taxAmount: 0 },
    // R&D
    { date: `${period}-20`, description: `R&D expenses - software development`, reference: `EXP-${id}-RD`, account: 'Research and Development', debit: rdAmt, credit: 0, taxRateName: 'No Tax', taxAmount: 0 },
    { date: `${period}-20`, description: `R&D expenses paid`, reference: `EXP-${id}-RD`, account: 'Bank', debit: 0, credit: rdAmt, taxRateName: 'No Tax', taxAmount: 0 },
    // Sales & Marketing
    { date: `${period}-15`, description: `Marketing spend - digital ads`, reference: `EXP-${id}-MKT`, account: 'Marketing', debit: salesMktAmt, credit: 0, taxRateName: `GST ${(gstRate * 100).toFixed(0)}%`, taxAmount: 0 },
    { date: `${period}-15`, description: `Marketing GST`, reference: `EXP-${id}-MKT`, account: gstInputAccount, debit: r(salesMktAmt * gstRate), credit: 0, taxRateName: `GST ${(gstRate * 100).toFixed(0)}%`, taxAmount: r(salesMktAmt * gstRate) },
    { date: `${period}-15`, description: `Marketing spend paid`, reference: `EXP-${id}-MKT`, account: 'Bank', debit: 0, credit: salesMktAmt + r(salesMktAmt * gstRate), taxRateName: `GST ${(gstRate * 100).toFixed(0)}%`, taxAmount: 0 },
    // Rent
    { date: `${period}-01`, description: `Office rent - ${period}`, reference: `RENT-${id}`, account: 'Office Rent', debit: rentAmt, credit: 0, taxRateName: 'No Tax', taxAmount: 0 },
    { date: `${period}-01`, description: `Office rent paid`, reference: `RENT-${id}`, account: 'Bank', debit: 0, credit: rentAmt, taxRateName: 'No Tax', taxAmount: 0 },
    // Income tax accrual (if profitable)
    ...(incomeTax > 0 ? [
      { date: `${period}-31`, description: `Income tax provision`, reference: `TAX-${id}`, account: 'Income Tax Expense', debit: incomeTax, credit: 0, taxRateName: 'No Tax', taxAmount: 0 },
      { date: `${period}-31`, description: `Income tax payable`, reference: `TAX-${id}`, account: 'Income Tax Payable', debit: 0, credit: incomeTax, taxRateName: 'No Tax', taxAmount: 0 },
    ] : []),
  ];

  // Build Trial Balance from transactions
  const accountTotals = new Map<string, { debit: number; credit: number }>();
  for (const t of transactions) {
    const entry = accountTotals.get(t.account) || { debit: 0, credit: 0 };
    entry.debit += t.debit;
    entry.credit += t.credit;
    accountTotals.set(t.account, entry);
  }

  const trialBalance: TrialBalanceLine[] = [];
  for (const [account, totals] of accountTotals) {
    const coaEntry = GAAP_COA_MAP.get(account);
    const accountType = coaEntry?.type || 'asset';
    const normalBalance = coaEntry?.normalBalance || 'debit';
    const netAmount = totals.debit - totals.credit;

    trialBalance.push({
      account,
      accountType,
      debitBalance: normalBalance === 'debit' && netAmount > 0 ? netAmount : (normalBalance === 'credit' && netAmount < 0 ? -netAmount : 0),
      creditBalance: normalBalance === 'credit' && -netAmount > 0 ? -netAmount : (normalBalance === 'debit' && netAmount < 0 ? -netAmount : 0),
    });
  }

  // Build P&L
  const pl: PLStatement = {
    revenue: rev,
    cogs: cogsAmt,
    grossProfit,
    grossMargin: Math.round((grossProfit / rev) * 1000) / 1000,
    operatingExpenses: [
      { name: 'Salaries and Wages', amount: payroll },
      { name: 'CPF / Superannuation', amount: cpfAmt },
      { name: 'Research and Development', amount: rdAmt },
      { name: 'Marketing', amount: salesMktAmt },
      { name: 'General and Administrative', amount: gaAmt },
      { name: 'Office Rent', amount: rentAmt },
    ],
    totalOpEx: totalOpEx + cpfAmt,
    operatingIncome: grossProfit - (totalOpEx + cpfAmt),
    otherIncome: 0,
    netIncomeBeforeTax: grossProfit - (totalOpEx + cpfAmt),
    incomeTax,
    netIncome: grossProfit - (totalOpEx + cpfAmt) - incomeTax,
  };

  // Build Balance Sheet (simplified — opening balances = 0 for scenario)
  const openingCash = r(rev * 2.5); // Assume healthy cash position
  const closingCash = openingCash + rev + gstOnSales - cogsAmt - r(cogsAmt * gstRate) - payroll - cpfAmt - rdAmt - salesMktAmt - r(salesMktAmt * gstRate) - rentAmt - incomeTax;
  const arAmt = 0; // AR cleared (payment received)
  const apAmt = cogsAmt + r(cogsAmt * gstRate); // AP still outstanding
  const gstInputAmt = r(cogsAmt * gstRate) + r(salesMktAmt * gstRate);

  const totalCurrentAssets = closingCash + arAmt + gstInputAmt;
  const totalFixedAssets = r(rev * 0.5);
  const totalAssets = totalCurrentAssets + totalFixedAssets;

  const totalCurrentLiab = apAmt + netGST + cpfAmt + incomeTax;
  const totalLTLiab = r(rev * 0.3);
  const totalLiab = totalCurrentLiab + totalLTLiab;
  const retainedEarnings = totalAssets - totalLiab - r(rev * 1.5); // Plug retained earnings
  const shareCapital = r(rev * 1.5);

  const bs: BalanceSheetStatement = {
    assets: {
      currentAssets: [
        { name: 'Bank', amount: closingCash },
        { name: gstInputAccount, amount: gstInputAmt },
      ],
      fixedAssets: [
        { name: 'Equipment', amount: totalFixedAssets },
      ],
    },
    liabilities: {
      currentLiabilities: [
        { name: 'Accounts Payable', amount: apAmt },
        { name: gstPayableAccount, amount: netGST },
        { name: cpfAccount, amount: cpfAmt },
        ...(incomeTax > 0 ? [{ name: 'Income Tax Payable', amount: incomeTax }] : []),
      ],
      longTermLiabilities: [
        { name: 'Bank Loan', amount: totalLTLiab },
      ],
    },
    equity: [
      { name: 'Share Capital', amount: shareCapital },
      { name: 'Retained Earnings', amount: retainedEarnings },
    ],
    totalAssets,
    totalLiabilities: totalLiab,
    totalEquity: shareCapital + retainedEarnings,
    isBalanced: Math.abs(totalAssets - (totalLiab + shareCapital + retainedEarnings)) < 1,
  };

  // GST Computation
  const gst: GSTComputation = {
    jurisdiction,
    gstRate,
    totalSales: rev,
    gstOnSales,
    totalPurchases: cogsAmt + salesMktAmt,
    gstOnPurchases,
    netGSTPayable: netGST,
    gstOutputTaxAccount: gstOutputAccount,
    gstInputTaxAccount: gstInputAccount,
    gstPayableAccount,
  };

  // Transaction Interpretations
  const interpretations: TransactionInterpretation[] = [
    {
      transactionRef: `INV-${id}-001`,
      account: 'Accounts Receivable',
      drCr: 'DR',
      amount: rev + gstOnSales,
      interpretation: `Customer invoice raised for ${companyType} service. Debiting AR records the amount owed by the customer including ${(gstRate * 100).toFixed(0)}% GST.`,
      impactOnFinancials: 'Increases Accounts Receivable on Balance Sheet',
    },
    {
      transactionRef: `INV-${id}-001`,
      account: 'Revenue',
      drCr: 'CR',
      amount: rev,
      interpretation: `Revenue recognised on invoice date per SFRS 15. Credit to Revenue increases income (ex-GST amount only — GST is not income).`,
      impactOnFinancials: 'Increases Revenue in P&L Income Statement',
    },
    {
      transactionRef: `INV-${id}-001`,
      account: gstOutputAccount,
      drCr: 'CR',
      amount: gstOnSales,
      interpretation: `GST Output Tax collected on behalf of ${jurisdiction === 'sg' ? 'IRAS' : 'ATO'}. Credit records the GST liability to be remitted.`,
      impactOnFinancials: `Increases ${gstOutputAccount} liability on Balance Sheet`,
    },
    {
      transactionRef: `PAY-${id}-PAYROLL`,
      account: 'Salaries and Wages',
      drCr: 'DR',
      amount: payroll,
      interpretation: `Monthly payroll expense recognised. Debit to Salaries expense flows through P&L, reducing operating income.`,
      impactOnFinancials: 'Increases Salaries Expense in P&L, reduces Net Income',
    },
  ];

  return {
    id,
    companyType,
    period,
    transactions,
    trialBalance,
    pl,
    balanceSheet: bs,
    gst,
    interpretations,
  };
}

/**
 * Edge case scenarios — these are exactly where Claude fails but NexusBrain should win.
 */
function buildEdgeCaseScenarios(): SyntheticAccountingScenario[] {
  const scenarios: SyntheticAccountingScenario[] = [];

  // Edge Case 1: Deferred Revenue (prepaid subscription — LIABILITY not Revenue)
  // Claude often books deferred revenue to P&L immediately — WRONG
  {
    const rev = 60000; // Annual subscription paid upfront
    const monthlyRecognised = 5000; // Only 1/12 recognised in month
    const deferred = rev - monthlyRecognised;
    const gstRate = 0.09;
    const gstAmt = Math.round(rev * gstRate);

    const transactions: SyntheticTransaction[] = [
      { date: '2025-01-01', description: 'Annual subscription received upfront', reference: 'INV-DEFERRED-001', account: 'Bank', debit: rev + gstAmt, credit: 0, taxRateName: 'GST 9%', taxAmount: gstAmt },
      { date: '2025-01-01', description: 'GST on upfront subscription', reference: 'INV-DEFERRED-001', account: 'GST Output Tax', debit: 0, credit: gstAmt, taxRateName: 'GST 9%', taxAmount: gstAmt },
      { date: '2025-01-01', description: 'Annual subscription - deferred', reference: 'INV-DEFERRED-001', account: 'Deferred Revenue', debit: 0, credit: rev, taxRateName: 'No Tax', taxAmount: 0 },
      { date: '2025-01-31', description: 'Revenue recognition - Jan portion (1/12)', reference: 'REV-REC-JAN', account: 'Deferred Revenue', debit: monthlyRecognised, credit: 0, taxRateName: 'No Tax', taxAmount: 0 },
      { date: '2025-01-31', description: 'Revenue recognition - Jan portion (1/12)', reference: 'REV-REC-JAN', account: 'Revenue', debit: 0, credit: monthlyRecognised, taxRateName: 'No Tax', taxAmount: 0 },
    ];

    const trialBalance: TrialBalanceLine[] = [
      { account: 'Bank', accountType: 'asset', debitBalance: rev + gstAmt, creditBalance: 0 },
      { account: 'GST Output Tax', accountType: 'liability', debitBalance: 0, creditBalance: gstAmt },
      { account: 'Deferred Revenue', accountType: 'liability', debitBalance: 0, creditBalance: deferred },
      { account: 'Revenue', accountType: 'revenue', debitBalance: 0, creditBalance: monthlyRecognised },
    ];

    scenarios.push({
      id: 'edge_deferred_revenue_sg',
      companyType: 'saas_sg',
      period: '2025-01',
      transactions,
      trialBalance,
      pl: {
        revenue: monthlyRecognised, // ONLY recognised portion!
        cogs: 0, grossProfit: monthlyRecognised, grossMargin: 1.0,
        operatingExpenses: [], totalOpEx: 0,
        operatingIncome: monthlyRecognised, otherIncome: 0,
        netIncomeBeforeTax: monthlyRecognised, incomeTax: 0,
        netIncome: monthlyRecognised,
      },
      balanceSheet: {
        assets: { currentAssets: [{ name: 'Bank', amount: rev + gstAmt }], fixedAssets: [] },
        liabilities: {
          currentLiabilities: [{ name: 'GST Output Tax', amount: gstAmt }, { name: 'Deferred Revenue', amount: deferred }],
          longTermLiabilities: [],
        },
        equity: [{ name: 'Retained Earnings', amount: monthlyRecognised }],
        totalAssets: rev + gstAmt,
        totalLiabilities: gstAmt + deferred,
        totalEquity: monthlyRecognised,
        isBalanced: Math.abs((rev + gstAmt) - (gstAmt + deferred + monthlyRecognised)) < 1,
      },
      gst: {
        jurisdiction: 'sg', gstRate: 0.09,
        totalSales: rev, gstOnSales: gstAmt,
        totalPurchases: 0, gstOnPurchases: 0,
        netGSTPayable: gstAmt,
        gstOutputTaxAccount: 'GST Output Tax',
        gstInputTaxAccount: 'GST Input Tax',
        gstPayableAccount: 'IRAS Payable',
      },
      interpretations: [
        {
          transactionRef: 'INV-DEFERRED-001',
          account: 'Deferred Revenue',
          drCr: 'CR',
          amount: rev,
          interpretation: 'Annual subscription received upfront. Revenue is NOT yet earned — it is deferred to Balance Sheet as a liability. Revenue is recognised at $5,000/month over 12 months per SFRS 15.',
          impactOnFinancials: 'Increases Deferred Revenue LIABILITY on Balance Sheet. No P&L impact until revenue is recognised.',
        },
      ],
    });
  }

  // Edge Case 1b: Zero-Rated Revenue (export of services to overseas clients)
  // CRITICAL for design partner: license fees to overseas banks (HSBC, SCB) = 0% GST
  // Include in GST F5 Box 1 (total supplies) but NOT in Box 6 (output tax)
  // Claude typically either omits this from Box 1 or incorrectly charges 9% GST on it
  {
    const zeroRatedRev = 80000;   // License fee to overseas bank (zero-rated)
    const stdRatedRev  = 40000;   // Implementation fee to SG entity (standard-rated 9%)
    const gstRate = 0.09;
    const gstOnStd = Math.round(stdRatedRev * gstRate);  // Only on std-rated portion

    const transactions: SyntheticTransaction[] = [
      // Zero-rated invoice (export of services — no GST charged, no Output Tax)
      { date: '2025-02-10', description: 'License fee - HSBC Holdings (zero-rated export)', reference: 'INV-ZR-001', account: 'Accounts Receivable', debit: zeroRatedRev, credit: 0, taxRateName: 'Zero-Rated Supplies', taxAmount: 0 },
      { date: '2025-02-10', description: 'License fee - HSBC Holdings (zero-rated export)', reference: 'INV-ZR-001', account: 'License Fees', debit: 0, credit: zeroRatedRev, taxRateName: 'Zero-Rated Supplies', taxAmount: 0 },
      // Standard-rated invoice (domestic SG customer — GST 9%)
      { date: '2025-02-15', description: 'Implementation fee - Singapore entity', reference: 'INV-STD-001', account: 'Accounts Receivable', debit: stdRatedRev + gstOnStd, credit: 0, taxRateName: 'GST 9%', taxAmount: gstOnStd },
      { date: '2025-02-15', description: 'Implementation fee - Singapore entity', reference: 'INV-STD-001', account: 'Implementation Fees', debit: 0, credit: stdRatedRev, taxRateName: 'GST 9%', taxAmount: 0 },
      { date: '2025-02-15', description: 'GST 9% on implementation fee', reference: 'INV-STD-001', account: 'GST Output Tax', debit: 0, credit: gstOnStd, taxRateName: 'GST 9%', taxAmount: gstOnStd },
    ];

    scenarios.push({
      id: 'edge_zero_rated_revenue_sg',
      companyType: 'saas_sg',
      period: '2025-02',
      transactions,
      trialBalance: [
        { account: 'Accounts Receivable', accountType: 'asset', debitBalance: zeroRatedRev + stdRatedRev + gstOnStd, creditBalance: 0 },
        { account: 'License Fees', accountType: 'revenue', debitBalance: 0, creditBalance: zeroRatedRev },
        { account: 'Implementation Fees', accountType: 'revenue', debitBalance: 0, creditBalance: stdRatedRev },
        { account: 'GST Output Tax', accountType: 'liability', debitBalance: 0, creditBalance: gstOnStd },
      ],
      pl: {
        revenue: zeroRatedRev + stdRatedRev, cogs: 0, grossProfit: zeroRatedRev + stdRatedRev, grossMargin: 1.0,
        operatingExpenses: [], totalOpEx: 0, operatingIncome: zeroRatedRev + stdRatedRev,
        otherIncome: 0, netIncomeBeforeTax: zeroRatedRev + stdRatedRev, incomeTax: 0,
        netIncome: zeroRatedRev + stdRatedRev,
      },
      balanceSheet: {
        assets: { currentAssets: [{ name: 'Accounts Receivable', amount: zeroRatedRev + stdRatedRev + gstOnStd }], fixedAssets: [] },
        liabilities: { currentLiabilities: [{ name: 'GST Output Tax', amount: gstOnStd }], longTermLiabilities: [] },
        equity: [{ name: 'Retained Earnings', amount: zeroRatedRev + stdRatedRev }],
        totalAssets: zeroRatedRev + stdRatedRev + gstOnStd,
        totalLiabilities: gstOnStd,
        totalEquity: zeroRatedRev + stdRatedRev,
        isBalanced: true,
      },
      gst: {
        jurisdiction: 'sg', gstRate: 0.09,
        totalSales: zeroRatedRev + stdRatedRev,  // Box 1: ALL supplies including zero-rated
        gstOnSales: gstOnStd,                     // Box 6: ONLY output tax on std-rated
        totalPurchases: 0, gstOnPurchases: 0,
        netGSTPayable: gstOnStd,
        gstOutputTaxAccount: 'GST Output Tax', gstInputTaxAccount: 'GST Input Tax', gstPayableAccount: 'IRAS Payable',
      },
      interpretations: [
        {
          transactionRef: 'INV-ZR-001', account: 'License Fees', drCr: 'CR', amount: zeroRatedRev,
          interpretation: 'License fee billed to overseas client (HSBC Holdings, non-SG entity). This is a zero-rated supply under IRAS GST rules — GST rate is 0%, no output tax charged. Revenue is $80,000 to P&L. Include $80,000 in GST F5 Box 1 (total supplies) but NOT in Box 6 (output tax). The full $80,000 is received without GST.',
          impactOnFinancials: 'Increases License Fee revenue on P&L. Zero output tax. Included in GST F5 Box 1 but not Box 6.',
        },
        {
          transactionRef: 'INV-STD-001', account: 'GST Output Tax', drCr: 'CR', amount: gstOnStd,
          interpretation: 'Standard-rated implementation fee to SG entity — 9% GST applies. Output Tax $3,600 is a liability to IRAS. Include in GST F5 Box 1 (supplies) AND Box 6 (output tax). Total invoice amount = $40,000 + $3,600 GST = $43,600.',
          impactOnFinancials: 'Increases GST Output Tax liability on Balance Sheet. Included in both Box 1 and Box 6 of GST F5.',
        },
      ],
    });
  }

  // Edge Case 2: GST on Imported Services (IRAS regulation — Claude often gets this wrong)
  // Under SG rules, imported services from overseas are subject to GST (reverse charge from 2020)
  {
    const serviceAmt = 10000; // AWS bill from US
    const gstRate = 0.09;
    const gstAmt = Math.round(serviceAmt * gstRate); // Self-assessed GST

    const transactions: SyntheticTransaction[] = [
      { date: '2025-01-15', description: 'AWS cloud services (imported - reverse charge GST)', reference: 'AWS-JAN', account: 'Cloud Infrastructure', debit: serviceAmt, credit: 0, taxRateName: 'GST 9% (Reverse Charge)', taxAmount: 0 },
      // Reverse charge: simultaneously debit GST Input Tax AND credit GST Output Tax
      { date: '2025-01-15', description: 'Self-assessed GST - imported services', reference: 'AWS-JAN-GST', account: 'GST Input Tax', debit: gstAmt, credit: 0, taxRateName: 'GST 9% (Reverse Charge)', taxAmount: gstAmt },
      { date: '2025-01-15', description: 'Self-assessed GST output - imported services', reference: 'AWS-JAN-GST', account: 'GST Output Tax', debit: 0, credit: gstAmt, taxRateName: 'GST 9% (Reverse Charge)', taxAmount: gstAmt },
      { date: '2025-01-15', description: 'AWS payment', reference: 'AWS-JAN', account: 'Accounts Payable', debit: 0, credit: serviceAmt, taxRateName: 'No Tax', taxAmount: 0 },
    ];

    scenarios.push({
      id: 'edge_imported_services_gst_sg',
      companyType: 'saas_sg',
      period: '2025-01',
      transactions,
      trialBalance: [
        { account: 'Cloud Infrastructure', accountType: 'expense', debitBalance: serviceAmt, creditBalance: 0 },
        { account: 'GST Input Tax', accountType: 'asset', debitBalance: gstAmt, creditBalance: 0 },
        { account: 'GST Output Tax', accountType: 'liability', debitBalance: 0, creditBalance: gstAmt },
        { account: 'Accounts Payable', accountType: 'liability', debitBalance: 0, creditBalance: serviceAmt },
      ],
      pl: {
        revenue: 0, cogs: serviceAmt, grossProfit: -serviceAmt, grossMargin: 0,
        operatingExpenses: [], totalOpEx: 0,
        operatingIncome: -serviceAmt, otherIncome: 0,
        netIncomeBeforeTax: -serviceAmt, incomeTax: 0,
        netIncome: -serviceAmt,
      },
      balanceSheet: {
        assets: { currentAssets: [{ name: 'GST Input Tax', amount: gstAmt }], fixedAssets: [] },
        liabilities: {
          currentLiabilities: [{ name: 'Accounts Payable', amount: serviceAmt }, { name: 'GST Output Tax', amount: gstAmt }],
          longTermLiabilities: [],
        },
        equity: [{ name: 'Retained Earnings', amount: -(serviceAmt + gstAmt - gstAmt) }],
        totalAssets: gstAmt,
        totalLiabilities: serviceAmt + gstAmt,
        totalEquity: -(serviceAmt),
        isBalanced: true,
      },
      gst: {
        jurisdiction: 'sg', gstRate: 0.09,
        totalSales: 0, gstOnSales: gstAmt, // Output = self-assessed
        totalPurchases: serviceAmt, gstOnPurchases: gstAmt, // Input = self-assessed
        netGSTPayable: 0, // Net = 0 (both debit and credit cancel for fully-taxable business)
        gstOutputTaxAccount: 'GST Output Tax',
        gstInputTaxAccount: 'GST Input Tax',
        gstPayableAccount: 'IRAS Payable',
      },
      interpretations: [
        {
          transactionRef: 'AWS-JAN-GST',
          account: 'GST Input Tax',
          drCr: 'DR',
          amount: gstAmt,
          interpretation: 'Imported services from overseas (AWS USA) are subject to IRAS Reverse Charge GST from Jan 2020. Self-assess GST by both debiting Input Tax (claimable) and crediting Output Tax (payable). For a fully GST-registered business, the net GST = $0.',
          impactOnFinancials: 'Net zero GST impact for fully-registered GST business on imported services.',
        },
      ],
    });
  }

  // Edge Case 3: GST Rate Change Mid-Year (2023 transition: GST 7% → GST 8%)
  // The design partner GL has transactions from 2022 (7%) and 2023 (8%) in the SAME file.
  // Claude typically assumes a single rate; brain must check taxRateName per row.
  {
    const rev2022 = 50000;
    const rev2023 = 55000;
    const gst7 = Math.round(rev2022 * 0.07);
    const gst8 = Math.round(rev2023 * 0.08);

    const transactions: SyntheticTransaction[] = [
      // Dec 2022 invoice — GST 7%
      { date: '2022-12-15', description: 'License fee Q4 2022 - GST 7%', reference: 'INV-2022-Q4', account: 'Accounts Receivable', debit: rev2022 + gst7, credit: 0, taxRateName: 'GST 7%', taxAmount: gst7 },
      { date: '2022-12-15', description: 'License fee Q4 2022', reference: 'INV-2022-Q4', account: 'License Fees', debit: 0, credit: rev2022, taxRateName: 'GST 7%', taxAmount: 0 },
      { date: '2022-12-15', description: 'GST 7% on license fee', reference: 'INV-2022-Q4', account: 'GST Output Tax', debit: 0, credit: gst7, taxRateName: 'GST 7%', taxAmount: gst7 },
      // Jan 2023 invoice — GST 8% (new rate from 1 Jan 2023)
      { date: '2023-01-15', description: 'License fee Q1 2023 - GST 8%', reference: 'INV-2023-Q1', account: 'Accounts Receivable', debit: rev2023 + gst8, credit: 0, taxRateName: 'GST 8%', taxAmount: gst8 },
      { date: '2023-01-15', description: 'License fee Q1 2023', reference: 'INV-2023-Q1', account: 'License Fees', debit: 0, credit: rev2023, taxRateName: 'GST 8%', taxAmount: 0 },
      { date: '2023-01-15', description: 'GST 8% on license fee', reference: 'INV-2023-Q1', account: 'GST Output Tax', debit: 0, credit: gst8, taxRateName: 'GST 8%', taxAmount: gst8 },
    ];

    scenarios.push({
      id: 'edge_gst_rate_change_7pct_to_8pct',
      companyType: 'saas_sg',
      period: '2022-12',
      transactions,
      trialBalance: [
        { account: 'Accounts Receivable', accountType: 'asset', debitBalance: rev2022 + gst7 + rev2023 + gst8, creditBalance: 0 },
        { account: 'License Fees', accountType: 'revenue', debitBalance: 0, creditBalance: rev2022 + rev2023 },
        { account: 'GST Output Tax', accountType: 'liability', debitBalance: 0, creditBalance: gst7 + gst8 },
      ],
      pl: {
        revenue: rev2022 + rev2023, cogs: 0, grossProfit: rev2022 + rev2023, grossMargin: 1.0,
        operatingExpenses: [], totalOpEx: 0, operatingIncome: rev2022 + rev2023,
        otherIncome: 0, netIncomeBeforeTax: rev2022 + rev2023, incomeTax: 0, netIncome: rev2022 + rev2023,
      },
      balanceSheet: {
        assets: { currentAssets: [{ name: 'Accounts Receivable', amount: rev2022 + gst7 + rev2023 + gst8 }], fixedAssets: [] },
        liabilities: { currentLiabilities: [{ name: 'GST Output Tax', amount: gst7 + gst8 }], longTermLiabilities: [] },
        equity: [{ name: 'Retained Earnings', amount: rev2022 + rev2023 }],
        totalAssets: rev2022 + gst7 + rev2023 + gst8,
        totalLiabilities: gst7 + gst8,
        totalEquity: rev2022 + rev2023,
        isBalanced: true,
      },
      gst: {
        jurisdiction: 'sg', gstRate: 0.08, // Mixed — must use per-row taxRateName
        totalSales: rev2022 + rev2023, gstOnSales: gst7 + gst8,
        totalPurchases: 0, gstOnPurchases: 0, netGSTPayable: gst7 + gst8,
        gstOutputTaxAccount: 'GST Output Tax', gstInputTaxAccount: 'GST Input Tax', gstPayableAccount: 'IRAS Payable',
      },
      interpretations: [
        {
          transactionRef: 'INV-2022-Q4', account: 'GST Output Tax', drCr: 'CR', amount: gst7,
          interpretation: 'GST at 7% applied — transaction date Dec 2022, before rate change. ALWAYS use taxRateName from each GL row, not a single assumed rate. This GL contains BOTH "GST 7%" (pre-2023) and "GST 8%" (2023) rows.',
          impactOnFinancials: 'Output tax at historical rate must match taxRateName field exactly.',
        },
      ],
    });
  }

  // Edge Case 4: FX Revaluation — Unrealised FX Gain/Loss (very common in SG multi-currency)
  // The design partner has USD-denominated receivables revalued at month-end SGD rates.
  // Claude often misclassifies "Unrealised foreign exchange differences" as an operating expense.
  {
    const usdReceivable = 100000; // Original SGD equivalent at invoice date (e.g. USD 75k @ 1.333)
    const fxGain = 2500;          // Month-end revaluation: SGD strengthened, receivable worth more

    const transactions: SyntheticTransaction[] = [
      // Original USD invoice (booked at historical rate)
      { date: '2025-01-05', description: 'License fee invoice - USD (original booking)', reference: 'INV-USD-001', account: 'Accounts Receivable', debit: usdReceivable, credit: 0, taxRateName: 'Zero-Rated Supplies', taxAmount: 0 },
      { date: '2025-01-05', description: 'License fee - overseas client USD', reference: 'INV-USD-001', account: 'License Fees', debit: 0, credit: usdReceivable, taxRateName: 'Zero-Rated Supplies', taxAmount: 0 },
      // Month-end FX revaluation (unrealised — no cash movement, just accounting adjustment)
      { date: '2025-01-31', description: 'Unrealised foreign exchange differences', reference: 'FX-REVAL-JAN', account: 'Accounts Receivable', debit: fxGain, credit: 0, taxRateName: 'No Tax', taxAmount: 0 },
      { date: '2025-01-31', description: 'Unrealised foreign exchange differences', reference: 'FX-REVAL-JAN', account: 'Unrealised Foreign Exchange Gain', debit: 0, credit: fxGain, taxRateName: 'No Tax', taxAmount: 0 },
    ];

    scenarios.push({
      id: 'edge_fx_revaluation_unrealised_gain',
      companyType: 'saas_sg',
      period: '2025-01',
      transactions,
      trialBalance: [
        { account: 'Accounts Receivable', accountType: 'asset', debitBalance: usdReceivable + fxGain, creditBalance: 0 },
        { account: 'License Fees', accountType: 'revenue', debitBalance: 0, creditBalance: usdReceivable },
        { account: 'Unrealised Foreign Exchange Gain', accountType: 'revenue', debitBalance: 0, creditBalance: fxGain },
      ],
      pl: {
        revenue: usdReceivable, cogs: 0, grossProfit: usdReceivable, grossMargin: 1.0,
        operatingExpenses: [], totalOpEx: 0, operatingIncome: usdReceivable,
        otherIncome: fxGain,
        netIncomeBeforeTax: usdReceivable + fxGain, incomeTax: 0, netIncome: usdReceivable + fxGain,
      },
      balanceSheet: {
        assets: { currentAssets: [{ name: 'Accounts Receivable', amount: usdReceivable + fxGain }], fixedAssets: [] },
        liabilities: { currentLiabilities: [], longTermLiabilities: [] },
        equity: [{ name: 'Retained Earnings', amount: usdReceivable + fxGain }],
        totalAssets: usdReceivable + fxGain,
        totalLiabilities: 0, totalEquity: usdReceivable + fxGain, isBalanced: true,
      },
      gst: {
        jurisdiction: 'sg', gstRate: 0.09,
        totalSales: usdReceivable, gstOnSales: 0, // Zero-rated — no output tax
        totalPurchases: 0, gstOnPurchases: 0, netGSTPayable: 0,
        gstOutputTaxAccount: 'GST Output Tax', gstInputTaxAccount: 'GST Input Tax', gstPayableAccount: 'IRAS Payable',
      },
      interpretations: [
        {
          transactionRef: 'FX-REVAL-JAN', account: 'Unrealised Foreign Exchange Gain', drCr: 'CR', amount: fxGain,
          interpretation: 'Month-end FX revaluation of USD-denominated receivable. Unrealised gain = SGD strengthened against USD between invoice date and month-end. No cash movement — purely accounting. Credit "Unrealised Foreign Exchange Gain" to Other Income in P&L (NOT operating expense). Debit Accounts Receivable to increase carrying value.',
          impactOnFinancials: 'Increases Accounts Receivable on Balance Sheet. Increases Other Income (Unrealised FX Gain) in P&L. Reverses when cash is received.',
        },
      ],
    });
  }

  // Edge Case 5: SFRS 16 Lease Accounting (office rental capitalised as ROU Asset)
  // Claude (and legacy accounting) often books lease payments as "Rent Expense" directly.
  // Under SFRS 16: recognise Right-of-Use Asset + Lease Liability; lease payment splits into
  // interest expense + liability reduction (NOT rent expense).
  {
    const annualRent = 120000;  // SGD 10,000/month office lease, 2-year term
    const pvFactor = 0.95;      // Simplified PV (assume low IBR)
    const rouAsset = Math.round(annualRent * 2 * pvFactor);  // 2-year PV
    const leaseLiabilityTotal = rouAsset;
    const monthlyPayment = Math.round(annualRent / 12);
    const interestRate = 0.035; // Incremental borrowing rate 3.5%
    const monthlyInterest = Math.round(leaseLiabilityTotal * interestRate / 12);
    const principalRepayment = monthlyPayment - monthlyInterest;

    const transactions: SyntheticTransaction[] = [
      // Lease commencement (Month 1)
      { date: '2025-01-01', description: 'SFRS 16 — Office lease commencement: ROU Asset recognised', reference: 'LEASE-COMM-001', account: 'Right-of-Use Assets', debit: rouAsset, credit: 0, taxRateName: 'No Tax', taxAmount: 0 },
      { date: '2025-01-01', description: 'SFRS 16 — Office lease commencement: Lease Liability', reference: 'LEASE-COMM-001', account: 'Lease Liability - Non-Current', debit: 0, credit: leaseLiabilityTotal, taxRateName: 'No Tax', taxAmount: 0 },
      // Monthly depreciation of ROU Asset
      { date: '2025-01-31', description: 'ROU Asset depreciation — office lease', reference: 'DEP-ROU-JAN', account: 'Depreciation', debit: Math.round(rouAsset / 24), credit: 0, taxRateName: 'No Tax', taxAmount: 0 },
      { date: '2025-01-31', description: 'Accumulated depreciation — ROU Asset', reference: 'DEP-ROU-JAN', account: 'Accumulated Depreciation', debit: 0, credit: Math.round(rouAsset / 24), taxRateName: 'No Tax', taxAmount: 0 },
      // Monthly lease payment (cash out) — splits into interest + principal
      { date: '2025-01-31', description: 'Lease interest expense — office', reference: 'LEASE-PAY-JAN', account: 'Interest Expense', debit: monthlyInterest, credit: 0, taxRateName: 'No Tax', taxAmount: 0 },
      { date: '2025-01-31', description: 'Lease liability reduction (principal)', reference: 'LEASE-PAY-JAN', account: 'Lease Liability - Non-Current', debit: principalRepayment, credit: 0, taxRateName: 'No Tax', taxAmount: 0 },
      { date: '2025-01-31', description: 'Lease payment from bank', reference: 'LEASE-PAY-JAN', account: 'Bank', debit: 0, credit: monthlyPayment, taxRateName: 'No Tax', taxAmount: 0 },
    ];

    scenarios.push({
      id: 'edge_sfrs16_lease_accounting',
      companyType: 'saas_sg',
      period: '2025-01',
      transactions,
      trialBalance: [
        { account: 'Right-of-Use Assets', accountType: 'asset', debitBalance: rouAsset, creditBalance: 0 },
        { account: 'Accumulated Depreciation', accountType: 'contra_asset', debitBalance: 0, creditBalance: Math.round(rouAsset / 24) },
        { account: 'Bank', accountType: 'asset', debitBalance: 0, creditBalance: monthlyPayment },
        { account: 'Lease Liability - Non-Current', accountType: 'liability', debitBalance: 0, creditBalance: leaseLiabilityTotal - principalRepayment },
        { account: 'Depreciation', accountType: 'expense', debitBalance: Math.round(rouAsset / 24), creditBalance: 0 },
        { account: 'Interest Expense', accountType: 'expense', debitBalance: monthlyInterest, creditBalance: 0 },
      ],
      pl: {
        revenue: 0, cogs: 0, grossProfit: 0, grossMargin: 0,
        operatingExpenses: [{ name: 'Depreciation', amount: Math.round(rouAsset / 24) }],
        totalOpEx: Math.round(rouAsset / 24),
        operatingIncome: -Math.round(rouAsset / 24),
        otherIncome: 0,
        netIncomeBeforeTax: -(Math.round(rouAsset / 24) + monthlyInterest),
        incomeTax: 0,
        netIncome: -(Math.round(rouAsset / 24) + monthlyInterest),
      },
      balanceSheet: {
        assets: { currentAssets: [{ name: 'Bank', amount: -monthlyPayment }], fixedAssets: [{ name: 'Right-of-Use Assets (net)', amount: rouAsset - Math.round(rouAsset / 24) }] },
        liabilities: { currentLiabilities: [], longTermLiabilities: [{ name: 'Lease Liability - Non-Current', amount: leaseLiabilityTotal - principalRepayment }] },
        equity: [{ name: 'Retained Earnings', amount: -(Math.round(rouAsset / 24) + monthlyInterest) }],
        totalAssets: rouAsset - Math.round(rouAsset / 24) - monthlyPayment,
        totalLiabilities: leaseLiabilityTotal - principalRepayment,
        totalEquity: -(Math.round(rouAsset / 24) + monthlyInterest),
        isBalanced: true,
      },
      gst: {
        jurisdiction: 'sg', gstRate: 0.09,
        totalSales: 0, gstOnSales: 0, totalPurchases: 0, gstOnPurchases: 0, netGSTPayable: 0,
        gstOutputTaxAccount: 'GST Output Tax', gstInputTaxAccount: 'GST Input Tax', gstPayableAccount: 'IRAS Payable',
      },
      interpretations: [
        {
          transactionRef: 'LEASE-COMM-001', account: 'Right-of-Use Assets', drCr: 'DR', amount: rouAsset,
          interpretation: 'SFRS 16 lease commencement: recognise Right-of-Use Asset (PV of future lease payments) and equal Lease Liability. Do NOT book as Rent Expense. Monthly P&L impact = Depreciation (ROU Asset ÷ lease term) + Interest Expense (liability × IBR). Cash payment reduces Lease Liability principal, NOT an expense.',
          impactOnFinancials: 'Creates ROU Asset on Balance Sheet (non-current). Creates Lease Liability (non-current). P&L shows Depreciation + Interest instead of Rent Expense.',
        },
      ],
    });
  }

  // Edge Case 6: Bad Debt Write-Off (using Allowance for Doubtful Accounts)
  // Claude often debits the expense directly to AR instead of going through the provision account.
  {
    const originalAR = 15000;
    const provisionPrior = 15000; // Previously set up provision (credit-normal contra asset)

    const transactions: SyntheticTransaction[] = [
      // Step 1 (prior period — already on books): Provision set up
      { date: '2024-12-31', description: 'Provision for doubtful debt - customer X', reference: 'PROV-2024', account: 'Bad Debt Expense', debit: provisionPrior, credit: 0, taxRateName: 'No Tax', taxAmount: 0 },
      { date: '2024-12-31', description: 'Allowance for doubtful accounts - customer X', reference: 'PROV-2024', account: 'Allowance for Doubtful Accounts', debit: 0, credit: provisionPrior, taxRateName: 'No Tax', taxAmount: 0 },
      // Step 2 (current period): Write-off confirmed — clear both AR and provision
      { date: '2025-01-31', description: 'Bad debt write-off - customer X confirmed', reference: 'WO-2025-001', account: 'Allowance for Doubtful Accounts', debit: originalAR, credit: 0, taxRateName: 'No Tax', taxAmount: 0 },
      { date: '2025-01-31', description: 'Bad debt write-off - AR cleared', reference: 'WO-2025-001', account: 'Accounts Receivable', debit: 0, credit: originalAR, taxRateName: 'No Tax', taxAmount: 0 },
    ];

    scenarios.push({
      id: 'edge_bad_debt_writeoff_via_provision',
      companyType: 'saas_sg',
      period: '2025-01',
      transactions,
      trialBalance: [
        { account: 'Bad Debt Expense', accountType: 'expense', debitBalance: provisionPrior, creditBalance: 0 },
        { account: 'Allowance for Doubtful Accounts', accountType: 'contra_asset', debitBalance: 0, creditBalance: 0 }, // Nets to zero after write-off
        { account: 'Accounts Receivable', accountType: 'asset', debitBalance: 0, creditBalance: originalAR }, // Cleared
      ],
      pl: {
        revenue: 0, cogs: 0, grossProfit: 0, grossMargin: 0,
        operatingExpenses: [{ name: 'Bad Debt Expense', amount: provisionPrior }],
        totalOpEx: provisionPrior, operatingIncome: -provisionPrior,
        otherIncome: 0, netIncomeBeforeTax: -provisionPrior, incomeTax: 0, netIncome: -provisionPrior,
      },
      balanceSheet: {
        assets: { currentAssets: [{ name: 'Accounts Receivable (net)', amount: -originalAR }], fixedAssets: [] },
        liabilities: { currentLiabilities: [], longTermLiabilities: [] },
        equity: [{ name: 'Retained Earnings', amount: -provisionPrior }],
        totalAssets: -originalAR,
        totalLiabilities: 0, totalEquity: -provisionPrior, isBalanced: false, // Simplified — opening equity not shown
      },
      gst: {
        jurisdiction: 'sg', gstRate: 0.09,
        totalSales: 0, gstOnSales: 0, totalPurchases: 0, gstOnPurchases: 0, netGSTPayable: 0,
        gstOutputTaxAccount: 'GST Output Tax', gstInputTaxAccount: 'GST Input Tax', gstPayableAccount: 'IRAS Payable',
      },
      interpretations: [
        {
          transactionRef: 'WO-2025-001', account: 'Allowance for Doubtful Accounts', drCr: 'DR', amount: originalAR,
          interpretation: 'Bad debt write-off using the allowance method (SFRS 9 expected credit loss). STEP 1 (prior period): Debit Bad Debt Expense, Credit Allowance for Doubtful Accounts (provision set up). STEP 2 (write-off period): Debit Allowance for Doubtful Accounts (use provision), Credit AR (clear the receivable). The P&L impact was already in the prior period — the write-off itself does NOT create a new expense.',
          impactOnFinancials: 'Clears both AR and the provision. No additional P&L impact in write-off period (expense was recognised when provision was created).',
        },
      ],
    });
  }

  return scenarios;
}

// ============================================================================
// MAIN EXPORT: fetchAllAASData
// ============================================================================

export async function fetchAllAASData(dryRun: boolean = false): Promise<AASRawData> {
  const sources: string[] = [];
  let recordCount = 0;

  console.log('[AASFetcher] ── Source 1: SEC EDGAR XBRL ──');
  const edgarCompanies = await fetchEDGARSaaSCompanies(dryRun);
  sources.push(`sec-edgar:${edgarCompanies.length}-companies`);
  recordCount += edgarCompanies.reduce((s, c) => s + c.periods.length, 0);

  console.log('[AASFetcher] ── Source 2: FASB + ERPNext CoA ──');
  const coaMap = await fetchERPNextCoA();
  sources.push(`coa-map:${coaMap.size}-accounts`);
  recordCount += coaMap.size;

  console.log('[AASFetcher] ── Source 3: Damodaran + ATO Benchmarks (hardcoded) ──');
  sources.push(`benchmarks:${INDUSTRY_BENCHMARKS.length}-industries`);
  recordCount += INDUSTRY_BENCHMARKS.length;

  console.log('[AASFetcher] ── Source 4: Synthetic Accounting Scenarios ──');
  const scenarios = buildSyntheticAccountingScenarios();
  sources.push(`synthetic-scenarios:${scenarios.length}`);
  recordCount += scenarios.length;

  console.log(`[AASFetcher] Total: ${recordCount} records from ${sources.length} sources`);

  return {
    edgarCompanies,
    coaMap,
    benchmarks: INDUSTRY_BENCHMARKS,
    scenarios,
    sources,
    recordCount,
  };
}
