/**
 * Synthetic Xero Data Generator
 *
 * Generates 12 months of realistic accounting data for a Series A SaaS company
 * (~$3M ARR, 35 employees, burning ~$180K/month net).
 *
 * Covers: Chart of Accounts, Monthly P&L, Balance Sheet, Bank Transactions,
 * Invoices (AR), Bills (AP), and daily cash balances.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

function randBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function datesBetween(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const d = new Date(start);
  while (d <= end) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface XeroAccount {
  code: string;
  name: string;
  type: "REVENUE" | "EXPENSE" | "ASSET" | "LIABILITY" | "EQUITY";
  category: string;
}

export interface XeroMonthlyPnL {
  month: string; // YYYY-MM
  revenue: {
    subscriptionRevenue: number;
    professionalServices: number;
    otherRevenue: number;
    totalRevenue: number;
  };
  cogs: {
    hosting: number;
    thirdPartyAPIs: number;
    customerSupport: number;
    totalCOGS: number;
  };
  grossProfit: number;
  grossMarginPct: number;
  opex: {
    salaries: number;
    benefits: number;
    rent: number;
    marketing: number;
    salesCommissions: number;
    software: number;
    travel: number;
    legal: number;
    insurance: number;
    depreciation: number;
    miscellaneous: number;
    totalOpex: number;
  };
  ebitda: number;
  netIncome: number;
}

export interface XeroBalanceSheet {
  month: string;
  assets: {
    cashAndEquivalents: number;
    accountsReceivable: number;
    prepaidExpenses: number;
    fixedAssets: number;
    totalAssets: number;
  };
  liabilities: {
    accountsPayable: number;
    accruedExpenses: number;
    deferredRevenue: number;
    shortTermDebt: number;
    totalLiabilities: number;
  };
  equity: {
    commonStock: number;
    additionalPaidInCapital: number;
    retainedEarnings: number;
    totalEquity: number;
  };
  totalLiabilitiesAndEquity: number;
}

export interface XeroTransaction {
  id: string;
  date: string;
  account: string;
  accountCode: string;
  description: string;
  amount: number;
  type: "RECEIVE" | "SPEND";
  reference: string;
  category: string;
  vendor?: string;
  isReconciled: boolean;
}

export interface XeroInvoice {
  id: string;
  invoiceNumber: string;
  customer: string;
  dateIssued: string;
  dateDue: string;
  datePaid: string | null;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  subtotal: number;
  tax: number;
  total: number;
  status: "PAID" | "AUTHORISED" | "OVERDUE" | "DRAFT";
  currency: "USD";
}

export interface XeroBill {
  id: string;
  billNumber: string;
  vendor: string;
  dateIssued: string;
  dateDue: string;
  datePaid: string | null;
  amount: number;
  category: string;
  status: "PAID" | "AUTHORISED" | "OVERDUE";
}

export interface XeroCashBalance {
  date: string;
  openingBalance: number;
  inflows: number;
  outflows: number;
  closingBalance: number;
  accountName: string;
}

export interface XeroData {
  accounts: XeroAccount[];
  monthlyPnL: XeroMonthlyPnL[];
  balanceSheets: XeroBalanceSheet[];
  transactions: XeroTransaction[];
  invoices: XeroInvoice[];
  bills: XeroBill[];
  dailyCashBalances: XeroCashBalance[];
}

// ─── Chart of Accounts ──────────────────────────────────────────────────────

const ACCOUNTS: XeroAccount[] = [
  { code: "200", name: "Subscription Revenue", type: "REVENUE", category: "Revenue" },
  { code: "210", name: "Professional Services", type: "REVENUE", category: "Revenue" },
  { code: "220", name: "Other Revenue", type: "REVENUE", category: "Revenue" },
  { code: "300", name: "Hosting & Infrastructure", type: "EXPENSE", category: "COGS" },
  { code: "310", name: "Third-Party APIs", type: "EXPENSE", category: "COGS" },
  { code: "320", name: "Customer Support", type: "EXPENSE", category: "COGS" },
  { code: "400", name: "Salaries & Wages", type: "EXPENSE", category: "People" },
  { code: "410", name: "Employee Benefits", type: "EXPENSE", category: "People" },
  { code: "420", name: "Rent & Utilities", type: "EXPENSE", category: "Facilities" },
  { code: "430", name: "Marketing & Advertising", type: "EXPENSE", category: "Marketing" },
  { code: "440", name: "Sales Commissions", type: "EXPENSE", category: "Sales" },
  { code: "450", name: "Software & Subscriptions", type: "EXPENSE", category: "Technology" },
  { code: "460", name: "Travel & Entertainment", type: "EXPENSE", category: "Travel" },
  { code: "470", name: "Legal & Professional", type: "EXPENSE", category: "Legal" },
  { code: "480", name: "Insurance", type: "EXPENSE", category: "Insurance" },
  { code: "490", name: "Depreciation", type: "EXPENSE", category: "Depreciation" },
  { code: "499", name: "Miscellaneous", type: "EXPENSE", category: "Other" },
  { code: "100", name: "Business Checking", type: "ASSET", category: "Cash" },
  { code: "110", name: "Savings Account", type: "ASSET", category: "Cash" },
  { code: "120", name: "Accounts Receivable", type: "ASSET", category: "Receivables" },
  { code: "130", name: "Prepaid Expenses", type: "ASSET", category: "Prepaid" },
  { code: "140", name: "Fixed Assets", type: "ASSET", category: "Fixed" },
  { code: "500", name: "Accounts Payable", type: "LIABILITY", category: "Payables" },
  { code: "510", name: "Accrued Expenses", type: "LIABILITY", category: "Accruals" },
  { code: "520", name: "Deferred Revenue", type: "LIABILITY", category: "Deferred" },
  { code: "530", name: "Short-Term Debt", type: "LIABILITY", category: "Debt" },
  { code: "600", name: "Common Stock", type: "EQUITY", category: "Stock" },
  { code: "610", name: "Additional Paid-In Capital", type: "EQUITY", category: "Capital" },
  { code: "620", name: "Retained Earnings", type: "EQUITY", category: "Retained" },
];

// ─── Customers ──────────────────────────────────────────────────────────────

const CUSTOMERS = [
  { name: "Acme Corp", plan: "enterprise", mrr: 8500 },
  { name: "GlobalTech Solutions", plan: "enterprise", mrr: 12000 },
  { name: "Nexus Industries", plan: "enterprise", mrr: 6500 },
  { name: "BrightPath Analytics", plan: "growth", mrr: 3200 },
  { name: "CloudScale Inc", plan: "growth", mrr: 2800 },
  { name: "DataFlow Systems", plan: "growth", mrr: 2400 },
  { name: "Elevate Digital", plan: "growth", mrr: 1900 },
  { name: "FusionWorks", plan: "growth", mrr: 2100 },
  { name: "GridPoint Technologies", plan: "starter", mrr: 800 },
  { name: "Harbor Logistics", plan: "starter", mrr: 650 },
  { name: "InnovateCo", plan: "starter", mrr: 500 },
  { name: "JetStream Media", plan: "starter", mrr: 750 },
  { name: "KineticAI", plan: "growth", mrr: 3500 },
  { name: "LumenOS", plan: "enterprise", mrr: 9200 },
  { name: "MindBridge Health", plan: "growth", mrr: 2600 },
  { name: "Orion Financial", plan: "enterprise", mrr: 15000 },
  { name: "PeakVenture Capital", plan: "growth", mrr: 1800 },
  { name: "QuartzLabs", plan: "starter", mrr: 900 },
  { name: "RedShift Robotics", plan: "growth", mrr: 2200 },
  { name: "SilverLake Partners", plan: "enterprise", mrr: 7800 },
  { name: "TechNova", plan: "starter", mrr: 450 },
  { name: "Unified Commerce", plan: "growth", mrr: 3100 },
  { name: "VeloCity Transport", plan: "starter", mrr: 600 },
  { name: "WavePoint Capital", plan: "enterprise", mrr: 11500 },
  { name: "ZenithAI", plan: "growth", mrr: 4200 },
];

// ─── Vendors ────────────────────────────────────────────────────────────────

const VENDORS = {
  hosting: ["AWS", "Vercel", "Cloudflare"],
  api: ["Twilio", "SendGrid", "Stripe"],
  software: ["Notion", "Slack", "Figma", "Linear", "GitHub", "Datadog", "HubSpot", "Salesforce", "Zoom", "Google Workspace", "1Password", "Jira"],
  marketing: ["Google Ads", "LinkedIn Ads", "Meta Ads", "Webflow", "Mailchimp"],
  travel: ["United Airlines", "Marriott Hotels", "Uber Business", "Delta Airlines", "Hilton"],
  legal: ["Wilson Sonsini", "Cooley LLP", "PwC"],
  insurance: ["Hartford Insurance", "Vouch Insurance"],
  facilities: ["WeWork", "Pacific Gas & Electric"],
};

// ─── Generator ──────────────────────────────────────────────────────────────

export function generateXeroData(startDate?: Date): XeroData {
  const start = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const end = new Date();
  const months: string[] = [];

  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  while (d <= end) {
    months.push(monthKey(d));
    d.setMonth(d.getMonth() + 1);
  }

  // Growth trajectory: MRR starts at ~$220K and grows ~4% MoM (realistic Series A)
  let baseMRR = 220000;
  const mrrGrowthRate = 0.04;
  let cumulativeRetainedEarnings = -1200000; // Pre-revenue losses
  let cashBalance = 2800000; // Post Series A cash

  const monthlyPnL: XeroMonthlyPnL[] = [];
  const balanceSheets: XeroBalanceSheet[] = [];
  const allTransactions: XeroTransaction[] = [];
  const allInvoices: XeroInvoice[] = [];
  const allBills: XeroBill[] = [];
  const allCashBalances: XeroCashBalance[] = [];

  let txCounter = 1;
  let invCounter = 1;
  let billCounter = 1;

  for (let mi = 0; mi < months.length; mi++) {
    const month = months[mi];
    const [yr, mo] = month.split("-").map(Number);
    const monthDate = new Date(yr, mo - 1, 1);
    const daysInMonth = new Date(yr, mo, 0).getDate();

    // Seasonal factors (Q4 strongest for enterprise SaaS, Q1 slowest)
    const seasonalFactor = mo >= 10 && mo <= 12 ? 1.12 : mo >= 1 && mo <= 3 ? 0.92 : 1.0;

    // MRR grows but with some noise
    const growthNoise = randBetween(-0.01, 0.02);
    baseMRR = baseMRR * (1 + mrrGrowthRate + growthNoise) * seasonalFactor / (mi === 0 ? 1 : seasonalFactor);

    // ── Revenue ──
    const subscriptionRevenue = Math.round(baseMRR * seasonalFactor);
    const professionalServices = Math.round(subscriptionRevenue * randBetween(0.04, 0.08));
    const otherRevenue = Math.round(randBetween(500, 3000));
    const totalRevenue = subscriptionRevenue + professionalServices + otherRevenue;

    // ── COGS (targets: 18-22% of revenue) ──
    const hosting = Math.round(subscriptionRevenue * randBetween(0.06, 0.09));
    const thirdPartyAPIs = Math.round(subscriptionRevenue * randBetween(0.03, 0.05));
    const customerSupport = Math.round(randBetween(15000, 22000));
    const totalCOGS = hosting + thirdPartyAPIs + customerSupport;
    const grossProfit = totalRevenue - totalCOGS;

    // ── Opex ──
    // Headcount grows: starts at 32, adds ~1 per month
    const headcount = 32 + Math.floor(mi * 0.8);
    const avgSalary = 9500; // Avg monthly salary (blended)
    const salaries = headcount * avgSalary + Math.round(randBetween(-5000, 5000));
    const benefits = Math.round(salaries * randBetween(0.18, 0.22));
    const rent = 18500; // WeWork
    const marketing = Math.round(totalRevenue * randBetween(0.12, 0.22)); // CAC-heavy
    const salesCommissions = Math.round(subscriptionRevenue * randBetween(0.06, 0.10));
    const software = Math.round(headcount * randBetween(280, 420));
    const travel = Math.round(randBetween(4000, 18000) * (mo === 1 || mo === 6 || mo === 9 ? 2.5 : 1)); // QBR months
    const legal = Math.round(randBetween(3000, 12000));
    const insurance = 4200;
    const depreciation = 2800;
    const miscellaneous = Math.round(randBetween(1500, 6000));
    const totalOpex = salaries + benefits + rent + marketing + salesCommissions + software + travel + legal + insurance + depreciation + miscellaneous;

    const ebitda = grossProfit - totalOpex + depreciation;
    const netIncome = grossProfit - totalOpex;
    cumulativeRetainedEarnings += netIncome;

    monthlyPnL.push({
      month,
      revenue: { subscriptionRevenue, professionalServices, otherRevenue, totalRevenue },
      cogs: { hosting, thirdPartyAPIs, customerSupport, totalCOGS },
      grossProfit,
      grossMarginPct: Math.round((grossProfit / totalRevenue) * 10000) / 100,
      opex: { salaries, benefits, rent, marketing, salesCommissions, software, travel, legal, insurance, depreciation, miscellaneous, totalOpex },
      ebitda,
      netIncome,
    });

    // ── Balance Sheet ──
    cashBalance += netIncome + depreciation - Math.round(randBetween(5000, 15000)); // Working capital changes
    const ar = Math.round(subscriptionRevenue * randBetween(0.3, 0.6)); // ~30-60% of monthly sub in AR
    const prepaid = Math.round(randBetween(25000, 45000));
    const fixedAssets = Math.round(85000 - depreciation * (mi + 1));
    const totalAssets = cashBalance + ar + prepaid + Math.max(fixedAssets, 0);

    const ap = Math.round((hosting + thirdPartyAPIs + software) * randBetween(0.4, 0.7));
    const accruedExpenses = Math.round(salaries * randBetween(0.15, 0.25));
    const deferredRevenue = Math.round(subscriptionRevenue * randBetween(0.8, 1.5)); // Annual prepayments
    const shortTermDebt = 0;
    const totalLiabilities = ap + accruedExpenses + deferredRevenue + shortTermDebt;

    const commonStock = 1000;
    const apic = 5500000; // Series A
    const totalEquity = commonStock + apic + cumulativeRetainedEarnings;

    balanceSheets.push({
      month,
      assets: { cashAndEquivalents: cashBalance, accountsReceivable: ar, prepaidExpenses: prepaid, fixedAssets: Math.max(fixedAssets, 0), totalAssets },
      liabilities: { accountsPayable: ap, accruedExpenses, deferredRevenue, shortTermDebt, totalLiabilities },
      equity: { commonStock, additionalPaidInCapital: apic, retainedEarnings: cumulativeRetainedEarnings, totalEquity },
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
    });

    // ── Generate Invoices ──
    const activeCustomers = CUSTOMERS.filter(() => Math.random() > 0.05);
    for (const cust of activeCustomers) {
      const mrrMultiplier = 1 + (mi * 0.01) + randBetween(-0.05, 0.05);
      const invoiceAmount = Math.round(cust.mrr * mrrMultiplier * 100) / 100;
      const issueDate = new Date(yr, mo - 1, randBetween(1, 5));
      const dueDate = new Date(yr, mo - 1 + 1, randBetween(1, 5));
      const isPaid = Math.random() > 0.12;
      const isOverdue = !isPaid && new Date() > dueDate;

      allInvoices.push({
        id: `INV-${String(invCounter++).padStart(5, "0")}`,
        invoiceNumber: `INV-${yr}${String(mo).padStart(2, "0")}-${String(invCounter).padStart(3, "0")}`,
        customer: cust.name,
        dateIssued: issueDate.toISOString().split("T")[0],
        dateDue: dueDate.toISOString().split("T")[0],
        datePaid: isPaid ? new Date(yr, mo - 1, randBetween(10, 28)).toISOString().split("T")[0] : null,
        lineItems: [{ description: `${cust.plan.charAt(0).toUpperCase() + cust.plan.slice(1)} Plan - Monthly`, quantity: 1, unitPrice: invoiceAmount, amount: invoiceAmount }],
        subtotal: invoiceAmount,
        tax: 0,
        total: invoiceAmount,
        status: isPaid ? "PAID" : isOverdue ? "OVERDUE" : "AUTHORISED",
        currency: "USD",
      });
    }

    // ── Generate Bills ──
    const billItems: Array<{ vendor: string; amount: number; category: string }> = [
      { vendor: pickOne(VENDORS.hosting), amount: hosting * 0.6, category: "Hosting" },
      { vendor: pickOne(VENDORS.hosting), amount: hosting * 0.4, category: "Hosting" },
      { vendor: pickOne(VENDORS.api), amount: thirdPartyAPIs * 0.5, category: "APIs" },
      { vendor: pickOne(VENDORS.api), amount: thirdPartyAPIs * 0.5, category: "APIs" },
      ...VENDORS.software.slice(0, 8 + Math.floor(mi * 0.3)).map((v) => ({
        vendor: v,
        amount: Math.round(randBetween(200, 2500)),
        category: "Software",
      })),
      { vendor: pickOne(VENDORS.marketing), amount: marketing * 0.4, category: "Marketing" },
      { vendor: pickOne(VENDORS.marketing), amount: marketing * 0.35, category: "Marketing" },
      { vendor: pickOne(VENDORS.facilities), amount: rent, category: "Rent" },
      { vendor: pickOne(VENDORS.legal), amount: legal, category: "Legal" },
      { vendor: pickOne(VENDORS.insurance), amount: insurance, category: "Insurance" },
    ];

    if (travel > 5000) {
      const travelVendors = VENDORS.travel.slice(0, Math.ceil(travel / 3000));
      for (const tv of travelVendors) {
        billItems.push({ vendor: tv, amount: Math.round(travel / travelVendors.length), category: "Travel" });
      }
    }

    for (const bill of billItems) {
      const issueDate = new Date(yr, mo - 1, randBetween(1, 25));
      const dueDate = new Date(yr, mo, randBetween(1, 15));
      const isPaid = Math.random() > 0.08;

      allBills.push({
        id: `BILL-${String(billCounter++).padStart(5, "0")}`,
        billNumber: `B-${yr}${String(mo).padStart(2, "0")}-${String(billCounter).padStart(3, "0")}`,
        vendor: bill.vendor,
        dateIssued: issueDate.toISOString().split("T")[0],
        dateDue: dueDate.toISOString().split("T")[0],
        datePaid: isPaid ? new Date(yr, mo - 1, randBetween(15, 28)).toISOString().split("T")[0] : null,
        amount: Math.round(bill.amount * 100) / 100,
        category: bill.category,
        status: isPaid ? "PAID" : new Date() > dueDate ? "OVERDUE" : "AUTHORISED",
      });
    }

    // ── Generate Daily Transactions & Cash Balances ──
    let dailyCash = mi === 0 ? cashBalance : allCashBalances[allCashBalances.length - 1]?.closingBalance || cashBalance;
    const monthDates = datesBetween(new Date(yr, mo - 1, 1), new Date(yr, mo - 1, daysInMonth));

    for (const date of monthDates) {
      const dateStr = date.toISOString().split("T")[0];
      const isWeekday = date.getDay() > 0 && date.getDay() < 6;
      let dayInflows = 0;
      let dayOutflows = 0;

      if (!isWeekday) {
        allCashBalances.push({ date: dateStr, openingBalance: dailyCash, inflows: 0, outflows: 0, closingBalance: dailyCash, accountName: "Business Checking" });
        continue;
      }

      // Inflows: customer payments cluster around 1st, 15th, end of month
      const dayOfMonth = date.getDate();
      if (dayOfMonth <= 5 || (dayOfMonth >= 13 && dayOfMonth <= 17) || dayOfMonth >= 27) {
        const paymentCount = Math.floor(randBetween(1, 5));
        for (let p = 0; p < paymentCount; p++) {
          const customer = pickOne(CUSTOMERS);
          const amount = Math.round(customer.mrr * randBetween(0.5, 1.5) * 100) / 100;
          dayInflows += amount;
          allTransactions.push({
            id: `TX-${String(txCounter++).padStart(6, "0")}`,
            date: dateStr,
            account: "Business Checking",
            accountCode: "100",
            description: `Payment from ${customer.name}`,
            amount,
            type: "RECEIVE",
            reference: `PAY-${dateStr}-${p}`,
            category: "Revenue",
            isReconciled: Math.random() > 0.1,
          });
        }
      }

      // Outflows: various operational spends
      const spendTypes: Array<{ chance: number; min: number; max: number; desc: string; code: string; cat: string; vendor?: string }> = [
        { chance: 0.3, min: 500, max: 5000, desc: "AWS services", code: "300", cat: "Hosting", vendor: "AWS" },
        { chance: 0.15, min: 200, max: 1500, desc: "API usage", code: "310", cat: "APIs", vendor: pickOne(VENDORS.api) },
        { chance: 0.05, min: 10000, max: 45000, desc: "Payroll", code: "400", cat: "Payroll" },
        { chance: 0.08, min: 500, max: 8000, desc: "Marketing spend", code: "430", cat: "Marketing", vendor: pickOne(VENDORS.marketing) },
        { chance: 0.1, min: 100, max: 2000, desc: "Software subscription", code: "450", cat: "Software", vendor: pickOne(VENDORS.software) },
        { chance: 0.04, min: 300, max: 5000, desc: "Travel expense", code: "460", cat: "Travel", vendor: pickOne(VENDORS.travel) },
        { chance: 0.03, min: 1000, max: 8000, desc: "Legal fees", code: "470", cat: "Legal", vendor: pickOne(VENDORS.legal) },
      ];

      // Payroll: big outflows on 15th and last day
      if (dayOfMonth === 15 || dayOfMonth === daysInMonth) {
        const payrollAmount = Math.round(salaries / 2);
        dayOutflows += payrollAmount;
        allTransactions.push({
          id: `TX-${String(txCounter++).padStart(6, "0")}`,
          date: dateStr,
          account: "Business Checking",
          accountCode: "400",
          description: "Payroll - Semi-monthly",
          amount: payrollAmount,
          type: "SPEND",
          reference: `PAY-${dateStr}`,
          category: "Payroll",
          isReconciled: true,
        });
      }

      for (const st of spendTypes) {
        if (st.desc === "Payroll") continue; // handled above
        if (Math.random() < st.chance) {
          const amount = Math.round(randBetween(st.min, st.max) * 100) / 100;
          dayOutflows += amount;
          allTransactions.push({
            id: `TX-${String(txCounter++).padStart(6, "0")}`,
            date: dateStr,
            account: "Business Checking",
            accountCode: st.code,
            description: st.desc,
            amount,
            type: "SPEND",
            reference: `SP-${dateStr}-${st.cat}`,
            category: st.cat,
            vendor: st.vendor,
            isReconciled: Math.random() > 0.15,
          });
        }
      }

      dailyCash = Math.round((dailyCash + dayInflows - dayOutflows) * 100) / 100;
      allCashBalances.push({
        date: dateStr,
        openingBalance: Math.round((dailyCash - dayInflows + dayOutflows) * 100) / 100,
        inflows: Math.round(dayInflows * 100) / 100,
        outflows: Math.round(dayOutflows * 100) / 100,
        closingBalance: dailyCash,
        accountName: "Business Checking",
      });
    }
  }

  return {
    accounts: ACCOUNTS,
    monthlyPnL,
    balanceSheets,
    transactions: allTransactions,
    invoices: allInvoices,
    bills: allBills,
    dailyCashBalances: allCashBalances,
  };
}
