/**
 * Transaction Interpretation Engine — Shared Module
 * ===================================================
 * Generates plain-English narratives for the top 30 transactions by value.
 * Written for non-accountants: what each transaction means in business terms.
 *
 * Shared by:
 *   - GET /api/aaas (route.ts) — returns interpretations in API response
 *   - GET /api/aaas/export (export/route.ts) — includes narrative column in CSV
 *
 * @packageDocumentation
 */

// ── Account classification (full rules with subType) ──────────────────────────

export const CLASSIFICATION_RULES: Array<{ pattern: string; type: string; subType: string }> = [
  // Liabilities (specific first)
  { pattern: 'cpf payable', type: 'liability', subType: 'statutory' },
  { pattern: 'accrued expense', type: 'liability', subType: 'accrued' },
  { pattern: 'accrued staff', type: 'liability', subType: 'accrued' },
  { pattern: 'trade creditor', type: 'liability', subType: 'payable' },
  { pattern: 'other creditor', type: 'liability', subType: 'payable' },
  { pattern: 'deferred revenue', type: 'liability', subType: 'deferred' },
  { pattern: 'gst summary', type: 'liability', subType: 'tax' },
  { pattern: 'wht payable', type: 'liability', subType: 'tax' },
  { pattern: 'lease liability', type: 'liability', subType: 'lease' },
  { pattern: 'amount due to director', type: 'liability', subType: 'related-party' },
  { pattern: 'convertible', type: 'liability', subType: 'convertible' },
  { pattern: 'loan', type: 'liability', subType: 'borrowing' },
  // Assets
  { pattern: 'trade debtor', type: 'asset', subType: 'receivable' },
  { pattern: 'other debtor', type: 'asset', subType: 'receivable' },
  { pattern: 'advance to', type: 'asset', subType: 'intercompany' },
  { pattern: 'prepayment', type: 'asset', subType: 'prepaid' },
  { pattern: 'fixed deposit', type: 'asset', subType: 'investment' },
  { pattern: 'computer', type: 'asset', subType: 'fixed' },
  { pattern: 'furniture', type: 'asset', subType: 'fixed' },
  { pattern: 'renovation', type: 'asset', subType: 'fixed' },
  { pattern: 'rou asset', type: 'asset', subType: 'rou' },
  { pattern: 'accumulated depreciation', type: 'asset', subType: 'contra' },
  // Equity
  { pattern: 'paid up capital', type: 'equity', subType: 'capital' },
  { pattern: 'retained earnings', type: 'equity', subType: 'retained' },
  { pattern: 'share based payment', type: 'equity', subType: 'reserves' },
  // Bank
  { pattern: 'uob', type: 'bank', subType: 'current' },
  { pattern: 'citibank', type: 'bank', subType: 'current' },
  { pattern: 'wise', type: 'bank', subType: 'transfer' },
  { pattern: 'amex clearing', type: 'bank', subType: 'clearing' },
  { pattern: 'volopay clearing', type: 'bank', subType: 'clearing' },
  // Revenue
  { pattern: 'license fee', type: 'revenue', subType: 'license' },
  { pattern: 'subscription fee', type: 'revenue', subType: 'subscription' },
  { pattern: 'implementation fee', type: 'revenue', subType: 'services' },
  { pattern: 'support fee', type: 'revenue', subType: 'support' },
  { pattern: 'overage fee', type: 'revenue', subType: 'overage' },
  { pattern: 'interest income', type: 'revenue', subType: 'interest' },
  { pattern: 'other income', type: 'revenue', subType: 'other' },
  { pattern: 'grant', type: 'revenue', subType: 'grant' },
  // Expenses (general — last)
  { pattern: 'salary', type: 'expense', subType: 'payroll' },
  { pattern: 'salaries', type: 'expense', subType: 'payroll' },
  { pattern: 'cpf', type: 'expense', subType: 'payroll' },
  { pattern: 'bonus', type: 'expense', subType: 'payroll' },
  { pattern: 'depreciation', type: 'expense', subType: 'depreciation' },
  { pattern: 'amortisation', type: 'expense', subType: 'amortization' },
  { pattern: 'bank charge', type: 'expense', subType: 'finance' },
  { pattern: 'insurance', type: 'expense', subType: 'insurance' },
  { pattern: 'rental', type: 'expense', subType: 'occupancy' },
  { pattern: 'travel', type: 'expense', subType: 'travel' },
  { pattern: 'marketing', type: 'expense', subType: 'marketing' },
  { pattern: 'accounting fee', type: 'expense', subType: 'professional' },
  { pattern: 'audit fee', type: 'expense', subType: 'professional' },
  { pattern: 'legal', type: 'expense', subType: 'professional' },
  { pattern: 'contractor', type: 'expense', subType: 'contractors' },
  { pattern: 'subscription', type: 'expense', subType: 'software' },
  { pattern: 'software', type: 'expense', subType: 'software' },
  { pattern: 'foreign exchange', type: 'expense', subType: 'fx' },
];

