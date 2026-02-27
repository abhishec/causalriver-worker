/**
 * Repo Map — PageRank on Symbol Graph (Aider pattern)
 *
 * Builds a compressed map of the most important code symbols for any repo.
 * Scales to unlimited repository size — always fits in LLM context window.
 *
 * Algorithm:
 * 1. Parse all TypeScript/JS files with ts-morph
 * 2. Extract symbols (functions, classes, interfaces, types, exports)
 * 3. Build dependency graph: symbol A → symbol B if A imports/calls/extends B
 * 4. Run PageRank on the graph to find most-referenced symbols
 * 5. Format top-N symbols as a compact text map
 *
 * Output format (similar to Aider's repo map):
 * ```
 * platform/lib/brain/brain-context.ts:
 *   getBrainContext(supabase, orgId, options): BrainContextResult [exported]
 *
 * platform/lib/se-aas/domain-executor.ts:
 *   executeDomain(params): Promise<DomainResult> [exported]
 *   ExecuteDomainParams (interface) [exported]
 * ```
 */

import path from "path";
import { Project, SyntaxKind, type SourceFile } from "ts-morph";
import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RepoSymbol {
  name: string;
  type: "function" | "class" | "interface" | "type" | "variable" | "export";
  filePath: string;     // relative to project root
  startLine: number;
  isExported: boolean;
  signature?: string;   // abbreviated type signature
}

export interface SymbolEdge {
  from: string;         // 'filePath::symbolName'
  to: string;           // 'filePath::symbolName' or just 'symbolName' for cross-file
  edgeType: "imports" | "calls" | "extends" | "implements" | "uses";
}

export interface RepoMap {
  totalFiles: number;
  totalSymbols: number;
  mapText: string;      // formatted map for LLM context
  topSymbols: Array<RepoSymbol & { pageRankScore: number }>;
  generatedAt: string;
}

interface BuildOptions {
  maxSymbols?: number;        // top N symbols (default: 150)
  includePatterns?: string[]; // glob patterns
  excludePatterns?: string[]; // exclusion patterns
  maxMapChars?: number;       // max output chars (default: 4000)
}

// ── PageRank (power iteration) ────────────────────────────────────────────────

function runPageRank(
  symbolKeys: string[],
  edges: SymbolEdge[],
  iterations: number = 20,
  dampingFactor: number = 0.85,
): Map<string, number> {
  const N = symbolKeys.length;
  if (N === 0) return new Map();

  const scores = new Map<string, number>();
  for (const key of symbolKeys) {
    scores.set(key, 1.0 / N);
  }

  // Build: who links TO this symbol
  const inLinks = new Map<string, string[]>();
  const outDegree = new Map<string, number>();
  for (const edge of edges) {
    if (!inLinks.has(edge.to)) inLinks.set(edge.to, []);
    inLinks.get(edge.to)!.push(edge.from);
    outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1);
  }

  // Power iteration
  for (let iter = 0; iter < iterations; iter++) {
    const newScores = new Map<string, number>();
    for (const key of symbolKeys) {
      const incoming = inLinks.get(key) ?? [];
      const rank =
        (1 - dampingFactor) / N +
        dampingFactor *
          incoming.reduce((sum, from) => {
            return sum + (scores.get(from) ?? 0) / (outDegree.get(from) ?? 1);
          }, 0);
      newScores.set(key, rank);
    }
    scores.clear();
    for (const [k, v] of newScores) scores.set(k, v);
  }

  return scores;
}

// ── Symbol extraction ─────────────────────────────────────────────────────────

function symbolKey(filePath: string, name: string): string {
  return `${filePath}::${name}`;
}

