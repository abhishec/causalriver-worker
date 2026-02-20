/**
 * Export Engine — Artifact-to-file conversion
 * ============================================
 *
 * Converts rendered artifacts into downloadable files:
 *   • PNG  — screenshot the DOM element at 2× resolution
 *   • PDF  — screenshot → jsPDF page(s)
 *   • CSV  — extract tabular data from chart/table artifacts
 *   • PPTX — future: convert presentation artifacts via pptxgenjs
 *
 * All heavy dependencies are lazy-loaded via dynamic import()
 * so they never bloat the initial bundle.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExportFormat = "png" | "pdf" | "csv" | "pptx";

export interface ExportOptions {
  /** The DOM element to capture (for PNG/PDF) */
  element?: HTMLElement;
  /** Artifact title — used as filename stem */
  title: string;
  /** Raw artifact content (for CSV/text exports) */
  content?: string;
  /** Structured data for CSV export */
  data?: Record<string, unknown>;
  /** Scale factor for PNG capture (default: 2) */
  scale?: number;
}

export interface ExportResult {
  success: boolean;
  filename: string;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeFilename(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9\s\-_]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 60) || "artifact";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── PNG Export ─────────────────────────────────────────────────────────────────

async function exportPNG(options: ExportOptions): Promise<ExportResult> {
  const { element, title, scale = 2 } = options;
  if (!element) {
    return { success: false, filename: "", error: "No DOM element provided for PNG export" };
  }

  try {
    // html2canvas is an optional peer dependency — lazy-loaded
    const html2canvas = (await import("html2canvas")).default as (
      element: HTMLElement,
      options?: Record<string, unknown>
    ) => Promise<HTMLCanvasElement>;
    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      backgroundColor: null,
      logging: false,
    });

    const filename = `${sanitizeFilename(title)}.png`;

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob: Blob | null) => {
          if (!blob) {
            resolve({ success: false, filename, error: "Canvas to blob failed" });
            return;
          }
          triggerDownload(blob, filename);
          resolve({ success: true, filename });
        },
        "image/png",
        1.0
      );
    });
  } catch (err) {
    return {
      success: false,
      filename: "",
      error: `PNG export failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

// ── PDF Export ─────────────────────────────────────────────────────────────────

async function exportPDF(options: ExportOptions): Promise<ExportResult> {
  const { element, title, scale = 2 } = options;
  if (!element) {
    return { success: false, filename: "", error: "No DOM element provided for PDF export" };
  }

  try {
    // html2canvas + jspdf are optional peer dependencies — lazy-loaded
    const html2canvasModule = await import("html2canvas");
    const jsPDFModule = await import("jspdf");
    const html2canvas = html2canvasModule.default as (
      element: HTMLElement,
      options?: Record<string, unknown>
    ) => Promise<HTMLCanvasElement>;
    const jsPDF = jsPDFModule.jsPDF as any;

    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const imgWidth = canvas.width / scale;
    const imgHeight = canvas.height / scale;

    // A4 dimensions in mm
    const pdfWidth = 210;
    const pdfHeight = 297;
    const margin = 10;
    const contentWidth = pdfWidth - 2 * margin;
    const contentHeight = (contentWidth / imgWidth) * imgHeight;

    const pdf = new jsPDF({
      orientation: contentHeight > pdfHeight ? "portrait" : "portrait",
      unit: "mm",
      format: "a4",
    });

    // If content fits on one page
    if (contentHeight <= pdfHeight - 2 * margin) {
      pdf.addImage(imgData, "PNG", margin, margin, contentWidth, contentHeight);
    } else {
      // Multi-page: split image across pages
      let yOffset = 0;
      const pageContentHeight = pdfHeight - 2 * margin;
      const sourcePageHeight = (pageContentHeight / contentHeight) * imgHeight;
      let page = 0;

      while (yOffset < imgHeight) {
        if (page > 0) pdf.addPage();

        // Create a cropped canvas for this page
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = Math.min(sourcePageHeight * scale, canvas.height - yOffset * scale);
        const ctx = pageCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(
            canvas,
            0, yOffset * scale,
            canvas.width, pageCanvas.height,
            0, 0,
            pageCanvas.width, pageCanvas.height
          );
          const pageImgData = pageCanvas.toDataURL("image/png");
          const drawHeight = (pageCanvas.height / scale / imgWidth) * contentWidth;
          pdf.addImage(pageImgData, "PNG", margin, margin, contentWidth, drawHeight);
        }

        yOffset += sourcePageHeight;
        page++;
      }
    }

    const filename = `${sanitizeFilename(title)}.pdf`;
    pdf.save(filename);
    return { success: true, filename };
  } catch (err) {
    return {
      success: false,
      filename: "",
      error: `PDF export failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

// ── CSV Export ─────────────────────────────────────────────────────────────────

async function exportCSV(options: ExportOptions): Promise<ExportResult> {
  const { title, content, data } = options;
  const filename = `${sanitizeFilename(title)}.csv`;

  try {
    let csvContent = "";

    if (data) {
      // Try to extract tabular data from structured artifact data
      const tableData = extractTableData(data);
      if (tableData) {
        csvContent = tableData;
      } else {
        csvContent = JSON.stringify(data, null, 2);
      }
    } else if (content) {
      // Check if content is already CSV-like or JSON
      try {
        const parsed = JSON.parse(content);
        const tableData = extractTableData(parsed);
        csvContent = tableData || content;
      } catch {
        csvContent = content;
      }
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    triggerDownload(blob, filename);
    return { success: true, filename };
  } catch (err) {
    return {
      success: false,
      filename,
      error: `CSV export failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

/**
 * Attempt to extract a CSV table from structured data.
 * Handles common patterns: arrays of objects, nested table data.
 */
function extractTableData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;

  // Direct array of objects
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") {
    return arrayToCSV(data as Record<string, unknown>[]);
  }

  // Look for common keys that hold tabular data
  const record = data as Record<string, unknown>;
  const tableKeys = [
    "accounts", "transactions", "items", "rows", "data",
    "topTransactions", "revenueBreakdown", "expenseBreakdown",
    "assets", "liabilities", "equity",
    "predictions", "findings", "variances", "causalAttributions",
  ];

  for (const key of tableKeys) {
    const val = record[key];
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
      return arrayToCSV(val as Record<string, unknown>[]);
    }
  }

  return null;
}

function arrayToCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const val = row[h];
      const str = val === null || val === undefined ? "" : String(val);
      // Escape quotes and wrap in quotes if needed
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

// ── Main Export Function ──────────────────────────────────────────────────────

/**
 * Export an artifact to the specified format.
 * Heavy libraries (html2canvas, jspdf, pptxgenjs) are lazy-loaded.
 */
export async function exportArtifact(
  format: ExportFormat,
  options: ExportOptions
): Promise<ExportResult> {
  switch (format) {
    case "png":
      return exportPNG(options);
    case "pdf":
      return exportPDF(options);
    case "csv":
      return exportCSV(options);
    case "pptx":
      return {
        success: false,
        filename: "",
        error: "PPTX export is coming soon. Install pptxgenjs to enable.",
      };
    default:
      return { success: false, filename: "", error: `Unsupported format: ${format}` };
  }
}

/**
 * Get the available export formats for a given artifact type.
 */
export function getAvailableFormats(
  artifactType: string
): { format: ExportFormat; label: string }[] {
  const formats: { format: ExportFormat; label: string }[] = [];

  // PNG — available for all visual artifacts
  if (["chart", "financial-statement", "engineering-analysis", "infographic", "presentation", "mermaid-diagram", "cash-flow-forecast", "revenue-leakage", "causal-pl"].includes(artifactType)) {
    formats.push({ format: "png", label: "PNG Image" });
  }

  // PDF — available for all visual artifacts
  if (["chart", "financial-statement", "engineering-analysis", "infographic", "presentation", "mermaid-diagram", "document", "analysis", "cash-flow-forecast", "revenue-leakage", "causal-pl"].includes(artifactType)) {
    formats.push({ format: "pdf", label: "PDF Document" });
  }

  // CSV — available for data artifacts
  if (["financial-statement", "table", "engineering-analysis", "cash-flow-forecast", "revenue-leakage", "causal-pl"].includes(artifactType)) {
    formats.push({ format: "csv", label: "CSV Spreadsheet" });
  }

  // PPTX — available for presentations
  if (artifactType === "presentation") {
    formats.push({ format: "pptx", label: "PowerPoint" });
  }

  return formats;
}
