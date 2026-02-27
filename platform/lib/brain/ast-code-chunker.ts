/**
 * AST-Aware Code Chunker
 * ======================
 * Uses ts-morph (TypeScript Compiler API wrapper) to split TypeScript/JavaScript
 * code at function/class/interface boundaries instead of naive character splits.
 *
 * Research-backed: 65% recall improvement in code RAG vs naive line-based chunking.
 * Ref: "How to Chunk Code for RAG" — chunks at semantic boundaries preserve context.
 *
 * Chunk strategy:
 * 1. Parse AST via ts-morph (in-memory, no disk writes)
 * 2. Extract top-level declarations: functions, classes, interfaces, type aliases, enums
 * 3. Each declaration = one chunk (with leading JSDoc comments preserved)
 * 4. If chunk > maxChunkChars, split into sub-chunks at method boundaries
 * 5. Fallback: regex-based boundary detection for non-TypeScript files
 *
 * Metadata per chunk: file path, symbol name, symbol type, start/end lines,
 * isExported, complexity, dependencies used in that chunk.
 */

import { Project, SyntaxKind, SourceFile } from "ts-morph";
import { logger } from "@/lib/logger";

// ── Public types ──────────────────────────────────────────────────────────────

export interface CodeChunk {
  content: string;
  symbolName: string;
  symbolType: "function" | "class" | "interface" | "type" | "enum" | "export" | "other";
  filePath: string;
  startLine: number;
  endLine: number;
  language: "typescript" | "javascript" | "tsx" | "jsx" | "python" | "other";
  metadata: {
    hasTests: boolean;
    isExported: boolean;
    complexity: "simple" | "moderate" | "complex";
    dependencies: string[];
  };
}

export interface ChunkingOptions {
  /** Max characters per chunk before sub-chunking. Default: 2000 */
  maxChunkChars?: number;
  /** Prepend relevant imports to each chunk. Default: true */
  includeImports?: boolean;
  /** Override language detection. Auto-detected from extension if omitted. */
  language?: string;
}

// ── Language detection ────────────────────────────────────────────────────────

export function detectLanguage(filePath: string): CodeChunk["language"] {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
      return "typescript";
    case "tsx":
      return "tsx";
    case "js":
      return "javascript";
    case "jsx":
      return "jsx";
    case "py":
      return "python";
    default:
      return "other";
  }
}

// ── Importance scoring ────────────────────────────────────────────────────────

/**
 * Score 0–1 for how important a chunk is to brain memory.
 * Drives write priority in universal-brain-writer.
 *
 * Rules:
 *   exported + complex   = 0.9
 *   exported + moderate  = 0.7
 *   exported + simple    = 0.5
 *   not exported + complex = 0.6
 *   not exported + moderate = 0.4
 *   not exported + simple   = 0.3
 */