function extractSymbolsFromFile(
  sourceFile: SourceFile,
  relPath: string,
  symbols: Map<string, RepoSymbol>,
  edges: SymbolEdge[],
  globalNameIndex: Map<string, string[]>, // name -> [filePath::name, ...]
): void {
  // Functions (declarations and arrow functions assigned to const)
  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;
    const isExported = fn.isExported();
    const params = fn.getParameters()
      .slice(0, 3)
      .map(p => {
        const typeText = p.getTypeNode()?.getText() ?? "";
        return typeText ? `${p.getName()}: ${typeText.slice(0, 30)}` : p.getName();
      })
      .join(", ");
    const returnType = fn.getReturnTypeNode()?.getText()?.slice(0, 40) ?? "";
    const signature = returnType ? `(${params}): ${returnType}` : `(${params})`;

    const key = symbolKey(relPath, name);
    symbols.set(key, { name, type: "function", filePath: relPath, startLine: fn.getStartLineNumber(), isExported, signature });
    if (!globalNameIndex.has(name)) globalNameIndex.set(name, []);
    globalNameIndex.get(name)!.push(key);
  }

  // Classes
  for (const cls of sourceFile.getClasses()) {
    const name = cls.getName();
    if (!name) continue;
    const isExported = cls.isExported();
    const key = symbolKey(relPath, name);
    symbols.set(key, { name, type: "class", filePath: relPath, startLine: cls.getStartLineNumber(), isExported });
    if (!globalNameIndex.has(name)) globalNameIndex.set(name, []);
    globalNameIndex.get(name)!.push(key);

    // Class extends edges
    const ext = cls.getExtends();
    if (ext) {
      const extName = ext.getExpression().getText().split("<")[0];
      edges.push({ from: key, to: extName, edgeType: "extends" });
    }
    // Class implements edges
    for (const impl of cls.getImplements()) {
      const implName = impl.getExpression().getText().split("<")[0];
      edges.push({ from: key, to: implName, edgeType: "implements" });
    }
  }

  // Interfaces
  for (const iface of sourceFile.getInterfaces()) {
    const name = iface.getName();
    const isExported = iface.isExported();
    const key = symbolKey(relPath, name);
    symbols.set(key, { name, type: "interface", filePath: relPath, startLine: iface.getStartLineNumber(), isExported });
    if (!globalNameIndex.has(name)) globalNameIndex.set(name, []);
    globalNameIndex.get(name)!.push(key);

    // Interface extends edges
    for (const ext of iface.getExtends()) {
      const extName = ext.getExpression().getText().split("<")[0];
      edges.push({ from: key, to: extName, edgeType: "extends" });
    }
  }

  // Type aliases
  for (const typeAlias of sourceFile.getTypeAliases()) {
    const name = typeAlias.getName();
    const isExported = typeAlias.isExported();
    const key = symbolKey(relPath, name);
    symbols.set(key, { name, type: "type", filePath: relPath, startLine: typeAlias.getStartLineNumber(), isExported });
    if (!globalNameIndex.has(name)) globalNameIndex.set(name, []);
    globalNameIndex.get(name)!.push(key);
  }

  // Top-level const/let/var (exported only — avoid noise)
  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const name = varDecl.getName();
    const stmt = varDecl.getVariableStatement();
    if (!stmt || !stmt.isExported()) continue;

    // Skip arrow functions — they're already covered by getFunctions() in ts-morph
    // but add exported constants (configs, registries, etc.)
    const initKind = varDecl.getInitializer()?.getKind();
    if (
      initKind === SyntaxKind.ArrowFunction ||
      initKind === SyntaxKind.FunctionExpression
    ) {
      // Treat as function
      const key = symbolKey(relPath, name);
      if (!symbols.has(key)) {
        symbols.set(key, { name, type: "function", filePath: relPath, startLine: varDecl.getStartLineNumber(), isExported: true });
        if (!globalNameIndex.has(name)) globalNameIndex.set(name, []);
        globalNameIndex.get(name)!.push(key);
      }
    } else {
      const key = symbolKey(relPath, name);
      symbols.set(key, { name, type: "variable", filePath: relPath, startLine: varDecl.getStartLineNumber(), isExported: true });
      if (!globalNameIndex.has(name)) globalNameIndex.set(name, []);
      globalNameIndex.get(name)!.push(key);
    }
  }

  // Import edges — file imports symbol → edge from this file to the imported symbol
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const namedImports = importDecl.getNamedImports();
    for (const named of namedImports) {
      const importedName = named.getName();
      // We'll resolve to the actual key after all files are processed
      // Use a placeholder — resolved in second pass
      edges.push({
        from: `${relPath}::__file__`,
        to: importedName,
        edgeType: "imports",
      });
    }
    const defaultImport = importDecl.getDefaultImport();
    if (defaultImport) {
      edges.push({
        from: `${relPath}::__file__`,
        to: defaultImport.getText(),
        edgeType: "imports",
      });
    }
  }

  // Call expressions — find function calls within this file to build call graph
  // We use identifier references to keep it simple and fast
  const callExprs = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of callExprs.slice(0, 200)) { // cap per file to avoid performance issues
    const expr = call.getExpression();
    let calledName: string | undefined;
    if (expr.getKind() === SyntaxKind.Identifier) {
      calledName = expr.getText();
    } else if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
      // e.g., supabase.from(...) — take rightmost identifier
      const parts = expr.getText().split(".");
      calledName = parts[parts.length - 1];
    }
    if (calledName && calledName.length > 2) {
      edges.push({
        from: `${relPath}::__file__`,
        to: calledName,
        edgeType: "calls",
      });
    }
  }
}

