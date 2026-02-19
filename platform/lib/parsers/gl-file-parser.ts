/**
 * GL File Parser — Dynamic multi-format parser for General Ledger data
 * ====================================================================
 *
 * Accepts Excel (.xlsx/.xls), CSV, or JSON files and normalizes them
 * into the canonical GLTransaction[] schema that NexusBrain's AAS agents
 * and brain ingestion pipeline expect.
 *
 * ZERO assumptions about column order or column names:
 *   - Columns are auto-detected by fuzzy header matching (50+ aliases)
 *   - Works with any Xero export, QuickBooks, MYOB, or custom spreadsheets
 *   - Only requirement: at least a Date column + 1 amount column (Debit/Credit/Amount)
 *   - Xero "section header" layout (account name rows) detected automatically
 *
 * Supported formats:
 *   - Any Excel (.xlsx/.xls) with auto-detected columns
 *   - Any CSV with auto-detected column mapping
 *   - JSON array of GLTransaction objects (existing format)
 *
 * Usage:
 *   import { parseGLFile } from "@/lib/parsers/gl-file-parser";
 *   const { transactions, metadata } = parseGLFile(buffer, "gl-export.xlsx");
 */

import * as XLSX from "xlsx";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GLTransaction {
  date: string;           // YYYY-MM-DD
  source: string;         // e.g. "Manual Journal", "Payable Invoice"
  description: string;
  reference: string;      // e.g. "#8222", "INV-15010853"
  debit: number;
  credit: number;
  runningBalance: number;
  tax: number;
  taxRate: number;        // 0-100 (e.g. 9 for 9% GST)
  taxRateName: string;    // e.g. "No Tax", "GST 9%"
  account: string;        // account name
}

export type FileFormat = "xero-xlsx" | "generic-xlsx" | "csv" | "json";

export interface ParseResult {
  transactions: GLTransaction[];
  metadata: {
    format: FileFormat;
    companyName?: string;
    period?: string;
    accountCount: number;
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
    parseErrors: number;
    rowsSkipped: number;
  };
}

// ── Date parsing ──────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04",
  May: "05", Jun: "06", Jul: "07", Aug: "08",
  Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  January: "01", February: "02", March: "03", April: "04",
  June: "06", July: "07", August: "08",
  September: "09", October: "10", November: "11", December: "12",
};

/**
 * Parse various date formats to YYYY-MM-DD:
 *   "01 Jan 2020"     → "2020-01-01" (Xero)
 *   "2020-01-01"      → "2020-01-01" (ISO)
 *   "01/01/2020"      → "2020-01-01" (DD/MM/YYYY)
 *   "1/1/2020"        → "2020-01-01"
 *   "1/15/24"         → "2024-01-15" (XLSX CSV output)
 *   Excel serial      → via XLSX date utils
 */
