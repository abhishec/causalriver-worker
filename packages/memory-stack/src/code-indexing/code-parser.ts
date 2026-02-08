/**
 * Code Parser — Regex-Based TypeScript/JavaScript Symbol Extraction
 *
 * Extracts functions, classes, interfaces, types, imports, and exports
 * from TypeScript/JavaScript source files using regex patterns.
 *
 * No tree-sitter dependency — pure regex for 80% symbol coverage.
 * Captures: signatures, JSDoc comments, body previews, parent classes.
 *
 * @example
 * ```typescript
 * const parser = createCodeParser();
 * const fileIndex = parser.parseSource(sourceCode, 'src/auth.ts');
 * console.log(fileIndex.symbols); // [{name: 'authenticate', kind: 'function', ...}]
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CodeSymbol {
  /** Symbol name */
  name: string;
  /** Symbol kind */
  kind: 'function' | 'class' | 'method' | 'interface' | 'type' | 'variable' | 'import' | 'export';
  /** File path */
  filePath: string;
  /** Start line (1-indexed) */
  startLine: number;
  /** End line (estimated, 1-indexed) */
  endLine: number;
  /** Full signature (e.g. "function foo(a: string): Promise<void>") */
  signature?: string;
  /** JSDoc comment above the symbol */
  docComment?: string;
  /** For methods: the parent class name */
  parentSymbol?: string;
  /** First N chars of body */
  bodyPreview?: string;
  /** Whether this symbol is exported */
  isExported: boolean;
}

export interface FileIndex {
  /** File path */
  filePath: string;
  /** Detected language */
  language: string;
  /** All extracted symbols */
  symbols: CodeSymbol[];
  /** Import statements */
  imports: string[];
  /** Export statements */
  exports: string[];
  /** Content hash for change detection */
  contentHash: string;
  /** When this file was indexed */
  lastIndexedAt: Date;
}