// Resolve placeholder edges (name-only) to actual symbol keys using globalNameIndex
function resolveEdges(
  edges: SymbolEdge[],
  globalNameIndex: Map<string, string[]>,
): SymbolEdge[] {
  return edges
    .map(edge => {
      if (edge.to.includes("::")) return edge; // already resolved

      const candidates = globalNameIndex.get(edge.to);
      if (!candidates || candidates.length === 0) return null; // external dep, drop

      // Prefer the first candidate (arbitrary for now; could rank by same-package proximity)
      return { ...edge, to: candidates[0] };
    })
    .filter((e): e is SymbolEdge => e !== null && e.to !== e.from);
}

// ── Format output ─────────────────────────────────────────────────────────────

function formatRepoMap(
  topSymbols: Array<RepoSymbol & { pageRankScore: number }>,
  totalFiles: number,
  totalSymbols: number,
  maxMapChars: number,
): string {
  const header = [
    `// Repo Map — Top ${topSymbols.length} symbols by PageRank`,
    `// Generated: ${new Date().toISOString().slice(0, 10)} | Files: ${totalFiles.toLocaleString()} | Symbols: ${totalSymbols.toLocaleString()}`,
    "",
  ].join("\n");

  // Group by file
  const byFile = new Map<string, Array<RepoSymbol & { pageRankScore: number }>>();
  for (const sym of topSymbols) {
    if (!byFile.has(sym.filePath)) byFile.set(sym.filePath, []);
    byFile.get(sym.filePath)!.push(sym);
  }

  const lines: string[] = [header];
  let charCount = header.length;

  for (const [filePath, syms] of byFile) {
    const fileHeader = `${filePath}:`;
    if (charCount + fileHeader.length > maxMapChars) break;
    lines.push(fileHeader);
    charCount += fileHeader.length + 1;

    for (const sym of syms) {
      const exportTag = sym.isExported ? " [exported]" : "";
      let line: string;
      if (sym.type === "function") {
        line = `  ${sym.name}${sym.signature ?? "()"}${exportTag}`;
      } else if (sym.type === "class" || sym.type === "interface" || sym.type === "type") {
        line = `  ${sym.name} (${sym.type})${exportTag}`;
      } else {
        line = `  ${sym.name} (${sym.type})${exportTag}`;
      }
      if (charCount + line.length > maxMapChars) break;
      lines.push(line);
      charCount += line.length + 1;
    }
    lines.push("");
    charCount += 1;
  }

  return lines.join("\n");
}