function parseDate(raw: unknown): string | null {
  if (!raw) return null;

  const str = String(raw).trim();

  // ISO format: 2020-01-01 or 2020-01-01T...
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }

  // Xero format: "01 Jan 2020" or "1 Jan 2020"
  const xeroMatch = str.match(/^(\d{1,2})\s+(\w{3,})\s+(\d{4})$/);
  if (xeroMatch) {
    const day = xeroMatch[1].padStart(2, "0");
    const mon = MONTH_MAP[xeroMatch[2]];
    const yr = xeroMatch[3];
    if (mon) return `${yr}-${mon}-${day}`;
  }

  // DD/MM/YYYY or D/M/YYYY (4-digit year)
  const slashMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  // M/D/YY or MM/DD/YY (2-digit year — XLSX CSV date output format)
  const shortYearMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/);
  if (shortYearMatch) {
    const part1 = parseInt(shortYearMatch[1]);
    const part2 = parseInt(shortYearMatch[2]);
    const shortYear = parseInt(shortYearMatch[3]);
    // 2-digit year: 00-49 → 2000s, 50-99 → 1900s
    const year = shortYear < 50 ? 2000 + shortYear : 1900 + shortYear;
    // XLSX outputs US format M/D/YY, so part1=month, part2=day
    // But if part1 > 12, it must be D/M/YY
    let month: number, day: number;
    if (part1 > 12) {
      day = part1;
      month = part2;
    } else if (part2 > 12) {
      month = part1;
      day = part2;
    } else {
      // Ambiguous — default to M/D/YY (US format, what XLSX produces)
      month = part1;
      day = part2;
    }
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // MM/DD/YYYY (US format — only if month <= 12 and day > 12)
  // Skip — ambiguous, default to DD/MM/YYYY above

  // Excel serial number
  if (/^\d{5}$/.test(str)) {
    try {
      const d = XLSX.SSF.parse_date_code(parseInt(str));
      if (d) {
        return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

// ── Number parsing ────────────────────────────────────────────────────────────

function parseNum(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") return raw;
  const str = String(raw).trim();
  if (str === "" || str === "-") return 0;
  // Remove currency symbols, commas, spaces
  const cleaned = str.replace(/[$SGD£€¥,\s]/g, "").replace(/\((.+)\)/, "-$1");
  return parseFloat(cleaned) || 0;
}

function parsePct(raw: unknown): number {
  if (!raw) return 0;
  if (typeof raw === "number") return raw;
  return parseFloat(String(raw).replace(/%/g, "")) || 0;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Auto-detect file format and parse to canonical GLTransaction[].
 * Throws if the file cannot be parsed at all.
 */
export function parseGLFile(buffer: Buffer, fileName: string): ParseResult {
  const ext = fileName.toLowerCase().split(".").pop() || "";

  if (ext === "xlsx" || ext === "xls") {
    return parseExcel(buffer);
  }

  if (ext === "csv") {
    return parseCSV(buffer);
  }

  if (ext === "json") {
    return parseJSON(buffer);
  }

  // Unknown extension — try JSON first, then CSV
  try {
    return parseJSON(buffer);
  } catch {
    try {
      return parseCSV(buffer);
    } catch {
      throw new Error(
        `Unsupported file format: .${ext}. Upload an Excel (.xlsx), CSV, or JSON file.`
      );
    }
  }
}

// ── Row classification helpers ────────────────────────────────────────────────

const SKIP_PREFIXES = ["Total", "Net movement", "General Ledger", "For the period", "Date"];

function isSkipRow(firstCell: string): boolean {
  return SKIP_PREFIXES.some((p) => firstCell.startsWith(p));
}

/**
 * Detect if a row is an account section header (Xero-style layout).
 * Account headers are rows with exactly ONE non-empty cell that is NOT a date
 * and NOT a skip/total prefix.
 */
function isAccountHeader(row: unknown[], dateColIdx?: number): boolean {
  const nonEmpty = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "");
  if (nonEmpty.length !== 1) return false;
  const val = String(nonEmpty[0]).trim();
  // Not a date, not a skip row
  if (isSkipRow(val)) return false;
  if (parseDate(val) !== null) return false;
  // Must be a reasonable account name (at least 2 chars, not just a number)
  if (val.length < 2) return false;
  if (/^\d+(\.\d+)?$/.test(val)) return false;
  return true;
}

// ── Column name matching — fuzzy, order-independent ────────────────────────────
//
// Two-tier matching:
//   1. Exact alias match (fast, unambiguous)
//   2. Fuzzy keyword match (catches "Debit (SGD)", "GL Account Name", etc.)
//
// This means we never assume column positions — the parser works with ANY
// column order and with column names we've never seen before.

/** Exact aliases (case-insensitive) for each canonical field */
const COLUMN_ALIASES: Record<string, string[]> = {
  date: ["date", "transaction date", "txn date", "posting date", "value date", "entry date", "trans date", "journal date"],
  source: ["source", "type", "transaction type", "txn type", "journal type", "entry type", "source type"],
  description: ["description", "memo", "narrative", "details", "particulars", "notes", "name", "comment", "line memo", "line description", "transaction description"],
  reference: ["reference", "ref", "ref no", "reference no", "invoice", "doc no", "document", "invoice no", "invoice number", "cheque no", "check no", "voucher no"],
  debit: ["debit", "debit amount", "dr", "debit (sgd)", "debit amount (sgd)", "debit (usd)", "debit (aud)", "debit (gbp)", "debit (eur)", "debit (myr)", "dr amount"],
  credit: ["credit", "credit amount", "cr", "credit (sgd)", "credit amount (sgd)", "credit (usd)", "credit (aud)", "credit (gbp)", "credit (eur)", "credit (myr)", "cr amount"],
  amount: ["amount", "net amount", "total amount", "value", "net", "amt"],
  runningBalance: ["running balance", "balance", "closing balance", "running total", "cumulative balance", "ytd balance"],
  tax: ["tax", "tax amount", "gst", "gst amount", "vat", "vat amount", "tax total"],
  taxRate: ["tax rate", "gst rate", "vat rate", "tax %", "tax percent", "gst %"],
  taxRateName: ["tax rate name", "tax code", "tax type", "gst code", "vat code", "tax name"],
  account: ["account", "account name", "gl account", "ledger account", "account code", "account title", "category", "account description", "chart of account", "coa", "gl code", "nominal code", "nominal"],
};

/** Fuzzy keyword patterns — used when exact match fails */
const COLUMN_FUZZY: Record<string, RegExp> = {
  date: /\bdate\b/i,
  source: /\b(source|journal.?type|entry.?type)\b/i,
  description: /\b(desc|memo|narrat|detail|particular|note)\b/i,
  reference: /\b(ref|invoice|cheque|check|voucher|doc)\b/i,
  debit: /\bde?bi?t\b/i,
  credit: /\bcre?di?t\b/i,
  amount: /\b(amount|value|net)\b/i,
  runningBalance: /\b(running|balance|closing|cumulative)\b/i,
  tax: /\b(tax|gst|vat)\b(?!.*(?:rate|code|name|type|%))/i,
  taxRate: /\b(tax|gst|vat)\b.*\b(rate|%|percent)\b/i,
  taxRateName: /\b(tax|gst|vat)\b.*\b(code|name|type)\b/i,
  account: /\b(account|ledger|gl|nominal|coa|categor)\b/i,
};

/**
 * Match a header string to a canonical field name.
 * Tries exact alias match first, then fuzzy keyword match.
 */
function matchColumn(header: string): string | null {
  const normalized = header.toLowerCase().trim();
  if (!normalized) return null;

  // 1. Exact alias match
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(normalized)) return field;
  }

  // 2. Fuzzy keyword match
  for (const [field, pattern] of Object.entries(COLUMN_FUZZY)) {
    if (pattern.test(normalized)) return field;
  }

  return null;
}

/**
 * Build a column index map from a header row.
 * Returns a map of canonical field name → column index.
 */
function buildColumnMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    const field = matchColumn(headers[i]);
    if (field && !(field in map)) {
      map[field] = i;
    }
  }
  return map;
}

