/**
 * parse-xero-gl.ts
 * ================
 * Parses a Xero "General Ledger Detail" XLSX export into the canonical
 * GL JSON schema that NexusBrain's AAS agents expect.
 *
 * Usage:
 *   npx tsx scripts/parse-xero-gl.ts \
 *     --input "/path/to/General Ledger Detail.xlsx" \
 *     --output /tmp/gl-data.json \
 *     [--org-slug ph-accounting]
 *
 * After running, upload with:
 *   npx tsx scripts/migrate-gl-data-to-storage.ts
 *
 * Xero GL Detail export structure (detected automatically):
 *   Row 0: "General Ledger Detail"
 *   Row 1: Company name
 *   Row 2: Period string
 *   Row 3: blank
 *   Row 4: ["Date","Source","Description","Reference","Debit","Credit",
 *            "Running Balance","Tax","Tax Rate","Tax Rate Name"]
 *   Row 5: blank
 *   Row 6+: Alternates between:
 *     - Account header row: single cell with account name
 *     - Transaction rows: 10 columns, col 0 = "DD Mon YYYY"
 *     - Subtotal rows: "Total X" / "Net movement" (skipped)
 *     - Blank rows (skipped)
 *
 * Output schema (GLTransaction[]):
 *   date           YYYY-MM-DD
 *   source         e.g. "Manual Journal", "Payable Invoice"
 *   description    full text
 *   reference      e.g. "#8222", "INV-15010853"
 *   debit          number (SGD)
 *   credit         number (SGD)
 *   runningBalance number (SGD)
 *   tax            number
 *   taxRate        number (0-100)
 *   taxRateName    e.g. "No Tax", "GST 8%"
 *   account        account name (from section header)
 *
 * Privacy: This script runs entirely locally. No data leaves your machine
 * until you explicitly run the upload script.
 */

import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

// ── CLI args ──────────────────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

const inputFile = getArg("--input");
const outputFile = getArg("--output") || path.resolve(__dirname, "../lib/accounting-jarvis/gl-data.json");

if (!inputFile) {
  console.error("Usage: npx tsx scripts/parse-xero-gl.ts --input <path-to.xlsx> [--output <path-to.json>]");
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`Input file not found: ${inputFile}`);
  process.exit(1);
}

// ── Date parsing ──────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04",
  May: "05", Jun: "06", Jul: "07", Aug: "08",
  Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseXeroDate(raw: string): string | null {
  // "01 Jan 2020" → "2020-01-01"
  const m = raw.trim().match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const mon = MONTH_MAP[m[2]];
  const yr = m[3];
  if (!mon) return null;
  return `${yr}-${mon}-${day}`;
}

// ── Number parsing ────────────────────────────────────────────────────────────

function parseNum(raw: string | null | undefined): number {
  if (!raw || String(raw).trim() === "") return 0;
  return parseFloat(String(raw).replace(/,/g, "")) || 0;
}

function parsePct(raw: string | null | undefined): number {
  if (!raw) return 0;
  return parseFloat(String(raw).replace(/%/g, "")) || 0;
}

// ── Row classification ────────────────────────────────────────────────────────

const SKIP_PREFIXES = ["Total", "Net movement", "General Ledger", "For the period", "Date"];

function isSkipRow(firstCell: string): boolean {
  return SKIP_PREFIXES.some((p) => firstCell.startsWith(p));
}

function isTransactionRow(row: unknown[]): boolean {
  if (!row[0]) return false;
  return /^\d{1,2}\s+\w{3}\s+\d{4}$/.test(String(row[0]).trim());
}