export interface CodeParserConfig {
  /** Max body preview length (default: 500) */
  maxBodyPreview?: number;
  /** File extensions to consider (default: ts, tsx, js, jsx) */
  includeExtensions?: string[];
  /** Directories to exclude (default: node_modules, dist, .git) */
  excludeDirs?: string[];
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a regex-based code parser.
 */
export function createCodeParser(config?: CodeParserConfig) {
  const maxBodyPreview = config?.maxBodyPreview ?? 500;

  // Simple hash function
  function hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Detect language from file path
   */
  function detectLanguage(filePath: string): string {
    if (filePath.endsWith('.tsx')) return 'tsx';
    if (filePath.endsWith('.ts')) return 'typescript';
    if (filePath.endsWith('.jsx')) return 'jsx';
    if (filePath.endsWith('.js')) return 'javascript';
    return 'unknown';
  }

  /**
   * Extract JSDoc comment above a given line
   */
  function extractDocComment(lines: string[], lineIndex: number): string | undefined {
    let endIdx = lineIndex - 1;
    while (endIdx >= 0 && lines[endIdx].trim() === '') endIdx--;

    if (endIdx < 0 || !lines[endIdx].trim().endsWith('*/')) return undefined;

    let startIdx = endIdx;
    while (startIdx > 0 && !lines[startIdx].trim().startsWith('/**')) {
      startIdx--;
    }

    if (!lines[startIdx].trim().startsWith('/**')) return undefined;

    return lines
      .slice(startIdx, endIdx + 1)
      .map((l) => l.trim())
      .join('\n');
  }

  /**
   * Estimate end line of a block by counting braces
   */
  function estimateEndLine(lines: string[], startLine: number): number {
    let braceCount = 0;
    let foundFirst = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundFirst = true;
        }
        if (char === '}') {
          braceCount--;
          if (foundFirst && braceCount === 0) return i + 1;
        }
      }
    }

    return Math.min(startLine + 20, lines.length);
  }

  /**
   * Extract body preview from start to end line
   */
  function extractBodyPreview(
    lines: string[],
    startLine: number,
    endLine: number
  ): string {
    const body = lines
      .slice(startLine, endLine)
      .join('\n');
    return body.substring(0, maxBodyPreview);
  }

  /**
   * Parse source code into symbols
   */
  function parseSource(content: string, filePath: string): FileIndex {
    const lines = content.split('\n');
    const symbols: CodeSymbol[] = [];
    const imports: string[] = [];
    const exports: string[] = [];

    // ── Patterns ─────────────────────────────────────────────────

    // Function declarations
    const funcRegex =
      /^(export\s+)?(export\s+default\s+)?(async\s+)?function\s+(\w+)\s*(<[^>]*>)?\s*\(([^)]*)\)\s*(?::\s*([^{]*))?/;

    // Arrow function assignments
    const arrowRegex =
      /^(export\s+)?(const|let|var)\s+(\w+)\s*(?::\s*[^=]*)?\s*=\s*(async\s+)?\(?([^)]*)\)?\s*(?::\s*[^=]*)?\s*=>/;

    // Class declarations
    const classRegex =
      /^(export\s+)?(export\s+default\s+)?(abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/;

    // Interface declarations
    const interfaceRegex =
      /^(export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?/;

    // Type alias declarations
    const typeRegex =
      /^(export\s+)?type\s+(\w+)(?:<[^>]*>)?\s*=/;

    // Import statements
    const importRegex = /^import\s+(?:type\s+)?(?:\{[^}]*\}|[\w*]+(?:\s+as\s+\w+)?)\s+from\s+['"]([^'"]+)['"]/;

    // Re-export statements
    const reExportRegex = /^export\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/;

    // Const/let with object or array (variable exports)
    const varExportRegex =
      /^export\s+(const|let|var)\s+(\w+)\s*(?::\s*[^=]*)?\s*=/;

    // Method inside class (simplified)
    const methodRegex =
      /^\s+(public\s+|private\s+|protected\s+|static\s+|readonly\s+)*(async\s+)?(\w+)\s*(<[^>]*>)?\s*\(([^)]*)\)\s*(?::\s*([^{]*))?/;

    let currentClass: string | null = null;
    let classEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith('//') || trimmed === '' || trimmed.startsWith('*')) continue;

      // Track class scope
      if (i >= classEndLine) {
        currentClass = null;
      }

      // Imports
      const importMatch = trimmed.match(importRegex);
      if (importMatch) {
        imports.push(importMatch[1]);
        continue;
      }

      // Re-exports
      const reExportMatch = trimmed.match(reExportRegex);
      if (reExportMatch) {
        exports.push(`{${reExportMatch[1].trim()}} from '${reExportMatch[2]}'`);
        continue;
      }

      // Function declarations
      const funcMatch = trimmed.match(funcRegex);
      if (funcMatch) {
        const isExported = !!(funcMatch[1] || funcMatch[2]);
        const endLine = estimateEndLine(lines, i);
        const docComment = extractDocComment(lines, i);

        symbols.push({
          name: funcMatch[4],
          kind: 'function',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.split('{')[0].trim(),
          docComment,
          isExported,
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });

        if (isExported) exports.push(funcMatch[4]);
        continue;
      }

      // Arrow function assignments
      const arrowMatch = trimmed.match(arrowRegex);
      if (arrowMatch) {
        const isExported = !!arrowMatch[1];
        const endLine = estimateEndLine(lines, i);
        const docComment = extractDocComment(lines, i);

        symbols.push({
          name: arrowMatch[3],
          kind: 'function',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.split('=>')[0].trim() + ' =>',
          docComment,
          isExported,
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });

        if (isExported) exports.push(arrowMatch[3]);
        continue;
      }

      // Class declarations
      const classMatch = trimmed.match(classRegex);
      if (classMatch) {
        const isExported = !!(classMatch[1] || classMatch[2]);
        const endLine = estimateEndLine(lines, i);
        const docComment = extractDocComment(lines, i);

        currentClass = classMatch[4];
        classEndLine = endLine;

        symbols.push({
          name: classMatch[4],
          kind: 'class',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.split('{')[0].trim(),
          docComment,
          isExported,
          bodyPreview: extractBodyPreview(lines, i, Math.min(i + 10, endLine)),
        });

        if (isExported) exports.push(classMatch[4]);
        continue;
      }

      // Interface declarations
      const ifaceMatch = trimmed.match(interfaceRegex);
      if (ifaceMatch) {
        const isExported = !!ifaceMatch[1];
        const endLine = estimateEndLine(lines, i);
        const docComment = extractDocComment(lines, i);

        symbols.push({
          name: ifaceMatch[2],
          kind: 'interface',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.split('{')[0].trim(),
          docComment,
          isExported,
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });

        if (isExported) exports.push(ifaceMatch[2]);
        continue;
      }

      // Type alias declarations
      const typeMatch = trimmed.match(typeRegex);
      if (typeMatch) {
        const isExported = !!typeMatch[1];
        const docComment = extractDocComment(lines, i);

        // Types can span multiple lines
        let endIdx = i;
        while (endIdx < lines.length - 1 && !lines[endIdx].includes(';')) {
          endIdx++;
        }

        symbols.push({
          name: typeMatch[2],
          kind: 'type',
          filePath,
          startLine: i + 1,
          endLine: endIdx + 1,
          signature: lines.slice(i, endIdx + 1).join(' ').trim(),
          docComment,
          isExported,
        });

        if (isExported) exports.push(typeMatch[2]);
        continue;
      }

      // Variable exports (const FOO = ...)
      const varMatch = trimmed.match(varExportRegex);
      if (varMatch && !funcMatch && !arrowMatch) {
        const docComment = extractDocComment(lines, i);
        symbols.push({
          name: varMatch[2],
          kind: 'variable',
          filePath,
          startLine: i + 1,
          endLine: i + 1,
          signature: trimmed,
          docComment,
          isExported: true,
        });
        exports.push(varMatch[2]);
        continue;
      }

      // Methods inside classes
      if (currentClass && i < classEndLine) {
        const methodMatch = line.match(methodRegex);
        if (
          methodMatch &&
          methodMatch[3] !== 'if' &&
          methodMatch[3] !== 'for' &&
          methodMatch[3] !== 'while' &&
          methodMatch[3] !== 'switch' &&
          methodMatch[3] !== 'return' &&
          methodMatch[3] !== 'constructor' !== false
        ) {
          const endLine = estimateEndLine(lines, i);
          const docComment = extractDocComment(lines, i);

          symbols.push({
            name: methodMatch[3],
            kind: methodMatch[3] === 'constructor' ? 'method' : 'method',
            filePath,
            startLine: i + 1,
            endLine,
            signature: trimmed.split('{')[0].trim(),
            docComment,
            parentSymbol: currentClass,
            isExported: false, // Methods are accessed via class
            bodyPreview: extractBodyPreview(lines, i, endLine),
          });
        }
      }
    }

    return {
      filePath,
      language: detectLanguage(filePath),
      symbols,
      imports,
      exports,
      contentHash: hashContent(content),
      lastIndexedAt: new Date(),
    };
  }

  /**
   * Extract just signatures from source (lighter than full parse)
   */
  function extractSignatures(content: string): CodeSymbol[] {
    return parseSource(content, 'unknown').symbols;
  }

  return {
    parseSource,
    extractSignatures,
  };
}
