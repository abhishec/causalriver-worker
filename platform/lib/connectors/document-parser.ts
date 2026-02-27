/**
 * Document Parser
 * ===============
 * Extracts plain text from file buffers based on MIME type or filename extension.
 *
 * Supported formats:
 *   - PDF  (application/pdf)           — via pdf-parse (text-based PDFs)
 *   - DOCX (application/vnd.openxmlformats-officedocument.wordprocessingml.document)
 *                                       — via mammoth (Word documents)
 *   - Plain text / Markdown            — direct UTF-8 decode
 *
 * pdf-parse note: works for text-layer PDFs (most enterprise docs).
 * Scanned-image PDFs will return empty/near-empty text — that is expected
 * without an OCR step. The caller should handle empty text gracefully.
 */

import { logger } from "@/lib/logger";

export type ParsedDocument = {
  text: string;
  pageCount?: number;
  wordCount: number;
};

/**
 * Parse a file buffer into plain text based on MIME type and/or filename.
 * Falls back to raw UTF-8 decode for plain text and markdown.
 */
export async function parseDocumentBuffer(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ParsedDocument> {
  const lowerMime = mimeType.toLowerCase();
  const lowerName = filename.toLowerCase();

  // PDF
  if (lowerMime === "application/pdf" || lowerName.endsWith(".pdf")) {
    return parsePdf(buffer, filename);
  }

  // DOCX (Word)
  if (
    lowerMime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    return parseDocx(buffer, filename);
  }

  // Plain text / Markdown / everything else — treat as UTF-8
  const text = buffer.toString("utf-8");
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return { text, wordCount };
}

async function parsePdf(buffer: Buffer, filename: string): Promise<ParsedDocument> {
  // Dynamic import avoids bundling pdf-parse in client chunks.
  // pdf-parse v2 uses the PDFParse class API (not the v1 functional default export).
  // pdf-parse is listed in serverExternalPackages so Next.js skips bundling it.
  const { PDFParse } = await import("pdf-parse");

  try {
    // Pass the buffer's underlying ArrayBuffer as `data` (v2 LoadParameters API)
    const parser = new PDFParse({ data: buffer.buffer as ArrayBuffer });

    // getText() returns TextResult { text: string, pages: PageTextResult[], total: number }
    const textResult = await parser.getText();

    // getInfo() returns InfoResult { total: number (page count), ... }
    const infoResult = await parser.getInfo();

    const wordCount = textResult.text.split(/\s+/).filter(Boolean).length;

    logger.warn("[document-parser] PDF parsed", {
      filename,
      pages: infoResult.total,
      wordCount,
      textLength: textResult.text.length,
    });

    await parser.destroy();

    return {
      text: textResult.text,
      pageCount: infoResult.total,
      wordCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("[document-parser] PDF parse failed", { filename, error: message });
    throw new Error(`Failed to parse PDF "${filename}": ${message}`);
  }
}

async function parseDocx(buffer: Buffer, filename: string): Promise<ParsedDocument> {
  const mammoth = await import("mammoth");

  try {
    const result = await mammoth.extractRawText({ buffer });

    if (result.messages.length > 0) {
      // Log first 3 warnings only — avoid flooding logs on complex docs
      logger.warn("[document-parser] DOCX parse warnings", {
        filename,
        warnings: result.messages.slice(0, 3).map((m) => m.message),
      });
    }

    const wordCount = result.value.split(/\s+/).filter(Boolean).length;

    logger.warn("[document-parser] DOCX parsed", {
      filename,
      wordCount,
      textLength: result.value.length,
      warnings: result.messages.length,
    });

    return {
      text: result.value,
      wordCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("[document-parser] DOCX parse failed", { filename, error: message });
    throw new Error(`Failed to parse DOCX "${filename}": ${message}`);
  }
}
