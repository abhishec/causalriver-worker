/**
 * Code Parser — Regex-Based Multi-Language Symbol Extraction
 *
 * Extracts functions, classes, interfaces, types, imports, and exports
 * from source files using language-specific regex patterns.
 *
 * Supported languages:
 *   - TypeScript / JavaScript / TSX / JSX (full)
 *   - Python (def, class, import, decorators, docstrings)
 *   - Go (func, type, struct, interface, import)
 *   - Java (class, interface, method, import, annotations)
 *   - Rust (fn, struct, enum, trait, impl, mod, use)
 *   - Ruby (def, class, module, require)
 *   - Kotlin (fun, class, interface, object, import)
 *   - Swift (func, class, struct, protocol, import)
 *   - C# (class, interface, method, using, namespace)
 *   - PHP (function, class, interface, use, namespace)
 *
 * No tree-sitter dependency — pure regex for 80% symbol coverage.
 * Captures: signatures, doc comments, body previews, parent classes.
 *
 * @example
 * ```typescript
 * const parser = createCodeParser();
 * const tsIndex = parser.parseSource(tsCode, 'src/auth.ts');
 * const pyIndex = parser.parseSource(pyCode, 'src/ml/model.py');
 * const goIndex = parser.parseSource(goCode, 'cmd/server/main.go');
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
  /** JSDoc / docstring comment above the symbol */
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
 * Create a regex-based code parser with multi-language support.
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
    if (filePath.endsWith('.py')) return 'python';
    if (filePath.endsWith('.go')) return 'go';
    if (filePath.endsWith('.java')) return 'java';
    if (filePath.endsWith('.rs')) return 'rust';
    if (filePath.endsWith('.rb')) return 'ruby';
    if (filePath.endsWith('.kt') || filePath.endsWith('.kts')) return 'kotlin';
    if (filePath.endsWith('.swift')) return 'swift';
    if (filePath.endsWith('.cs')) return 'csharp';
    if (filePath.endsWith('.cpp') || filePath.endsWith('.cc') || filePath.endsWith('.cxx')) return 'cpp';
    if (filePath.endsWith('.c') || filePath.endsWith('.h')) return 'c';
    if (filePath.endsWith('.php')) return 'php';
    return 'unknown';
  }

  // ========================================================================
  // SHARED HELPERS
  // ========================================================================

  /**
   * Extract JSDoc/block comment above a given line (/** ... *​/)
   */
  function extractDocComment(lines: string[], lineIndex: number): string | undefined {
    let endIdx = lineIndex - 1;
    while (endIdx >= 0 && lines[endIdx].trim() === '') endIdx--;

    if (endIdx < 0 || !lines[endIdx].trim().endsWith('*/')) return undefined;

    let startIdx = endIdx;
    while (startIdx > 0 && !lines[startIdx].trim().startsWith('/**') && !lines[startIdx].trim().startsWith('/*')) {
      startIdx--;
    }

    if (!lines[startIdx].trim().startsWith('/**') && !lines[startIdx].trim().startsWith('/*')) return undefined;

    return lines
      .slice(startIdx, endIdx + 1)
      .map((l) => l.trim())
      .join('\n');
  }

  /**
   * Extract Python docstring (triple-quoted string after def/class)
   */
  function extractPythonDocstring(lines: string[], startLine: number): string | undefined {
    // Look for triple-quoted string on the line after the declaration
    let checkLine = startLine + 1;
    while (checkLine < lines.length && lines[checkLine].trim() === '') checkLine++;

    if (checkLine >= lines.length) return undefined;
    const trimmed = lines[checkLine].trim();

    const tripleQuoteMatch = trimmed.match(/^("""|''')/);
    if (!tripleQuoteMatch) return undefined;

    const quote = tripleQuoteMatch[1];
    // Single-line docstring
    if (trimmed.endsWith(quote) && trimmed.length > 6) {
      return trimmed.slice(3, -3).trim();
    }

    // Multi-line docstring
    const docLines = [trimmed.slice(3)];
    for (let j = checkLine + 1; j < lines.length; j++) {
      if (lines[j].trim().endsWith(quote)) {
        const last = lines[j].trim().slice(0, -3);
        if (last) docLines.push(last);
        return docLines.map((l) => l.trim()).filter(Boolean).join('\n');
      }
      docLines.push(lines[j]);
    }
    return undefined;
  }

  /**
   * Extract # comment block above a line (Ruby, Python)
   */
  function extractHashComment(lines: string[], lineIndex: number): string | undefined {
    let endIdx = lineIndex - 1;
    while (endIdx >= 0 && lines[endIdx].trim() === '') endIdx--;

    if (endIdx < 0 || !lines[endIdx].trim().startsWith('#')) return undefined;

    let startIdx = endIdx;
    while (startIdx > 0 && lines[startIdx - 1].trim().startsWith('#')) {
      startIdx--;
    }

    return lines
      .slice(startIdx, endIdx + 1)
      .map((l) => l.trim())
      .join('\n');
  }

  /**
   * Extract // comment block above a line (Go, Rust, C, etc.)
   */
  function extractSlashComment(lines: string[], lineIndex: number): string | undefined {
    let endIdx = lineIndex - 1;
    while (endIdx >= 0 && lines[endIdx].trim() === '') endIdx--;

    if (endIdx < 0 || !lines[endIdx].trim().startsWith('//')) return undefined;

    let startIdx = endIdx;
    while (startIdx > 0 && lines[startIdx - 1].trim().startsWith('//')) {
      startIdx--;
    }

    return lines
      .slice(startIdx, endIdx + 1)
      .map((l) => l.trim())
      .join('\n');
  }

  /**
   * Estimate end line of a brace-delimited block { ... }
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
   * Estimate end line of an indentation-based block (Python, Ruby)
   */
  function estimateEndLineByIndent(lines: string[], startLine: number): number {
    const startIndent = lines[startLine].search(/\S/);
    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') continue; // skip blank lines
      const indent = line.search(/\S/);
      if (indent <= startIndent) return i;
    }
    return lines.length;
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

  // ========================================================================
  // LANGUAGE-SPECIFIC PARSERS
  // ========================================================================

  /**
   * Parse TypeScript / JavaScript / TSX / JSX
   */
  function parseTypeScript(
    lines: string[],
    filePath: string,
    symbols: CodeSymbol[],
    imports: string[],
    exports: string[]
  ): void {
    // ── Patterns ──
    const funcRegex =
      /^(export\s+)?(export\s+default\s+)?(async\s+)?function\s+(\w+)\s*(<[^>]*>)?\s*\(([^)]*)\)\s*(?::\s*([^{]*))?/;
    const arrowRegex =
      /^(export\s+)?(const|let|var)\s+(\w+)\s*(?::\s*[^=]*)?\s*=\s*(async\s+)?\(?([^)]*)\)?\s*(?::\s*[^=]*)?\s*=>/;
    const classRegex =
      /^(export\s+)?(export\s+default\s+)?(abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/;
    const interfaceRegex =
      /^(export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?/;
    const typeRegex =
      /^(export\s+)?type\s+(\w+)(?:<[^>]*>)?\s*=/;
    const importRegex = /^import\s+(?:type\s+)?(?:\{[^}]*\}|[\w*]+(?:\s+as\s+\w+)?)\s+from\s+['"]([^'"]+)['"]/;
    const reExportRegex = /^export\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/;
    const varExportRegex =
      /^export\s+(const|let|var)\s+(\w+)\s*(?::\s*[^=]*)?\s*=/;
    const methodRegex =
      /^\s+(public\s+|private\s+|protected\s+|static\s+|readonly\s+)*(async\s+)?(\w+)\s*(<[^>]*>)?\s*\(([^)]*)\)\s*(?::\s*([^{]*))?/;

    let currentClass: string | null = null;
    let classEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('//') || trimmed === '' || trimmed.startsWith('*')) continue;

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
            isExported: false,
            bodyPreview: extractBodyPreview(lines, i, endLine),
          });
        }
      }
    }
  }

  /**
   * Parse Python source code
   */
  function parsePython(
    lines: string[],
    filePath: string,
    symbols: CodeSymbol[],
    imports: string[],
    exports: string[]
  ): void {
    // Patterns
    const funcRegex = /^(\s*)(async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?\s*:/;
    const classRegex = /^(\s*)class\s+(\w+)(?:\(([^)]*)\))?\s*:/;
    const importRegex = /^(?:from\s+([\w.]+)\s+)?import\s+(.+)/;
    const decoratorRegex = /^(\s*)@(\w[\w.]*)/;

    let currentClass: string | null = null;
    let classIndent = -1;
    let lastDecorator: string | undefined;

    // Check for __all__ exports
    const allMatch = lines.join('\n').match(/__all__\s*=\s*\[([^\]]*)\]/);
    if (allMatch) {
      const exportNames = allMatch[1].match(/['"](\w+)['"]/g);
      if (exportNames) {
        for (const m of exportNames) {
          exports.push(m.replace(/['"]/g, ''));
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '' || trimmed.startsWith('#')) {
        if (trimmed.startsWith('#')) {
          // Don't clear decorator for comments
        }
        continue;
      }

      // Track class scope by indentation
      if (currentClass !== null) {
        const indent = line.search(/\S/);
        if (indent <= classIndent && trimmed !== '') {
          currentClass = null;
          classIndent = -1;
        }
      }

      // Decorators
      const decoMatch = trimmed.match(decoratorRegex);
      if (decoMatch) {
        lastDecorator = trimmed;
        continue;
      }

      // Import statements
      const importMatch = trimmed.match(importRegex);
      if (importMatch) {
        const module = importMatch[1] || importMatch[2].trim();
        imports.push(module);
        lastDecorator = undefined;
        continue;
      }

      // Class declarations
      const classMatch = line.match(classRegex);
      if (classMatch) {
        const indent = classMatch[1].length;
        const name = classMatch[2];
        const endLine = estimateEndLineByIndent(lines, i);
        const docComment = extractHashComment(lines, i) || extractPythonDocstring(lines, i);

        currentClass = name;
        classIndent = indent;

        // Python: top-level classes are implicitly "exported" (public)
        const isExported = indent === 0 && !name.startsWith('_');

        symbols.push({
          name,
          kind: 'class',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed,
          docComment,
          isExported,
          bodyPreview: extractBodyPreview(lines, i, Math.min(i + 10, endLine)),
        });

        if (isExported) exports.push(name);
        lastDecorator = undefined;
        continue;
      }

      // Function/method declarations
      const funcMatch = line.match(funcRegex);
      if (funcMatch) {
        const indent = funcMatch[1].length;
        const isAsync = !!funcMatch[2];
        const name = funcMatch[3];
        const endLine = estimateEndLineByIndent(lines, i);
        const docComment = extractHashComment(lines, i) || extractPythonDocstring(lines, i);
        const isMethod = currentClass !== null && indent > classIndent;
        const isExported = indent === 0 && !name.startsWith('_');

        const sig = trimmed;

        symbols.push({
          name,
          kind: isMethod ? 'method' : 'function',
          filePath,
          startLine: i + 1,
          endLine,
          signature: lastDecorator ? `${lastDecorator}\n${sig}` : sig,
          docComment,
          parentSymbol: isMethod ? currentClass ?? undefined : undefined,
          isExported,
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });

        if (isExported) exports.push(name);
        lastDecorator = undefined;
        continue;
      }

      lastDecorator = undefined;
    }
  }

  /**
   * Parse Go source code
   */
  function parseGo(
    lines: string[],
    filePath: string,
    symbols: CodeSymbol[],
    imports: string[],
    exports: string[]
  ): void {
    // Go: exported = starts with uppercase
    const funcRegex = /^func\s+(?:\((\w+)\s+\*?(\w+)\)\s+)?(\w+)\s*(\([^)]*\))\s*(.*?)\s*\{?$/;
    const typeStructRegex = /^type\s+(\w+)\s+struct\s*\{?/;
    const typeInterfaceRegex = /^type\s+(\w+)\s+interface\s*\{?/;
    const typeAliasRegex = /^type\s+(\w+)\s+(.+)/;
    const importRegex = /^\s*"([^"]+)"/;
    const constVarRegex = /^(const|var)\s+(\w+)\s*/;

    let inImportBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '' || trimmed.startsWith('//')) continue;

      // Import block handling
      if (trimmed === 'import (') {
        inImportBlock = true;
        continue;
      }
      if (inImportBlock) {
        if (trimmed === ')') {
          inImportBlock = false;
          continue;
        }
        const im = trimmed.match(importRegex);
        if (im) imports.push(im[1]);
        continue;
      }
      // Single import
      if (trimmed.startsWith('import "')) {
        const im = trimmed.match(/"([^"]+)"/);
        if (im) imports.push(im[1]);
        continue;
      }

      // Function declarations
      const funcMatch = trimmed.match(funcRegex);
      if (funcMatch) {
        const receiverType = funcMatch[2]; // receiver type for methods
        const name = funcMatch[3];
        const endLine = estimateEndLine(lines, i);
        const docComment = extractSlashComment(lines, i);
        const isExported = name[0] === name[0].toUpperCase() && /[A-Z]/.test(name[0]);

        symbols.push({
          name,
          kind: receiverType ? 'method' : 'function',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.replace(/\s*\{$/, ''),
          docComment,
          parentSymbol: receiverType || undefined,
          isExported,
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });

        if (isExported) exports.push(name);
        continue;
      }

      // Struct declarations
      const structMatch = trimmed.match(typeStructRegex);
      if (structMatch) {
        const name = structMatch[1];
        const endLine = estimateEndLine(lines, i);
        const docComment = extractSlashComment(lines, i);
        const isExported = /[A-Z]/.test(name[0]);

        symbols.push({
          name,
          kind: 'class', // struct → class in our model
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.replace(/\s*\{$/, ''),
          docComment,
          isExported,
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });

        if (isExported) exports.push(name);
        continue;
      }

      // Interface declarations
      const ifaceMatch = trimmed.match(typeInterfaceRegex);
      if (ifaceMatch) {
        const name = ifaceMatch[1];
        const endLine = estimateEndLine(lines, i);
        const docComment = extractSlashComment(lines, i);
        const isExported = /[A-Z]/.test(name[0]);

        symbols.push({
          name,
          kind: 'interface',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.replace(/\s*\{$/, ''),
          docComment,
          isExported,
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });

        if (isExported) exports.push(name);
        continue;
      }

      // Type aliases (non-struct, non-interface)
      const typeMatch = trimmed.match(typeAliasRegex);
      if (typeMatch && !structMatch && !ifaceMatch) {
        const name = typeMatch[1];
        const docComment = extractSlashComment(lines, i);
        const isExported = /[A-Z]/.test(name[0]);

        symbols.push({
          name,
          kind: 'type',
          filePath,
          startLine: i + 1,
          endLine: i + 1,
          signature: trimmed,
          docComment,
          isExported,
        });

        if (isExported) exports.push(name);
        continue;
      }

      // Package-level const/var
      const constMatch = trimmed.match(constVarRegex);
      if (constMatch) {
        const name = constMatch[2];
        const isExported = /[A-Z]/.test(name[0]);
        const docComment = extractSlashComment(lines, i);

        symbols.push({
          name,
          kind: 'variable',
          filePath,
          startLine: i + 1,
          endLine: i + 1,
          signature: trimmed,
          docComment,
          isExported,
        });

        if (isExported) exports.push(name);
        continue;
      }
    }
  }

  /**
   * Parse Java source code
   */
  function parseJava(
    lines: string[],
    filePath: string,
    symbols: CodeSymbol[],
    imports: string[],
    exports: string[]
  ): void {
    const importRegex = /^import\s+(static\s+)?([^;]+);/;
    const classRegex = /^(public\s+|private\s+|protected\s+)?(abstract\s+|final\s+)?(class|enum)\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/;
    const interfaceRegex = /^(public\s+|private\s+|protected\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?/;
    const methodRegex = /^\s+(public|private|protected)?\s*(static\s+)?(final\s+)?(?:synchronized\s+)?(?:<[^>]+>\s+)?(\w[\w<>\[\],.?\s]*)\s+(\w+)\s*\(([^)]*)\)/;
    const annotationRegex = /^\s*@(\w+)/;

    let currentClass: string | null = null;
    let classEndLine = -1;
    let lastAnnotation: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

      if (i >= classEndLine) {
        currentClass = null;
      }

      // Annotations
      const annoMatch = trimmed.match(annotationRegex);
      if (annoMatch) {
        lastAnnotation = trimmed;
        continue;
      }

      // Imports
      const importMatch = trimmed.match(importRegex);
      if (importMatch) {
        imports.push(importMatch[2]);
        continue;
      }

      // Class/Enum declarations
      const classMatch = trimmed.match(classRegex);
      if (classMatch) {
        const name = classMatch[4];
        const endLine = estimateEndLine(lines, i);
        const docComment = extractDocComment(lines, i);
        const isExported = !classMatch[1] || classMatch[1].trim() === 'public';

        currentClass = name;
        classEndLine = endLine;

        symbols.push({
          name,
          kind: 'class',
          filePath,
          startLine: i + 1,
          endLine,
          signature: lastAnnotation ? `${lastAnnotation}\n${trimmed.split('{')[0].trim()}` : trimmed.split('{')[0].trim(),
          docComment,
          isExported,
          bodyPreview: extractBodyPreview(lines, i, Math.min(i + 10, endLine)),
        });

        if (isExported) exports.push(name);
        lastAnnotation = undefined;
        continue;
      }

      // Interface declarations
      const ifaceMatch = trimmed.match(interfaceRegex);
      if (ifaceMatch) {
        const name = ifaceMatch[2];
        const endLine = estimateEndLine(lines, i);
        const docComment = extractDocComment(lines, i);
        const isExported = !ifaceMatch[1] || ifaceMatch[1].trim() === 'public';

        symbols.push({
          name,
          kind: 'interface',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.split('{')[0].trim(),
          docComment,
          isExported,
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });

        if (isExported) exports.push(name);
        lastAnnotation = undefined;
        continue;
      }

      // Methods
      if (currentClass && i < classEndLine) {
        const methodMatch = line.match(methodRegex);
        if (
          methodMatch &&
          methodMatch[5] !== 'if' &&
          methodMatch[5] !== 'for' &&
          methodMatch[5] !== 'while' &&
          methodMatch[5] !== 'switch' &&
          methodMatch[5] !== 'return'
        ) {
          const name = methodMatch[5];
          const endLine = estimateEndLine(lines, i);
          const docComment = extractDocComment(lines, i);

          symbols.push({
            name,
            kind: 'method',
            filePath,
            startLine: i + 1,
            endLine,
            signature: lastAnnotation ? `${lastAnnotation}\n${trimmed.split('{')[0].trim()}` : trimmed.split('{')[0].trim(),
            docComment,
            parentSymbol: currentClass,
            isExported: false,
            bodyPreview: extractBodyPreview(lines, i, endLine),
          });
          lastAnnotation = undefined;
        }
      }

      lastAnnotation = undefined;
    }
  }

  /**
   * Parse Rust source code
   */
  function parseRust(
    lines: string[],
    filePath: string,
    symbols: CodeSymbol[],
    imports: string[],
    exports: string[]
  ): void {
    const funcRegex = /^(\s*)(pub\s+)?(async\s+)?fn\s+(\w+)\s*(<[^>]*>)?\s*\(([^)]*)\)\s*(?:->\s*([^{]*))?/;
    const structRegex = /^(\s*)(pub\s+)?struct\s+(\w+)/;
    const enumRegex = /^(\s*)(pub\s+)?enum\s+(\w+)/;
    const traitRegex = /^(\s*)(pub\s+)?trait\s+(\w+)/;
    const implRegex = /^(\s*)impl\s+(?:<[^>]*>\s+)?(\w+)(?:\s+for\s+(\w+))?/;
    const modRegex = /^(\s*)(pub\s+)?mod\s+(\w+)/;
    const useRegex = /^(\s*)(pub\s+)?use\s+(.+);/;
    const typeRegex = /^(\s*)(pub\s+)?type\s+(\w+)/;
    const constRegex = /^(\s*)(pub\s+)?(const|static)\s+(\w+)/;

    let currentImpl: string | null = null;
    let implEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

      if (i >= implEndLine) {
        currentImpl = null;
      }

      // Use statements
      const useMatch = trimmed.match(useRegex);
      if (useMatch) {
        imports.push(useMatch[3]);
        if (useMatch[2]) exports.push(useMatch[3]);
        continue;
      }

      // Impl blocks
      const implMatch = trimmed.match(implRegex);
      if (implMatch) {
        currentImpl = implMatch[3] || implMatch[2]; // impl Type or impl Trait for Type
        implEndLine = estimateEndLine(lines, i);
        continue;
      }

      // Function declarations
      const funcMatch = trimmed.match(funcRegex);
      if (funcMatch) {
        const isPublic = !!funcMatch[2];
        const name = funcMatch[4];
        const endLine = estimateEndLine(lines, i);
        const docComment = extractSlashComment(lines, i);
        const isMethod = currentImpl !== null;

        symbols.push({
          name,
          kind: isMethod ? 'method' : 'function',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.replace(/\s*\{$/, ''),
          docComment,
          parentSymbol: isMethod ? currentImpl ?? undefined : undefined,
          isExported: isPublic,
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });

        if (isPublic) exports.push(name);
        continue;
      }

      // Struct declarations
      const structMatch = trimmed.match(structRegex);
      if (structMatch) {
        const isPublic = !!structMatch[2];
        const name = structMatch[3];
        const endLine = estimateEndLine(lines, i);
        const docComment = extractSlashComment(lines, i);

        symbols.push({
          name,
          kind: 'class', // struct → class in our model
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.replace(/\s*\{$/, ''),
          docComment,
          isExported: isPublic,
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });

        if (isPublic) exports.push(name);
        continue;
      }

      // Enum declarations
      const enumMatch = trimmed.match(enumRegex);
      if (enumMatch) {
        const isPublic = !!enumMatch[2];
        const name = enumMatch[3];
        const endLine = estimateEndLine(lines, i);
        const docComment = extractSlashComment(lines, i);

        symbols.push({
          name,
          kind: 'type', // enum → type in our model
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.replace(/\s*\{$/, ''),
          docComment,
          isExported: isPublic,
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });

        if (isPublic) exports.push(name);
        continue;
      }

      // Trait declarations
      const traitMatch = trimmed.match(traitRegex);
      if (traitMatch) {
        const isPublic = !!traitMatch[2];
        const name = traitMatch[3];
        const endLine = estimateEndLine(lines, i);
        const docComment = extractSlashComment(lines, i);

        symbols.push({
          name,
          kind: 'interface', // trait → interface in our model
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.replace(/\s*\{$/, ''),
          docComment,
          isExported: isPublic,
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });

        if (isPublic) exports.push(name);
        continue;
      }

      // Module declarations
      const modMatch = trimmed.match(modRegex);
      if (modMatch) {
        const isPublic = !!modMatch[2];
        const name = modMatch[3];
        const docComment = extractSlashComment(lines, i);

        symbols.push({
          name,
          kind: 'variable', // mod → variable as best fit
          filePath,
          startLine: i + 1,
          endLine: i + 1,
          signature: trimmed.replace(';', ''),
          docComment,
          isExported: isPublic,
        });
        continue;
      }

      // Type aliases
      const typeMatch = trimmed.match(typeRegex);
      if (typeMatch) {
        const isPublic = !!typeMatch[2];
        const name = typeMatch[3];
        const docComment = extractSlashComment(lines, i);

        symbols.push({
          name,
          kind: 'type',
          filePath,
          startLine: i + 1,
          endLine: i + 1,
          signature: trimmed.replace(';', ''),
          docComment,
          isExported: isPublic,
        });

        if (isPublic) exports.push(name);
        continue;
      }

      // Const/static
      const constMatch = trimmed.match(constRegex);
      if (constMatch) {
        const isPublic = !!constMatch[2];
        const name = constMatch[4];
        const docComment = extractSlashComment(lines, i);

        symbols.push({
          name,
          kind: 'variable',
          filePath,
          startLine: i + 1,
          endLine: i + 1,
          signature: trimmed.replace(';', ''),
          docComment,
          isExported: isPublic,
        });

        if (isPublic) exports.push(name);
        continue;
      }
    }
  }

  /**
   * Parse Ruby source code
   */
  function parseRuby(
    lines: string[],
    filePath: string,
    symbols: CodeSymbol[],
    imports: string[],
    exports: string[]
  ): void {
    const defRegex = /^(\s*)def\s+(self\.)?(\w+[?!=]?)\s*(?:\(([^)]*)\))?/;
    const classRegex = /^(\s*)class\s+(\w+)(?:\s*<\s*(\w[\w:]*))?\s*/;
    const moduleRegex = /^(\s*)module\s+(\w[\w:]*)/;
    const requireRegex = /^require(?:_relative)?\s+['"]([^'"]+)['"]/;
    const attrRegex = /^\s*attr_(?:reader|writer|accessor)\s+(.+)/;

    let currentClass: string | null = null;
    let classIndent = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '' || trimmed.startsWith('#')) continue;

      // Track class scope
      if (currentClass !== null) {
        const indent = line.search(/\S/);
        if (indent <= classIndent && trimmed === 'end') {
          currentClass = null;
          classIndent = -1;
          continue;
        }
      }

      // Require
      const requireMatch = trimmed.match(requireRegex);
      if (requireMatch) {
        imports.push(requireMatch[1]);
        continue;
      }

      // Module
      const moduleMatch = line.match(moduleRegex);
      if (moduleMatch) {
        const name = moduleMatch[2];
        const endLine = estimateEndLineByIndent(lines, i);
        const docComment = extractHashComment(lines, i);

        symbols.push({
          name,
          kind: 'class', // module → class in our model
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed,
          docComment,
          isExported: true, // Ruby modules are public
          bodyPreview: extractBodyPreview(lines, i, Math.min(i + 10, endLine)),
        });

        exports.push(name);
        continue;
      }

      // Class
      const classMatch = line.match(classRegex);
      if (classMatch) {
        const indent = classMatch[1].length;
        const name = classMatch[2];
        const endLine = estimateEndLineByIndent(lines, i);
        const docComment = extractHashComment(lines, i);

        currentClass = name;
        classIndent = indent;

        symbols.push({
          name,
          kind: 'class',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed,
          docComment,
          isExported: true,
          bodyPreview: extractBodyPreview(lines, i, Math.min(i + 10, endLine)),
        });

        exports.push(name);
        continue;
      }

      // Method (def)
      const defMatch = line.match(defRegex);
      if (defMatch) {
        const indent = defMatch[1].length;
        const isSelf = !!defMatch[2];
        const name = defMatch[3];
        const endLine = estimateEndLineByIndent(lines, i);
        const docComment = extractHashComment(lines, i);
        const isMethod = currentClass !== null && indent > classIndent;
        const isExported = !name.startsWith('_');

        symbols.push({
          name: isSelf ? `self.${name}` : name,
          kind: isMethod ? 'method' : 'function',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed,
          docComment,
          parentSymbol: isMethod ? currentClass ?? undefined : undefined,
          isExported,
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });

        if (isExported) exports.push(name);
        continue;
      }

      // attr_reader / attr_writer / attr_accessor
      const attrMatch = trimmed.match(attrRegex);
      if (attrMatch && currentClass) {
        const names = attrMatch[1].match(/:(\w+)/g);
        if (names) {
          for (const n of names) {
            const attrName = n.slice(1); // remove :
            symbols.push({
              name: attrName,
              kind: 'variable',
              filePath,
              startLine: i + 1,
              endLine: i + 1,
              signature: trimmed,
              parentSymbol: currentClass,
              isExported: true,
            });
          }
        }
      }
    }
  }

  /**
   * Parse C/C++ source code (basic)
   */
  function parseCCpp(
    lines: string[],
    filePath: string,
    symbols: CodeSymbol[],
    imports: string[],
    exports: string[]
  ): void {
    const includeRegex = /^#include\s+[<"]([^>"]+)[>"]/;
    const funcRegex = /^(?:static\s+|inline\s+|extern\s+)?(?:const\s+)?(\w[\w:*&<>,\s]*?)\s+(\w+)\s*\(([^)]*)\)\s*(?:const\s*)?(?:override\s*)?(?:=\s*0\s*)?[{;]/;
    const classRegex = /^(?:class|struct)\s+(\w+)(?:\s*:\s*(?:public|private|protected)\s+(\w+))?\s*\{?/;
    const namespaceRegex = /^namespace\s+(\w+)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#ifndef') || trimmed.startsWith('#define') || trimmed.startsWith('#endif')) continue;

      // Includes
      const includeMatch = trimmed.match(includeRegex);
      if (includeMatch) {
        imports.push(includeMatch[1]);
        continue;
      }

      // Namespace
      const nsMatch = trimmed.match(namespaceRegex);
      if (nsMatch) {
        symbols.push({
          name: nsMatch[1],
          kind: 'variable',
          filePath,
          startLine: i + 1,
          endLine: estimateEndLine(lines, i),
          signature: trimmed.replace(/\s*\{$/, ''),
          isExported: true,
        });
        continue;
      }

      // Class/struct
      const classMatch = trimmed.match(classRegex);
      if (classMatch) {
        const name = classMatch[1];
        const endLine = estimateEndLine(lines, i);
        const docComment = extractDocComment(lines, i) || extractSlashComment(lines, i);

        symbols.push({
          name,
          kind: 'class',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.replace(/\s*\{$/, ''),
          docComment,
          isExported: true,
          bodyPreview: extractBodyPreview(lines, i, Math.min(i + 10, endLine)),
        });
        exports.push(name);
        continue;
      }

      // Functions
      const funcMatch = trimmed.match(funcRegex);
      if (funcMatch && funcMatch[2] !== 'if' && funcMatch[2] !== 'for' && funcMatch[2] !== 'while' && funcMatch[2] !== 'switch') {
        const name = funcMatch[2];
        const endLine = estimateEndLine(lines, i);
        const docComment = extractDocComment(lines, i) || extractSlashComment(lines, i);

        symbols.push({
          name,
          kind: 'function',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.replace(/\s*\{$/, ''),
          docComment,
          isExported: !trimmed.startsWith('static'),
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });
        continue;
      }
    }
  }

  /**
   * Parse PHP source code
   */
  function parsePHP(
    lines: string[],
    filePath: string,
    symbols: CodeSymbol[],
    imports: string[],
    exports: string[]
  ): void {
    const useRegex = /^use\s+([^;]+);/;
    const namespaceRegex = /^namespace\s+([^;]+);/;
    const classRegex = /^(abstract\s+|final\s+)?(class)\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/;
    const interfaceRegex = /^interface\s+(\w+)/;
    const funcRegex = /^(public|private|protected)?\s*(static\s+)?function\s+(\w+)\s*\(([^)]*)\)/;
    const traitRegex = /^trait\s+(\w+)/;

    let currentClass: string | null = null;
    let classEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('<?') || trimmed.startsWith('?>')) continue;

      if (i >= classEndLine) {
        currentClass = null;
      }

      // Namespace
      const nsMatch = trimmed.match(namespaceRegex);
      if (nsMatch) {
        exports.push(nsMatch[1]);
        continue;
      }

      // Use
      const useMatch = trimmed.match(useRegex);
      if (useMatch) {
        imports.push(useMatch[1]);
        continue;
      }

      // Class
      const classMatch = trimmed.match(classRegex);
      if (classMatch) {
        const name = classMatch[3];
        const endLine = estimateEndLine(lines, i);
        const docComment = extractDocComment(lines, i);

        currentClass = name;
        classEndLine = endLine;

        symbols.push({
          name,
          kind: 'class',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.split('{')[0].trim(),
          docComment,
          isExported: true,
          bodyPreview: extractBodyPreview(lines, i, Math.min(i + 10, endLine)),
        });
        exports.push(name);
        continue;
      }

      // Interface
      const ifaceMatch = trimmed.match(interfaceRegex);
      if (ifaceMatch) {
        const name = ifaceMatch[1];
        const endLine = estimateEndLine(lines, i);
        const docComment = extractDocComment(lines, i);

        symbols.push({
          name,
          kind: 'interface',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.split('{')[0].trim(),
          docComment,
          isExported: true,
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });
        exports.push(name);
        continue;
      }

      // Trait
      const traitMatch = trimmed.match(traitRegex);
      if (traitMatch) {
        const name = traitMatch[1];
        const endLine = estimateEndLine(lines, i);

        symbols.push({
          name,
          kind: 'interface',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.split('{')[0].trim(),
          isExported: true,
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });
        continue;
      }

      // Functions/methods
      const funcMatch = trimmed.match(funcRegex);
      if (funcMatch) {
        const name = funcMatch[3];
        const endLine = estimateEndLine(lines, i);
        const docComment = extractDocComment(lines, i);
        const isMethod = currentClass !== null;

        symbols.push({
          name,
          kind: isMethod ? 'method' : 'function',
          filePath,
          startLine: i + 1,
          endLine,
          signature: trimmed.split('{')[0].trim(),
          docComment,
          parentSymbol: isMethod ? currentClass ?? undefined : undefined,
          isExported: !isMethod || funcMatch[1] === 'public' || !funcMatch[1],
          bodyPreview: extractBodyPreview(lines, i, endLine),
        });
        continue;
      }
    }
  }

  // ========================================================================
  // MAIN PARSE DISPATCHER
  // ========================================================================

  /**
   * Parse source code into symbols, dispatching to language-specific parser
   */
  function parseSource(content: string, filePath: string): FileIndex {
    const lines = content.split('\n');
    const symbols: CodeSymbol[] = [];
    const imports: string[] = [];
    const exports: string[] = [];
    const language = detectLanguage(filePath);

    switch (language) {
      case 'typescript':
      case 'javascript':
      case 'tsx':
      case 'jsx':
        parseTypeScript(lines, filePath, symbols, imports, exports);
        break;
      case 'python':
        parsePython(lines, filePath, symbols, imports, exports);
        break;
      case 'go':
        parseGo(lines, filePath, symbols, imports, exports);
        break;
      case 'java':
        parseJava(lines, filePath, symbols, imports, exports);
        break;
      case 'rust':
        parseRust(lines, filePath, symbols, imports, exports);
        break;
      case 'ruby':
        parseRuby(lines, filePath, symbols, imports, exports);
        break;
      case 'kotlin':
      case 'swift':
        // Kotlin and Swift share enough similarity with Java for basic parsing
        parseJava(lines, filePath, symbols, imports, exports);
        break;
      case 'csharp':
      case 'cpp':
      case 'c':
        parseCCpp(lines, filePath, symbols, imports, exports);
        break;
      case 'php':
        parsePHP(lines, filePath, symbols, imports, exports);
        break;
      default:
        // Fallback: try TypeScript parser (works for C-family syntax)
        parseTypeScript(lines, filePath, symbols, imports, exports);
        break;
    }

    return {
      filePath,
      language,
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