export function estimateChunkImportance(chunk: CodeChunk): number {
  const { isExported, complexity } = chunk.metadata;
  if (isExported) {
    if (complexity === "complex") return 0.9;
    if (complexity === "moderate") return 0.7;
    return 0.5;
  }
  if (complexity === "complex") return 0.6;
  if (complexity === "moderate") return 0.4;
  return 0.3;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function classifyComplexity(lineCount: number): "simple" | "moderate" | "complex" {
  if (lineCount <= 20) return "simple";
  if (lineCount <= 80) return "moderate";
  return "complex";
}

function isTestSymbol(name: string, content: string): boolean {
  const lower = name.toLowerCase();
  if (lower.includes("test") || lower.includes("spec")) return true;
  if (/\bdescribe\s*\(/.test(content) || /\bit\s*\(/.test(content)) return true;
  return false;
}

/**
 * Extract import identifiers used in a chunk to identify dependencies.
 * Scans the file's import declarations and checks which identifiers appear in the chunk text.
 */
function extractUsedDependencies(
  chunkText: string,
  allImports: Array<{ moduleSpecifier: string; namedImports: string[] }>
): string[] {
  const deps: string[] = [];
  for (const imp of allImports) {
    const used = imp.namedImports.filter((name) => chunkText.includes(name));
    if (used.length > 0) deps.push(imp.moduleSpecifier);
  }
  return [...new Set(deps)];
}

/**
 * Split oversized text into sub-chunks at method/function boundaries.
 * Used when a class body exceeds maxChunkChars.
 */
function splitAtMethodBoundaries(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const lines = text.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  // Method boundary heuristic: lines starting with visibility modifiers or async/function at 2-space indent
  const methodStart = /^\s{2,4}(public|private|protected|async|static|override|\*\s)?\s*(async\s+)?\w+\s*[(<]/;

  for (const line of lines) {
    const wouldExceed = currentLen + line.length + 1 > maxChars;
    const isBoundary = methodStart.test(line) && current.length > 5;

    if (wouldExceed && isBoundary && current.length > 0) {
      chunks.push(current.join("\n").trim());
      current = [line];
      currentLen = line.length + 1;
    } else {
      current.push(line);
      currentLen += line.length + 1;
    }
  }
  if (current.length > 0) chunks.push(current.join("\n").trim());
  return chunks.filter(Boolean);
}

// ── Import extraction from SourceFile ────────────────────────────────────────

function extractImports(
  sourceFile: SourceFile
): Array<{ moduleSpecifier: string; namedImports: string[] }> {
  return sourceFile
    .getImportDeclarations()
    .map((imp) => ({
      moduleSpecifier: imp.getModuleSpecifierValue(),
      namedImports: imp
        .getNamedImports()
        .map((n) => n.getName())
        .concat(
          imp.getDefaultImport()?.getText()
            ? [imp.getDefaultImport()!.getText()]
            : []
        ),
    }));
}

// ── Core: chunk TypeScript/TSX/JS via ts-morph AST ───────────────────────────

function chunkWithTsMorph(
  code: string,
  filePath: string,
  language: CodeChunk["language"],
  options: Required<ChunkingOptions>
): CodeChunk[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      strict: false,
    },
  });

  // Use .tsx extension for TSX/JSX to allow JSX parsing
  const ext =
    language === "tsx" || language === "jsx" ? ".tsx" : ".ts";
  const tempPath = `__temp__${ext}`;

  const sourceFile = project.createSourceFile(tempPath, code, {
    overwrite: true,
  });

  const allImports = extractImports(sourceFile);
  const chunks: CodeChunk[] = [];

  // ── Helper: build a CodeChunk from text + metadata ──────────────────
  const buildChunk = (
    content: string,
    symbolName: string,
    symbolType: CodeChunk["symbolType"],
    startLine: number,
    endLine: number,
    isExported: boolean
  ): CodeChunk => {
    const deps = extractUsedDependencies(content, allImports);
    const lineCount = endLine - startLine + 1;
    return {
      content,
      symbolName,
      symbolType,
      filePath,
      startLine,
      endLine,
      language,
      metadata: {
        hasTests: isTestSymbol(symbolName, content),
        isExported,
        complexity: classifyComplexity(lineCount),
        dependencies: deps,
      },
    };
  };

  // ── Helper: add chunk (splitting if oversized) ───────────────────────
  const addChunks = (
    text: string,
    symbolName: string,
    symbolType: CodeChunk["symbolType"],
    startLine: number,
    endLine: number,
    isExported: boolean
  ) => {
    let importPrefix = "";
    if (options.includeImports && allImports.length > 0) {
      // Include the first import declaration text as context header
      const importLines = sourceFile
        .getImportDeclarations()
        .map((i) => i.getText())
        .join("\n");
      if (importLines) {
        importPrefix = importLines + "\n\n";
      }
    }

    const full = importPrefix + text;

    if (full.length <= options.maxChunkChars) {
      chunks.push(buildChunk(full, symbolName, symbolType, startLine, endLine, isExported));
      return;
    }

    // Sub-chunk at method boundaries
    const subTexts = splitAtMethodBoundaries(text, options.maxChunkChars);
    subTexts.forEach((sub, idx) => {
      chunks.push(
        buildChunk(
          importPrefix + sub,
          `${symbolName}[${idx + 1}/${subTexts.length}]`,
          symbolType,
          startLine,
          endLine,
          isExported
        )
      );
    });
  };

  // ── Extract functions ─────────────────────────────────────────────────
  for (const fn of sourceFile.getFunctions()) {
    const isExported = fn.isExported() || fn.isDefaultExport();
    const name = fn.getName() ?? "(anonymous)";
    const start = fn.getStartLineNumber();
    const end = fn.getEndLineNumber();
    addChunks(fn.getFullText().trim(), name, "function", start, end, isExported);
  }

  // ── Extract arrow functions assigned to const (top-level) ────────────
  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const init = varDecl.getInitializer();
    if (!init) continue;
    const kind = init.getKind();
    if (
      kind !== SyntaxKind.ArrowFunction &&
      kind !== SyntaxKind.FunctionExpression
    )
      continue;
    const stmt = varDecl.getVariableStatement();
    if (!stmt) continue;
    const isExported = stmt.isExported();
    const name = varDecl.getName();
    const start = stmt.getStartLineNumber();
    const end = stmt.getEndLineNumber();
    addChunks(stmt.getFullText().trim(), name, "function", start, end, isExported);
  }

  // ── Extract classes ───────────────────────────────────────────────────
  for (const cls of sourceFile.getClasses()) {
    const isExported = cls.isExported() || cls.isDefaultExport();
    const name = cls.getName() ?? "(anonymous)";
    const start = cls.getStartLineNumber();
    const end = cls.getEndLineNumber();
    addChunks(cls.getFullText().trim(), name, "class", start, end, isExported);
  }

  // ── Extract interfaces ────────────────────────────────────────────────
  for (const iface of sourceFile.getInterfaces()) {
    const isExported = iface.isExported();
    const name = iface.getName();
    const start = iface.getStartLineNumber();
    const end = iface.getEndLineNumber();
    addChunks(iface.getFullText().trim(), name, "interface", start, end, isExported);
  }

  // ── Extract type aliases ──────────────────────────────────────────────
  for (const typeAlias of sourceFile.getTypeAliases()) {
    const isExported = typeAlias.isExported();
    const name = typeAlias.getName();
    const start = typeAlias.getStartLineNumber();
    const end = typeAlias.getEndLineNumber();
    addChunks(typeAlias.getFullText().trim(), name, "type", start, end, isExported);
  }

  // ── Extract enums ─────────────────────────────────────────────────────
  for (const en of sourceFile.getEnums()) {
    const isExported = en.isExported();
    const name = en.getName();
    const start = en.getStartLineNumber();
    const end = en.getEndLineNumber();
    addChunks(en.getFullText().trim(), name, "enum", start, end, isExported);
  }

  // ── Extract named export declarations not already captured ────────────
  for (const exportDecl of sourceFile.getExportDeclarations()) {
    const text = exportDecl.getFullText().trim();
    if (!text) continue;
    const start = exportDecl.getStartLineNumber();
    const end = exportDecl.getEndLineNumber();
    chunks.push(
      buildChunk(text, "(export)", "export", start, end, true)
    );
  }

  // ── De-duplicate by startLine (ts-morph may overlap arrow + var) ──────
  const seen = new Set<number>();
  return chunks.filter((c) => {
    if (seen.has(c.startLine)) return false;
    seen.add(c.startLine);
    return true;
  });
}