// ── Unified Excel/spreadsheet parser ──────────────────────────────────────────
//
// Single parser for ALL Excel files — Xero, QuickBooks, MYOB, custom.
// No hardcoded column positions. Everything auto-detected.

function parseExcel(buffer: Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", raw: false });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,
    defval: "",
  });

  if (rows.length < 2) {
    throw new Error("Excel file has too few rows. Expected at least a header and one data row.");
  }

  return parseRows(rows);
}

/**
 * Core row parser — used by both Excel and CSV paths.
 *
 * Strategy:
 *   1. Scan first 30 rows to find the HEADER ROW (auto-detected by column name matching)
 *   2. Extract metadata (company name, period) from rows ABOVE the header
 *   3. Detect if this is a "section header" layout (no Account column → Xero-style)
 *   4. Parse all data rows below the header using the dynamic column map
 *   5. Handle single "Amount" column by splitting into debit/credit
 */
function parseRows(rows: unknown[][]): ParseResult {
  // ── Step 1: Find the header row ──────────────────────────────────────────
  let headerRowIdx = -1;
  let colMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const headers = row.map((c) => String(c || "").trim());
    const candidate = buildColumnMap(headers);
    const matchedCount = Object.keys(candidate).length;

    // Need at least: date + one amount column (debit, credit, or amount)
    const hasDate = candidate.date !== undefined;
    const hasAmount = candidate.debit !== undefined || candidate.credit !== undefined || candidate.amount !== undefined;

    if (matchedCount >= 2 && hasDate && hasAmount) {
      headerRowIdx = i;
      colMap = candidate;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error(
      "Could not detect column headers. Expected columns with recognizable names like: " +
      "Date, Debit, Credit, Account, Description, Amount, etc. " +
      "The parser auto-detects columns — they can be in any order."
    );
  }

  // ── Step 2: Extract metadata from rows above the header ──────────────────
  let companyName: string | undefined;
  let period: string | undefined;
  let isXeroStyle = false;

  for (let i = 0; i < headerRowIdx; i++) {
    const cell = String(rows[i]?.[0] || "").trim();
    if (!cell) continue;

    // Detect Xero-style layout
    if (/general ledger|ledger detail/i.test(cell)) {
      isXeroStyle = true;
      continue;
    }

    // Period detection
    if (/period|from.*to|for the|year ended|as at|fy\s*\d{4}/i.test(cell)) {
      period = cell;
      // Also mark as Xero-style if it has metadata rows
      isXeroStyle = true;
    } else if (!companyName && cell.length > 2) {
      // First non-title, non-period text is likely the company name
      companyName = cell;
    }
  }

  // ── Step 3: Detect section header layout ─────────────────────────────────
  // If there's no Account column in the header, check if the file uses
  // Xero-style section headers (account name as a single-cell row above
  // its transactions).
  const hasAccountColumn = colMap.account !== undefined;
  const hasSectionHeaders = !hasAccountColumn;

  // ── Step 4: Parse data rows ──────────────────────────────────────────────
  const transactions: GLTransaction[] = [];
  let parseErrors = 0;
  let skippedRows = 0;
  let currentAccount = "Unknown";

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.length === 0) continue;

    // Check if row has any non-empty content
    const nonEmptyCells = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "");
    if (nonEmptyCells.length === 0) continue;

    const firstCell = String(row[0] || "").trim();

    // Skip totals, subtotals, net movement rows (check first cell)
    if (firstCell && isSkipRow(firstCell)) {
      skippedRows++;
      continue;
    }

    // Section header detection (when there's no account column)
    if (hasSectionHeaders && isAccountHeader(row, colMap.date)) {
      currentAccount = firstCell;
      continue;
    }

    // Try to parse as a transaction using the DETECTED date column (not column 0)
    const dateRaw = colMap.date !== undefined ? row[colMap.date] : null;
    const dateStr = parseDate(dateRaw);
    if (!dateStr) {
      // Not a transaction row
      if (nonEmptyCells.length > 0 && firstCell && !isSkipRow(firstCell) && !isAccountHeader(row, colMap.date)) {
        parseErrors++;
      } else {
        skippedRows++;
      }
      continue;
    }

    // Handle debit/credit — support separate columns OR single "Amount" column
    let debit = 0;
    let credit = 0;
    if (colMap.debit !== undefined || colMap.credit !== undefined) {
      debit = colMap.debit !== undefined ? parseNum(row[colMap.debit]) : 0;
      credit = colMap.credit !== undefined ? parseNum(row[colMap.credit]) : 0;
    } else if (colMap.amount !== undefined) {
      // Single "Amount" column: positive = debit, negative = credit
      const amt = parseNum(row[colMap.amount]);
      if (amt >= 0) {
        debit = amt;
      } else {
        credit = Math.abs(amt);
      }
    }

    transactions.push({
      date: dateStr,
      source: colMap.source !== undefined ? String(row[colMap.source] || "").trim() : "",
      description: colMap.description !== undefined ? String(row[colMap.description] || "").trim() : "",
      reference: colMap.reference !== undefined ? String(row[colMap.reference] || "").trim() : "",
      debit,
      credit,
      runningBalance: colMap.runningBalance !== undefined ? parseNum(row[colMap.runningBalance]) : 0,
      tax: colMap.tax !== undefined ? parseNum(row[colMap.tax]) : 0,
      taxRate: colMap.taxRate !== undefined ? parsePct(row[colMap.taxRate]) : 0,
      taxRateName: colMap.taxRateName !== undefined ? String(row[colMap.taxRateName] || "No Tax").trim() : "No Tax",
      account: hasSectionHeaders
        ? currentAccount
        : (colMap.account !== undefined ? String(row[colMap.account] || "Unknown").trim() : "Unknown"),
    });
  }

  // Determine format label
  const format: FileFormat = isXeroStyle ? "xero-xlsx" : "generic-xlsx";
  return buildResult(transactions, format, parseErrors, skippedRows, companyName, period);
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(buffer: Buffer): ParseResult {
  const text = buffer.toString("utf-8");

  // Use XLSX to parse CSV (handles quoting, encoding edge cases)
  const wb = XLSX.read(text, { type: "string", raw: false });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,
    defval: "",
  });

  if (rows.length < 2) {
    throw new Error("CSV file has too few rows. Expected at least a header and one data row.");
  }

  // Reuse the same row-parsing logic as Excel
  return parseRows(rows);
}

