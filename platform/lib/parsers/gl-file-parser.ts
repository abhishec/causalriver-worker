/**
 * GL File Parser — Dynamic multi-format parser for General Ledger data
 * ====================================================================
 *
 * Accepts Excel (.xlsx/.xls), CSV, or JSON files and normalizes them
 * into the canonical GLTransaction[] schema that NexusBrain's AAS agents
 * and brain ingestion pipeline expect.
 *
 * Supported formats:
 *   - Xero "General Ledger Detail" XLSX export (auto-detected)
 *   - Generic CSV with auto-detected column mapping
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

  // DD/MM/YYYY or D/M/YYYY
  const slashMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
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

// ── Excel parser (Xero + generic) ─────────────────────────────────────────────

const SKIP_PREFIXES = ["Total", "Net movement", "General Ledger", "For the period", "Date"];

function isSkipRow(firstCell: string): boolean {
  return SKIP_PREFIXES.some((p) => firstCell.startsWith(p));
}

function isXeroTransactionRow(row: unknown[]): boolean {
  if (!row[0]) return false;
  return /^\d{1,2}\s+\w{3}\s+\d{4}$/.test(String(row[0]).trim());
}

function isAccountHeader(row: unknown[]): boolean {
  const nonEmpty = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "");
  if (nonEmpty.length !== 1) return false;
  const val = String(nonEmpty[0]).trim();
  return !isXeroTransactionRow(row) && !isSkipRow(val);
}

function parseExcel(buffer: Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", raw: false });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,
    defval: "",
  });

  if (rows.length < 5) {
    throw new Error("Excel file has too few rows. Expected a Xero GL Detail export.");
  }

  // Detect if this is a Xero GL Detail export
  const firstCell = String(rows[0]?.[0] || "").trim();
  const isXero = firstCell === "General Ledger Detail" ||
    firstCell.includes("General Ledger") ||
    firstCell.includes("Ledger Detail");

  if (isXero) {
    return parseXeroXLSX(rows);
  }

  // Generic Excel — try to find a header row with recognizable column names
  return parseGenericExcel(rows);
}

function parseXeroXLSX(rows: unknown[][]): ParseResult {
  const companyName = String(rows[1]?.[0] || "").trim();
  const period = String(rows[2]?.[0] || "").trim();

  const transactions: GLTransaction[] = [];
  let currentAccount = "Unknown";
  let skippedRows = 0;
  let parseErrors = 0;

  // Xero starts data at row 5 (0-indexed)
  for (let i = 5; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const cell0 = String(row[0] || "").trim();
    if (!cell0) continue;

    if (isSkipRow(cell0)) {
      skippedRows++;
      continue;
    }

    if (isAccountHeader(row)) {
      currentAccount = cell0;
      continue;
    }

    if (isXeroTransactionRow(row)) {
      const dateStr = parseDate(cell0);
      if (!dateStr) {
        parseErrors++;
        continue;
      }

      transactions.push({
        date: dateStr,
        source: String(row[1] || "").trim(),
        description: String(row[2] || "").trim(),
        reference: String(row[3] || "").trim(),
        debit: parseNum(row[4]),
        credit: parseNum(row[5]),
        runningBalance: parseNum(row[6]),
        tax: parseNum(row[7]),
        taxRate: parsePct(row[8]),
        taxRateName: String(row[9] || "No Tax").trim(),
        account: currentAccount,
      });
    }
  }

  return buildResult(transactions, "xero-xlsx", parseErrors, skippedRows, companyName, period);
}

// ── Column name matching for generic Excel/CSV ────────────────────────────────

const COLUMN_ALIASES: Record<string, string[]> = {
  date: ["date", "transaction date", "txn date", "posting date", "value date", "entry date"],
  source: ["source", "type", "transaction type", "txn type", "journal type"],
  description: ["description", "memo", "narrative", "details", "particulars", "notes", "name"],
  reference: ["reference", "ref", "ref no", "reference no", "invoice", "doc no", "document"],
  debit: ["debit", "debit amount", "dr", "debit (sgd)", "debit amount (sgd)"],
  credit: ["credit", "credit amount", "cr", "credit (sgd)", "credit amount (sgd)"],
  runningBalance: ["running balance", "balance", "closing balance", "running total"],
  tax: ["tax", "tax amount", "gst", "gst amount", "vat"],
  taxRate: ["tax rate", "gst rate", "vat rate", "tax %"],
  taxRateName: ["tax rate name", "tax code", "tax type", "gst code"],
  account: ["account", "account name", "gl account", "ledger account", "account code", "account title", "category"],
};

function matchColumn(header: string): string | null {
  const normalized = header.toLowerCase().trim();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(normalized)) return field;
  }
  return null;
}

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

// ── Generic Excel parser ──────────────────────────────────────────────────────

function parseGenericExcel(rows: unknown[][]): ParseResult {
  // Find the header row (first row with 3+ recognized column names)
  let headerRowIdx = -1;
  let colMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;

    const headers = row.map((c) => String(c || "").trim());
    const candidate = buildColumnMap(headers);
    const matchedCount = Object.keys(candidate).length;

    if (matchedCount >= 3 && candidate.date !== undefined) {
      headerRowIdx = i;
      colMap = candidate;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error(
      "Could not detect column headers. Expected columns like: Date, Account, Debit, Credit. " +
      "Supported formats: Xero GL Detail export, or any spreadsheet with standard accounting columns."
    );
  }

  const transactions: GLTransaction[] = [];
  let parseErrors = 0;
  let skippedRows = 0;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.length === 0) continue;

    const dateRaw = colMap.date !== undefined ? row[colMap.date] : null;
    const dateStr = parseDate(dateRaw);
    if (!dateStr) {
      // Skip non-transaction rows (subtotals, blanks, etc.)
      const firstCell = String(row[0] || "").trim();
      if (firstCell && !isSkipRow(firstCell)) {
        parseErrors++;
      } else {
        skippedRows++;
      }
      continue;
    }

    transactions.push({
      date: dateStr,
      source: colMap.source !== undefined ? String(row[colMap.source] || "").trim() : "",
      description: colMap.description !== undefined ? String(row[colMap.description] || "").trim() : "",
      reference: colMap.reference !== undefined ? String(row[colMap.reference] || "").trim() : "",
      debit: colMap.debit !== undefined ? parseNum(row[colMap.debit]) : 0,
      credit: colMap.credit !== undefined ? parseNum(row[colMap.credit]) : 0,
      runningBalance: colMap.runningBalance !== undefined ? parseNum(row[colMap.runningBalance]) : 0,
      tax: colMap.tax !== undefined ? parseNum(row[colMap.tax]) : 0,
      taxRate: colMap.taxRate !== undefined ? parsePct(row[colMap.taxRate]) : 0,
      taxRateName: colMap.taxRateName !== undefined ? String(row[colMap.taxRateName] || "No Tax").trim() : "No Tax",
      account: colMap.account !== undefined ? String(row[colMap.account] || "Unknown").trim() : "Unknown",
    });
  }

  return buildResult(transactions, "generic-xlsx", parseErrors, skippedRows);
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

  // Reuse generic Excel parser logic (same column detection)
  return parseGenericExcel(rows);
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