// ── Fallback: regex-based chunking for Python / unknown files ─────────────────

function chunkWithRegex(
  code: string,
  filePath: string,
  language: CodeChunk["language"],
  options: Required<ChunkingOptions>
): CodeChunk[] {
  const lines = code.split("\n");
  const chunks: CodeChunk[] = [];

  // Patterns for top-level declarations
  const boundaries: Array<{
    pattern: RegExp;
    type: CodeChunk["symbolType"];
    nameGroup: number;
  }> = [
    {
      pattern: /^(export\s+)?(async\s+)?function\s+(\w+)/,
      type: "function",
      nameGroup: 3,
    },
    { pattern: /^(export\s+)?class\s+(\w+)/, type: "class", nameGroup: 2 },
    {
      pattern: /^(export\s+)?interface\s+(\w+)/,
      type: "interface",
      nameGroup: 2,
    },
    { pattern: /^(export\s+)?type\s+(\w+)\s*=/, type: "type", nameGroup: 2 },
    { pattern: /^(export\s+)?enum\s+(\w+)/, type: "enum", nameGroup: 2 },
    { pattern: /^def\s+(\w+)/, type: "function", nameGroup: 1 },
    { pattern: /^class\s+(\w+)/, type: "class", nameGroup: 1 },
  ];

  let currentLines: string[] = [];
  let currentStartLine = 1;
  let currentSymbol = "(module)";
  let currentType: CodeChunk["symbolType"] = "other";
  let currentExported = false;

  const flush = (endLine: number) => {
    if (currentLines.length === 0) return;
    const text = currentLines.join("\n").trim();
    if (!text) return;
    const lineCount = endLine - currentStartLine + 1;
    const subTexts = splitAtMethodBoundaries(text, options.maxChunkChars);
    subTexts.forEach((sub, idx) => {
      chunks.push({
        content: sub,
        symbolName:
          subTexts.length > 1
            ? `${currentSymbol}[${idx + 1}/${subTexts.length}]`
            : currentSymbol,
        symbolType: currentType,
        filePath,
        startLine: currentStartLine,
        endLine,
        language,
        metadata: {
          hasTests: isTestSymbol(currentSymbol, sub),
          isExported: currentExported,
          complexity: classifyComplexity(lineCount),
          dependencies: [],
        },
      });
    });
  };

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;

    for (const { pattern, type, nameGroup } of boundaries) {
      const match = line.match(pattern);
      if (match) {
        flush(lineNo - 1);
        currentLines = [line];
        currentStartLine = lineNo;
        currentSymbol = match[nameGroup] ?? "(unknown)";
        currentType = type;
        currentExported = line.startsWith("export");
        return;
      }
    }
    currentLines.push(line);
  });
  flush(lines.length);

  return chunks;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Chunk a code file into AST-aware semantic chunks.
 *
 * @param filePath - Relative or absolute file path (used for language detection and metadata)
 * @param content  - Raw source code text
 * @param options  - Optional chunking configuration
 * @returns        Array of CodeChunk, one per top-level declaration
 */