// ── Main entry: buildRepoMap ──────────────────────────────────────────────────

export async function buildRepoMap(
  projectRoot: string,
  options: BuildOptions = {},
): Promise<RepoMap> {
  const {
    maxSymbols = 150,
    excludePatterns = [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/*.d.ts",
      "**/*.test.ts",
      "**/*.spec.ts",
    ],
    maxMapChars = 4000,
  } = options;

  const tsConfigPath = path.join(projectRoot, "tsconfig.json");

  const project = new Project({
    tsConfigFilePath: tsConfigPath,
    skipAddingFilesFromTsConfig: false,
    skipFileDependencyResolution: true, // faster — we build our own graph
    compilerOptions: {
      skipLibCheck: true,
    },
  });

  // Remove files that match exclusion patterns
  const allSourceFiles = project.getSourceFiles().filter(sf => {
    const fp = sf.getFilePath();
    return !excludePatterns.some(pat => {
      // Simple glob matching: convert ** patterns to regex
      const regexStr = pat
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*");
      return new RegExp(regexStr).test(fp);
    });
  });

  const symbols = new Map<string, RepoSymbol>();
  const edges: SymbolEdge[] = [];
  const globalNameIndex = new Map<string, string[]>(); // name -> [key, ...]

  // First pass: extract all symbols and raw edges
  for (const sf of allSourceFiles) {
    const absPath = sf.getFilePath();
    const relPath = path.relative(projectRoot, absPath).replace(/\\/g, "/");
    try {
      extractSymbolsFromFile(sf, relPath, symbols, edges, globalNameIndex);
    } catch {
      // Non-fatal: skip malformed files
    }
  }

  // Second pass: resolve name-only edges to full symbol keys
  const resolvedEdges = resolveEdges(edges, globalNameIndex);

  // Also add __file__ nodes to the symbol map for import/call sources
  // (already done implicitly — file nodes participate as edge sources)

  // Run PageRank
  const symbolKeys = Array.from(symbols.keys());
  const pageRankScores = runPageRank(symbolKeys, resolvedEdges);

  // Sort by PageRank score descending
  const ranked = symbolKeys
    .map(key => ({
      ...(symbols.get(key) as RepoSymbol),
      pageRankScore: pageRankScores.get(key) ?? 0,
    }))
    .sort((a, b) => b.pageRankScore - a.pageRankScore)
    .slice(0, maxSymbols);

  const mapText = formatRepoMap(ranked, allSourceFiles.length, symbols.size, maxMapChars);

  return {
    totalFiles: allSourceFiles.length,
    totalSymbols: symbols.size,
    mapText,
    topSymbols: ranked,
    generatedAt: new Date().toISOString(),
  };
}

// ── Store in brain memory ─────────────────────────────────────────────────────

export async function buildAndStoreRepoMap(
  supabase: SupabaseClient,
  orgId: string,
  projectRoot: string,
  options?: BuildOptions,
): Promise<{ totalFiles: number; totalSymbols: number; mapLength: number }> {
  const map = await buildRepoMap(projectRoot, options);

  const { error } = await supabase
    .from("ai_memory")
    .upsert(
      {
        organization_id: orgId,
        memory_type: "knowledge",
        domain: "code.repo_map",
        content: map.mapText,
        importance: 0.95,
        metadata: {
          totalFiles: map.totalFiles,
          totalSymbols: map.totalSymbols,
          topSymbolCount: map.topSymbols.length,
          generatedAt: map.generatedAt,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,domain" },
    );

  if (error) {
    logger.warn("[repo-map] Failed to upsert repo map to ai_memory:", error.message);
  } else {
    logger.warn(`[repo-map] Stored repo map: ${map.totalFiles} files, ${map.totalSymbols} symbols, ${map.mapText.length} chars`);
  }

  return {
    totalFiles: map.totalFiles,
    totalSymbols: map.totalSymbols,
    mapLength: map.mapText.length,
  };
}