// ── JSON parser (backward compatible) ─────────────────────────────────────────

function parseJSON(buffer: Buffer): ParseResult {
  const text = buffer.toString("utf-8");
  const data = JSON.parse(text);

  if (!Array.isArray(data)) {
    throw new Error("JSON file must contain an array of transactions.");
  }

  // Validate and normalize
  const transactions: GLTransaction[] = data.map((row: any) => ({
    date: String(row.date || "").slice(0, 10),
    source: String(row.source || ""),
    description: String(row.description || ""),
    reference: String(row.reference || ""),
    debit: parseNum(row.debit),
    credit: parseNum(row.credit),
    runningBalance: parseNum(row.runningBalance || row.running_balance || 0),
    tax: parseNum(row.tax || 0),
    taxRate: parseNum(row.taxRate || row.tax_rate || 0),
    taxRateName: String(row.taxRateName || row.tax_rate_name || "No Tax"),
    account: String(row.account || "Unknown"),
  }));

  return buildResult(transactions, "json", 0, 0);
}

// ── Result builder ────────────────────────────────────────────────────────────

function buildResult(
  transactions: GLTransaction[],
  format: FileFormat,
  parseErrors: number,
  rowsSkipped: number,
  companyName?: string,
  period?: string
): ParseResult {
  const accounts = new Set(transactions.map((t) => t.account));
  const totalDebit = transactions.reduce((sum, t) => sum + t.debit, 0);
  const totalCredit = transactions.reduce((sum, t) => sum + t.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return {
    transactions,
    metadata: {
      format,
      companyName,
      period,
      accountCount: accounts.size,
      totalDebit,
      totalCredit,
      balanced,
      parseErrors,
      rowsSkipped,
    },
  };
}