export async function chunkCodeFile(
  filePath: string,
  content: string,
  options?: ChunkingOptions
): Promise<CodeChunk[]> {
  const lang = (options?.language as CodeChunk["language"]) ?? detectLanguage(filePath);
  return chunkCodeText(content, lang, { ...options, language: lang });
}

/**
 * Chunk raw code text into AST-aware semantic chunks.
 *
 * @param code     - Raw source code
 * @param language - Programming language (for parser selection)
 * @param options  - Optional chunking configuration
 * @returns        Array of CodeChunk
 */
export async function chunkCodeText(
  code: string,
  language: string,
  options?: ChunkingOptions
): Promise<CodeChunk[]> {
  const lang = language as CodeChunk["language"];
  const resolved: Required<ChunkingOptions> = {
    maxChunkChars: options?.maxChunkChars ?? 2000,
    includeImports: options?.includeImports ?? true,
    language: lang,
  };

  if (!code.trim()) return [];

  try {
    if (
      lang === "typescript" ||
      lang === "tsx" ||
      lang === "javascript" ||
      lang === "jsx"
    ) {
      const chunks = chunkWithTsMorph(code, options?.language ?? lang, lang, resolved);
      if (chunks.length > 0) return chunks;
    }

    // Fallback for Python or if ts-morph produced zero chunks
    return chunkWithRegex(code, options?.language ?? lang, lang, resolved);
  } catch (err) {
    logger.warn("[ast-code-chunker] AST parsing failed, falling back to regex", {
      error: err instanceof Error ? err.message : String(err),
      language: lang,
    });
    return chunkWithRegex(code, options?.language ?? lang, lang, resolved);
  }
}