function isAccountHeader(row: unknown[]): boolean {
  // Single non-empty cell, not a date, not a skip prefix
  const nonEmpty = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "");
  if (nonEmpty.length !== 1) return false;
  const val = String(nonEmpty[0]).trim();
  return !isTransactionRow(row) && !isSkipRow(val);
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface GLTransaction {
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

function main() {
  console.log(`\n=== Parse Xero GL: XLSX → NexusBrain JSON ===\n`);
  console.log(`Input:  ${inputFile}`);
  console.log(`Output: ${outputFile}\n`);

  // 1. Read workbook
  console.log("[1/4] Reading workbook...");
  const wb = XLSX.readFile(inputFile!);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  console.log(`  Sheet: "${sheetName}" — ${rows.length} raw rows`);

  // Detect company name + period from metadata rows
  const companyName = String(rows[1]?.[0] || "").trim();
  const period = String(rows[2]?.[0] || "").trim();
  console.log(`  Company: ${companyName}`);
  console.log(`  Period:  ${period}`);

  // 2. Parse transactions
  console.log("\n[2/4] Parsing transactions...");
  const transactions: GLTransaction[] = [];
  let currentAccount = "Unknown";
  let skippedRows = 0;
  let parseErrors = 0;

  for (let i = 5; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const firstCell = String(row[0] || "").trim();
    if (!firstCell) continue;

    // Skip totals and subtotals
    if (isSkipRow(firstCell)) {
      skippedRows++;
      continue;
    }

    // Account section header
    if (isAccountHeader(row)) {
      currentAccount = firstCell;
      continue;
    }

    // Transaction row
    if (isTransactionRow(row)) {
      const dateStr = parseXeroDate(firstCell);
      if (!dateStr) {
        parseErrors++;
        continue;
      }

      transactions.push({
        date: dateStr,
        source: String(row[1] || "").trim(),
        description: String(row[2] || "").trim(),
        reference: String(row[3] || "").trim(),
        debit: parseNum(row[4] as string),
        credit: parseNum(row[5] as string),
        runningBalance: parseNum(row[6] as string),
        tax: parseNum(row[7] as string),
        taxRate: parsePct(row[8] as string),
        taxRateName: String(row[9] || "No Tax").trim(),
        account: currentAccount,
      });
    }
  }

  console.log(`  Transactions parsed:   ${transactions.length.toLocaleString()}`);
  console.log(`  Rows skipped (totals): ${skippedRows}`);
  if (parseErrors > 0) {
    console.log(`  Parse errors:          ${parseErrors}`);
  }

  // 3. Validate (double-entry check)
  console.log("\n[3/4] Validating...");
  const accounts = new Set(transactions.map((t) => t.account));
  const totalDebit = transactions.reduce((sum, t) => sum + t.debit, 0);
  const totalCredit = transactions.reduce((sum, t) => sum + t.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const datesSorted = transactions.map((t) => t.date).sort();
  const dateFrom = datesSorted[0];
  const dateTo = datesSorted[datesSorted.length - 1];

  const sourceCounts: Record<string, number> = {};
  for (const t of transactions) {
    sourceCounts[t.source] = (sourceCounts[t.source] || 0) + 1;
  }

  console.log(`  Unique accounts:       ${accounts.size}`);
  console.log(`  Date range:            ${dateFrom} to ${dateTo}`);
  console.log(`  Total debit:           SGD ${totalDebit.toLocaleString("en-SG", { minimumFractionDigits: 2 })}`);
  console.log(`  Total credit:          SGD ${totalCredit.toLocaleString("en-SG", { minimumFractionDigits: 2 })}`);
  console.log(`  Balanced:              ${balanced ? "✓ YES" : "✗ NO (variance: " + (totalDebit - totalCredit).toFixed(2) + ")"}`);
  console.log(`  Sources:`);
  for (const [src, count] of Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${src.padEnd(30)} ${count.toLocaleString()}`);
  }

  // 4. Write output
  console.log("\n[4/4] Writing JSON...");
  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`  Created directory: ${outputDir}`);
  }

  fs.writeFileSync(outputFile, JSON.stringify(transactions, null, 0), "utf-8");
  const outputSize = (fs.statSync(outputFile).size / 1024 / 1024).toFixed(1);
  console.log(`  Written: ${outputFile} (${outputSize} MB)`);

  console.log(`\n=== Parse complete ===`);
  console.log(`\nGL data summary:`);
  console.log(`  ${transactions.length.toLocaleString()} transactions`);
  console.log(`  ${accounts.size} accounts`);
  console.log(`  ${dateFrom} → ${dateTo}`);
  console.log(`  Balanced: ${balanced ? "YES" : "NO"}`);
  console.log(`\nNext step:`);
  console.log(`  npx tsx scripts/migrate-gl-data-to-storage.ts`);
  console.log(`  (uploads ${outputFile} to Supabase Storage for ph-accounting org)\n`);
}

main();
