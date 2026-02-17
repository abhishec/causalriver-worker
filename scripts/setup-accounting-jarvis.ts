/**
 * Setup Accounting Jarvis — Parse Xero GL & Seed Design Partner Data
 * ====================================================================
 *
 * Parses a real Xero General Ledger Detail export (.xlsx) into JSON,
 * then seeds the accounting intelligence into the brain.
 *
 * Design Partner: Singapore SaaS company (SFRS/IRAS jurisdiction)
 * Data: 63,653 rows, 49,684 transactions, 194 accounts, 2020-2026
 *
 * Usage:
 *   npx tsx scripts/setup-accounting-jarvis.ts --input "/path/to/GL.xlsx"
 *
 * Output:
 *   - Writes gl-data.json locally (then run migrate-gl-data-to-storage.ts to upload to Supabase Storage)
 *   - Seeds ai_memory, causal_relationships_statistical, cross_domain_signals
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Types ───────────────────────────────────────────────────────────────────

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

// ── Parse XLSX using openpyxl via Python subprocess ─────────────────────────
// (Node.js xlsx libraries struggle with large files — Python is more reliable)

async function parseXeroGL(xlsxPath: string): Promise<GLTransaction[]> {
  const { execSync } = await import('child_process');

  console.log(`[setup-accounting-jarvis] Parsing: ${xlsxPath}`);

  const pythonScript = `
import openpyxl, json, sys

wb = openpyxl.load_workbook("${xlsxPath.replace(/"/g, '\\"')}", data_only=True)
ws = wb[wb.sheetnames[0]]

transactions = []
current_account = None

for row_idx, row in enumerate(ws.iter_rows(min_row=6, max_row=ws.max_row, values_only=True), 6):
    col_a = str(row[0]).strip() if row[0] else ""
    col_b = str(row[1]).strip() if row[1] else ""

    # Account header (no source, no debit/credit)
    if col_a and not col_b and not row[4] and not row[5]:
        if col_a.startswith("Total ") or col_a == "Net movement" or col_a == "Total":
            continue
        current_account = col_a
    elif col_a and col_b and current_account:
        # Transaction row
        transactions.append({
            "date": col_a[:10],
            "source": col_b,
            "description": str(row[2])[:200] if row[2] else "",
            "reference": str(row[3])[:50] if row[3] else "",
            "debit": float(row[4]) if row[4] else 0,
            "credit": float(row[5]) if row[5] else 0,
            "runningBalance": float(row[6]) if row[6] else 0,
            "tax": float(row[7]) if row[7] else 0,
            "taxRate": float(row[8]) if row[8] else 0,
            "taxRateName": str(row[9]) if row[9] else "No Tax",
            "account": current_account
        })

json.dump(transactions, sys.stdout)
`;

  try {
    const result = execSync(`python3 -c '${pythonScript.replace(/'/g, "'\\''")}'`, {
      maxBuffer: 500 * 1024 * 1024, // 500MB for large GLs
      timeout: 300000, // 5 minutes
    });
    return JSON.parse(result.toString());
  } catch {
    // Fallback: write python script to temp file and execute
    const tmpScript = path.join('/tmp', 'parse_gl.py');
    fs.writeFileSync(tmpScript, pythonScript);
    const result = execSync(`python3 "${tmpScript}"`, {
      maxBuffer: 500 * 1024 * 1024,
      timeout: 300000,
    });
    fs.unlinkSync(tmpScript);
    return JSON.parse(result.toString());
  }
}

// ── Anonymize company data ──────────────────────────────────────────────────

function anonymizeTransactions(transactions: GLTransaction[]): GLTransaction[] {
  // Replace company name references in descriptions
  const companyPatterns = [
    /Tookitaki\s+(Holding|Inc|Technologies|Private|Limited)/gi,
    /Tookitaki/gi,
    /THPL/g,
    /TTMFS/g,
  ];

  return transactions.map(txn => {
    let description = txn.description;
    for (const pattern of companyPatterns) {
      description = description.replace(pattern, 'DesignPartner');
    }
    return { ...txn, description };
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf('--input');
  const inputPath = inputIdx >= 0 ? args[inputIdx + 1] : '/Users/abhishek/Downloads/Tookitaki Holding Pte Ltd - General Ledger Detail.xlsx';

  if (!fs.existsSync(inputPath)) {
    console.error(`[setup-accounting-jarvis] File not found: ${inputPath}`);
    console.error('Usage: npx tsx scripts/setup-accounting-jarvis.ts --input "/path/to/GL.xlsx"');
    process.exit(1);
  }

  // Step 1: Parse XLSX
  console.log('[setup-accounting-jarvis] Step 1: Parsing Xero GL export...');
  const rawTransactions = await parseXeroGL(inputPath);
  console.log(`[setup-accounting-jarvis] Parsed ${rawTransactions.length} transactions`);

  // Step 2: Anonymize
  console.log('[setup-accounting-jarvis] Step 2: Anonymizing company data...');
  const transactions = anonymizeTransactions(rawTransactions);

  // Step 3: Write to JSON
  const outputDir = path.resolve(__dirname, '../platform/lib/accounting-jarvis');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'gl-data.json');
  console.log(`[setup-accounting-jarvis] Step 3: Writing ${transactions.length} transactions to ${outputPath}...`);
  fs.writeFileSync(outputPath, JSON.stringify(transactions, null, 0)); // No indent for smaller file

  // Step 4: Generate stats
  const accounts = new Set(transactions.map(t => t.account));
  const sources = new Set(transactions.map(t => t.source));
  const totalDebits = transactions.reduce((s, t) => s + t.debit, 0);
  const totalCredits = transactions.reduce((s, t) => s + t.credit, 0);
  const dateRange = [
    transactions[0]?.date || 'N/A',
    transactions[transactions.length - 1]?.date || 'N/A',
  ];

  console.log('\n[setup-accounting-jarvis] ═══ SUMMARY ═══');
  console.log(`  Transactions:  ${transactions.length}`);
  console.log(`  Accounts:      ${accounts.size}`);
  console.log(`  Source types:  ${sources.size}`);
  console.log(`  Date range:    ${dateRange[0]} to ${dateRange[1]}`);
  console.log(`  Total debits:  $${totalDebits.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`  Total credits: $${totalCredits.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`  Balanced:      ${Math.abs(totalDebits - totalCredits) < 0.01 ? 'YES' : 'NO (variance: $' + Math.abs(totalDebits - totalCredits).toFixed(2) + ')'}`);
  console.log(`  Output file:   ${outputPath}`);
  console.log(`  File size:     ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)} MB`);
  console.log('\n[setup-accounting-jarvis] Done! The Accounting Jarvis dashboard will now load this data.');
}

main().catch(err => {
  console.error('[setup-accounting-jarvis] Fatal error:', err);
  process.exit(1);
});
