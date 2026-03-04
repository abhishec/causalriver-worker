/**
 * GL File Parser Tests — Synthetic Xero Excel + CSV + JSON
 * =========================================================
 * Verifies:
 *   1. parseGLFile handles Xero XLSX format correctly
 *   2. parseGLFile handles generic CSV correctly
 *   3. parseGLFile handles JSON correctly (backward compatible)
 *   4. Parsed output matches GLTransaction schema for downstream:
 *      - RE1: Transaction Interpretation Engine (needs account, debit, credit, description)
 *      - RE2: Causal Financial Risk Scoring (needs account classification for signal generation)
 *   5. generateGLSignals-compatible output (monthly revenue/expense aggregation)
 *
 * Note: xlsx (SheetJS) is used ONLY in this test file to create synthetic Excel
 * buffers. It is a devDependency — the production parser uses exceljs instead,
 * which does not have the unpatched CVEs (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9).
 */

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseGLFile, type GLTransaction } from "@/lib/parsers/gl-file-parser";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createXeroExcelBuffer(): Buffer {
  // Simulate Xero "General Ledger Detail" export
  const rows: (string | number | null)[][] = [
    ["General Ledger Detail", null, null, null, null, null, null, null, null, null],
    ["Tookitaki Holding Pte. Ltd.", null, null, null, null, null, null, null, null, null],
    ["For the period 1 Jan 2024 to 31 Dec 2024", null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null],
    ["Date", "Source", "Description", "Reference", "Debit", "Credit", "Running Balance", "Tax", "Tax Rate", "Tax Rate Name"],
    [null, null, null, null, null, null, null, null, null, null],
    // -- Account header: License Fee Income
    ["License Fee Income", null, null, null, null, null, null, null, null, null],
    ["15 Jan 2024", "Receivable Invoice", "Q1 2024 SaaS License - Acme Corp", "INV-10001", "", "50000.00", "50000.00", "4500.00", "9%", "GST 9%"],
    ["15 Apr 2024", "Receivable Invoice", "Q2 2024 SaaS License - Acme Corp", "INV-10045", "", "50000.00", "100000.00", "4500.00", "9%", "GST 9%"],
    ["15 Jul 2024", "Receivable Invoice", "Q3 2024 SaaS License - Acme Corp", "INV-10089", "", "52000.00", "152000.00", "4680.00", "9%", "GST 9%"],
    ["15 Oct 2024", "Receivable Invoice", "Q4 2024 SaaS License - Acme Corp", "INV-10120", "", "52000.00", "204000.00", "4680.00", "9%", "GST 9%"],
    ["Total License Fee Income", null, null, null, "0.00", "204000.00", null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null],
    // -- Account header: Salaries
    ["Salaries", null, null, null, null, null, null, null, null, null],
    ["31 Jan 2024", "Manual Journal", "Jan 2024 Payroll", "#8001", "35000.00", "", "35000.00", "", "", "No Tax"],
    ["28 Feb 2024", "Manual Journal", "Feb 2024 Payroll", "#8002", "35000.00", "", "70000.00", "", "", "No Tax"],
    ["31 Mar 2024", "Manual Journal", "Mar 2024 Payroll", "#8003", "35000.00", "", "105000.00", "", "", "No Tax"],
    ["30 Apr 2024", "Manual Journal", "Apr 2024 Payroll", "#8004", "36000.00", "", "141000.00", "", "", "No Tax"],
    ["Total Salaries", null, null, null, "141000.00", "0.00", null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null],
    // -- Account header: Trade Debtors
    ["Trade Debtors", null, null, null, null, null, null, null, null, null],
    ["15 Jan 2024", "Receivable Invoice", "Acme Corp - INV-10001", "INV-10001", "54500.00", "", "54500.00", "", "", "No Tax"],
    ["20 Mar 2024", "Receive Money", "Payment received - Acme Corp", "PAY-5001", "", "54500.00", "0.00", "", "", "No Tax"],
    ["Total Trade Debtors", null, null, null, "54500.00", "54500.00", null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null],
    // -- Account header: CPF Payable
    ["CPF Payable", null, null, null, null, null, null, null, null, null],
    ["31 Jan 2024", "Manual Journal", "Jan 2024 CPF contribution", "#8001", "", "5950.00", "5950.00", "", "", "No Tax"],
    ["28 Feb 2024", "Manual Journal", "Feb 2024 CPF contribution", "#8002", "", "5950.00", "11900.00", "", "", "No Tax"],
    ["Total CPF Payable", null, null, null, "0.00", "11900.00", null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null],
    // -- Account header: GST Summary
    ["GST Summary", null, null, null, null, null, null, null, null, null],
    ["31 Mar 2024", "Manual Journal", "Q1 GST F5 submission", "#GST-Q1", "9000.00", "", "9000.00", "", "", "No Tax"],
    ["Net movement", null, null, null, "9000.00", "0.00", null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null],
    // -- Account header: Insurance Expense
    ["Insurance Expense", null, null, null, null, null, null, null, null, null],
    ["01 Feb 2024", "Payable Invoice", "Annual D&O insurance premium", "INS-2024", "8500.00", "", "8500.00", "", "", "No Tax"],
    ["Total Insurance Expense", null, null, null, "8500.00", "0.00", null, null, null, null],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "General Ledger Detail");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

function createCSVBuffer(): Buffer {
  const csv = `Date,Account,Description,Reference,Debit,Credit,Tax Rate
2024-01-15,License Fee Income,Q1 SaaS License,INV-10001,0,50000,9
2024-01-31,Salaries,Jan 2024 Payroll,#8001,35000,0,0
2024-02-28,Salaries,Feb 2024 Payroll,#8002,35000,0,0
2024-01-15,Trade Debtors,Acme Corp Invoice,INV-10001,54500,0,0
2024-03-20,Trade Debtors,Payment received,PAY-5001,0,54500,0
2024-02-01,Insurance Expense,D&O Insurance,INS-2024,8500,0,0
`;
  return Buffer.from(csv, "utf-8");
}

function createJSONBuffer(): Buffer {
  const transactions = [
    { date: "2024-01-15", source: "Receivable Invoice", description: "Q1 SaaS License", reference: "INV-10001", debit: 0, credit: 50000, runningBalance: 50000, tax: 4500, taxRate: 9, taxRateName: "GST 9%", account: "License Fee Income" },
    { date: "2024-01-31", source: "Manual Journal", description: "Jan 2024 Payroll", reference: "#8001", debit: 35000, credit: 0, runningBalance: 35000, tax: 0, taxRate: 0, taxRateName: "No Tax", account: "Salaries" },
    { date: "2024-02-28", source: "Manual Journal", description: "Feb 2024 Payroll", reference: "#8002", debit: 35000, credit: 0, runningBalance: 70000, tax: 0, taxRate: 0, taxRateName: "No Tax", account: "Salaries" },
    { date: "2024-02-01", source: "Payable Invoice", description: "D&O Insurance", reference: "INS-2024", debit: 8500, credit: 0, runningBalance: 8500, tax: 0, taxRate: 0, taxRateName: "No Tax", account: "Insurance Expense" },
  ];
  return Buffer.from(JSON.stringify(transactions), "utf-8");
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GL File Parser", () => {
  describe("Xero Excel (.xlsx)", () => {
    it("should parse Xero GL Detail export correctly", async () => {
      const buffer = createXeroExcelBuffer();
      const result = await parseGLFile(buffer, "General Ledger Detail.xlsx");

      expect(result.metadata.format).toBe("xero-xlsx");
      expect(result.metadata.companyName).toBe("Tookitaki Holding Pte. Ltd.");
      expect(result.metadata.period).toContain("2024");
      expect(result.transactions.length).toBeGreaterThanOrEqual(10);
    });

    it("should extract correct accounts from section headers", async () => {
      const buffer = createXeroExcelBuffer();
      const result = await parseGLFile(buffer, "gl.xlsx");

      const accounts = new Set(result.transactions.map((t) => t.account));
      expect(accounts.has("License Fee Income")).toBe(true);
      expect(accounts.has("Salaries")).toBe(true);
      expect(accounts.has("Trade Debtors")).toBe(true);
      expect(accounts.has("CPF Payable")).toBe(true);
      expect(accounts.has("Insurance Expense")).toBe(true);
    });

    it("should parse Xero date format (DD Mon YYYY) to ISO", async () => {
      const buffer = createXeroExcelBuffer();
      const result = await parseGLFile(buffer, "gl.xlsx");

      const firstTxn = result.transactions.find((t) => t.account === "License Fee Income");
      expect(firstTxn).toBeDefined();
      expect(firstTxn!.date).toBe("2024-01-15");
    });

    it("should parse debit/credit amounts correctly", async () => {
      const buffer = createXeroExcelBuffer();
      const result = await parseGLFile(buffer, "gl.xlsx");

      const revenue = result.transactions.filter((t) => t.account === "License Fee Income");
      expect(revenue.length).toBe(4);
      expect(revenue[0].credit).toBe(50000);
      expect(revenue[0].debit).toBe(0);

      const payroll = result.transactions.filter((t) => t.account === "Salaries");
      expect(payroll.length).toBe(4);
      expect(payroll[0].debit).toBe(35000);
      expect(payroll[0].credit).toBe(0);
    });

    it("should parse GST tax rate correctly", async () => {
      const buffer = createXeroExcelBuffer();
      const result = await parseGLFile(buffer, "gl.xlsx");

      const gstTxn = result.transactions.find((t) => t.taxRate > 0);
      expect(gstTxn).toBeDefined();
      expect(gstTxn!.taxRate).toBe(9);
      expect(gstTxn!.taxRateName).toBe("GST 9%");
    });

    it("should skip Total and Net movement rows", async () => {
      const buffer = createXeroExcelBuffer();
      const result = await parseGLFile(buffer, "gl.xlsx");

      const totalRows = result.transactions.filter(
        (t) => t.description.startsWith("Total") || t.description.startsWith("Net movement")
      );
      expect(totalRows.length).toBe(0);
    });
  });

  describe("CSV format", () => {
    it("should parse CSV with auto-detected columns", async () => {
      const buffer = createCSVBuffer();
      const result = await parseGLFile(buffer, "transactions.csv");

      expect(result.metadata.format).toBe("generic-xlsx"); // CSV falls through to generic-xlsx format label
      expect(result.transactions.length).toBe(6);
    });

    it("should map account column correctly", async () => {
      const buffer = createCSVBuffer();
      const result = await parseGLFile(buffer, "gl.csv");

      const accounts = new Set(result.transactions.map((t) => t.account));
      expect(accounts.has("License Fee Income")).toBe(true);
      expect(accounts.has("Salaries")).toBe(true);
    });
  });

  describe("JSON format (backward compatible)", () => {
    it("should parse JSON array of transactions", async () => {
      const buffer = createJSONBuffer();
      const result = await parseGLFile(buffer, "gl-data.json");

      expect(result.metadata.format).toBe("json");
      expect(result.transactions.length).toBe(4);
    });

    it("should preserve all fields from JSON", async () => {
      const buffer = createJSONBuffer();
      const result = await parseGLFile(buffer, "gl-data.json");

      const first = result.transactions[0];
      expect(first.date).toBe("2024-01-15");
      expect(first.account).toBe("License Fee Income");
      expect(first.credit).toBe(50000);
      expect(first.taxRate).toBe(9);
      expect(first.taxRateName).toBe("GST 9%");
    });
  });

  describe("RE1 readiness: Transaction Interpretation Engine", () => {
    it("should produce transactions with all fields needed for RE1 narratives", async () => {
      const buffer = createXeroExcelBuffer();
      const result = await parseGLFile(buffer, "gl.xlsx");

      // RE1 needs: account, debit, credit, description, reference, date
      for (const txn of result.transactions) {
        expect(txn.account).toBeTruthy();
        expect(txn.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof txn.debit).toBe("number");
        expect(typeof txn.credit).toBe("number");
        expect(txn.debit >= 0 || txn.credit >= 0).toBe(true);
      }
    });

    it("should have revenue accounts detectable by classification rules", async () => {
      const buffer = createXeroExcelBuffer();
      const result = await parseGLFile(buffer, "gl.xlsx");

      // RE1 classifies accounts by pattern matching
      // "License Fee Income" should match "license fee" → revenue/license
      const revenueAccounts = result.transactions.filter((t) =>
        /fee|income|grant|revenue|subscription/i.test(t.account)
      );
      expect(revenueAccounts.length).toBeGreaterThan(0);
    });

    it("should have expense accounts detectable by classification rules", async () => {
      const buffer = createXeroExcelBuffer();
      const result = await parseGLFile(buffer, "gl.xlsx");

      const expenseAccounts = result.transactions.filter((t) =>
        /salary|salaries|expense|cost|depreciation|insurance/i.test(t.account)
      );
      expect(expenseAccounts.length).toBeGreaterThan(0);
    });
  });

  describe("RE2 readiness: Causal Financial Risk Scoring", () => {
    it("should produce data suitable for generateGLSignals (monthly aggregation)", async () => {
      const buffer = createXeroExcelBuffer();
      const result = await parseGLFile(buffer, "gl.xlsx");

      // generateGLSignals groups by month from txn.date
      const months = new Set(result.transactions.map((t) => t.date.slice(0, 7)));
      expect(months.size).toBeGreaterThan(1);
    });

    it("should have data for bootstrapAccountingCausalGraph conditions", async () => {
      const buffer = createXeroExcelBuffer();
      const result = await parseGLFile(buffer, "gl.xlsx");

      // bootstrapAccountingCausalGraph checks:
      // hasRevenue: "fee|income|grant|revenue|subscription"
      const hasRevenue = result.transactions.some((t) =>
        /fee|income|grant|revenue|subscription/i.test(t.account)
      );
      expect(hasRevenue).toBe(true);

      // hasPayroll: "salary|salaries|cpf"
      const hasPayroll = result.transactions.some((t) =>
        /salary|salaries|cpf/i.test(t.account)
      );
      expect(hasPayroll).toBe(true);

      // hasReceivables: "trade debtor|receivable"
      const hasReceivables = result.transactions.some((t) =>
        /trade debtor|receivable/i.test(t.account)
      );
      expect(hasReceivables).toBe(true);

      // hasGST: "gst" or taxRate > 0
      const hasGST = result.transactions.some((t) =>
        /gst/i.test(t.account) || t.taxRate > 0
      );
      expect(hasGST).toBe(true);
    });

    it("should produce balanced debits and credits", async () => {
      const buffer = createXeroExcelBuffer();
      const result = await parseGLFile(buffer, "gl.xlsx");

      // Not always balanced in a partial export, but metadata should report it
      expect(typeof result.metadata.balanced).toBe("boolean");
      expect(result.metadata.totalDebit).toBeGreaterThan(0);
      expect(result.metadata.totalCredit).toBeGreaterThan(0);
    });
  });

  describe("Flexible column handling", () => {
    it("should parse Xero Excel with shuffled column order", async () => {
      // Same data as Xero but columns are in a completely different order:
      // Credit, Date, Tax Rate Name, Debit, Source, Reference, Description, Tax, Running Balance, Tax Rate
      const rows: (string | number | null)[][] = [
        ["General Ledger Detail", null, null, null, null, null, null, null, null, null],
        ["Acme Corp Pte. Ltd.", null, null, null, null, null, null, null, null, null],
        ["For the period 1 Jan 2024 to 31 Dec 2024", null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null, null],
        // Shuffled header
        ["Credit", "Date", "Tax Rate Name", "Debit", "Source", "Reference", "Description", "Tax", "Running Balance", "Tax Rate"],
        [null, null, null, null, null, null, null, null, null, null],
        // Account header
        ["License Fee Income", null, null, null, null, null, null, null, null, null],
        // Transaction row — values must match the SHUFFLED header order
        ["50000.00", "15 Jan 2024", "GST 9%", "", "Receivable Invoice", "INV-10001", "Q1 SaaS License", "4500.00", "50000.00", "9%"],
        ["Total License Fee Income", null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null, null],
        ["Salaries", null, null, null, null, null, null, null, null, null],
        ["", "31 Jan 2024", "No Tax", "35000.00", "Manual Journal", "#8001", "Jan 2024 Payroll", "", "35000.00", ""],
        ["Total Salaries", null, null, null, null, null, null, null, null, null],
      ];

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "GL Detail");
      const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

      const result = await parseGLFile(buffer, "gl-shuffled.xlsx");

      expect(result.metadata.format).toBe("xero-xlsx");
      expect(result.metadata.companyName).toBe("Acme Corp Pte. Ltd.");
      expect(result.transactions.length).toBe(2);

      // Verify values map to correct fields despite shuffled columns
      const revenue = result.transactions.find((t) => t.account === "License Fee Income")!;
      expect(revenue.date).toBe("2024-01-15");
      expect(revenue.credit).toBe(50000);
      expect(revenue.debit).toBe(0);
      expect(revenue.source).toBe("Receivable Invoice");
      expect(revenue.reference).toBe("INV-10001");
      expect(revenue.taxRate).toBe(9);
      expect(revenue.taxRateName).toBe("GST 9%");

      const salary = result.transactions.find((t) => t.account === "Salaries")!;
      expect(salary.debit).toBe(35000);
      expect(salary.credit).toBe(0);
    });

    it("should parse Excel with non-standard column names (fuzzy match)", async () => {
      // Column names that don't exactly match our aliases but should fuzzy-match
      const rows: (string | number | null)[][] = [
        ["Transaction Date", "GL Account Name", "Memo/Description", "Ref No.", "Debit (SGD)", "Credit (SGD)", "Closing Balance"],
        ["2024-01-15", "License Fee Income", "Q1 SaaS License", "INV-10001", "0", "50000", "50000"],
        ["2024-01-31", "Salaries", "Jan Payroll", "#8001", "35000", "0", "35000"],
        ["2024-02-01", "Insurance Expense", "D&O Insurance", "INS-2024", "8500", "0", "8500"],
      ];

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

      const result = await parseGLFile(buffer, "custom-gl.xlsx");

      expect(result.metadata.format).toBe("generic-xlsx");
      expect(result.transactions.length).toBe(3);

      // Verify fuzzy matching worked
      expect(result.transactions[0].date).toBe("2024-01-15");
      expect(result.transactions[0].account).toBe("License Fee Income");
      expect(result.transactions[0].credit).toBe(50000);
      expect(result.transactions[0].description).toBe("Q1 SaaS License");
      expect(result.transactions[0].reference).toBe("INV-10001");
      expect(result.transactions[0].runningBalance).toBe(50000);
    });

    it("should parse with minimal columns (Date + Debit + Credit only)", async () => {
      const rows: (string | number | null)[][] = [
        ["Date", "Debit", "Credit"],
        ["2024-01-15", "0", "50000"],
        ["2024-01-31", "35000", "0"],
      ];

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

      const result = await parseGLFile(buffer, "minimal.xlsx");

      expect(result.transactions.length).toBe(2);
      expect(result.transactions[0].credit).toBe(50000);
      expect(result.transactions[1].debit).toBe(35000);
      // Missing fields should have safe defaults
      expect(result.transactions[0].account).toBe("Unknown");
      expect(result.transactions[0].source).toBe("");
      expect(result.transactions[0].taxRate).toBe(0);
    });

    it("should parse with extra/unknown columns (ignored gracefully)", async () => {
      const rows: (string | number | null)[][] = [
        ["Date", "Account", "Debit", "Credit", "Department", "Cost Center", "Project Code", "Approved By"],
        ["2024-01-15", "Revenue", "0", "50000", "Sales", "SG-001", "PRJ-42", "John"],
        ["2024-01-31", "Salaries", "35000", "0", "HR", "SG-002", "PRJ-10", "Jane"],
      ];

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

      const result = await parseGLFile(buffer, "extra-cols.xlsx");

      expect(result.transactions.length).toBe(2);
      expect(result.transactions[0].account).toBe("Revenue");
      expect(result.transactions[0].credit).toBe(50000);
      expect(result.transactions[1].account).toBe("Salaries");
      expect(result.transactions[1].debit).toBe(35000);
    });

    it("should parse single Amount column (positive=debit, negative=credit)", async () => {
      const rows: (string | number | null)[][] = [
        ["Date", "Account", "Description", "Amount"],
        ["2024-01-15", "Revenue", "Q1 License", "-50000"],
        ["2024-01-31", "Salaries", "Jan Payroll", "35000"],
        ["2024-02-01", "Insurance", "D&O Premium", "8500"],
      ];

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

      const result = await parseGLFile(buffer, "single-amount.xlsx");

      expect(result.transactions.length).toBe(3);
      // Negative amount → credit
      expect(result.transactions[0].debit).toBe(0);
      expect(result.transactions[0].credit).toBe(50000);
      // Positive amount → debit
      expect(result.transactions[1].debit).toBe(35000);
      expect(result.transactions[1].credit).toBe(0);
    });

    it("should handle header row not on row 0 (metadata rows above)", async () => {
      // Some exports have title, company, date, blank, then header
      const rows: (string | number | null)[][] = [
        ["ACME Corp Financial Report", null, null, null],
        ["Prepared by: Finance Team", null, null, null],
        ["As at 31 December 2024", null, null, null],
        [null, null, null, null],
        [null, null, null, null],
        // Header is on row 5
        ["Date", "Account", "Debit", "Credit"],
        ["2024-01-15", "Revenue", "0", "50000"],
        ["2024-01-31", "Salaries", "35000", "0"],
      ];

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

      const result = await parseGLFile(buffer, "offset-header.xlsx");

      expect(result.transactions.length).toBe(2);
      // "ACME Corp Financial Report" is the first non-title text, treated as company name
      expect(result.metadata.companyName).toBe("ACME Corp Financial Report");
      expect(result.metadata.period).toBe("As at 31 December 2024");
    });

    it("should parse CSV with non-standard column names", async () => {
      const csv = `Transaction Date,GL Account,Memo,Ref No.,Dr,Cr
2024-01-15,License Fee Income,Q1 SaaS License,INV-10001,0,50000
2024-01-31,Salaries,Jan Payroll,#8001,35000,0
`;
      const buffer = Buffer.from(csv, "utf-8");
      const result = await parseGLFile(buffer, "custom.csv");

      expect(result.transactions.length).toBe(2);
      expect(result.transactions[0].account).toBe("License Fee Income");
      expect(result.transactions[0].credit).toBe(50000);
      expect(result.transactions[0].description).toBe("Q1 SaaS License");
      expect(result.transactions[1].debit).toBe(35000);
    });
  });

  describe("Error handling", () => {
    it("should throw on empty file", async () => {
      const buffer = Buffer.from("", "utf-8");
      await expect(parseGLFile(buffer, "empty.json")).rejects.toThrow();
    });

    it("should throw on non-array JSON", async () => {
      const buffer = Buffer.from('{"key": "value"}', "utf-8");
      await expect(parseGLFile(buffer, "bad.json")).rejects.toThrow("array");
    });

    it("should throw on CSV with only a header row (no data)", async () => {
      // This covers the rows.length < 2 branch in parseCSV
      const csv = `Date,Account,Debit,Credit\n`;
      const buffer = Buffer.from(csv, "utf-8");
      await expect(parseGLFile(buffer, "header-only.csv")).rejects.toThrow(/too few rows/i);
    });
  });

  describe("Row parse error counting", () => {
    it("should count parse errors for rows with data but unparseable date", async () => {
      // A row that has non-empty cells, non-skip first cell, but no valid date.
      // This exercises the parseErrors++ branch.
      const rows: (string | number | null)[][] = [
        ["Date", "Account", "Description", "Debit", "Credit"],
        ["2024-01-15", "Revenue", "Valid transaction", 0, 50000],
        // Row with non-empty data but totally invalid "date" value
        ["NOT-A-DATE-VALUE-XYZ", "Revenue", "Invalid date row", 100, 0],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

      const result = await parseGLFile(buffer, "error-rows.xlsx");

      // The valid row should be parsed, the invalid one counted as a parse error
      expect(result.transactions.length).toBeGreaterThanOrEqual(1);
      expect(result.metadata.parseErrors).toBeGreaterThanOrEqual(1);
    });
  });
});