export function classifyAccount(name: string): string {
  const lower = name.toLowerCase();
  for (const rule of CLASSIFICATION_RULES) {
    if (lower.includes(rule.pattern)) return rule.type;
  }
  return 'unclassified';
}

// ── GL Transaction type ───────────────────────────────────────────────────────

export interface GLTransaction {
  date: string;
  source: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  runningBalance: number;
  tax: number;
  taxRate: number;
  taxRateName: string;
  account: string;
}

// ── Interpretation output ─────────────────────────────────────────────────────

export interface TransactionInterpretation {
  date: string;
  account: string;
  description: string;
  reference: string;
  amount: number;
  direction: 'debit' | 'credit';
  accountType: string;
  narrative: string;
  businessImpact: 'positive' | 'neutral' | 'watch';
  category: string;
}

// ── Main interpretation engine ────────────────────────────────────────────────

export function generateTransactionInterpretations(
  transactions: GLTransaction[],
  accountBalances: Map<string, { type: string; debit: number; credit: number; count: number }>
): TransactionInterpretation[] {
  // Take top 30 transactions by absolute value
  const sorted = [...transactions]
    .sort((a, b) => Math.max(b.debit, b.credit) - Math.max(a.debit, a.credit))
    .slice(0, 30);

  return sorted.map(txn => {
    const amount = Math.max(txn.debit, txn.credit);
    const direction: 'debit' | 'credit' = txn.debit >= txn.credit ? 'debit' : 'credit';
    const accountType = classifyAccount(txn.account);
    const acctLower = txn.account.toLowerCase();
    const amtFmt = `SGD ${amount.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    let narrative = '';
    let businessImpact: 'positive' | 'neutral' | 'watch' = 'neutral';
    let category = accountType;

    // ── Revenue narratives ──
    if (accountType === 'revenue') {
      businessImpact = 'positive';
      if (acctLower.includes('license fee') || acctLower.includes('subscription')) {
        narrative = `Recurring software license/subscription revenue of ${amtFmt} — core ARR contribution. ${txn.reference ? `Ref: ${txn.reference}.` : ''} Customer billing recorded; check deferred revenue schedule if multi-period.`;
        category = 'ARR Revenue';
      } else if (acctLower.includes('implementation') || acctLower.includes('professional')) {
        narrative = `Professional services / implementation revenue of ${amtFmt}. One-time in nature; should not be projected as recurring ARR. Verify POC delivery confirmation in supporting documents.`;
        category = 'Services Revenue';
      } else if (acctLower.includes('grant')) {
        narrative = `Grant income of ${amtFmt} recognised. Verify grant conditions met and no clawback risk. Not reflective of commercial revenue traction — should be excluded from ARR metrics.`;
        category = 'Grant Income';
        businessImpact = 'neutral';
      } else if (acctLower.includes('interest')) {
        narrative = `Interest income of ${amtFmt} earned on cash deposits or fixed deposits. Non-operating income; positive but not a revenue quality indicator.`;
        category = 'Interest Income';
      } else if (acctLower.includes('overage')) {
        narrative = `Overage / usage-based revenue of ${amtFmt}. Positive signal of product adoption beyond contracted limits — consider upsell opportunity.`;
        category = 'Usage Revenue';
      } else {
        narrative = `Revenue of ${amtFmt} from "${txn.account}". ${txn.description ? `Transaction note: ${txn.description}.` : ''} Classify further by revenue stream for accurate ARR tracking.`;
        category = 'Other Revenue';
      }
    }
    // ── Payroll / salary narratives ──
    else if (acctLower.includes('salary') || acctLower.includes('salaries') || acctLower.includes('payroll') || acctLower.includes('bonus')) {
      businessImpact = 'watch';
      category = 'Payroll';
      const isBonus = acctLower.includes('bonus');
      narrative = isBonus
        ? `Bonus / variable compensation payment of ${amtFmt}. One-time cash outflow — verify this is accrual release and performance justification documented. Check CPF contribution computed on bonus amount.`
        : `Payroll disbursement of ${amtFmt}. ${txn.reference ? `Ref: ${txn.reference}. ` : ''}Largest recurring operating expense. Verify headcount matches HR records and CPF contributions filed timely with IRAS.`;
    }
    // ── CPF narratives ──
    else if (acctLower.includes('cpf')) {
      businessImpact = 'neutral';
      category = 'Statutory';
      narrative = `CPF contribution of ${amtFmt} — statutory employer + employee CPF. Must be paid by 14th of following month to avoid IRAS penalty. Verify allocation: OA/SA/MA rates correct for employee age band.`;
    }
    // ── Tax / GST narratives ──
    else if (acctLower.includes('gst') || txn.taxRateName === 'GST on Expenses (9%)' || txn.taxRateName === 'GST on Income (9%)') {
      businessImpact = 'neutral';
      category = 'GST/Tax';
      narrative = direction === 'debit'
        ? `GST input tax of ${amtFmt} (claimable). Recorded as debit to GST Summary — will net against output tax in F5 return. Ensure tax invoice from registered supplier on file.`
        : `GST output tax of ${amtFmt} collected from customer. Credit to GST Summary — payable to IRAS in next filing period. Ensure corresponding tax invoice issued.`;
    }
    // ── Rent / lease narratives ──
    else if (acctLower.includes('rental') || acctLower.includes('lease') || acctLower.includes('rou')) {
      businessImpact = 'neutral';
      category = 'Occupancy';
      narrative = acctLower.includes('rou')
        ? `Right-of-Use asset movement of ${amtFmt} under SFRS(I) 16 lease accounting. Ensure corresponding lease liability amortisation schedule updated. Review for any lease modification events.`
        : `Office rental / occupancy cost of ${amtFmt}. Fixed recurring overhead — verify lease agreement current and renewal date tracked in commitments schedule.`;
    }
    // ── Depreciation narratives ──
    else if (acctLower.includes('depreciation') || acctLower.includes('amortis')) {
      businessImpact = 'neutral';
      category = 'Non-Cash';
      narrative = `Depreciation / amortisation charge of ${amtFmt}. Non-cash expense — adds back in cash flow from operations. Verify fixed asset register updated and method (straight-line/reducing balance) consistently applied under SFRS(I) 16.`;
    }
    // ── Bank / transfer narratives ──
    else if (accountType === 'bank') {
      businessImpact = direction === 'credit' ? 'positive' : 'neutral';
      category = 'Cash Movement';
      narrative = direction === 'credit'
        ? `Cash inflow of ${amtFmt} to ${txn.account}. ${txn.description ? `Source: ${txn.description}.` : ''} Trace to source document (invoice / bank advice) to confirm completeness.`
        : `Cash outflow of ${amtFmt} from ${txn.account}. ${txn.description ? `Purpose: ${txn.description}.` : ''} Verify approved payment mandate and supporting invoice on file.`;
    }
    // ── Intercompany / related party ──
    else if (acctLower.includes('advance to') || acctLower.includes('due to') || acctLower.includes('intercompany')) {
      businessImpact = 'watch';
      category = 'Related Party';
      narrative = `Related-party / intercompany transaction of ${amtFmt}. Auditors will scrutinise: ensure transfer pricing documentation prepared, arm's-length basis confirmed, and IRAS Form C disclosure complete. ${txn.description ? `Note: ${txn.description}.` : ''}`;
    }
    // ── Asset purchases ──
    else if (accountType === 'asset' && direction === 'debit') {
      businessImpact = 'neutral';
      category = 'Capital Expenditure';
      narrative = `Capital expenditure / asset acquisition of ${amtFmt} in ${txn.account}. Verify capitalization policy met (useful life >1 year, cost >materiality threshold). Add to fixed asset register with depreciation start date.`;
    }
    // ── Liabilities ──
    else if (accountType === 'liability') {
      businessImpact = direction === 'credit' ? 'watch' : 'neutral';
      category = 'Liability';
      if (acctLower.includes('deferred revenue')) {
        narrative = `Deferred revenue movement of ${amtFmt}. ${direction === 'credit' ? 'Contract liability increasing — cash received ahead of revenue recognition.' : 'Revenue being recognised from deferred balance — verify delivery milestone met per SFRS(I) 15.'} Update revenue recognition schedule.`;
      } else if (acctLower.includes('accrued')) {
        narrative = `Accrued liability of ${amtFmt} in ${txn.account}. ${direction === 'credit' ? 'Expense incurred but not yet paid — ensure reversing entry scheduled.' : 'Accrual being settled in cash — match to original accrual entry.'} Review for completeness at period close.`;
      } else {
        narrative = `Liability movement of ${amtFmt} in ${txn.account}. ${direction === 'credit' ? 'Obligation increasing.' : 'Obligation being settled.'} ${txn.description ? `Context: ${txn.description}.` : ''} Confirm balance matches counterparty confirmation.`;
      }
    }
    // ── Foreign exchange ──
    else if (acctLower.includes('foreign exchange') || acctLower.includes('forex') || acctLower.includes('fx')) {
      businessImpact = Math.max(txn.debit, txn.credit) > 10000 ? 'watch' : 'neutral';
      category = 'FX';
      narrative = `Foreign exchange ${direction === 'debit' ? 'loss' : 'gain'} of ${amtFmt}. ${direction === 'debit' ? 'USD/SGD or other currency movement created a loss — review hedging policy.' : 'FX gain recorded.'} Ensure proper mark-to-market at period end for all foreign-currency balances.`;
    }
    // ── Software / SaaS subscriptions ──
    else if (acctLower.includes('software') || acctLower.includes('subscription') && accountType === 'expense') {
      businessImpact = 'neutral';
      category = 'Technology';
      narrative = `Software / SaaS subscription expense of ${amtFmt}. ${txn.description ? `Service: ${txn.description}.` : ''} Verify annual vs monthly billing — prepayments should be captured in prepaid expenses and amortised monthly.`;
    }
    // ── Fallback ──
    else {
      const typeLabel = accountType === 'expense' ? 'operating expense' : accountType === 'equity' ? 'equity movement' : 'transaction';
      narrative = `${accountType.charAt(0).toUpperCase() + accountType.slice(1)} ${typeLabel} of ${amtFmt} in "${txn.account}". ${txn.description ? `Description: ${txn.description}.` : ''} ${txn.source ? `Source: ${txn.source}.` : ''} Review for correct classification and period allocation.`;
      businessImpact = 'neutral';
    }

    return {
      date: txn.date.slice(0, 10),
      account: txn.account,
      description: txn.description,
      reference: txn.reference,
      amount,
      direction,
      accountType,
      narrative,
      businessImpact,
      category,
    };
  });
}
