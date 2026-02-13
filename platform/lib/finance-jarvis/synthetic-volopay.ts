/**
 * Synthetic Volopay Data Generator
 *
 * Generates 12 months of corporate card spend data for a 35-person SaaS company.
 * Cards are issued to team members across: Sales, Finance, Engineering, Marketing,
 * Operations, and Leadership.
 *
 * Each card has a budget limit, department, and realistic transaction patterns.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VolopayCardHolder {
  id: string;
  name: string;
  email: string;
  department: "Sales" | "Finance" | "Engineering" | "Marketing" | "Operations" | "Leadership";
  role: string;
  cardNumber: string; // last 4 digits
  monthlyLimit: number;
  isActive: boolean;
}

export interface VolopayTransaction {
  id: string;
  cardHolderId: string;
  cardHolderName: string;
  department: string;
  date: string;
  merchant: string;
  merchantCategory: string;
  amount: number;
  currency: "USD";
  status: "COMPLETED" | "PENDING" | "DECLINED";
  receiptUploaded: boolean;
  notes: string;
  flagged: boolean;
  flagReason?: string;
}

export interface VolopayBudget {
  id: string;
  department: string;
  budgetName: string;
  monthlyLimit: number;
  currentSpend: number;
  utilizationPct: number;
  period: string; // YYYY-MM
}

export interface VolopayDepartmentSummary {
  department: string;
  month: string;
  totalSpend: number;
  transactionCount: number;
  avgTransactionSize: number;
  topMerchant: string;
  topCategory: string;
  overBudget: boolean;
  budgetUtilization: number;
  uniqueCardholders: number;
  flaggedTransactions: number;
}

export interface VolopayData {
  cardHolders: VolopayCardHolder[];
  transactions: VolopayTransaction[];
  budgets: VolopayBudget[];
  departmentSummaries: VolopayDepartmentSummary[];
}

// ─── Team Members ───────────────────────────────────────────────────────────

const TEAM: Omit<VolopayCardHolder, "id" | "cardNumber">[] = [
  // Leadership (4)
  { name: "Arjun Mehta", email: "arjun@company.com", department: "Leadership", role: "CEO", monthlyLimit: 15000, isActive: true },
  { name: "Sarah Chen", email: "sarah@company.com", department: "Leadership", role: "CTO", monthlyLimit: 10000, isActive: true },
  { name: "Michael Torres", email: "michael@company.com", department: "Leadership", role: "CFO", monthlyLimit: 12000, isActive: true },
  { name: "Priya Sharma", email: "priya@company.com", department: "Leadership", role: "COO", monthlyLimit: 10000, isActive: true },
  // Sales (8)
  { name: "David Park", email: "david.p@company.com", department: "Sales", role: "VP Sales", monthlyLimit: 8000, isActive: true },
  { name: "Emily Rodriguez", email: "emily.r@company.com", department: "Sales", role: "Account Executive", monthlyLimit: 4000, isActive: true },
  { name: "James Wilson", email: "james.w@company.com", department: "Sales", role: "Account Executive", monthlyLimit: 4000, isActive: true },
  { name: "Lisa Chang", email: "lisa.c@company.com", department: "Sales", role: "SDR Lead", monthlyLimit: 3000, isActive: true },
  { name: "Ryan Mitchell", email: "ryan.m@company.com", department: "Sales", role: "Account Executive", monthlyLimit: 4000, isActive: true },
  { name: "Aisha Patel", email: "aisha.p@company.com", department: "Sales", role: "Solutions Engineer", monthlyLimit: 3500, isActive: true },
  { name: "Chris Baker", email: "chris.b@company.com", department: "Sales", role: "SDR", monthlyLimit: 2000, isActive: true },
  { name: "Nicole Foster", email: "nicole.f@company.com", department: "Sales", role: "Sales Ops", monthlyLimit: 2500, isActive: true },
  // Engineering (10)
  { name: "Raj Krishnan", email: "raj.k@company.com", department: "Engineering", role: "VP Engineering", monthlyLimit: 5000, isActive: true },
  { name: "Anna Mueller", email: "anna.m@company.com", department: "Engineering", role: "Staff Engineer", monthlyLimit: 3000, isActive: true },
  { name: "Tomasz Nowak", email: "tomasz.n@company.com", department: "Engineering", role: "Senior Engineer", monthlyLimit: 2500, isActive: true },
  { name: "Yuki Tanaka", email: "yuki.t@company.com", department: "Engineering", role: "Senior Engineer", monthlyLimit: 2500, isActive: true },
  { name: "Carlos Reyes", email: "carlos.r@company.com", department: "Engineering", role: "DevOps Lead", monthlyLimit: 3000, isActive: true },
  { name: "Sofia Lindgren", email: "sofia.l@company.com", department: "Engineering", role: "Engineer", monthlyLimit: 1500, isActive: true },
  { name: "Wei Zhang", email: "wei.z@company.com", department: "Engineering", role: "Engineer", monthlyLimit: 1500, isActive: true },
  { name: "Olivia Scott", email: "olivia.s@company.com", department: "Engineering", role: "QA Lead", monthlyLimit: 2000, isActive: true },
  { name: "Deepak Gupta", email: "deepak.g@company.com", department: "Engineering", role: "Engineer", monthlyLimit: 1500, isActive: true },
  { name: "Maria Santos", email: "maria.s@company.com", department: "Engineering", role: "Engineer", monthlyLimit: 1500, isActive: true },
  // Marketing (5)
  { name: "Jordan Hayes", email: "jordan.h@company.com", department: "Marketing", role: "VP Marketing", monthlyLimit: 8000, isActive: true },
  { name: "Tanya Volkov", email: "tanya.v@company.com", department: "Marketing", role: "Content Lead", monthlyLimit: 3000, isActive: true },
  { name: "Marcus Lee", email: "marcus.l@company.com", department: "Marketing", role: "Demand Gen", monthlyLimit: 5000, isActive: true },
  { name: "Hannah Kim", email: "hannah.k@company.com", department: "Marketing", role: "Designer", monthlyLimit: 2500, isActive: true },
  { name: "Ben Clarke", email: "ben.c@company.com", department: "Marketing", role: "Events Manager", monthlyLimit: 4000, isActive: true },
  // Finance (3)
  { name: "Rachel Green", email: "rachel.g@company.com", department: "Finance", role: "Controller", monthlyLimit: 5000, isActive: true },
  { name: "Kevin Obi", email: "kevin.o@company.com", department: "Finance", role: "FP&A Analyst", monthlyLimit: 2000, isActive: true },
  { name: "Diana Lopez", email: "diana.l@company.com", department: "Finance", role: "AP/AR Specialist", monthlyLimit: 3000, isActive: true },
  // Operations (3)
  { name: "Samantha Wright", email: "sam.w@company.com", department: "Operations", role: "Head of Ops", monthlyLimit: 6000, isActive: true },
  { name: "Tyler Brooks", email: "tyler.b@company.com", department: "Operations", role: "Office Manager", monthlyLimit: 4000, isActive: true },
  { name: "Anita Desai", email: "anita.d@company.com", department: "Operations", role: "People Ops", monthlyLimit: 3000, isActive: true },
];

// ─── Merchant Profiles by Department ────────────────────────────────────────

const MERCHANTS: Record<string, Array<{ name: string; category: string; minAmount: number; maxAmount: number }>> = {
  Sales: [
    { name: "Salesforce", category: "Software", minAmount: 150, maxAmount: 300 },
    { name: "LinkedIn Sales Navigator", category: "Software", minAmount: 80, maxAmount: 100 },
    { name: "Outreach.io", category: "Software", minAmount: 100, maxAmount: 200 },
    { name: "Gong.io", category: "Software", minAmount: 120, maxAmount: 180 },
    { name: "STK Steakhouse", category: "Client Entertainment", minAmount: 200, maxAmount: 800 },
    { name: "Nobu Restaurant", category: "Client Entertainment", minAmount: 300, maxAmount: 1200 },
    { name: "The Capital Grille", category: "Client Entertainment", minAmount: 250, maxAmount: 600 },
    { name: "Marriott Hotels", category: "Travel & Lodging", minAmount: 180, maxAmount: 450 },
    { name: "United Airlines", category: "Travel & Flights", minAmount: 300, maxAmount: 1500 },
    { name: "Delta Airlines", category: "Travel & Flights", minAmount: 250, maxAmount: 1200 },
    { name: "Uber", category: "Transportation", minAmount: 15, maxAmount: 85 },
    { name: "DoorDash", category: "Meals", minAmount: 20, maxAmount: 60 },
    { name: "Amazon Business", category: "Supplies", minAmount: 25, maxAmount: 200 },
    { name: "WeWork", category: "Co-working", minAmount: 50, maxAmount: 200 },
    { name: "Starbucks", category: "Meals", minAmount: 5, maxAmount: 30 },
  ],
  Engineering: [
    { name: "AWS", category: "Cloud Infrastructure", minAmount: 50, maxAmount: 3000 },
    { name: "GitHub", category: "Software", minAmount: 4, maxAmount: 21 },
    { name: "Datadog", category: "Monitoring", minAmount: 200, maxAmount: 800 },
    { name: "Vercel", category: "Hosting", minAmount: 20, maxAmount: 500 },
    { name: "JetBrains", category: "Software", minAmount: 15, maxAmount: 25 },
    { name: "Udemy Business", category: "Training", minAmount: 15, maxAmount: 30 },
    { name: "O'Reilly Learning", category: "Training", minAmount: 40, maxAmount: 50 },
    { name: "Apple Store", category: "Hardware", minAmount: 30, maxAmount: 2500 },
    { name: "NewEgg", category: "Hardware", minAmount: 50, maxAmount: 500 },
    { name: "Amazon Business", category: "Supplies", minAmount: 20, maxAmount: 150 },
    { name: "Sweetgreen", category: "Meals", minAmount: 12, maxAmount: 25 },
    { name: "Uber Eats", category: "Meals", minAmount: 15, maxAmount: 40 },
  ],
  Marketing: [
    { name: "Google Ads", category: "Digital Advertising", minAmount: 500, maxAmount: 8000 },
    { name: "LinkedIn Ads", category: "Digital Advertising", minAmount: 300, maxAmount: 5000 },
    { name: "Meta Ads", category: "Digital Advertising", minAmount: 200, maxAmount: 4000 },
    { name: "HubSpot", category: "Software", minAmount: 800, maxAmount: 1200 },
    { name: "Canva", category: "Design", minAmount: 12, maxAmount: 30 },
    { name: "Figma", category: "Design", minAmount: 15, maxAmount: 45 },
    { name: "Webflow", category: "Website", minAmount: 30, maxAmount: 200 },
    { name: "Mailchimp", category: "Email Marketing", minAmount: 200, maxAmount: 500 },
    { name: "Shutterstock", category: "Stock Media", minAmount: 30, maxAmount: 200 },
    { name: "Event Space Rental", category: "Events", minAmount: 500, maxAmount: 5000 },
    { name: "Vistaprint", category: "Print", minAmount: 100, maxAmount: 800 },
    { name: "Swag.com", category: "Merchandise", minAmount: 200, maxAmount: 3000 },
    { name: "Adobe Creative Cloud", category: "Design", minAmount: 55, maxAmount: 85 },
  ],
  Finance: [
    { name: "Xero", category: "Accounting Software", minAmount: 65, maxAmount: 200 },
    { name: "Stripe", category: "Payment Processing", minAmount: 100, maxAmount: 500 },
    { name: "Ramp", category: "Expense Management", minAmount: 0, maxAmount: 100 },
    { name: "Carta", category: "Cap Table", minAmount: 200, maxAmount: 400 },
    { name: "Gusto", category: "Payroll", minAmount: 500, maxAmount: 800 },
    { name: "Amazon Business", category: "Supplies", minAmount: 20, maxAmount: 100 },
    { name: "PwC Advisory", category: "Consulting", minAmount: 1000, maxAmount: 5000 },
  ],
  Operations: [
    { name: "WeWork", category: "Office Space", minAmount: 5000, maxAmount: 18500 },
    { name: "Amazon Business", category: "Office Supplies", minAmount: 50, maxAmount: 500 },
    { name: "Staples", category: "Office Supplies", minAmount: 30, maxAmount: 300 },
    { name: "FedEx", category: "Shipping", minAmount: 20, maxAmount: 200 },
    { name: "Costco Business", category: "Supplies", minAmount: 100, maxAmount: 400 },
    { name: "Google Workspace", category: "Software", minAmount: 400, maxAmount: 700 },
    { name: "1Password", category: "Security", minAmount: 100, maxAmount: 200 },
    { name: "Notion", category: "Software", minAmount: 80, maxAmount: 200 },
    { name: "Zoom", category: "Software", minAmount: 150, maxAmount: 300 },
    { name: "Slack", category: "Software", minAmount: 200, maxAmount: 500 },
  ],
  Leadership: [
    { name: "United Airlines - First Class", category: "Travel & Flights", minAmount: 800, maxAmount: 4000 },
    { name: "Four Seasons Hotel", category: "Travel & Lodging", minAmount: 400, maxAmount: 1200 },
    { name: "Nobu Restaurant", category: "Client Entertainment", minAmount: 400, maxAmount: 1500 },
    { name: "Per Se", category: "Client Entertainment", minAmount: 500, maxAmount: 2000 },
    { name: "Board Meeting Catering", category: "Meetings", minAmount: 200, maxAmount: 800 },
    { name: "Uber Black", category: "Transportation", minAmount: 30, maxAmount: 200 },
    { name: "Amazon Business", category: "Supplies", minAmount: 30, maxAmount: 300 },
    { name: "Apple Store", category: "Hardware", minAmount: 100, maxAmount: 3000 },
    { name: "Executive Coach", category: "Professional Development", minAmount: 500, maxAmount: 2000 },
  ],
};

// ─── Anomaly Patterns ───────────────────────────────────────────────────────

interface AnomalyPattern {
  cardHolderIndex: number;
  month: number; // 0-indexed from start
  merchant: string;
  category: string;
  amount: number;
  reason: string;
}

const ANOMALIES: AnomalyPattern[] = [
  { cardHolderIndex: 5, month: 3, merchant: "Las Vegas Hotel & Casino", category: "Travel & Lodging", amount: 2800, reason: "Personal trip on corporate card" },
  { cardHolderIndex: 6, month: 5, merchant: "Best Buy", category: "Electronics", amount: 3200, reason: "Unauthorized hardware purchase exceeding policy" },
  { cardHolderIndex: 21, month: 7, merchant: "Google Ads", category: "Digital Advertising", amount: 25000, reason: "Campaign budget overspend - 3x monthly limit" },
  { cardHolderIndex: 0, month: 4, merchant: "Per Se", category: "Client Entertainment", amount: 4500, reason: "CEO dinner - excessive entertainment spend" },
  { cardHolderIndex: 8, month: 6, merchant: "Louis Vuitton", category: "Gifts", amount: 1800, reason: "Luxury gift - possible policy violation" },
  { cardHolderIndex: 13, month: 8, merchant: "Steam Store", category: "Software", amount: 450, reason: "Gaming platform purchase - personal use" },
  { cardHolderIndex: 3, month: 9, merchant: "Emirates First Class", category: "Travel & Flights", amount: 8500, reason: "First class international - exceeds travel policy" },
  { cardHolderIndex: 24, month: 2, merchant: "Crypto.com", category: "Financial Services", amount: 5000, reason: "Cryptocurrency purchase on corporate card" },
  { cardHolderIndex: 10, month: 10, merchant: "Weekend Getaway Resort", category: "Travel & Lodging", amount: 1200, reason: "Weekend personal trip" },
  { cardHolderIndex: 22, month: 6, merchant: "Bar Tab - Nightclub", category: "Entertainment", amount: 850, reason: "Late night entertainment - questionable business purpose" },
];

// ─── Generator ──────────────────────────────────────────────────────────────

export function generateVolopayData(startDate?: Date): VolopayData {
  const start = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const months: string[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  const end = new Date();
  while (d <= end) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }

  // Build card holders
  const cardHolders: VolopayCardHolder[] = TEAM.map((t, i) => ({
    ...t,
    id: `CH-${String(i + 1).padStart(3, "0")}`,
    cardNumber: `**** ${String(4000 + i * 7 + Math.floor(Math.random() * 100)).padStart(4, "0")}`,
  }));

  const transactions: VolopayTransaction[] = [];
  const budgets: VolopayBudget[] = [];
  const departmentSummaries: VolopayDepartmentSummary[] = [];
  let txId = 1;

  const departments = ["Sales", "Finance", "Engineering", "Marketing", "Operations", "Leadership"] as const;

  // Department budget targets (monthly)
  const DEPT_BUDGETS: Record<string, number> = {
    Sales: 35000,
    Finance: 8000,
    Engineering: 25000,
    Marketing: 40000,
    Operations: 28000,
    Leadership: 25000,
  };

  for (let mi = 0; mi < months.length; mi++) {
    const month = months[mi];
    const [yr, mo] = month.split("-").map(Number);
    const daysInMonth = new Date(yr, mo, 0).getDate();

    const deptSpend: Record<string, { total: number; count: number; merchants: Record<string, number>; categories: Record<string, number>; holders: Set<string>; flagged: number }> = {};
    for (const dept of departments) {
      deptSpend[dept] = { total: 0, count: 0, merchants: {}, categories: {}, holders: new Set(), flagged: 0 };
    }

    // Generate transactions for each cardholder
    for (let chi = 0; chi < cardHolders.length; chi++) {
      const ch = cardHolders[chi];
      if (!ch.isActive) continue;

      const merchantList = MERCHANTS[ch.department] || MERCHANTS.Operations;

      // Number of transactions per month varies by role
      const baseTxCount = ch.department === "Sales" ? rand(8, 20)
        : ch.department === "Marketing" ? rand(5, 15)
        : ch.department === "Engineering" ? rand(3, 10)
        : ch.department === "Leadership" ? rand(4, 12)
        : rand(3, 8);

      const txCount = Math.round(baseTxCount);

      for (let t = 0; t < txCount; t++) {
        const merchant = pick(merchantList);
        const amount = rand(merchant.minAmount, merchant.maxAmount);
        const dayOfMonth = Math.floor(rand(1, daysInMonth));
        const dateStr = `${yr}-${String(mo).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;

        const isDeclined = Math.random() < 0.02;
        const isPending = !isDeclined && Math.random() < 0.05;
        const status = isDeclined ? "DECLINED" : isPending ? "PENDING" : "COMPLETED";

        const isFlagged = amount > ch.monthlyLimit * 0.4 || Math.random() < 0.03;
        let flagReason: string | undefined;
        if (isFlagged) {
          flagReason = amount > ch.monthlyLimit * 0.4
            ? "Large transaction relative to card limit"
            : "Random audit selection";
        }

        transactions.push({
          id: `VTX-${String(txId++).padStart(6, "0")}`,
          cardHolderId: ch.id,
          cardHolderName: ch.name,
          department: ch.department,
          date: dateStr,
          merchant: merchant.name,
          merchantCategory: merchant.category,
          amount,
          currency: "USD",
          status,
          receiptUploaded: Math.random() > 0.25,
          notes: "",
          flagged: isFlagged,
          flagReason,
        });

        if (status === "COMPLETED") {
          const ds = deptSpend[ch.department];
          ds.total += amount;
          ds.count++;
          ds.merchants[merchant.name] = (ds.merchants[merchant.name] || 0) + amount;
          ds.categories[merchant.category] = (ds.categories[merchant.category] || 0) + amount;
          ds.holders.add(ch.id);
          if (isFlagged) ds.flagged++;
        }
      }

      // Inject anomalies
      const anomaly = ANOMALIES.find((a) => a.cardHolderIndex === chi && a.month === mi);
      if (anomaly) {
        const dayOfMonth = Math.floor(rand(1, daysInMonth));
        const dateStr = `${yr}-${String(mo).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
        transactions.push({
          id: `VTX-${String(txId++).padStart(6, "0")}`,
          cardHolderId: ch.id,
          cardHolderName: ch.name,
          department: ch.department,
          date: dateStr,
          merchant: anomaly.merchant,
          merchantCategory: anomaly.category,
          amount: anomaly.amount,
          currency: "USD",
          status: "COMPLETED",
          receiptUploaded: false,
          notes: "",
          flagged: true,
          flagReason: anomaly.reason,
        });

        const ds = deptSpend[ch.department];
        ds.total += anomaly.amount;
        ds.count++;
        ds.flagged++;
        ds.merchants[anomaly.merchant] = (ds.merchants[anomaly.merchant] || 0) + anomaly.amount;
        ds.categories[anomaly.category] = (ds.categories[anomaly.category] || 0) + anomaly.amount;
        ds.holders.add(ch.id);
      }
    }

    // Build department summaries and budgets
    for (const dept of departments) {
      const ds = deptSpend[dept];
      const budget = DEPT_BUDGETS[dept];
      const utilization = Math.round((ds.total / budget) * 10000) / 100;

      const topMerchant = Object.entries(ds.merchants).sort(([, a], [, b]) => b - a)[0];
      const topCategory = Object.entries(ds.categories).sort(([, a], [, b]) => b - a)[0];

      departmentSummaries.push({
        department: dept,
        month,
        totalSpend: Math.round(ds.total * 100) / 100,
        transactionCount: ds.count,
        avgTransactionSize: ds.count > 0 ? Math.round((ds.total / ds.count) * 100) / 100 : 0,
        topMerchant: topMerchant?.[0] || "N/A",
        topCategory: topCategory?.[0] || "N/A",
        overBudget: ds.total > budget,
        budgetUtilization: utilization,
        uniqueCardholders: ds.holders.size,
        flaggedTransactions: ds.flagged,
      });

      budgets.push({
        id: `BDG-${dept}-${month}`,
        department: dept,
        budgetName: `${dept} Monthly Budget`,
        monthlyLimit: budget,
        currentSpend: Math.round(ds.total * 100) / 100,
        utilizationPct: utilization,
        period: month,
      });
    }
  }

  return { cardHolders, transactions, budgets, departmentSummaries };
}
